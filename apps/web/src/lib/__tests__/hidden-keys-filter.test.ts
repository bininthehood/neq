/**
 * @vitest-environment node
 *
 * hiddenKeys ("관심 없음" 영구 숨김) — 검증·종류별 제외·출구 누출 테스트.
 *
 * 필터 지점은 route.ts 의 두 출구(스트리밍 onCard / 비스트리밍 recommendations 배열)뿐.
 * lib 의 모든 카드 경로(미리보기·LLM 픽·phase2·탐색·콜드스타트·폴백)는 이 두 출구로만
 * 나가므로, lib 를 mock 해 각 경로에서 나올 법한 카드를 흘려 보내 출구에서 막히는지 본다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Recommendation } from "@/lib/types";
import { HIDDEN_KEYS_MAX, isHiddenRec, parseHiddenKeys } from "@/lib/recommend/hidden-keys";

const { getRecommendations, getRecommendationsStreaming } = vi.hoisted(() => ({
  getRecommendations: vi.fn(),
  getRecommendationsStreaming: vi.fn(),
}));

vi.mock("@/lib/recommend", () => ({ getRecommendations, getRecommendationsStreaming }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 10 })),
  checkDailyRecommendationBudget: vi.fn(async () => true),
}));

import { POST } from "@/app/api/recommend/route";

function rec(type: Recommendation["type"], tmdbId: number): Recommendation {
  return { type, tmdbId, title: `${type}-${tmdbId}` } as Recommendation;
}

function post(body: object, streaming = false) {
  return POST(
    new NextRequest("http://localhost/api/recommend", {
      method: "POST",
      body: JSON.stringify(body),
      headers: streaming ? { "x-neko-streaming": "1" } : {},
    }),
  );
}

describe("parseHiddenKeys — 형식·중복·상한", () => {
  it("올바른 키만 남기고 잘못된 항목은 조용히 버림", () => {
    const keys = parseHiddenKeys([
      "movie:1396", "tv:1396", "series:1", "movie:", "movie:abc", "tv:1234567890",
      "MOVIE:1", " movie:1", 1396, null, { k: 1 }, "tv:42",
    ]);
    expect([...keys]).toEqual(["movie:1396", "tv:1396", "tv:42"]);
  });

  it("중복 제거", () => {
    expect([...parseHiddenKeys(["tv:1", "tv:1", "movie:1"])]).toEqual(["tv:1", "movie:1"]);
  });

  it("상한 초과 시 앞에서부터 500개 (최근 숨김 우선)", () => {
    const raw = Array.from({ length: 600 }, (_, i) => `movie:${i}`);
    const keys = parseHiddenKeys(raw);
    expect(keys.size).toBe(HIDDEN_KEYS_MAX);
    expect(keys.has("movie:0")).toBe(true);
    expect(keys.has("movie:499")).toBe(true);
    expect(keys.has("movie:500")).toBe(false);
  });

  it("중복은 상한을 차지하지 않음", () => {
    const raw = [...Array(100).fill("tv:7"), ...Array.from({ length: 500 }, (_, i) => `movie:${i}`)];
    expect(parseHiddenKeys(raw).size).toBe(500);
    expect(parseHiddenKeys(raw).has("movie:498")).toBe(true);
  });

  it("없음 / 배열 아님 → 빈 Set", () => {
    for (const raw of [undefined, null, "movie:1", 1, {}]) {
      expect(parseHiddenKeys(raw).size).toBe(0);
    }
  });
});

describe("isHiddenRec — 종류별 제외", () => {
  const hidden = parseHiddenKeys(["movie:1396"]);
  it("영화 1396 숨김은 드라마 1396 을 숨기지 않음", () => {
    expect(isHiddenRec(rec("movie", 1396), hidden)).toBe(true);
    expect(isHiddenRec(rec("series", 1396), hidden)).toBe(false);
    expect(isHiddenRec(rec("variety", 1396), hidden)).toBe(false);
  });
  it("series·variety 는 tv 키로 비교", () => {
    const tv = parseHiddenKeys(["tv:1396"]);
    expect(isHiddenRec(rec("series", 1396), tv)).toBe(true);
    expect(isHiddenRec(rec("variety", 1396), tv)).toBe(true);
    expect(isHiddenRec(rec("movie", 1396), tv)).toBe(false);
  });
  it("빈 목록 = no-op", () => {
    expect(isHiddenRec(rec("movie", 1396), new Set())).toBe(false);
  });
});

describe("POST /api/recommend — 출구 누출 없음", () => {
  // 각 lib 경로가 내보낼 수 있는 카드 (출구 기준으로는 모두 동일한 Recommendation).
  const cards = [
    rec("movie", 1396), // 미리보기 (MIRROR_PREVIEW)
    rec("series", 1396), // LLM 픽 — 같은 id 의 드라마, 남아야 함
    rec("series", 100), // phase2 score-fill
    rec("variety", 200), // 탐색 후보
    rec("movie", 300), // 폴백 / score 안전망
  ];
  const body = { favorites: ["기생충"], hiddenKeys: ["movie:1396", "tv:100", "tv:200"] };

  beforeEach(() => {
    getRecommendations.mockReset();
    getRecommendationsStreaming.mockReset();
  });

  it("스트리밍: 숨긴 카드는 card 줄로 나가지 않음", async () => {
    getRecommendationsStreaming.mockImplementation(
      async (...args: unknown[]) => {
        const callbacks = args[7] as { onCard: (r: Recommendation) => void };
        for (const c of cards) callbacks.onCard(c);
      },
    );
    const res = await post(body, true);
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    const sent = lines.filter((l) => l.type === "card").map((l) => `${l.rec.type}:${l.rec.tmdbId}`);
    expect(sent).toEqual(["series:1396", "movie:300"]);
    expect(lines.at(-1)).toEqual({ type: "done" });
  });

  it("비스트리밍: 숨긴 카드는 recommendations 에서 빠짐", async () => {
    getRecommendations.mockResolvedValue({ recommendations: cards, timings: {} });
    const json = await (await post(body)).json();
    expect(json.recommendations.map((r: Recommendation) => `${r.type}:${r.tmdbId}`)).toEqual([
      "series:1396",
      "movie:300",
    ]);
  });

  it("콜드스타트(favorites 없음)도 같은 출구 — 스트리밍·비스트리밍 모두 제외", async () => {
    getRecommendations.mockResolvedValue({ recommendations: cards, timings: {} });
    getRecommendationsStreaming.mockImplementation(async (...args: unknown[]) => {
      (args[7] as { onCard: (r: Recommendation) => void }).onCard(rec("movie", 1396));
    });
    const cold = { hiddenKeys: ["movie:1396"] };
    const json = await (await post(cold)).json();
    expect(json.recommendations).toHaveLength(cards.length - 1);
    expect(await (await post(cold, true)).text()).not.toContain('"card"');
  });

  it("hiddenKeys 미전송(예전 앱) → 전부 그대로", async () => {
    getRecommendations.mockResolvedValue({ recommendations: cards, timings: {} });
    const json = await (await post({ favorites: ["기생충"] })).json();
    expect(json.recommendations).toHaveLength(cards.length);
  });
});
