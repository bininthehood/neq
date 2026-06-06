/**
 * Phase B-2 (2026-06-06) — ranking 단위 테스트.
 *
 * mock OpenAI 로 LLM ranker 검증 + 실제 score fallback 흐름 검증. 실제 OpenAI
 * 호출 없음.
 *
 * 검증 항목:
 *   1. empty pool → picks=[], meta=(none/0/0)
 *   2. score fallback 정렬 보존 + count
 *   3. score fallback reason 텍스트 (normalizeReason 통과)
 *   4. LLM mock 정상 응답 → picks 의 id 가 candidates 의 tmdbId 와 매칭
 *   5. LLM mock JSON 파싱 실패 → picks=[], usage 살아있음
 *   6. LLM mock API 에러 → picks=[], usage=null, meta 정상
 *   7. A-3/A-4 meta — axis ∈ DIVERSITY_AXES / temp ∈ {0.8,0.95,1.1,1.2} / seed > 0
 *   8. subscribedOttIds → LLM prompt 안 한글 라벨 변환
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// env stub — OpenAI / supabaseAdmin 평가 단계 throw 방지
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.TMDB_API_KEY = "test-tmdb-key";
  process.env.OPENAI_API_KEY = "sk-test-0123456789abcdef0123456789abcdef";
});

// Mock OpenAI SDK — `new OpenAI()` 로 인스턴스화하는 prompt.ts / ranking.ts 양쪽
// 모두를 mock. 각 테스트가 mockCreate 의 동작을 설정.
const mockCreate = vi.fn();

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: (...args: unknown[]) => mockCreate(...args),
        },
      };
    },
  };
});

import {
  rankCandidatesLLM,
  rankCandidatesScore,
  providerIdsToNames,
  providerIdsToTmdbNames,
  DIVERSITY_AXES,
  type RankerInput,
} from "../ranking";
import type { TmdbCandidate } from "../candidate-generation";

// 후보 fixture
function mkCandidate(
  tmdbId: number,
  overrides: Partial<TmdbCandidate> = {},
): TmdbCandidate {
  return {
    tmdbId,
    type: "movie",
    title: `작품 ${tmdbId}`,
    titleEn: null,
    overview: "줄거리",
    posterPath: null,
    backdropPath: null,
    rating: 8.0,
    releaseDate: "2022-01-01",
    genreIds: [28],
    country: ["US"],
    originCountry: ["US"],
    runtime: 120,
    seasons: null,
    director: null,
    castNames: [],
    providers: [{ name: "Netflix", logoUrl: null }],
    watchLink: null,
    popularity: 8.0,
    personaMatch: 0,
    totalScore: 8.0,
    ...overrides,
  };
}

function mkInput(
  candidates: TmdbCandidate[],
  overrides: Partial<RankerInput> = {},
): RankerInput {
  return {
    candidates,
    favorites: ["기생충"],
    feedback: undefined,
    savedCount: 0,
    onboardingCount: 0,
    tasteGenres: [],
    subscribedOttIds: [],
    tasteSummary: undefined,
    excludeCount: 0,
    count: 20,
    ...overrides,
  };
}

beforeEach(() => {
  mockCreate.mockReset();
});

describe("rankCandidatesScore", () => {
  it("#1 empty pool → picks=[], meta=(none/0/0), usage=null", () => {
    const out = rankCandidatesScore(mkInput([]));
    expect(out.picks).toEqual([]);
    expect(out.usage).toBeNull();
    expect(out.meta).toEqual({
      diversity_axis: "none",
      temperature: 0,
      seed: 0,
    });
  });

  it("#2 정렬 보존 — top 5 고정, count 만큼 반환", () => {
    // totalScore desc 정렬된 후보 10개
    const cands = Array.from({ length: 10 }, (_, i) =>
      mkCandidate(100 + i, { totalScore: 10 - i, rating: 9 - i * 0.5 }),
    );
    const out = rankCandidatesScore(mkInput(cands, { count: 7 }));
    expect(out.picks).toHaveLength(7);
    // top 5 는 입력 순서 유지 (head 고정)
    expect(out.picks.slice(0, 5).map((p) => p.id)).toEqual([
      100, 101, 102, 103, 104,
    ]);
    expect(out.meta.diversity_axis).toBe("score-fallback");
  });

  it("#3 reason 텍스트 — 한 줄 + normalizeReason 통과 (15~30자)", () => {
    const cands = [
      mkCandidate(100, { rating: 8.5, title: "고평점 작품" }),
      mkCandidate(101, {
        rating: 6.0,
        releaseDate: `${new Date().getFullYear()}-03-01`,
        title: "신작",
      }),
      mkCandidate(102, {
        rating: 6.0,
        releaseDate: "2010-01-01",
        title: "클래식",
      }),
    ];
    const out = rankCandidatesScore(mkInput(cands));
    expect(out.picks).toHaveLength(3);
    for (const p of out.picks) {
      // normalizeReason 통과 = 15자 이상 30자 이하
      expect(p.reason.length).toBeGreaterThanOrEqual(15);
      expect(p.reason.length).toBeLessThanOrEqual(30);
      // 한 줄 (개행 없음)
      expect(p.reason).not.toContain("\n");
    }
    // 고평점 reason 에 "평점" 포함
    const top = out.picks.find((p) => p.id === 100);
    expect(top?.reason).toContain("평점");
  });
});

describe("rankCandidatesLLM", () => {
  it("#4 정상 mock 응답 → picks length=count, id 매칭", async () => {
    const cands = [mkCandidate(100), mkCandidate(101), mkCandidate(102)];
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              selected: [
                {
                  id: 100,
                  reason: "긴장감이 끝까지 놓이지 않는 명작이에요",
                },
                {
                  id: 101,
                  reason: "캐릭터 케미가 미쳤어요. 시즌2 빨리 보고싶어요",
                },
              ],
            }),
          },
        },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        prompt_tokens_details: { cached_tokens: 80 },
      },
    });

    const out = await rankCandidatesLLM(mkInput(cands, { count: 2 }));
    expect(out.picks).toHaveLength(2);
    expect(out.picks[0].id).toBe(100);
    expect(out.picks[1].id).toBe(101);
    // 모두 input candidates 의 tmdbId 에 속함
    const candidateIds = new Set(cands.map((c) => c.tmdbId));
    for (const p of out.picks) {
      expect(candidateIds.has(p.id)).toBe(true);
    }
    expect(out.usage).not.toBeNull();
    expect(out.usage?.cached_tokens).toBe(80);
  });

  it("#5 JSON 파싱 실패 → picks=[], usage 살아있음", async () => {
    const cands = [mkCandidate(100)];
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "not a valid json {{{" } }],
      usage: {
        prompt_tokens: 50,
        completion_tokens: 10,
        prompt_tokens_details: { cached_tokens: 0 },
      },
    });

    const out = await rankCandidatesLLM(mkInput(cands));
    expect(out.picks).toEqual([]);
    expect(out.usage).not.toBeNull();
    expect(out.usage?.prompt_tokens).toBe(50);
  });

  it("#6 API 에러 → picks=[], usage=null, meta 정상", async () => {
    const cands = [mkCandidate(100), mkCandidate(101)];
    mockCreate.mockRejectedValueOnce(new Error("OpenAI quota exceeded"));

    const out = await rankCandidatesLLM(mkInput(cands, { excludeCount: 30 }));
    expect(out.picks).toEqual([]);
    expect(out.usage).toBeNull();
    // meta 는 호출 전 결정되었으므로 정상값 유지
    expect(DIVERSITY_AXES).toContain(out.meta.diversity_axis as never);
    expect(out.meta.temperature).toBe(0.95); // excludeCount=30 → 0.95
    expect(out.meta.seed).toBeGreaterThan(0);
  });

  it("#7 A-3/A-4 meta — axis / temperature / seed 범위 검증", async () => {
    const cands = [mkCandidate(100)];
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              selected: [
                {
                  id: 100,
                  reason: "긴장감이 끝까지 놓이지 않는 명작이에요",
                },
              ],
            }),
          },
        },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 30,
        prompt_tokens_details: { cached_tokens: 0 },
      },
    });

    const out = await rankCandidatesLLM(mkInput(cands, { excludeCount: 5 }));
    expect(DIVERSITY_AXES).toContain(out.meta.diversity_axis as never);
    // excludeCount=5 → temperature 0.8
    expect([0.8, 0.95, 1.1, 1.2]).toContain(out.meta.temperature);
    expect(out.meta.temperature).toBe(0.8);
    expect(out.meta.seed).toBeGreaterThan(0);
    // seed 는 uint32 범위
    expect(out.meta.seed).toBeLessThan(2 ** 32);
  });

  it("#8 subscribedOttIds → LLM prompt 안에 한글 OTT 라벨 포함", async () => {
    const cands = [mkCandidate(100)];
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              selected: [
                {
                  id: 100,
                  reason: "긴장감이 끝까지 놓이지 않는 명작이에요",
                },
              ],
            }),
          },
        },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 30,
        prompt_tokens_details: { cached_tokens: 0 },
      },
    });

    await rankCandidatesLLM(
      mkInput(cands, {
        // 8=넷플릭스, 356=웨이브, 1881=티빙
        subscribedOttIds: [8, 356, 1881],
      }),
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMsg = callArgs.messages.find((m) => m.role === "user");
    expect(userMsg).toBeDefined();
    // 한글 OTT 라벨 변환 확인
    expect(userMsg!.content).toContain("넷플릭스");
    expect(userMsg!.content).toContain("웨이브");
    expect(userMsg!.content).toContain("티빙");
  });

  it("#1 (LLM) empty pool → 호출 skip + meta=(none/0/0)", async () => {
    const out = await rankCandidatesLLM(mkInput([]));
    expect(out.picks).toEqual([]);
    expect(out.usage).toBeNull();
    expect(out.meta).toEqual({
      diversity_axis: "none",
      temperature: 0,
      seed: 0,
    });
    // 빈 후보 → LLM 호출 skip
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("providerIdsToNames (B-3)", () => {
  it("#9 매핑 id → 한글 라벨, 알 수 없는 id 는 silent skip", () => {
    const out = providerIdsToNames([8, 337, 99999]);
    expect(out).toEqual(["넷플릭스", "디즈니플러스"]);
  });
});

describe("providerIdsToTmdbNames (B-3.1)", () => {
  it("#10 매핑 id → TMDB 영문 라벨 (DB providers JSONB 매칭용)", () => {
    const out = providerIdsToTmdbNames([8, 337, 356, 1881, 97, 99999]);
    expect(out).toEqual([
      "Netflix",
      "Disney Plus",
      "wavve",
      "TVING",
      "Watcha",
    ]);
  });
});
