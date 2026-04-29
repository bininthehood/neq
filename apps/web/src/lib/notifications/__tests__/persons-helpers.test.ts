/**
 * persons-helpers 단위 테스트
 *
 * 검증 범위:
 *  - extractPersonsFromCredits : director 1 + cast top 3 추출
 *  - dedupPersonsForProfile : 사용자 단위 person_id+role dedup
 *  - tmdbCredits : 429 retry + 404 throw
 *  - workKey : 캐시 키 안정성
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.stubEnv("TMDB_API_KEY", "test-tmdb-key");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
});

describe("extractPersonsFromCredits", () => {
  it("director (job=Director) + cast top 3 추출", async () => {
    const { extractPersonsFromCredits } = await import("../persons-helpers");
    const credits = {
      crew: [
        { id: 100, name: "Director A", job: "Director", department: "Directing" },
        { id: 200, name: "Editor", job: "Editor", department: "Editing" },
      ],
      cast: [
        { id: 1, name: "Actor 1" },
        { id: 2, name: "Actor 2" },
        { id: 3, name: "Actor 3" },
        { id: 4, name: "Actor 4" }, // 4번은 drop (top 3)
      ],
    };
    const out = extractPersonsFromCredits(credits);
    expect(out).toEqual([
      { personId: 100, personName: "Director A", role: "director" },
      { personId: 1, personName: "Actor 1", role: "actor" },
      { personId: 2, personName: "Actor 2", role: "actor" },
      { personId: 3, personName: "Actor 3", role: "actor" },
    ]);
  });

  it("Director job 없으면 department=Directing 폴백", async () => {
    const { extractPersonsFromCredits } = await import("../persons-helpers");
    const out = extractPersonsFromCredits({
      crew: [
        { id: 999, name: "Co-Director", job: "Co-Director", department: "Directing" },
      ],
      cast: [],
    });
    expect(out).toEqual([
      { personId: 999, personName: "Co-Director", role: "director" },
    ]);
  });

  it("id 누락 cast 는 drop", async () => {
    const { extractPersonsFromCredits } = await import("../persons-helpers");
    const out = extractPersonsFromCredits({
      crew: [],
      cast: [
        { name: "no id" },
        { id: 5, name: "valid" },
      ],
    });
    expect(out).toEqual([{ personId: 5, personName: "valid", role: "actor" }]);
  });

  it("null/undefined → 빈 배열", async () => {
    const { extractPersonsFromCredits } = await import("../persons-helpers");
    expect(extractPersonsFromCredits(null)).toEqual([]);
    expect(extractPersonsFromCredits(undefined)).toEqual([]);
    expect(extractPersonsFromCredits({})).toEqual([]);
  });

  it("director 없고 cast 만 있는 경우", async () => {
    const { extractPersonsFromCredits } = await import("../persons-helpers");
    const out = extractPersonsFromCredits({
      cast: [{ id: 1, name: "Solo" }],
      crew: [{ id: 99, name: "Editor", job: "Editor", department: "Editing" }],
    });
    expect(out).toEqual([
      { personId: 1, personName: "Solo", role: "actor" },
    ]);
  });
});

describe("dedupPersonsForProfile", () => {
  it("동일 person_id+role 은 1행으로 dedup (최초 작품 보존)", async () => {
    const { dedupPersonsForProfile } = await import("../persons-helpers");
    const works = [
      {
        tmdbId: 100,
        mediaType: "movie" as const,
        persons: [
          { personId: 1, personName: "Bong Joon-ho", role: "director" as const },
          { personId: 2, personName: "Song Kang-ho", role: "actor" as const },
        ],
      },
      {
        tmdbId: 200,
        mediaType: "movie" as const,
        persons: [
          { personId: 1, personName: "Bong Joon-ho", role: "director" as const }, // 중복
          { personId: 3, personName: "Lee Sun-kyun", role: "actor" as const },
        ],
      },
    ];
    const out = dedupPersonsForProfile("p1", works);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({
      personId: 1,
      role: "director",
      sourceWorkId: 100, // 첫 작품 보존
    });
    expect(out[1]).toMatchObject({ personId: 2, role: "actor" });
    expect(out[2]).toMatchObject({
      personId: 3,
      role: "actor",
      sourceWorkId: 200,
    });
  });

  it("같은 person_id 라도 role 이 다르면 별도 row (director/actor 겸업)", async () => {
    const { dedupPersonsForProfile } = await import("../persons-helpers");
    const works = [
      {
        tmdbId: 1,
        mediaType: "movie" as const,
        persons: [
          { personId: 42, personName: "X", role: "director" as const },
          { personId: 42, personName: "X", role: "actor" as const },
        ],
      },
    ];
    const out = dedupPersonsForProfile("p1", works);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.role).sort()).toEqual(["actor", "director"]);
  });

  it("빈 입력 → 빈 출력", async () => {
    const { dedupPersonsForProfile } = await import("../persons-helpers");
    expect(dedupPersonsForProfile("p1", [])).toEqual([]);
  });
});

describe("workKey", () => {
  it("(tmdbId, mediaType) → 고정 키", async () => {
    const { workKey } = await import("../persons-helpers");
    expect(workKey(550, "movie")).toBe("550|movie");
    expect(workKey(550, "tv")).toBe("550|tv");
    expect(workKey(550, "movie")).not.toBe(workKey(550, "tv"));
  });
});

describe("tmdbCredits (fetch wrapper)", () => {
  it("정상 200 → JSON 반환", async () => {
    const { tmdbCredits, RateLimiter } = await import("../persons-helpers");
    const limiter = new RateLimiter(1000);
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ cast: [{ id: 1 }], crew: [] }),
    });
    const out = await tmdbCredits(
      550,
      "movie",
      "k",
      limiter,
      fakeFetch as unknown as typeof fetch,
    );
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ cast: [{ id: 1 }], crew: [] });
  });

  it("503 → 1회 재시도 후 성공", async () => {
    const { tmdbCredits, RateLimiter } = await import("../persons-helpers");
    const limiter = new RateLimiter(1000);
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });
    const out = await tmdbCredits(
      1,
      "tv",
      "k",
      limiter,
      fakeFetch as unknown as typeof fetch,
    );
    expect(fakeFetch).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ ok: true });
  }, 10000);

  it("404 → throw", async () => {
    const { tmdbCredits, RateLimiter } = await import("../persons-helpers");
    const limiter = new RateLimiter(1000);
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(
      tmdbCredits(1, "movie", "k", limiter, fakeFetch as unknown as typeof fetch),
    ).rejects.toThrow(/404/);
  });
});
