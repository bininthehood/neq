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

/**
 * Cast / Director 의 풍부화된 형태 — TMDB credits 의 person id, profile_path 까지 보유.
 *
 * 사용자 직접 테스트 위임 J #4 — DetailSheet Cast 영역에 실제 인물 사진을 표시하기 위해
 * 기존 `cast: string[]` / `director: string | null` 옆에 optional 로 추가.
 *
 * - tmdbId: TMDB person id. /person/{id} endpoint, 검색 진입 등에 활용.
 * - profileUrl: TMDB profile_path 기반 URL (w185). 사진 미보유 시 null → 이니셜 fallback.
 * - name: TMDB 가 ko-KR 우선 반환 (없으면 원어).
 *
 * sync.ts(supabase saved_items.metadata) / recommend.ts / persons-helpers.ts 등 기존
 * `cast: string[]` 의존 코드는 변경 없음. 새 필드는 hydrate / recommend 신규 경로에서만 채워진다.
 */
export interface CastMember {
  name: string;
  tmdbId: number;
  profileUrl: string | null;
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
  /**
   * 위임 J #4 — 풍부화된 감독 정보 (id + profile photo).
   * 기존 `director: string | null` 와 동시에 채워진다 (string 은 호환용).
   * 미존재 시 null/undefined → DetailSheet 가 기존 이니셜 fallback 사용.
   */
  directorMember?: CastMember | null;
  /**
   * 위임 J #4 — 풍부화된 캐스트 배열 (각 항목 id + profile photo).
   * 기존 `cast: string[]` 와 동시에 채워진다. 길이/순서는 cast 배열과 일치 (top 4).
   */
  castMembers?: CastMember[];
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

/**
 * 관련 작품 카드 — DetailSheet 가로 카로셀에 사용 (시리즈 컬렉션 + 감독 작품).
 *
 * 단일 출처(@neq/core)에서 정의해 web/native 양쪽 동기화. spec §F3.
 *
 * - id: TMDB id (movie 또는 tv)
 * - mediaType: 카드 클릭 시 다음 hydrate 호출에 필요
 * - year: release_date / first_air_date 의 4자리. 없으면 빈 문자열
 * - posterUrl: w185 사이즈. null 이면 fallback UI
 */
export interface RelatedWork {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
  mediaType: 'movie' | 'tv';
}

export interface RelatedWorksCollection {
  id: number;
  name: string;
  works: RelatedWork[];
}

/**
 * /api/tmdb/related 응답 형식.
 *
 * - collection: 시리즈/프랜차이즈 (movie 의 belongs_to_collection 유효 시). 없으면 null
 * - recommendations: TMDB /recommendations 결과 — 사용자 행동 기반 비슷한 작품
 *   (자기 자신, collection, directorWorks 와 dedup. popularity desc 정렬, 최대 8개)
 * - directorWorks: 감독 다른 작품 (popularity desc, 자기 자신 제외, 최대 12개)
 * - directorName: 디스플레이용 (있으면 헤더 "OOO 감독의 다른 작품")
 *
 * UI 표시 우선순위 — 사용자 직접 테스트 #4:
 *   1) collection (예: 반지의 제왕 → 호빗 시리즈 같은 프랜차이즈, 가장 가까운 관계)
 *   2) recommendations (TMDB 사용자 행동 기반 비슷한 작품)
 *   3) directorWorks (감독 다른 작품)
 * 빈 배열은 호출처가 섹션 자체 hidden 처리.
 */
export interface RelatedWorksResponse {
  collection: RelatedWorksCollection | null;
  recommendations: RelatedWork[];
  directorWorks: RelatedWork[];
  directorName: string | null;
}

/**
 * 인물 검색 결과 (감독/배우 등). spec §4.3 참조.
 *
 * - profileUrl: TMDB profile_path 기반 URL. 사진 미존재 시 null.
 * - knownFor: TMDB person.known_for 배열에서 추출한 대표작 (최대 3개).
 * - knownForDept: TMDB known_for_department. 'Directing' | 'Acting' | 그 외.
 *   Directing/Acting 외 부서(Production, Writing, ...)는 클라이언트가 무시 가능.
 */
export interface PersonResult {
  id: number;
  name: string;
  profileUrl: string | null;
  knownFor: { title: string; year: string }[];
  knownForDept: 'Directing' | 'Acting' | string;
}

/**
 * grouped=1 응답. works/directors/actors 분리 (spec §4.2).
 *
 * recent/trending 은 클라이언트(LocalStorage / 별도 endpoint) 영역이므로
 * 서버 응답에 포함하지 않는다.
 */
export interface GroupedSearchResponse {
  works: SearchResult[];
  directors: PersonResult[];
  actors: PersonResult[];
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

// === Onboarding V2 — 계정 레벨 prefs (페르소나 외부) ===
//
// 페르소나(Persona)는 사용자가 가진 N개의 취향 프로필 — favorites 5픽이 핵심 신호.
// AccountPrefs는 계정 전체 단위의 약한 신호 — 장르 칩 / 구독 OTT / 알림 토글.
// 두 신호는 LLM 입력에서 강한(favorites) + 약한(tasteGenres, subscribedOtt) 조합으로 사용.
//
// 스펙: _workspace/onboarding-v2-spec.md
// 마이그레이션: supabase/migrations/20260428_onboarding_v2.sql (profiles.account_prefs JSONB)

/**
 * Web Push API 표준 PushSubscription 의 직렬화 형태.
 *
 * lib.dom 의 PushSubscriptionJSON 과 동등하지만, 서버 사이드/노드 환경에서도
 * 빌드되어야 하므로 동일한 shape 의 자체 타입을 정의한다.
 */
export interface NekoPushSubscriptionJSON {
  endpoint: string;
  expirationTime?: number | null;
  keys?: {
    p256dh: string;
    auth: string;
  };
}

export interface NotificationPrefs {
  weeklyRec: boolean;       // 주간 추천
  newRelease: boolean;      // 새 작품 (4가지 트리거 통합 토글)
  ottExpiry: boolean;       // OTT 만료 (proxy 추정)
  monthlyReport: boolean;   // 월간 리포트
  pushSubscription: NekoPushSubscriptionJSON | null;
}

export interface AccountPrefs {
  tasteGenres: string[];          // 장르 ID 또는 slug ('thriller', 'documentary', ...)
  subscribedOtt: number[];        // TMDB provider id 배열
  notificationPrefs: NotificationPrefs;
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
