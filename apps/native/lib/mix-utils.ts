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

// 3차 (2026-07-08) — 사용자 노출 용어 '믹스' → '큐'. 내부 심볼/이벤트명은 mix 유지.
export function mixLabelOf(seedTitle: string): string {
  return `${seedTitle} 큐`;
}

export function mixCaptionOf(seedTitle: string): string {
  return `${seedTitle}${koreanInstrumentalParticle(seedTitle)} 시작한 큐`;
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

/**
 * 장르 큐 하이브리드 병합 (3차, 2026-07-08) — mirror 대표작 2 : seed related 1 교차.
 *
 * "애니만 saved 면 SF 큐도 애니만 나옴" (related-only 편향) 과 "대표작 일변도"
 * (mirror-only) 둘 다 방지. mirror 우세 비율인 이유: 장르 큐의 기대는 "그 장르의
 * 대표작 발견" 이고, related 는 개인 맥락(저장작 인접) 양념.
 *
 * excludeKeys: `${mediaType}:${id}` — saved + recHistory 활성 + seed 자신.
 * 한쪽이 비면 자연히 다른 쪽만으로 채움 (mirror fetch 실패 = related-only fallback).
 */
export function mergeGenreQueueItems(
  mirror: RelatedWork[],
  related: RelatedWork[],
  excludeKeys: Set<string>,
  max: number = MIX_MAX_ITEMS,
): RelatedWork[] {
  const seen = new Set(excludeKeys);
  const out: RelatedWork[] = [];
  const takeFrom = (list: RelatedWork[], idx: number): [RelatedWork | null, number] => {
    while (idx < list.length) {
      const w = list[idx++];
      const k = `${w.mediaType}:${w.id}`;
      if (!seen.has(k)) {
        seen.add(k);
        return [w, idx];
      }
    }
    return [null, idx];
  };
  let mi = 0;
  let ri = 0;
  while (out.length < max) {
    let progressed = false;
    for (let n = 0; n < 2 && out.length < max; n++) {
      const [w, ni] = takeFrom(mirror, mi);
      mi = ni;
      if (!w) break;
      out.push(w);
      progressed = true;
    }
    if (out.length < max) {
      const [w, ni] = takeFrom(related, ri);
      ri = ni;
      if (w) {
        out.push(w);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return out;
}
