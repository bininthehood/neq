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
}

export interface OttOption {
  id: string;
  providerId: number;
  name: string;
  short: string;
  color: string;
}

export interface NotifOption {
  id: 'weeklyRec' | 'newRelease' | 'ottExpiry' | 'monthlyReport';
  title: string;
  desc: string;
  defaultOn: boolean;
}

export const GENRE_CHIPS: GenreChip[] = [
  { id: 'drama',     ko: '드라마',     en: 'Drama' },
  { id: 'thriller',  ko: '스릴러',     en: 'Thriller' },
  { id: 'romance',   ko: '로맨스',     en: 'Romance' },
  { id: 'comedy',    ko: '코미디',     en: 'Comedy' },
  { id: 'sf',        ko: 'SF',         en: 'Sci-Fi' },
  { id: 'mystery',   ko: '미스터리',   en: 'Mystery' },
  { id: 'crime',     ko: '범죄',       en: 'Crime' },
  { id: 'doc',       ko: '다큐',       en: 'Documentary' },
  { id: 'action',    ko: '액션',       en: 'Action' },
  { id: 'fantasy',   ko: '판타지',     en: 'Fantasy' },
  { id: 'horror',    ko: '호러',       en: 'Horror' },
  { id: 'animation', ko: '애니메이션', en: 'Animation' },
  { id: 'variety',   ko: '예능',       en: 'Variety' },
  { id: 'history',   ko: '시대극',     en: 'Period' },
  { id: 'music',     ko: '음악',       en: 'Music' },
];

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

export const STEP_LABELS = ['welcome', 'hello', 'taste', 'ott', 'notify'] as const;
export type StepKey = typeof STEP_LABELS[number];

export const TOTAL_STEPS = 5;
