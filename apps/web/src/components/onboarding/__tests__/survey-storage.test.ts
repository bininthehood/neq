import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveProgress,
  loadProgress,
  clearProgress,
  clearAllProgress,
  hasProgress,
  type SurveyProgress,
} from '../_lib/survey-storage';
import type { PersonaContext } from '@neq/core';

const MOVIE_ALONE: PersonaContext = {
  contentType: 'movie',
  companion: 'alone',
};
const VARIETY_TOGETHER: PersonaContext = {
  contentType: 'variety',
  companion: 'together',
};

function fixtureProgress(context: PersonaContext, step: 1 | 2 | 3 = 2): SurveyProgress {
  return {
    context,
    prevAnswers: [
      { question: '어떤 페이스?', selectedOption: 'b' },
      { question: '어떤 결말?', selectedOption: 'c' },
    ],
    step,
    token: 'abc.xyz',
  };
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('survey-storage', () => {
  it('1. happy — saveProgress → loadProgress 동일 데이터 복원', () => {
    const progress = fixtureProgress(MOVIE_ALONE);
    expect(saveProgress(progress)).toBe(true);
    const loaded = loadProgress(MOVIE_ALONE);
    expect(loaded).toEqual(progress);
  });

  it('2. quota 초과 → silent fallback (false 반환, write 실패)', () => {
    // jsdom 의 Storage.prototype 에 spy — sessionStorage 직접 할당은 안 통함
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementationOnce(() => {
        throw new DOMException('quota', 'QuotaExceededError');
      });
    expect(saveProgress(fixtureProgress(MOVIE_ALONE))).toBe(false);
    spy.mockRestore();
  });

  it('3. corrupt JSON → 자동 clear + null 반환', () => {
    sessionStorage.setItem(
      'neq_taste_survey_progress:movie-alone',
      'not-valid-json{',
    );
    expect(loadProgress(MOVIE_ALONE)).toBeNull();
    // 자동 clear 확인
    expect(
      sessionStorage.getItem('neq_taste_survey_progress:movie-alone'),
    ).toBeNull();
  });

  it('4. 컨텍스트별 분리 — 영화/혼자 ≠ 예능/같이', () => {
    saveProgress(fixtureProgress(MOVIE_ALONE, 2));
    saveProgress(fixtureProgress(VARIETY_TOGETHER, 1));
    const a = loadProgress(MOVIE_ALONE);
    const b = loadProgress(VARIETY_TOGETHER);
    expect(a?.step).toBe(2);
    expect(b?.step).toBe(1);
    expect(a?.context.contentType).toBe('movie');
    expect(b?.context.contentType).toBe('variety');
  });

  it('5. clearProgress("처음부터") → 해당 컨텍스트만 clear', () => {
    saveProgress(fixtureProgress(MOVIE_ALONE));
    saveProgress(fixtureProgress(VARIETY_TOGETHER));
    clearProgress(MOVIE_ALONE);
    expect(loadProgress(MOVIE_ALONE)).toBeNull();
    expect(loadProgress(VARIETY_TOGETHER)).not.toBeNull();
  });

  it('6. clearAllProgress → 모든 컨텍스트 clear', () => {
    saveProgress(fixtureProgress(MOVIE_ALONE));
    saveProgress(fixtureProgress(VARIETY_TOGETHER));
    // 다른 sessionStorage key 도 있다고 가정
    sessionStorage.setItem('unrelated_key', 'should-survive');
    clearAllProgress();
    expect(loadProgress(MOVIE_ALONE)).toBeNull();
    expect(loadProgress(VARIETY_TOGETHER)).toBeNull();
    expect(sessionStorage.getItem('unrelated_key')).toBe('should-survive');
  });

  it('7. invalid stored shape (step 필드 빠짐) → null 반환 + clear', () => {
    sessionStorage.setItem(
      'neq_taste_survey_progress:movie-alone',
      JSON.stringify({ context: MOVIE_ALONE, prevAnswers: [] }), // step 없음
    );
    expect(loadProgress(MOVIE_ALONE)).toBeNull();
    expect(
      sessionStorage.getItem('neq_taste_survey_progress:movie-alone'),
    ).toBeNull();
  });

  it('8. hasProgress — modal trigger 결정', () => {
    expect(hasProgress(MOVIE_ALONE)).toBe(false);
    saveProgress(fixtureProgress(MOVIE_ALONE));
    expect(hasProgress(MOVIE_ALONE)).toBe(true);
    expect(hasProgress(VARIETY_TOGETHER)).toBe(false);
  });

  it('9. saveProgress 호출 후 동일 컨텍스트 재저장 → 마지막만 살아남음', () => {
    saveProgress(fixtureProgress(MOVIE_ALONE, 1));
    saveProgress(fixtureProgress(MOVIE_ALONE, 2));
    saveProgress(fixtureProgress(MOVIE_ALONE, 3));
    expect(loadProgress(MOVIE_ALONE)?.step).toBe(3);
  });
});
