export interface TMDBResult {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
  genre_ids?: number[];
}

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
  // category는 TMDB watch/providers의 flatrate/rent/buy 분류. 구버전 metadata에는 없음(optional).
  providers: { name: string; logoUrl: string | null; category?: 'subscription' | 'rent' | 'buy' }[];
  watchLink: string | null;
  director: string | null;
  cast: string[];
  runtime: number | null;
  seasons: number | null;
  country: string[];
  backdrop: string | null;
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
  contextId?: string;
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

export interface Persona {
  id: string;
  name: string;
  favorites: string[];
  favoritesMeta: FavoriteMeta[];
  watchReports: WatchReport[];
  seenTitles: string[];
  recCache: Recommendation[];
  recFilteredCache: Record<string, Recommendation[]>;
}

export interface FavoriteMeta {
  id: number;
  title: string;
  posterUrl: string | null;
}

export interface UserDataExportV2 {
  version: 2;
  deviceId: string;
  exportedAt: number;
  data: {
    personas: Persona[];
    activePersonaId: string;
    saved: SavedItem[];
    archived: number[];
  };
}

export interface UserDataExport {
  version: number;
  deviceId: string;
  exportedAt: number;
  data: {
    favorites: string[];
    saved: SavedItem[];
    watchReports: WatchReport[];
    seenTitles: string[];
    archived: number[];
    personas?: Persona[];
    activePersonaId?: string;
  };
}

export const USER_DATA_SCHEMA_VERSION = 2;
