// 단일 출처: @neq/core. 웹 전용 타입 추가 시 이 파일에 정의.
export type {
  TMDBResult,
  Recommendation,
  SavedItem,
  WatchReaction,
  WatchReport,
  RecommendFilter,
  WatchFeedback,
  CastMember,
  SearchResult,
  PersonResult,
  GroupedSearchResponse,
  RelatedWork,
  RelatedWorksCollection,
  RelatedWorksResponse,
  UserDataExport,
  UserDataExportV2,
  Persona,
  FavoriteMeta,
  AccountPrefs,
  NotificationPrefs,
  NekoPushSubscriptionJSON,
  // 1.0.4 트랙 B (2026-06-23) — /api/recommend NDJSON streaming protocol (web+native 공유).
  RecommendCardSource,
  RecommendStreamMessage,
  RecommendStreamCard,
  RecommendStreamReswap,
  RecommendStreamRankDone,
} from "@neq/core";

export { USER_DATA_SCHEMA_VERSION } from "@neq/core";
