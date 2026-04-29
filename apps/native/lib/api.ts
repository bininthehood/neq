import { createApiClient } from '@neq/core';
import type { Recommendation, RecommendFilter } from '@neq/core';
import { env } from './env';
import { track, parseServerTiming } from './analytics';
import { buildPrefetchKey } from './prefetch-utils';

// re-export — 외부 호출자(useRecommendations 등)는 './api' 한 곳에서 가져갈 수 있게
export { buildPrefetchKey } from './prefetch-utils';

const client = createApiClient(env.API_BASE_URL);

export const searchTMDB = client.searchTMDB;

export type { RecommendRequest } from '@neq/core';
export type { SearchResult } from '@neq/core';

import type { RecommendRequest } from '@neq/core';

/**
 * 추천 fetch + PostHog `recommendation_loaded` 이벤트.
 *
 * 웹 `useRecommendations.ts` 패턴 1:1 — 단, 네이티브는 NDJSON streaming 미지원이므로
 * Server-Timing 헤더로 srv_*_ms 를 측정한다 (서버가 헤더를 노출하는 경우).
 *
 * 측정 속성:
 * - duration_ms: 클라이언트 round-trip
 * - srv_<step>_ms: Server-Timing 헤더의 각 step (예: srv_enrich_ms, srv_llm_ms)
 * - cold_start: favorites.length === 0
 * - favorites_count, has_filter, count, ...
 * - taste_genres_count / subscribed_ott_count / cold_start_version: V2 입력 (P0-2)
 *
 * 실패 시 `recommendation_failed` 발사.
 *
 * #16 Cold start fallback (D6):
 *   favorites=[] 인데 서버가 0건 응답을 주는 cold start 함정에 대비.
 *   recs.length === 0 이고 favorites=[] 이면 `/api/trending` 으로 보강.
 *   trending 응답은 단순 schema 라 누락 필드는 안전 기본값으로 채운다.
 *
 * P0-2 Cold Start V2 (위임 D4b):
 *   호출자가 body 에 tasteGenres / subscribedOtt 를 포함하면 그대로 서버에 전달.
 *   flag OFF 또는 값이 빈 배열이면 호출자가 body 에서 제거하여 V1 동작 그대로 보존.
 */
