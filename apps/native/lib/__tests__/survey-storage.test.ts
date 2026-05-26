import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearAllProgress,
  clearProgress,
  hasProgress,
  loadProgress,
  saveProgress,
} from '../survey-storage';
import {
  __allKeys,
  __peekStorage,
  __resetStorage,
} from './_mocks/async-storage';
import type { PersonaContext } from '@neq/core';

/**
 * Persona v2 survey-storage (native AsyncStorage wrapper) 회귀.
 *
 * web `apps/web/src/components/onboarding/__tests__/survey-storage.test.ts`
 * 정합. 차이: 모든 API 가 async (AsyncStorage 기반).
 */

const MOVIE_ALONE: PersonaContext = { contentType: 'movie', companion: 'alone' };
const VARIETY_TOGETHER: PersonaContext = {
  contentType: 'variety',
  companion: 'together',
};

beforeEach(() => {
  __resetStorage();
});

describe('survey-storage (native)', () => {
  it('1. happy — saveProgress → loadProgress 동일 데이터 복원', async () => {
    const progress = {
      context: MOVIE_ALONE,
      prevAnswers: [
        { question: '어떤 페이스?', selectedOption: '천천히 깊게' },
      ],
      step: 2 as const,
      token: 'abc.def',
    };
    const ok = await saveProgress(progress);
    expect(ok).toBe(true);

    const loaded = await loadProgress(MOVIE_ALONE);
    expect(loaded).toEqual(progress);
  });

  it('2. corrupt JSON → 자동 clear + null 반환', async () => {
    // raw 손상 — 직접 mock 에 손상 데이터 주입
    const mod = await import('./_mocks/async-storage');
    const corruptKey = 'neq_taste_survey_progress:movie-alone';
    // mock 의 setItem 사용
    await mod.default.setItem(corruptKey, '{this is not json');
    expect(__peekStorage(corruptKey)).toContain('this is not json');

    const loaded = await loadProgress(MOVIE_ALONE);
    expect(loaded).toBeNull();
    // 자동 clear 확인
    expect(__peekStorage(corruptKey)).toBeUndefined();
  });

  it('3. invalid stored shape (step 필드 빠짐) → null 반환 + clear', async () => {
    const mod = await import('./_mocks/async-storage');
    const key = 'neq_taste_survey_progress:movie-alone';
    await mod.default.setItem(
      key,
      JSON.stringify({
        context: MOVIE_ALONE,
        prevAnswers: [],
        // step 없음
      }),
    );
    const loaded = await loadProgress(MOVIE_ALONE);
    expect(loaded).toBeNull();
    expect(__peekStorage(key)).toBeUndefined();
  });

  it('4. 컨텍스트별 분리 — 영화/혼자 ≠ 예능/같이', async () => {
    await saveProgress({
      context: MOVIE_ALONE,
      prevAnswers: [{ question: 'q1', selectedOption: 'a' }],
      step: 1,
    });
    await saveProgress({
      context: VARIETY_TOGETHER,
      prevAnswers: [
        { question: 'q1', selectedOption: 'b' },
        { question: 'q2', selectedOption: 'c' },
      ],
      step: 2,
    });

    const a = await loadProgress(MOVIE_ALONE);
    const b = await loadProgress(VARIETY_TOGETHER);
    expect(a?.prevAnswers).toHaveLength(1);
    expect(b?.prevAnswers).toHaveLength(2);
    expect(a?.step).toBe(1);
    expect(b?.step).toBe(2);
  });

  it('5. clearProgress("처음부터") → 해당 컨텍스트만 clear', async () => {
    await saveProgress({
      context: MOVIE_ALONE,
      prevAnswers: [{ question: 'q', selectedOption: 'a' }],
      step: 1,
    });
    await saveProgress({
      context: VARIETY_TOGETHER,
      prevAnswers: [{ question: 'q', selectedOption: 'b' }],
      step: 1,
    });

    await clearProgress(MOVIE_ALONE);
    expect(await loadProgress(MOVIE_ALONE)).toBeNull();
    expect(await loadProgress(VARIETY_TOGETHER)).not.toBeNull();
  });

  it('6. clearAllProgress → 모든 컨텍스트 clear', async () => {
    await saveProgress({
      context: MOVIE_ALONE,
      prevAnswers: [{ question: 'q', selectedOption: 'a' }],
      step: 1,
    });
    await saveProgress({
      context: VARIETY_TOGETHER,
      prevAnswers: [{ question: 'q', selectedOption: 'b' }],
      step: 1,
    });
    // 다른 prefix 의 unrelated key 도 추가 — 보존 확인
    const mod = await import('./_mocks/async-storage');
    await mod.default.setItem('neq_onboarded', 'true');

    await clearAllProgress();
    expect(await loadProgress(MOVIE_ALONE)).toBeNull();
    expect(await loadProgress(VARIETY_TOGETHER)).toBeNull();
    // 다른 prefix 의 key 는 보존
    expect(__allKeys()).toContain('neq_onboarded');
  });

  it('7. hasProgress — modal trigger 결정', async () => {
    expect(await hasProgress(MOVIE_ALONE)).toBe(false);
    await saveProgress({
      context: MOVIE_ALONE,
      prevAnswers: [{ question: 'q', selectedOption: 'a' }],
      step: 1,
    });
    expect(await hasProgress(MOVIE_ALONE)).toBe(true);
    expect(await hasProgress(VARIETY_TOGETHER)).toBe(false);
  });

  it('8. saveProgress 호출 후 동일 컨텍스트 재저장 → 마지막만 살아남음', async () => {
    await saveProgress({
      context: MOVIE_ALONE,
      prevAnswers: [{ question: 'q1', selectedOption: 'a' }],
      step: 1,
    });
    await saveProgress({
      context: MOVIE_ALONE,
      prevAnswers: [
        { question: 'q1', selectedOption: 'a' },
        { question: 'q2', selectedOption: 'b' },
      ],
      step: 2,
      token: 'new-token',
    });

    const loaded = await loadProgress(MOVIE_ALONE);
    expect(loaded?.prevAnswers).toHaveLength(2);
    expect(loaded?.step).toBe(2);
    expect(loaded?.token).toBe('new-token');
  });

  it('9. step 3 도 valid', async () => {
    await saveProgress({
      context: MOVIE_ALONE,
      prevAnswers: [],
      step: 3,
    });
    const loaded = await loadProgress(MOVIE_ALONE);
    expect(loaded?.step).toBe(3);
  });
});
