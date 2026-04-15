import { env } from './env';
import type { Recommendation } from './types';

export interface RecommendFilter {
  type?: 'movie' | 'series' | 'variety';
  origin?: 'kr' | 'foreign';
  year?: 'recent' | '2010s' | 'classic';
  ott?: string[];
}

export interface RecommendRequest {
  favorites?: string[];
  filter?: RecommendFilter;
  exclude?: string[];
  excludeIds?: number[];
}

export interface SearchResult {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
  rating: number;
  mediaType: 'movie' | 'tv';
}

export async function searchTMDB(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const url = `${env.API_BASE_URL}/api/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`검색 실패 (${res.status})`);
  return (await res.json()) as SearchResult[];
}

export async function fetchRecommendations(
  body: RecommendRequest = {},
  signal?: AbortSignal,
): Promise<Recommendation[]> {
  const res = await fetch(`${env.API_BASE_URL}/api/recommend`, {
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
