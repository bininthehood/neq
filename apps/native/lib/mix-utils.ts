/**
 * Seeded Mix MVP — 순수 헬퍼 (2026-07-08).
 *
 * Discover top 카드 MIX 버튼 → seed 작품 기준 후보 묶음.
 * 데이터는 기존 `/api/tmdb/related` 응답(RelatedWorksResponse)을 그대로 재사용 —
 * 새 API/자체 scoring 없음. priority: recommendations → collection → directorWorks.
 * (genre/provider 보강은 related 응답에 재료가 없어 MVP 범위 밖 — 후속 과제.)
 */
import type { RelatedWork, RelatedWorksResponse } from './types';

export const MIX_MAX_ITEMS = 12;

/**
 * 받침 유무에 따른 도구격 조사. 받침 없음 또는 ㄹ 받침 → '로', 그 외 받침 → '으로'.
 * 비한글 끝 글자(영문/숫자)는 발음 판정이 불가해 '로' 고정.
 */
export function koreanInstrumentalParticle(word: string): '으로' | '로' {
  const code = word.charCodeAt(word.length - 1);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return jong === 0 || jong === 8 ? '로' : '으로';
  }
  return '로';
}

export function mixLabelOf(seedTitle: string): string {
  return `${seedTitle} 믹스`;
}

export function mixCaptionOf(seedTitle: string): string {
  return `${seedTitle}${koreanInstrumentalParticle(seedTitle)} 시작한 믹스`;
}

/** dedupe key — tmdb id 는 movie/tv 공간이 독립이라 id 단독 비교 금지 (media_type PK 정합). */
function keyOf(w: RelatedWork): string {
  return `${w.mediaType}:${w.id}`;
}

export function dedupeMixItems(items: RelatedWork[]): RelatedWork[] {
  const seen = new Set<string>();
  const out: RelatedWork[] = [];
  for (const w of items) {
    const k = keyOf(w);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(w);
  }
  return out;
}

/**
 * seed + related 응답 → 믹스 후보 (최대 max).
 * priority: recommendations → collection.works → directorWorks.
 * seed 자기 자신(id + mediaType 일치) 제외, `mediaType:id` dedupe.
 */
export function buildSeededMixItems(
  seed: { tmdbId: number; type: 'movie' | 'series' | 'variety' },
  related: RelatedWorksResponse,
  max: number = MIX_MAX_ITEMS,
): RelatedWork[] {
  const seedMediaType = seed.type === 'movie' ? 'movie' : 'tv';
  const merged = [
    ...related.recommendations,
    ...(related.collection?.works ?? []),
    ...related.directorWorks,
  ].filter((w) => !(w.id === seed.tmdbId && w.mediaType === seedMediaType));
  return dedupeMixItems(merged).slice(0, max);
}
