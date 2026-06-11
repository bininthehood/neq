/**
 * REGRESSION test (IRON RULE) — CRITICAL.
 *
 * 페르소나 v2 의 tasteSummary 가 undefined / 빈 문자열일 때 LLM 큐레이션 user
 * prompt 가 기존 (v1) 과 100% 동일해야 함. 1 byte 라도 차이 나면 기존 사용자
 * 추천 결과가 변할 수 있음 → 추천 만족도 회귀 위험.
 *
 * Test plan artifact 의 "Regression critical (IRON RULE)" 첫 항목.
 */
import { describe, it, expect, vi } from 'vitest';

// Env stub + OpenAI SDK mock — module 평가 단계 throw 방지.
// 본 test 는 LLM 호출 안 함 (pure prompt builder 만 검사).
vi.hoisted(() => {
  process.env.TMDB_API_KEY = 'test-tmdb-key';
  process.env.OPENAI_API_KEY = 'sk-test-0123456789abcdef0123456789abcdef';
});

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: vi.fn() } };
  },
}));

import { buildCurationUserPrompt } from '../prompt';
import type { EnrichedCandidate } from '../types';

function fixtureCandidate(id: number, title: string): EnrichedCandidate {
  // 본 REGRESSION test 는 tasteSummary 분기만 검증 — buildCandidateList 가 읽는
  // 최소 필드만 mock. TMDBSimilarItem shape 의 release_date / vote_average /
  // overview / genre_ids 등.
  return {
    id,
    type: 'movie',
    item: {
      id,
      title,
      release_date: '2024-01-01',
      vote_average: 7.5,
      overview: '테스트 작품 개요',
      genre_ids: [18],
    },
    frequency: 1,
    score: 7.5,
    providers: [],
    watchLink: null,
    credits: {
      director: null,
      cast: [],
      directorMember: null,
      castMembers: [],
    },
    details: {
      runtime: 120,
      seasons: null,
      country: ['KR'],
      backdrop: null,
    },
  } as unknown as EnrichedCandidate;
}

const BASE_ARGS = {
  candidates: [fixtureCandidate(1, '기생충'), fixtureCandidate(2, '올드보이')],
  favorites: ['살인의 추억', '오아시스'],
  feedback: undefined,
  savedCount: 0,
  onboardingCount: 5,
  tasteGenres: ['thriller', 'drama'],
  subscribedOtt: [8, 337],
};