export async function fetchRecommendations(
  body: RecommendRequest = {},
  signal?: AbortSignal,
): Promise<Recommendation[]> {
  const t0 = Date.now();
  const favoritesCount = body.favorites?.length ?? 0;
  const hasFilter = !!body.filter && Object.keys(body.filter).length > 0;
  const filterType = body.filter?.type ?? 'all';
  const filterOrigin = body.filter?.origin ?? 'all';
  const isColdStart = favoritesCount === 0;
  // V2 입력 (P0-2) — body 에 포함된 값 기준으로 PostHog 속성 계산.
  // flag 평가/prefs 읽기는 호출자(useRecommendations 또는 화면) 가 담당.
  const tasteGenresCount = body.tasteGenres?.length ?? 0;
  const subscribedOttCount = body.subscribedOtt?.length ?? 0;
  const coldStartVersion: 'v1' | 'v2' =
    tasteGenresCount > 0 || subscribedOttCount > 0 ? 'v2' : 'v1';

  // @neq/core 가 fetch 응답 객체를 노출하지 않으므로 timing 측정은 raw fetch 로 한다.
  // (signature/error 처리는 createApiClient 와 동일하게 유지)
  let res: Response;
  try {
    res = await fetch(`${env.API_BASE_URL}/api/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    track('recommendation_failed', {
      reason: 'network_error',
      filter_type: filterType,
      filter_origin: filterOrigin,
    });
    throw err;
  }

  if (!res.ok) {
    track('recommendation_failed', {
      reason: 'http_error',
      status: res.status,
      filter_type: filterType,
      filter_origin: filterOrigin,
    });
    const text = await res.text().catch(() => '');
    throw new Error(`추천 요청 실패 (${res.status}) ${text.slice(0, 200)}`);
  }

  const serverTiming = parseServerTiming(res.headers.get('server-timing'));
  const data = (await res.json()) as { recommendations?: Recommendation[] };
  let recs = data.recommendations ?? [];

  // #16 Cold start fallback — favorites=[] + 빈 응답일 때 trending으로 보강
  let coldStartFallbackUsed = false;
  if (isColdStart && recs.length === 0) {
    try {
      const trending = await fetchTrendingAsRecommendations(signal);
      if (trending.length > 0) {
        recs = trending;
        coldStartFallbackUsed = true;
      }
    } catch {
      // trending 실패는 silent — 빈 응답 그대로 반환 (사용자에게는 empty state 노출)
    }
  }

  const duration_ms = Date.now() - t0;

  // recommendations 가 비어 있어도 발사 (서버가 0건 응답을 줄 수 있음 → funnel drop 진단)
  const props: Record<string, string | number | boolean | null | undefined> = {
    count: recs.length,
    duration_ms,
    cold_start: isColdStart,
    favorites_count: favoritesCount,
    has_filter: hasFilter,
    filter_type: filterType,
    filter_origin: filterOrigin,
    streamed: false,
    platform: 'native',
    cold_start_fallback: coldStartFallbackUsed,
    taste_genres_count: tasteGenresCount,
    subscribed_ott_count: subscribedOttCount,
    cold_start_version: coldStartVersion,
  };
  // Server-Timing 헤더 → srv_<name>_ms
  for (const [k, v] of Object.entries(serverTiming)) {
    props[`srv_${k}_ms`] = v;
  }
  track('recommendation_loaded', props);

  // V2 분기 진입 시 별도 이벤트 1건 (web 의 cold_start_v2 패턴 일치)
  if (coldStartVersion === 'v2') {
    track('cold_start_v2', {
      taste_genres_count: tasteGenresCount,
      subscribed_ott_count: subscribedOttCount,
      favorites_count: favoritesCount,
      platform: 'native',
    });
  }

  return recs;
}

// =============================================================================
// #16 Cold start fallback — /api/trending
// =============================================================================

interface TrendingItem {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
}

/**
 * /api/trending 응답을 Recommendation schema 로 매핑.
 *
 * trending endpoint 는 cold start 시 LLM 호출 없이 빠르게 카드를 채우는 안전망이라
 * reason/cast/director/runtime 등 LLM/enrich 산출물은 빈 값/null 로 둔다.
 *
 * - type: 응답에 정보 없음 → 'movie' 로 기본값 (web /api/trending 은 movie/tv 혼합이지만
 *   필드가 노출되지 않음). 향후 trending 응답 schema 를 확장하면 정확화 가능.
 * - rating/overview: TMDB 원본 미노출 → 0/'' 로 두고 UI 에서 fallback 처리.
 */
function trendingItemToRecommendation(item: TrendingItem): Recommendation {
  return {
    title: item.title,
    titleEn: item.title,
    type: 'movie',
    reason: '',
    tmdbId: item.id,
    posterUrl: item.posterUrl,
    rating: 0,
    date: item.year,
    overview: '',
    providers: [],
    watchLink: null,
    director: null,
    cast: [],
    runtime: null,
    seasons: null,
    country: [],
    backdrop: null,
  };
}

async function fetchTrendingAsRecommendations(
  signal?: AbortSignal,
): Promise<Recommendation[]> {
  const res = await fetch(`${env.API_BASE_URL}/api/trending`, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as TrendingItem[] | unknown;
  if (!Array.isArray(data)) return [];
  return data.map(trendingItemToRecommendation);
}

// =============================================================================
// #17 Recommendation prefetch — module-level cache
// =============================================================================

interface PrefetchEntry {
  key: string;
  recs: Recommendation[];
  ts: number;
}

const PREFETCH_TTL_MS = 5 * 60 * 1000; // 5분
const prefetchCache = new Map<string, PrefetchEntry>();
const inflightPrefetch = new Map<string, Promise<void>>();

/**
 * 캐시 무효 — 활성 항목만 보존.
 */
function pruneExpired(): void {
  const now = Date.now();
  for (const [key, entry] of prefetchCache.entries()) {
    if (now - entry.ts > PREFETCH_TTL_MS) prefetchCache.delete(key);
  }
}

/**
 * 백그라운드 prefetch — 캐시에 결과를 저장한다. 호출자는 await 안 해도 됨.
 *
 * - 같은 key 가 캐시 또는 진행 중이면 재호출 skip
 * - 호출 자체는 silent (사용자 노출 X) → recommendation_loaded 발사 X
 *   대신 `recommendation_load_more` 발사 (web prefetchNextBatch 와 일치)
 *
 * @returns Promise — 호출자가 await 하면 prefetch 완료까지 대기. 일반적으로 unawaited
 */
export function prefetchRecommendations(
  body: RecommendRequest = {},
  signal?: AbortSignal,
): Promise<void> {
  pruneExpired();
  const key = buildPrefetchKey(body.filter, body.favorites, body.savedCount);
  const cached = prefetchCache.get(key);
  if (cached) return Promise.resolve();
  const inflight = inflightPrefetch.get(key);
  if (inflight) return inflight;

  const filterType = body.filter?.type ?? 'all';
  const filterOrigin = body.filter?.origin ?? 'all';
  const favoritesCount = body.favorites?.length ?? 0;

  const promise = (async () => {
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(`${env.API_BASE_URL}/api/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch {
      // 백그라운드는 silent — 실패 시 재시도는 호출자(load-more 트리거)가 다시 부르면 진행
      return;
    }
    if (!res.ok) return;

    const serverTiming = parseServerTiming(res.headers.get('server-timing'));
    const data = (await res.json().catch(() => null)) as
      | { recommendations?: Recommendation[] }
      | null;
    const recs = data?.recommendations ?? [];
    if (recs.length === 0) return;

    prefetchCache.set(key, { key, recs, ts: Date.now() });

    const duration_ms = Date.now() - t0;
    const props: Record<string, string | number | boolean | null | undefined> = {
      count: recs.length,
      duration_ms,
      favorites_count: favoritesCount,
      filter_type: filterType,
      filter_origin: filterOrigin,
      streamed: false,
      platform: 'native',
    };
    for (const [k, v] of Object.entries(serverTiming)) {
      props[`srv_${k}_ms`] = v;
    }
    track('recommendation_load_more', props);
  })().finally(() => {
    inflightPrefetch.delete(key);
  });

  inflightPrefetch.set(key, promise);
  return promise;
}

/**
 * 캐시에서 prefetch 결과 1회성 소비 (없으면 null).
 *
 * 호출자 패턴:
 *   const cached = consumePrefetchedRecommendations(filter, favorites, savedCount);
 *   if (cached) setRecs(prev => [...prev, ...cached]);
 */
export function consumePrefetchedRecommendations(
  filter: RecommendFilter | undefined,
  favorites: string[] | undefined,
  savedCount: number | undefined,
): Recommendation[] | null {
  pruneExpired();
  const key = buildPrefetchKey(filter, favorites, savedCount);
  const entry = prefetchCache.get(key);
  if (!entry) return null;
  prefetchCache.delete(key);
  return entry.recs;
}

/**
 * 테스트 전용 — 캐시 초기화. 일반 코드는 사용 X.
 * @internal
 */
export function __test_resetPrefetchCache(): void {
  prefetchCache.clear();
  inflightPrefetch.clear();
}

/**
 * 테스트 전용 — 캐시 크기 조회. 일반 코드는 사용 X.
 * @internal
 */
export function __test_getPrefetchCacheSize(): number {
  return prefetchCache.size;
}
