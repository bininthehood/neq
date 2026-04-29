/**
 * providers-helpers 단위 테스트
 *
 * 검증 범위:
 *  - extractKrProviderIds : KR 응답 → CompactProviders, KR 없으면 빈 객체
 *  - mirrorProvidersToCompact : 미러 array → CompactProviders (이름→id 역매핑)
 *  - classifyCache : fresh / stale / miss
 *  - mapWithConcurrency : concurrency 제한 + 순서 보존
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.stubEnv("TMDB_API_KEY", "test-tmdb-key");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
});

describe("extractKrProviderIds", () => {
  it("KR.flatrate / rent / buy 추출 + 정수 dedup", async () => {
    const { extractKrProviderIds } = await import("../providers-helpers");
    const raw = {
      results: {
        KR: {
          flatrate: [
            { provider_id: 8, provider_name: "Netflix" },
            { provider_id: 8, provider_name: "Netflix duplicate" },
            { provider_id: 1881, provider_name: "Tving" },
          ],
          rent: [{ provider_id: 3 }],
          buy: [{ provider_id: 3 }],
        },
        US: {
          flatrate: [{ provider_id: 999 }], // 다른 region 무시
        },
      },
    };
    const out = extractKrProviderIds(raw);
    expect(out.flatrate).toEqual([8, 1881]);
    expect(out.rent).toEqual([3]);
    expect(out.buy).toEqual([3]);
  });

  it("KR 없으면 빈 객체 반환 (NULL 회피)", async () => {
    const { extractKrProviderIds } = await import("../providers-helpers");
    const out = extractKrProviderIds({ results: {} });
    expect(out).toEqual({ flatrate: [], rent: [], buy: [] });
  });

  it("results 자체가 없으면 빈 객체", async () => {
    const { extractKrProviderIds } = await import("../providers-helpers");
    expect(extractKrProviderIds({})).toEqual({ flatrate: [], rent: [], buy: [] });
    expect(extractKrProviderIds(null)).toEqual({ flatrate: [], rent: [], buy: [] });
  });

  it("provider_id 누락 row 는 drop", async () => {
    const { extractKrProviderIds } = await import("../providers-helpers");
    const out = extractKrProviderIds({
      results: {
        KR: {
          flatrate: [{ provider_name: "no id" }, { provider_id: 8 }],
        },
      },
    });
    expect(out.flatrate).toEqual([8]);
  });
});

describe("mirrorProvidersToCompact", () => {
  it("이름 → id 역매핑 + category 분류", async () => {
    const { mirrorProvidersToCompact } = await import("../providers-helpers");
    const input = [
      { name: "Netflix", category: "subscription" as const },
      { name: "TVING", category: "subscription" as const },
      { name: "Apple TV", category: "rent" as const },
      { name: "Unknown Provider", category: "subscription" as const }, // drop
    ];
    const out = mirrorProvidersToCompact(input);
    expect(out.flatrate).toEqual([8, 1881]);
    expect(out.rent).toEqual([2]);
    expect(out.buy).toEqual([]);
  });

  it("null/undefined → 빈 객체", async () => {
    const { mirrorProvidersToCompact } = await import("../providers-helpers");
    expect(mirrorProvidersToCompact(null)).toEqual({
      flatrate: [],
      rent: [],
      buy: [],
    });
    expect(mirrorProvidersToCompact(undefined)).toEqual({
      flatrate: [],
      rent: [],
      buy: [],
    });
  });

  it("동일 id 동일 카테고리 중복은 dedup", async () => {
    const { mirrorProvidersToCompact } = await import("../providers-helpers");
    const out = mirrorProvidersToCompact([
      { name: "Netflix", category: "subscription" as const },
      { name: "Netflix", category: "subscription" as const },
    ]);
    expect(out.flatrate).toEqual([8]);
  });
});

describe("classifyCache", () => {
  it("null/undefined fetched_at → miss", async () => {
    const { classifyCache } = await import("../providers-helpers");
    const now = new Date("2026-04-29T10:00:00Z");
    expect(classifyCache(null, now)).toBe("miss");
    expect(classifyCache(undefined, now)).toBe("miss");
  });

  it("23h 전 → fresh", async () => {
    const { classifyCache } = await import("../providers-helpers");
    const now = new Date("2026-04-29T10:00:00Z");
    const fetched = new Date(now.getTime() - 23 * 3600 * 1000).toISOString();
    expect(classifyCache(fetched, now)).toBe("fresh");
  });

  it("25h 전 → stale", async () => {
    const { classifyCache } = await import("../providers-helpers");
    const now = new Date("2026-04-29T10:00:00Z");
    const fetched = new Date(now.getTime() - 25 * 3600 * 1000).toISOString();
    expect(classifyCache(fetched, now)).toBe("stale");
  });

  it("이상한 ISO → miss", async () => {
    const { classifyCache } = await import("../providers-helpers");
    const now = new Date();
    expect(classifyCache("not-a-date", now)).toBe("miss");
  });
});

describe("mapWithConcurrency", () => {
  it("결과 순서가 입력 순서와 동일", async () => {
    const { mapWithConcurrency } = await import("../providers-helpers");
    const items = [1, 2, 3, 4, 5];
    const out = await mapWithConcurrency(items, 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it("동시 실행 lane 수 제한 (max active)", async () => {
    const { mapWithConcurrency } = await import("../providers-helpers");
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await mapWithConcurrency(items, 3, async () => {
      active += 1;
      if (active > maxActive) maxActive = active;
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return null;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("빈 입력 → 빈 출력 (worker 호출 0)", async () => {
    const { mapWithConcurrency } = await import("../providers-helpers");
    let calls = 0;
    const out = await mapWithConcurrency([], 5, async () => {
      calls += 1;
      return 1;
    });
    expect(out).toEqual([]);
    expect(calls).toBe(0);
  });
});

describe("tmdbWatchProviders (fetch wrapper)", () => {
  it("정상 200 → JSON 반환", async () => {
    const { tmdbWatchProviders, RateLimiter } = await import("../providers-helpers");
    const limiter = new RateLimiter(1000); // 빠른 통과
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: { KR: { flatrate: [{ provider_id: 8 }] } } }),
    });
    const out = await tmdbWatchProviders(
      550,
      "movie",
      "k",
      limiter,
      fakeFetch as unknown as typeof fetch,
    );
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ results: { KR: { flatrate: [{ provider_id: 8 }] } } });
  });

  it("429 → 1회 재시도 후 성공", async () => {
    const { tmdbWatchProviders, RateLimiter } = await import("../providers-helpers");
    const limiter = new RateLimiter(1000);
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });
    const out = await tmdbWatchProviders(
      1,
      "movie",
      "k",
      limiter,
      fakeFetch as unknown as typeof fetch,
    );
    expect(fakeFetch).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ ok: true });
  }, 10000);

  it("404 → throw", async () => {
    const { tmdbWatchProviders, RateLimiter } = await import("../providers-helpers");
    const limiter = new RateLimiter(1000);
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(
      tmdbWatchProviders(1, "movie", "k", limiter, fakeFetch as unknown as typeof fetch),
    ).rejects.toThrow(/404/);
  });
});
