export interface TMDBResult {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
}

export interface Recommendation {
  title: string;
  titleEn: string;
  type: "movie" | "series";
  reason: string;
  tmdbId: number;
  posterUrl: string | null;
  rating: number;
  date: string;
  overview: string;
  providers: { name: string; logoUrl: string | null }[];
  watchLink: string | null;
  director: string | null;
  cast: string[];
  runtime: number | null;       // 분 단위 (영화) 또는 에피소드 평균
  seasons: number | null;       // 시리즈 시즌 수
  country: string[];            // 제작 국가 코드
  backdrop: string | null;      // 스틸컷/배경 이미지
  originCountry?: string[];
}

export interface SavedItem {
  recommendation: Recommendation;
  savedAt: number;
}

export type WatchReaction = "loved" | "good" | "meh" | "dropped";

export interface WatchReport {
  tmdbId: number;
  reaction: WatchReaction;
  reportedAt: number;
}
