import { describe, it, expect } from 'vitest';
import { filterHidden } from '../hidden-keys';

type R = { type: 'movie' | 'series' | 'variety'; tmdbId: number; title: string };
const rec = (type: R['type'], tmdbId: number): R => ({ type, tmdbId, title: `${type}${tmdbId}` });

describe('앱 숨김 필터 (X2)', () => {
  it('숨김이 없으면 같은 배열 (재렌더 비용 0)', () => {
    const deck = [rec('movie', 1)];
    expect(filterHidden(deck, new Set())).toBe(deck);
  });

  it('이미 받아 둔 카드: 숨긴 작품만 빠지고 순서 유지', () => {
    const deck = [rec('movie', 1), rec('series', 2), rec('movie', 3)];
    expect(filterHidden(deck, new Set(['tv:2'])).map((r) => r.tmdbId)).toEqual([1, 3]);
  });

  it('영화·드라마 같은 id 는 서로 안 가림', () => {
    const deck = [rec('movie', 9), rec('series', 9)];
    expect(filterHidden(deck, new Set(['movie:9']))).toEqual([rec('series', 9)]);
  });

  it('큐(관련작·장르) 덱의 예능도 tv 키로 걸림', () => {
    const mixDeck = [rec('variety', 4), rec('movie', 5)];
    expect(filterHidden(mixDeck, new Set(['tv:4'])).map((r) => r.tmdbId)).toEqual([5]);
  });

  it('인기작 대체(/api/trending) 카드도 걸림', () => {
    // api.ts trendingItemToRecommendation 은 type 정보가 없어 'movie' 로 채운다 (expo/fetch 의존이라 직접 import 불가)
    const trending = [rec('movie', 11), rec('movie', 12)];
    expect(filterHidden(trending, new Set(['movie:11'])).map((r) => r.tmdbId)).toEqual([12]);
  });
});