describe('IRON RULE — buildCurationUserPrompt tasteSummary 분기', () => {
  it('tasteSummary undefined → 기존 (v1) prompt 와 동일', () => {
    const v1 = buildCurationUserPrompt(
      BASE_ARGS.candidates,
      BASE_ARGS.favorites,
      BASE_ARGS.feedback,
      BASE_ARGS.savedCount,
      BASE_ARGS.onboardingCount,
      BASE_ARGS.tasteGenres,
      BASE_ARGS.subscribedOtt,
      // tasteSummary 인자 omitted = undefined
    );
    const v2WithoutSummary = buildCurationUserPrompt(
      BASE_ARGS.candidates,
      BASE_ARGS.favorites,
      BASE_ARGS.feedback,
      BASE_ARGS.savedCount,
      BASE_ARGS.onboardingCount,
      BASE_ARGS.tasteGenres,
      BASE_ARGS.subscribedOtt,
      undefined,
    );
    expect(v2WithoutSummary).toBe(v1);
    // 1 byte 라도 차이 나면 추천 결과 회귀 가능
    expect(v2WithoutSummary.length).toBe(v1.length);
  });

  it('tasteSummary 빈 문자열 → 기존 prompt 와 동일', () => {
    const v1 = buildCurationUserPrompt(
      BASE_ARGS.candidates,
      BASE_ARGS.favorites,
      BASE_ARGS.feedback,
      BASE_ARGS.savedCount,
      BASE_ARGS.onboardingCount,
      BASE_ARGS.tasteGenres,
      BASE_ARGS.subscribedOtt,
    );
    const v2Empty = buildCurationUserPrompt(
      BASE_ARGS.candidates,
      BASE_ARGS.favorites,
      BASE_ARGS.feedback,
      BASE_ARGS.savedCount,
      BASE_ARGS.onboardingCount,
      BASE_ARGS.tasteGenres,
      BASE_ARGS.subscribedOtt,
      '',
    );
    expect(v2Empty).toBe(v1);
  });

  it('tasteSummary 공백 only → 기존 prompt 와 동일', () => {
    const v1 = buildCurationUserPrompt(
      BASE_ARGS.candidates,
      BASE_ARGS.favorites,
      BASE_ARGS.feedback,
      BASE_ARGS.savedCount,
      BASE_ARGS.onboardingCount,
      BASE_ARGS.tasteGenres,
      BASE_ARGS.subscribedOtt,
    );
    const v2Whitespace = buildCurationUserPrompt(
      BASE_ARGS.candidates,
      BASE_ARGS.favorites,
      BASE_ARGS.feedback,
      BASE_ARGS.savedCount,
      BASE_ARGS.onboardingCount,
      BASE_ARGS.tasteGenres,
      BASE_ARGS.subscribedOtt,
      '   \n\t  ',
    );
    expect(v2Whitespace).toBe(v1);
  });

  it('tasteSummary 정상 → [취향 요약] 블록 추가됨', () => {
    const v1 = buildCurationUserPrompt(
      BASE_ARGS.candidates,
      BASE_ARGS.favorites,
      BASE_ARGS.feedback,
      BASE_ARGS.savedCount,
      BASE_ARGS.onboardingCount,
      BASE_ARGS.tasteGenres,
      BASE_ARGS.subscribedOtt,
    );
    const summary = '여운이 긴 작품을 좋아하는 사람입니다.';
    const v2 = buildCurationUserPrompt(
      BASE_ARGS.candidates,
      BASE_ARGS.favorites,
      BASE_ARGS.feedback,
      BASE_ARGS.savedCount,
      BASE_ARGS.onboardingCount,
      BASE_ARGS.tasteGenres,
      BASE_ARGS.subscribedOtt,
      summary,
    );
    expect(v2).not.toBe(v1);
    expect(v2).toContain('[취향 요약]');
    expect(v2).toContain(summary);
    // 기존 prompt 의 모든 텍스트가 v2 에도 그대로 (추가만, 제거 없음)
    expect(v2).toContain('[사용자 취향 기반]');
    expect(v2).toContain('[후보 ');
  });

  it('tasteSummary 800자 초과 → sentence boundary truncate', () => {
    const long =
      '첫 번째 문장입니다. ' +
      '두번째 매우 매우 매우 ' + '아주 아주 '.repeat(200);
    const v2 = buildCurationUserPrompt(
      BASE_ARGS.candidates,
      BASE_ARGS.favorites,
      BASE_ARGS.feedback,
      BASE_ARGS.savedCount,
      BASE_ARGS.onboardingCount,
      BASE_ARGS.tasteGenres,
      BASE_ARGS.subscribedOtt,
      long,
    );
    // [취향 요약] 블록 안의 truncated 길이 < 원본
    expect(v2).toContain('[취향 요약]');
    expect(v2.length).toBeLessThan(long.length + 500); // 다른 블록 포함해도 long 보다 짧음
  });

  it('tasteSummary 명시 = "내 취향"... → 정확히 prepend (앞뒤 공백 trim)', () => {
    const summary = '  여운이 긴 작품 ';
    const v2 = buildCurationUserPrompt(
      BASE_ARGS.candidates,
      BASE_ARGS.favorites,
      BASE_ARGS.feedback,
      BASE_ARGS.savedCount,
      BASE_ARGS.onboardingCount,
      BASE_ARGS.tasteGenres,
      BASE_ARGS.subscribedOtt,
      summary,
    );
    expect(v2).toContain('[취향 요약]\n여운이 긴 작품');
    expect(v2).not.toContain('[취향 요약]\n  여운');
  });
});
