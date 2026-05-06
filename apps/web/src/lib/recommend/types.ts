import type { TMDBSimilarItem } from "../tmdb";
import type { Recommendation } from "../types";

// ---------- 내부 타입 ----------

/** 취향 작품 → TMDB 매칭 결과 */
export interface MatchedFavorite {
  id: number;
  type: "movie" | "series";
  title: string;
  genreIds: number[];
}

/** 병합/랭킹 후 후보 */
export interface Candidate {
  id: number;
  type: "movie" | "series";
  item: TMDBSimilarItem;
  frequency: number; // 몇 개의 favorite에서 추천됐나
  score: number;     // frequency × vote_average
}

/** 풍부화 완료된 후보 (OTT, credits, details 포함) */
export interface EnrichedCandidate extends Candidate {
  providers: Array<{ name: string; logoUrl: string | null }>;
  watchLink: string | null;
  // 위임 J #4 — getCredits 가 director/cast 외에 directorMember/castMembers (id+profile)
  // 까지 동시 반환. tmdb 모듈 반환 시그니처와 일치시킨다.
  credits: {
    director: string | null;
    cast: string[];
    directorMember: { name: string; tmdbId: number; profileUrl: string | null } | null;
    castMembers: { name: string; tmdbId: number; profileUrl: string | null }[];
  };
  details: {
    runtime: number | null;
    seasons: number | null;
    country: string[];
    backdrop: string | null;
  };
}

// ---------- Phase 3: TMDB 미러 (tmdb_metadata) row ----------

export type TmdbMetadataRow = {
  tmdb_id: number;
  media_type: "movie" | "tv";
  poster_path: string | null;
  backdrop_path: string | null;
  director: string | null;
  cast_names: string[] | null;
  runtime: number | null;
  seasons: number | null;
  country: string[] | null;
  origin_country: string[] | null;
  providers: Array<{
    name: string;
    logoUrl: string | null;
    category?: "subscription" | "rent" | "buy";
  }> | null;
  watch_link: string | null;
};

// ---------- LLM 큐레이션 결과 ----------

export interface CuratedPick {
  id: number;
  reason: string;
}

// ---------- 외부 노출 타입 ----------

export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
};

export type RecommendResult = {
  recommendations: Recommendation[];
  timings: Record<string, number>;
  usage?: TokenUsage;
};

export type StreamingCallbacks = {
  onCard: (rec: Recommendation) => void;
  onTimings: (timings: Record<string, number>) => void;
  onUsage: (usage: TokenUsage) => void;
};
