/**
 * 프론트엔드 공용 API 클라이언트.
 * baseUrl을 인자로 받아 웹/네이티브 환경 차이를 흡수한다.
 */
import type {
  Recommendation,
  RecommendFilter,
  SearchResult,
  WatchFeedback,
} from './types';

export interface RecommendRequest {
  favorites?: string[];
  filter?: RecommendFilter;
  feedback?: WatchFeedback;
  exclude?: string[];
  excludeIds?: number[];
  /** 저장한 작품 총 개수 — 모드 판정(탐색/혼합/개인화)에 signal로 사용 */
  savedCount?: number;
  /** 온보딩에서 선택한 초기 취향 작품 수 — 모드 판정 signal */
  onboardingCount?: number;
  /**
   * Cold Start V2 (P0-2) — 장르 칩 멀티 선택 (LLM 강한 신호로 사용).
   * 서버는 NEXT_PUBLIC_TASTE_GENRES_ENABLED flag OFF 시 무시한다.
   */
  tasteGenres?: string[];
  /**
   * Cold Start V2 (P0-2) — 구독 OTT provider id (LLM 약한 신호 — 가중치).
   * 서버는 NEXT_PUBLIC_OTT_WEAK_SIGNAL flag OFF 시 무시한다.
   */
  subscribedOtt?: number[];
}

export function createApiClient(baseUrl: string) {
  async function fetchRecommendations(
    body: RecommendRequest = {},
    signal?: AbortSignal,
  ): Promise<Recommendation[]> {
    const res = await fetch(`${baseUrl}/api/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`추천 요청 실패 (${res.status}) ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as { recommendations: Recommendation[] };
    return data.recommendations ?? [];
  }

  async function searchTMDB(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    const url = `${baseUrl}/api/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`검색 실패 (${res.status})`);
    return (await res.json()) as SearchResult[];
  }

  return { fetchRecommendations, searchTMDB };
}

export type ApiClient = ReturnType<typeof createApiClient>;
