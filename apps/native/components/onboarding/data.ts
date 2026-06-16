/**
 * Onboarding V2 (D4a, native) — 5단계 정적 데이터.
 *
 * web `apps/web/src/components/onboarding/data.ts` 와 1:1 동일.
 * 양쪽 동기화 필수 — TMDB provider id, 장르 slug 가 LLM 입력/account_prefs 와 호환되어야 함.
 *
 * 스펙: _workspace/onboarding-v2-spec.md §1.2
 */

export interface GenreChip {
  id: string;
  ko: string;
  en: string;
  /** TMDB movie genre id — `/api/tmdb/by-genre` 호출용. variety 등 movie 미존재 장르는 null. */
  tmdbMovieId: number | null;
}

export interface OttOption {
  id: string;
  providerId: number;
  name: string;
  short: string;
  color: string;
  /**
   * "곧 지원" 마킹 — onboarding OTT step / Filter chip 에서 disabled + 라벨 노출.
   * 현재 사용: Coupang Play (TMDB watch providers API 가 KR Coupang Play 데이터 미공급 →
   * 추천 결과에 가용성 미반영. 사용자 기대치 mismatch 차단). 2026-06-11 출시 D-7 추가.
   * 추후 데이터 공급 또는 직접 매핑 구현 시 false 또는 필드 제거.
   */
  comingSoon?: boolean;
}

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

export const OTT_OPTIONS: OttOption[] = [
  { id: 'netflix', providerId: 8,    name: 'Netflix',     short: 'N',  color: '#E50914' },
  { id: 'tving',   providerId: 1883, name: 'TVING',       short: 'T',  color: '#FF153C' },
  { id: 'wavve',   providerId: 1881, name: 'Wavve',       short: 'W',  color: '#1351F9' },
  { id: 'watcha',  providerId: 97,   name: 'Watcha',      short: 'W',  color: '#FF0558' },
  { id: 'disney',  providerId: 337,  name: 'Disney+',     short: 'D+', color: '#0E47BA' },
  { id: 'apple',   providerId: 350,  name: 'Apple TV+',   short: 'A',  color: '#000000' },
  { id: 'coupang', providerId: 356,  name: 'Coupang Play',short: 'C',  color: '#A335EE', comingSoon: true },
];

/**
 * 2026-05-26 — taste (작품선택) 제거 + persona (Persona v2 동적 설문) 추가.
 * 2026-06-16 — notify (알림 체크리스트) 제거. 알림 인프라 disabled
 *   (NEXT_PUBLIC_NOTIFICATIONS_ENABLED=false + VAPID 키 미설정 + native push 미발급)
 *   상태에서 사용자에게 토글 노출 = 구현되지 않은 약속. 활성화 시점 결정되면
 *   설정 화면 또는 onboarding 재도입.
 */
export const STEP_LABELS = ['welcome', 'hello', 'genre', 'persona', 'ott'] as const;
export type StepKey = typeof STEP_LABELS[number];

export const TOTAL_STEPS = 5;

/**
 * persona step 의 sub-step 개수 (context_select / step1 / step2-or-3 / favorites_pick / summary).
 * web data.ts 와 동기화 — 양쪽 동일 값 유지 필수.
 */
export const PERSONA_SUB_STEPS = 5;

/** 사용자 화면 통합 progress 의 총 단계. */
export const UNIFIED_TOTAL_STEPS = TOTAL_STEPS + PERSONA_SUB_STEPS - 1;

/** StepHeader 0-indexed `current` 산식 — web data.ts 의 computeUnifiedHeaderCurrent 와 동일. */
export function computeUnifiedHeaderCurrent(step: number, personaSubStep: number): number {
  const personaIdx = STEP_LABELS.indexOf('persona');
  if (step < personaIdx) return step;
  if (step === personaIdx) return personaIdx + (personaSubStep - 1);
  return step + (PERSONA_SUB_STEPS - 1);
}

/**
 * "neq," 워드마크 이미지 정본 (Phase 5 amber 리컬러링).
 * web `apps/web/public/neq-logo.png` 와 동일 자산.
 *
 * 폰트 텍스트 대신 이미지 사용 이유: amber 색상 + 컴마 disc + 폰트 미탑재 환경 보장.
 * 비율 346:153 ≈ 2.26:1 — height 만 지정하고 width = height × 2.26 으로 설정.
 */
export const WORDMARK_ASSET = require('../../assets/neq-logo.png');
export const WORDMARK_ASPECT_RATIO = 346 / 153; // ≈ 2.26
