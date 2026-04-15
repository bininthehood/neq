/**
 * 웹/네이티브 양쪽에서 공유하는 도메인 타입.
 * 백엔드 API 응답 계약의 단일 출처.
 */

export interface Recommendation {
  title: string;
  titleEn: string;
  type: 'movie' | 'series';
  reason: string;
  tmdbId: number;
  posterUrl: string | null;
  rating: number;
  date: string;
  overview: string;
  providers: { name: string; logoUrl: string | null }[];
  watchLink: string | null;
  director?: string | null;
  cast?: string[];
  runtime?: number | null;
  seasons?: number | null;
  country?: string[];
  backdrop?: string | null;
  originCountry?: string[];
}

export interface SavedItem {
  recommendation: Recommendation;
  savedAt: number;
}

export type WatchReaction = 'loved' | 'good' | 'meh' | 'dropped';

export interface WatchReport {
  tmdbId: number;
  reaction: WatchReaction;
  reportedAt: number;
}

export interface RecommendFilter {
  type?: 'movie' | 'series' | 'variety';
  origin?: 'kr' | 'foreign';
  year?: 'recent' | '2010s' | 'classic';
  ott?: string[];
}

export interface WatchFeedback {
  loved: string[];
  good: string[];
  meh: string[];
  dropped: string[];
}

export interface SearchResult {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
  rating: number;
  mediaType: 'movie' | 'tv';
}
