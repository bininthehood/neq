import { describe, it, expect } from 'vitest';
import type { RelatedWork, RelatedWorksResponse } from '@neq/core';
import {
  koreanInstrumentalParticle,
  mixLabelOf,
  mixCaptionOf,
  dedupeMixItems,
  buildSeededMixItems,
  MIX_MAX_ITEMS,
} from '../mix-utils';

function w(id: number, mediaType: 'movie' | 'tv' = 'movie', title = `w${id}`): RelatedWork {
  return { id, title, posterUrl: null, year: '2020', mediaType };
}

function related(partial: Partial<RelatedWorksResponse>): RelatedWorksResponse {
  return {
    collection: null,
    recommendations: [],
    directorWorks: [],
    directorName: null,
    ...partial,
  };
}

describe('koreanInstrumentalParticle', () => {
  it('받침 있는 글자 → 으로', () => {
    expect(koreanInstrumentalParticle('인셉션')).toBe('으로');
    expect(koreanInstrumentalParticle('올드보이')).toBe('로'); // 받침 없음
  });
  it('받침 없는 글자 → 로', () => {
    expect(koreanInstrumentalParticle('토르')).toBe('로');
  });
  it('ㄹ 받침 → 로 (도구격 예외)', () => {
    expect(koreanInstrumentalParticle('겨울')).toBe('로');
  });
  it('비한글 끝 글자 → 로 고정', () => {
    expect(koreanInstrumentalParticle('Her')).toBe('로');
    expect(koreanInstrumentalParticle('1917')).toBe('로');
  });
  it('라벨/캡션 조합', () => {
    expect(mixLabelOf('인셉션')).toBe('인셉션 믹스');
    expect(mixCaptionOf('인셉션')).toBe('인셉션으로 시작한 믹스');
    expect(mixCaptionOf('토르')).toBe('토르로 시작한 믹스');
  });
});

describe('dedupeMixItems', () => {
  it('mediaType:id 기준 중복 제거 — 첫 항목 유지', () => {
    const out = dedupeMixItems([w(1), w(2), w(1), w(2, 'tv')]);
    // movie:1, movie:2, tv:2 — movie/tv 는 id 공간이 독립이라 tv:2 는 별개 작품.
    expect(out).toHaveLength(3);
    expect(out.map((x) => `${x.mediaType}:${x.id}`)).toEqual(['movie:1', 'movie:2', 'tv:2']);
  });
});

describe('buildSeededMixItems', () => {
  const seed = { tmdbId: 100, type: 'movie' as const };

  it('priority: recommendations → collection → directorWorks', () => {
    const out = buildSeededMixItems(
      seed,
      related({
        recommendations: [w(1)],
        collection: { id: 9, name: 'c', works: [w(2)] },
        directorWorks: [w(3)],
      }),
    );
    expect(out.map((x) => x.id)).toEqual([1, 2, 3]);
  });

  it('seed 자기 자신 제외 (id + mediaType 일치)', () => {
    const out = buildSeededMixItems(
      seed,
      related({
        recommendations: [w(100), w(1)],
        // tv:100 은 seed(movie:100) 와 다른 작품 — 제외되면 안 됨.
        directorWorks: [w(100, 'tv')],
      }),
    );
    expect(out.map((x) => `${x.mediaType}:${x.id}`)).toEqual(['movie:1', 'tv:100']);
  });

  it('series/variety seed 는 tv mediaType 으로 자기 제외', () => {
    const out = buildSeededMixItems(
      { tmdbId: 100, type: 'series' },
      related({ recommendations: [w(100, 'tv'), w(100, 'movie')] }),
    );
    expect(out.map((x) => `${x.mediaType}:${x.id}`)).toEqual(['movie:100']);
  });

  it('섹션 간 중복 dedupe + 최대 12개 캡', () => {
    const many = Array.from({ length: 10 }, (_, i) => w(i + 1));
    const out = buildSeededMixItems(
      seed,
      related({
        recommendations: many,
        collection: { id: 9, name: 'c', works: [w(1), w(11), w(12), w(13)] },
        directorWorks: [w(2), w(14)],
      }),
    );
    expect(out).toHaveLength(MIX_MAX_ITEMS);
    // w(1)/w(2) 는 recommendations 에서 이미 등장 — 재등장 X.
    expect(out.map((x) => x.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('빈 related → 빈 배열 (Discover 흐름 무손상 fallback 은 호출부 책임)', () => {
    expect(buildSeededMixItems(seed, related({}))).toEqual([]);
  });
});
