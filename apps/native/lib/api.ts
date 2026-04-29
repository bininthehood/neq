import { createApiClient } from '@neq/core';
import type { Recommendation } from '@neq/core';
import { env } from './env';
import { track, parseServerTiming } from './analytics';

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
 *
 * 실패 시 `recommendation_failed` 발사.
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
  const recs = data.recommendations ?? [];

  const duration_ms = Date.now() - t0;

  // recommendations 가 비어 있어도 발사 (서버가 0건 응답을 줄 수 있음 → funnel drop 진단)
  const props: Record<string, string | number | boolean | null | undefined> = {
    count: recs.length,
    duration_ms,
    cold_start: favoritesCount === 0,
    favorites_count: favoritesCount,
    has_filter: hasFilter,
    filter_type: filterType,
    filter_origin: filterOrigin,
    streamed: false,
    platform: 'native',
  };
  // Server-Timing 헤더 → srv_<name>_ms
  for (const [k, v] of Object.entries(serverTiming)) {
    props[`srv_${k}_ms`] = v;
  }
  track('recommendation_loaded', props);

  return recs;
}
