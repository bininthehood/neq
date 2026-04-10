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

/**
 * 사용자 데이터 내보내기/가져오기 포맷.
 * 이 스키마는 향후 백엔드 API (`GET /api/user/data`, `POST /api/user/sync`)의
 * 요청/응답 스펙으로 그대로 재사용된다.
 */
export interface UserDataExport {
  version: number;          // 스키마 버전 (향후 마이그레이션용)
  deviceId: string;         // 익명 사용자 식별자
  exportedAt: number;       // 내보낸 시각 (timestamp)
  data: {
    favorites: string[];
    saved: SavedItem[];
    watchReports: WatchReport[];
    seenTitles: string[];
    archived: number[];
  };
}

export const USER_DATA_SCHEMA_VERSION = 1;
