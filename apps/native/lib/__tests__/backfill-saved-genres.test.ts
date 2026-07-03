import { describe, it, expect, beforeEach } from 'vitest';
import type { Recommendation, SavedItem } from '@neq/core';
import AsyncStorage from './_mocks/async-storage';
import { __resetStorage } from './_mocks/async-storage';
import { backfillSavedGenres, getSaved } from '../store';

const SAVED_KEY = 'neq_saved';

function rec(tmdbId: number, genres?: number[]): Recommendation {
  return {
    title: `t${tmdbId}`,
    titleEn: `t${tmdbId}`,
    type: 'movie',
    reason: '',
    tmdbId,
    posterUrl: null,
    rating: 0,
    date: '',
    overview: '',
    providers: [],
    watchLink: null,
    director: null,
    cast: [],
    runtime: null,
    seasons: null,
    country: [],
    backdrop: null,
    ...(genres !== undefined ? { genres } : {}),
  };
}

async function seed(items: SavedItem[]): Promise<void> {
  await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(items));
}

describe('backfillSavedGenres', () => {
  beforeEach(() => __resetStorage());

  it('genres 없는 저장분만 채우고 persist', async () => {
    await seed([
      { recommendation: rec(1), savedAt: 1 },
      { recommendation: rec(2, [18]), savedAt: 2 }, // 이미 보유 → 건드리지 않음
    ]);
    const fetcher = async (ids: number[]) => {
      expect(ids).toEqual([1]); // genres 없는 id 만 요청
      return { 1: [28, 35] };
    };
    const out = await backfillSavedGenres(fetcher);
    expect(out.find((s) => s.recommendation.tmdbId === 1)!.recommendation.genres).toEqual([28, 35]);
    expect(out.find((s) => s.recommendation.tmdbId === 2)!.recommendation.genres).toEqual([18]);
    // persist 확인
    const persisted = await getSaved();
    expect(persisted.find((s) => s.recommendation.tmdbId === 1)!.recommendation.genres).toEqual([28, 35]);
  });

  it('빈 장르([])도 백필 완료로 간주 — 재조회 안 함', async () => {
    await seed([{ recommendation: rec(1), savedAt: 1 }]);
    const out = await backfillSavedGenres(async () => ({ 1: [] }));
    expect(out[0].recommendation.genres).toEqual([]);
    // 두 번째 호출: missing 0개 → fetcher 미호출
    let called = false;
    await backfillSavedGenres(async () => { called = true; return {}; });
    expect(called).toBe(false);
  });

  it('mirror 미매칭 id 는 그대로 남아 다음 로드에서 재시도', async () => {
    await seed([{ recommendation: rec(1), savedAt: 1 }]);
    const out = await backfillSavedGenres(async () => ({})); // 미매칭
    expect(out[0].recommendation.genres).toBeUndefined();
  });

  it('저장분 없으면 no-op', async () => {
    const out = await backfillSavedGenres(async () => ({ 1: [1] }));
    expect(out).toEqual([]);
  });
});
