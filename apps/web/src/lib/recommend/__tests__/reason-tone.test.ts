import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("openai", () => {
  return {
    default: vi.fn(function OpenAI() {
      return {
        chat: { completions: { create: vi.fn() } },
      };
    }),
  };
});

import {
  templateReason,
  normalizeReason,
  REASON_BANNED_PATTERNS,
  CURATION_SYSTEM_PROMPT,
} from "../prompt";
import type { EnrichedCandidate } from "../types";

/**
 * reason 톤 회귀 테스트 (2026-07-10 — Instagram 큐레이션 문구 톤 정합).
 *
 * 검증 3축:
 *  1. templateReason / cold start fallback 전 풀에 금지 표현
 *     (평가 단정·과장 마케팅·AI 포지셔닝) 이 없다
 *  2. 문장이 평가 단정형 어미 (~요 / ~니다) 로 끝나지 않는다 — 명사 종결
 *  3. 시스템 프롬프트의 톤 블록·길이 규칙·좋은 예가 새 톤을 따른다
 */

// templateReason 이 실제로 읽는 필드만 채운 최소 mock.
function candidate(over: {
  genreIds?: number[];
  date?: string;
  country?: string[];
  rating?: number;
  type?: "movie" | "series";
}): EnrichedCandidate {
  return {
    type: over.type ?? "movie",
    item: {
      genre_ids: over.genreIds ?? [],
      release_date: over.date ?? "2015-01-01",
      vote_average: over.rating ?? 7.0,
    },
    details: { country: over.country ?? ["US"] },
  } as unknown as EnrichedCandidate;
}

// 템플릿 풀에 등장하는 모든 TMDB 장르 id (prompt.ts GENRE_REASONS 키와 동기).
const GENRE_IDS = [
  28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 53,
  10752, 37, 10765, 10764, 10767,
];

/** Math.random 을 고정 값으로 순회하며 풀의 모든 엔트리를 결정적으로 수집. */
function collectAllTemplateReasons(): string[] {
  const out = new Set<string>();
  const randValues = [0, 0.49, 0.99];
  for (const r of randValues) {
    vi.spyOn(Math, "random").mockReturnValue(r);
    for (const gid of GENRE_IDS) {
      out.add(templateReason(candidate({ genreIds: [gid] })));
    }
    // 평점/연도/국가 풀 + 폴백 3종
    out.add(templateReason(candidate({ rating: 8.2 })));
    out.add(templateReason(candidate({ date: "2001-05-01" })));
    out.add(templateReason(candidate({ date: "2026-02-01" })));
    out.add(templateReason(candidate({ country: ["KR"] })));
    out.add(templateReason(candidate({ rating: 9.0, genreIds: [999999] })));
    out.add(
      templateReason(candidate({ type: "series", rating: 7.0, genreIds: [999999] })),
    );
    out.add(templateReason(candidate({ rating: 7.0, genreIds: [999999] })));
    vi.restoreAllMocks();
  }
  return [...out];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("templateReason / fallback — 톤 원칙", () => {
  const reasons = collectAllTemplateReasons();

  it("전 풀에 금지 표현 (평가 단정·과장·AI 포지셔닝) 없음", () => {
    for (const r of reasons) {
      for (const banned of REASON_BANNED_PATTERNS) {
        expect(r, `"${r}" 가 금지 패턴 ${banned} 에 걸림`).not.toMatch(banned);
      }
    }
  });

  it("평가 단정형 어미 (~요/~니다) 로 끝나지 않음 — 명사 종결", () => {
    for (const r of reasons) {
      expect(r, `"${r}" 가 서술 어미로 끝남`).not.toMatch(/(요|니다)[.!?]?$/);
    }
  });

  it("풀이 비어 있지 않고 각 reason 이 카드 표시 가능한 길이", () => {
    expect(reasons.length).toBeGreaterThan(20);
    for (const r of reasons) {
      expect(r.length).toBeGreaterThanOrEqual(10);
      expect(r.length).toBeLessThanOrEqual(80);
    }
  });
});

describe("CURATION_SYSTEM_PROMPT — 톤 블록", () => {
  it("톤 원칙 블록 + 새 길이 규칙 (35~80, 45~70 sweet spot) 포함", () => {
    expect(CURATION_SYSTEM_PROMPT).toContain("[reason 톤 원칙");
    expect(CURATION_SYSTEM_PROMPT).toContain("35자 이상 80자 이하");
    expect(CURATION_SYSTEM_PROMPT).toContain("45~70자 sweet spot");
  });

  it("좋은 예 블록이 새 톤 (줄거리 설명 + 명사 종결) 이고 금지 표현이 없음", () => {
    const start = CURATION_SYSTEM_PROMPT.indexOf("[좋은 예");
    const end = CURATION_SYSTEM_PROMPT.indexOf("[나쁜 예");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const goodBlock = CURATION_SYSTEM_PROMPT.slice(start, end);
    expect(goodBlock).toContain("시니어 인턴"); // 톤 기준 예시 앵커
    for (const banned of REASON_BANNED_PATTERNS) {
      expect(goodBlock).not.toMatch(banned);
    }
  });
});

describe("normalizeReason — 25/80 경계", () => {
  it("25자 미만 폐기", () => {
    expect(normalizeReason("재밌어요")).toBeNull();
    expect(normalizeReason("스무 자를 갓 넘긴 짧은 감상 한 줄")).toBeNull(); // 19자
  });

  it("25~80자 통과 (trim 원문)", () => {
    const ok = "은퇴한 벤이 패션 스타트업의 시니어 인턴으로 들어가 CEO 줄스와 함께 일하는 이야기";
    expect(normalizeReason(`  ${ok}  `)).toBe(ok);
  });

  it("80자 초과 시 자연 경계에서 truncate — 결과 ≤ 80자", () => {
    const long =
      "도시를 떠난 혜원이 고향으로 돌아와 계절이 바뀔 때마다 직접 기른 재료로 요리를 만들고, 오래된 친구들과 다시 관계를 쌓으며 일 년을 보내는 과정을 천천히 따라가는 잔잔한 드라마";
    const out = normalizeReason(long);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(80);
    expect(out!.length).toBeGreaterThanOrEqual(55);
  });
});
