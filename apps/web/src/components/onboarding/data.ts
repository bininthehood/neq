/**
 * Onboarding V2 (D4a) — 5단계 정적 데이터.
 *
 * 디자인 산출물 `_workspace/design-handoff/_incoming/neq-design/project/neko-onboarding.jsx`
 * 의 GENRE_CHIPS / OTTS_LIST / NOTIF_OPTIONS 와 1:1 매칭. id/slug 는 LLM 입력
 * (`apps/web/src/lib/account-prefs.ts` tasteGenres) 과 TMDB provider id 와 호환.
 *
 * 스펙: _workspace/onboarding-v2-spec.md §1.2 (AccountPrefs)
 */

export interface GenreChip {
  id: string; // tasteGenres 의 slug — LLM 프롬프트에 그대로 전달
  ko: string;
  en: string;
  tmdbMovieId: number | null; // TMDB movie genre id — `/discover/movie?with_genres=` 용. variety 등 movie 미존재 장르는 null.
}

export interface OttOption {
  id: string;            // 클라이언트 식별용 slug
  providerId: number;    // TMDB watch provider id (account_prefs.subscribedOtt 에 저장)
  name: string;
  short: string;         // 2자리 약어 (디자인)
  color: string;         // 브랜드 색
}

export interface NotifOption {
  id: 'weeklyRec' | 'newRelease' | 'ottExpiry' | 'monthlyReport';
  title: string;
  desc: string;
  defaultOn: boolean;
}

// 디자인 산출물 GENRE_CHIPS 와 동일 (15종) + TMDB movie genre id 매핑.
// variety 는 movie 카테고리 미존재 → null (해당 장르 추천 fetch skip).
export const GENRE_CHIPS: GenreChip[] = [
  { id: 'drama',     ko: '드라마',     en: 'Drama',         tmdbMovieId: 18 },
  { id: 'thriller',  ko: '스릴러',     en: 'Thriller',      tmdbMovieId: 53 },
  { id: 'romance',   ko: '로맨스',     en: 'Romance',       tmdbMovieId: 10749 },
  { id: 'comedy',    ko: '코미디',     en: 'Comedy',        tmdbMovieId: 35 },
  { id: 'sf',        ko: 'SF',         en: 'Sci-Fi',        tmdbMovieId: 878 },
  { id: 'mystery',   ko: '미스터리',   en: 'Mystery',       tmdbMovieId: 9648 },
  { id: 'crime',     ko: '범죄',       en: 'Crime',         tmdbMovieId: 80 },
  { id: 'doc',       ko: '다큐',       en: 'Documentary',   tmdbMovieId: 99 },
  { id: 'action',    ko: '액션',       en: 'Action',        tmdbMovieId: 28 },
  { id: 'fantasy',   ko: '판타지',     en: 'Fantasy',       tmdbMovieId: 14 },
  { id: 'horror',    ko: '호러',       en: 'Horror',        tmdbMovieId: 27 },
  { id: 'animation', ko: '애니메이션', en: 'Animation',     tmdbMovieId: 16 },
  { id: 'variety',   ko: '예능',       en: 'Variety',       tmdbMovieId: null },
  { id: 'history',   ko: '시대극',     en: 'Period',        tmdbMovieId: 36 },
  { id: 'music',     ko: '음악',       en: 'Music',         tmdbMovieId: 10402 },
];

/**
 * TMDB watch provider id 매핑 (한국 KR 기준).
 * - 8 = Netflix
 * - 1881 = Wavve
 * - 1883 = TVING
 * - 97 = Watcha
 * - 337 = Disney Plus
 * - 350 = Apple TV Plus
 * - 356 = Coupang Play
 *
 * 참고: TMDB provider id 는 API region 별로 동일하나 일부 엔트리는 KR 전용.
 * 잘못된 id 가 들어가도 `account_prefs.subscribedOtt` 는 약한 신호로만 쓰이므로 안전.
 */
export const OTT_OPTIONS: OttOption[] = [
  { id: 'netflix', providerId: 8,    name: 'Netflix',     short: 'N',  color: '#E50914' },
  { id: 'tving',   providerId: 1883, name: 'TVING',       short: 'T',  color: '#FF153C' },
  { id: 'wavve',   providerId: 1881, name: 'Wavve',       short: 'W',  color: '#1351F9' },
  { id: 'watcha',  providerId: 97,   name: 'Watcha',      short: 'W',  color: '#FF0558' },
  { id: 'disney',  providerId: 337,  name: 'Disney+',     short: 'D+', color: '#0E47BA' },
  { id: 'apple',   providerId: 350,  name: 'Apple TV+',   short: 'A',  color: '#000000' },
  { id: 'coupang', providerId: 356,  name: 'Coupang Play',short: 'C',  color: '#A335EE' },
];

export const NOTIF_OPTIONS: NotifOption[] = [
  { id: 'weeklyRec',     title: '주간 추천',     desc: '매주 월요일 아침, 취향에 맞는 작품 5개', defaultOn: true },
  { id: 'newRelease',    title: '새 작품 알림',  desc: '저장한 감독·배우의 새 작품이 공개될 때',   defaultOn: true },
  { id: 'ottExpiry',     title: 'OTT 만료',      desc: '저장한 작품이 OTT에서 곧 내려갈 때',      defaultOn: false },
  { id: 'monthlyReport', title: '월간 리포트',   desc: '매월 1일, 한 달간 본 작품 요약',          defaultOn: true },
];

/** 단계 라벨 — 진행률/PostHog 이벤트 step prop 에 사용. genre 추가로 6단계. */
export const STEP_LABELS = ['welcome', 'hello', 'genre', 'taste', 'ott', 'notify'] as const;
export type StepKey = typeof STEP_LABELS[number];

export const TOTAL_STEPS = 6;

/** 온보딩 픽 작품 — 어느 장르에서 선택된 작품인지 추적 위함 (선택 사항). */
export interface OnboardingTasteSelection {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
  genreSlug: string | null; // 장르 섹션에서 선택된 경우, 검색에서 선택된 경우 null
}
