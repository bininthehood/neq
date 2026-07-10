/**
 * 데이터 선행 fetch + 모듈 캐시 (2026-07-10).
 *
 * 배경: 이미지 팝인 완화 (0f752fd) 후에도 남은 체감 지연은 데이터 도착 자체 —
 * 실측: /api/trending 0.5~1.0s (온보딩 선호작 스텝), /api/tmdb/related 0.7~1.8s
 * (DetailSheet 관련작 스켈레톤). 화면 mount 시점이 아니라 "도착이 예상되는
 * 시점" 에 미리 받아 캐시하면 mount 즉시 렌더.
 *
 * - trending: 설문 시작 시점에 warm — favorites 스텝 도달까지 3-step 여유.
 * - related: Discover top 카드 1.5s dwell 시 선-fetch (빠른 스와이프는 스킵 —
 *   TMDB 호출 낭비 방지). DetailSheet 재오픈/history 복귀도 캐시 히트.
 * 캐시는 module-level (탭 전환 무관), TTL 10분, related 는 LRU 20.
 */
import { env } from './env';
import { prefetchPosters } from './image-prefetch';
import type { RelatedWorksResponse } from './types';

const TTL_MS = 10 * 60 * 1000;

// ---------- trending (온보딩 선호작 제안 풀) ----------

let trendingCache: { at: number; data: unknown[] } | null = null;
let trendingInflight: Promise<void> | null = null;

export function warmTrending(): void {
  if (trendingCache && Date.now() - trendingCache.at < TTL_MS) return;
  if (trendingInflight) return;
  trendingInflight = fetch(`${env.API_BASE_URL}/api/trending`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data: unknown) => {
      if (Array.isArray(data) && data.length > 0) {
        trendingCache = { at: Date.now(), data };
        prefetchPosters(
          (data as { posterUrl?: string | null }[]).map((d) => d.posterUrl ?? null),
          24,
        );
      }
    })
    .catch(() => {
      /* silent — 소비처가 기존 fetch 경로로 폴백 */
    })
    .finally(() => {
      trendingInflight = null;
    });
}

export function getTrendingCached(): unknown[] | null {
  if (trendingCache && Date.now() - trendingCache.at < TTL_MS) return trendingCache.data;
  return null;
}

// ---------- related (DetailSheet 관련작) ----------

const relatedCache = new Map<string, { at: number; data: RelatedWorksResponse }>();
const relatedInflight = new Set<string>();
const RELATED_LRU_MAX = 20;

function relatedKey(tmdbId: number, type: 'movie' | 'series'): string {
  return `${type}:${tmdbId}`;
}

export function getRelatedCached(
  tmdbId: number,
  type: 'movie' | 'series',
): RelatedWorksResponse | null {
  const hit = relatedCache.get(relatedKey(tmdbId, type));
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  return null;
}

export function putRelatedCache(
  tmdbId: number,
  type: 'movie' | 'series',
  data: RelatedWorksResponse,
): void {
  const key = relatedKey(tmdbId, type);
  relatedCache.delete(key);
  relatedCache.set(key, { at: Date.now(), data });
  // LRU — Map 삽입 순서 = 오래된 것부터 evict.
  while (relatedCache.size > RELATED_LRU_MAX) {
    const oldest = relatedCache.keys().next().value;
    if (oldest === undefined) break;
    relatedCache.delete(oldest);
  }
}

export function prefetchRelated(tmdbId: number, type: 'movie' | 'series'): void {
  const key = relatedKey(tmdbId, type);
  if (getRelatedCached(tmdbId, type) || relatedInflight.has(key)) return;
  relatedInflight.add(key);
  fetch(`${env.API_BASE_URL}/api/tmdb/related?work_id=${tmdbId}&type=${type}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data: RelatedWorksResponse | null) => {
      if (!data) return;
      putRelatedCache(tmdbId, type, data);
      prefetchPosters(
        [
          ...(data.collection?.works ?? []),
          ...(data.recommendations ?? []),
          ...(data.directorWorks ?? []),
        ].map((w) => w.posterUrl),
        36,
      );
    })
    .catch(() => {
      /* silent */
    })
    .finally(() => {
      relatedInflight.delete(key);
    });
}
