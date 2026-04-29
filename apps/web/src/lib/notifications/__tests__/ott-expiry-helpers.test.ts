/**
 * ott-expiry-helpers 단위 테스트
 *
 * 검증 범위:
 *  - diffFlatrate : 어제→오늘 사라진 provider id (null-safe)
 *  - intersectWithSubscribed : 사용자 subscribedOtt 와 교차
 *  - buildExpiryPayloadText : 1건 / 다건 톤
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.stubEnv("TMDB_API_KEY", "test-tmdb-key");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
});

describe("diffFlatrate", () => {
  it("어제 [8,337] → 오늘 [337] = 사라진 [8]", async () => {
    const { diffFlatrate } = await import("../ott-expiry-helpers");
    const yesterday = { flatrate: [8, 337], rent: [], buy: [] };
    const today = { flatrate: [337], rent: [], buy: [] };
    expect(diffFlatrate(yesterday, today)).toEqual([8]);
  });

  it("동일 → 빈 배열", async () => {
    const { diffFlatrate } = await import("../ott-expiry-helpers");
    expect(
      diffFlatrate(
        { flatrate: [8], rent: [], buy: [] },
        { flatrate: [8], rent: [], buy: [] },
      ),
    ).toEqual([]);
  });

  it("어제만 null → 빈 배열 (비교 불가)", async () => {
    const { diffFlatrate } = await import("../ott-expiry-helpers");
    expect(diffFlatrate(null, { flatrate: [8], rent: [], buy: [] })).toEqual([]);
  });

  it("오늘 null → 빈 배열 (false positive 회피)", async () => {
    const { diffFlatrate } = await import("../ott-expiry-helpers");
    expect(diffFlatrate({ flatrate: [8], rent: [], buy: [] }, null)).toEqual([]);
  });

  it("flatrate 만 비교 (rent/buy 변동은 무시)", async () => {
    const { diffFlatrate } = await import("../ott-expiry-helpers");
    const yesterday = { flatrate: [8], rent: [3], buy: [3] };
    const today = { flatrate: [8], rent: [], buy: [] };
    expect(diffFlatrate(yesterday, today)).toEqual([]);
  });
});

describe("intersectWithSubscribed", () => {
  it("사용자 구독 OTT 와 교차된 hit 만 통과", async () => {
    const { intersectWithSubscribed } = await import("../ott-expiry-helpers");
    const hits = [
      {
        workId: 1,
        mediaType: "movie" as const,
        goneProviderIds: [8, 337], // 넷플릭스, 디즈니+
      },
      {
        workId: 2,
        mediaType: "tv" as const,
        goneProviderIds: [97], // 왓챠 only
      },
    ];
    const subscribed = [8]; // 사용자는 넷플릭스만
    const out = intersectWithSubscribed(hits, subscribed);
    expect(out).toHaveLength(1);
    expect(out[0].workId).toBe(1);
    expect(out[0].goneProviderIds).toEqual([8]);
  });

  it("subscribedOtt 비어있으면 빈 배열", async () => {
    const { intersectWithSubscribed } = await import("../ott-expiry-helpers");
    const hits = [
      { workId: 1, mediaType: "movie" as const, goneProviderIds: [8] },
    ];
    expect(intersectWithSubscribed(hits, [])).toEqual([]);
  });

  it("교차되는 provider 가 0이면 hit drop", async () => {
    const { intersectWithSubscribed } = await import("../ott-expiry-helpers");
    const hits = [
      { workId: 1, mediaType: "movie" as const, goneProviderIds: [97] },
    ];
    expect(intersectWithSubscribed(hits, [8])).toEqual([]);
  });
});

describe("buildExpiryPayloadText", () => {
  it("1건 + provider 1 → 'OO 에서 사라질 수 있어요'", async () => {
    const { buildExpiryPayloadText } = await import("../ott-expiry-helpers");
    const text = buildExpiryPayloadText([
      { title: "기생충", goneProviderIds: [8] },
    ]);
    expect(text.title).toBe("곧 내려갈 수 있어요");
    expect(text.body).toContain("기생충");
    expect(text.body).toContain("넷플릭스");
  });

  it("1건 + provider 2 → 'OO 외 N곳'", async () => {
    const { buildExpiryPayloadText } = await import("../ott-expiry-helpers");
    const text = buildExpiryPayloadText([
      { title: "기생충", goneProviderIds: [8, 337] },
    ]);
    expect(text.body).toContain("외 1곳");
  });

  it("3건 → '제목 외 N편이 OTT에서 사라질 수 있어요'", async () => {
    const { buildExpiryPayloadText } = await import("../ott-expiry-helpers");
    const text = buildExpiryPayloadText([
      { title: "기생충", goneProviderIds: [8] },
      { title: "헤어질 결심", goneProviderIds: [8] },
      { title: "올드보이", goneProviderIds: [8] },
    ]);
    expect(text.body).toContain("기생충");
    expect(text.body).toContain("외 2편");
  });

  it("빈 배열 → 폴백 텍스트", async () => {
    const { buildExpiryPayloadText } = await import("../ott-expiry-helpers");
    const text = buildExpiryPayloadText([]);
    expect(text.title).toBe("곧 내려갈 수 있어요");
  });

  it("알 수 없는 provider id → 'OTT' 라벨 폴백", async () => {
    const { buildExpiryPayloadText } = await import("../ott-expiry-helpers");
    const text = buildExpiryPayloadText([
      { title: "x", goneProviderIds: [99999] },
    ]);
    expect(text.body).toContain("OTT");
  });
});
