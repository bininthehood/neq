/**
 * Discover 화면 필터 타입과 라벨 — 웹/네이티브 공유.
 *
 * RecommendFilter (api.ts)와 다른 점:
 * - API 필터는 "all"이 undefined로 표현됨 (서버 입력 최소화)
 * - UI 필터는 "all"을 명시적으로 포함 (초기값 + 리셋 상태 표현)
 *
 * UI → API 변환 시 "all"은 undefined로 매핑.
 */

export type FilterType = 'all' | 'movie' | 'series' | 'variety';
export type FilterOrigin = 'all' | 'kr' | 'foreign';
export type FilterYear = 'all' | 'recent' | '2010s' | 'classic';
export type FilterRating = 'all' | '7' | '8' | '9';

export const OTT_OPTIONS = [
  'Netflix',
  'Disney Plus',
  'Watcha',
  'wavve',
  'Coupang Play',
  'TVING',
  'Apple TV Plus',
];

/**
 * 2026-06-18 ("내 OTT 만 보기" 토글 — 1.0.3 train) — providerId ↔ FilterChips OTT 이름 매핑.
 *
 * subscribedOtt (account_prefs) 는 TMDB providerId number[] 로 저장된다.
 * FilterChips 의 filterOTTs 는 OTT 이름 Set<string> 으로 추적된다. 두 표현 사이
 * 직접 매핑이 필요한 곳은 Discover 의 "내 OTT 만 보기" 토글 핸들러 한 곳뿐이라
 * 본 모듈에 보조 매핑 테이블만 둔다.
 *
 * 매핑 source:
 *   - apps/native/components/onboarding/data.ts OTT_OPTIONS (id, providerId, name)
 *   - apps/web/src/components/onboarding/data.ts OTT_OPTIONS (동일)
 *   - 이 파일 OTT_OPTIONS (FilterChips 라벨 — TMDB 표준 이름)
 *
 * onboarding name 과 FilterChips 라벨이 다른 케이스 ("Disney+" → "Disney Plus",
 * "Apple TV+" → "Apple TV Plus", "Wavve" → "wavve") 가 있어 직접 string 매칭이 안 된다.
 * providerId 를 키로 둔 explicit map 으로 양쪽 정합 보장.
 */
const PROVIDER_ID_TO_FILTER_OTT: Record<number, string> = {
  8: 'Netflix',
  337: 'Disney Plus',
  97: 'Watcha',
  1881: 'wavve',
  356: 'Coupang Play',
  1883: 'TVING',
  350: 'Apple TV Plus',
};

/**
 * subscribedOtt (TMDB providerId 배열) 를 FilterChips 의 filterOTTs (OTT 이름 Set) 로 변환.
 *
 * 매핑 누락 (테이블에 없는 providerId) 은 silent skip — 추가 OTT 도입 시 위 테이블만 확장.
 * native + PWA 동일 helper — 양쪽에서 동일 결과 보장.
 */
export function subscribedOttToFilterOTTs(subscribedOtt: number[]): Set<string> {
  const out = new Set<string>();
  for (const id of subscribedOtt) {
    const name = PROVIDER_ID_TO_FILTER_OTT[id];
    if (name) out.add(name);
  }
  return out;
}

export const TYPE_LABELS: Record<FilterType, string> = {
  all: '유형',
  movie: '영화',
  series: '시리즈',
  variety: '예능',
};

export const ORIGIN_LABELS: Record<FilterOrigin, string> = {
  all: '국가',
  kr: '국내',
  foreign: '해외',
};

export const YEAR_LABELS: Record<FilterYear, string> = {
  all: '년도',
  recent: '2020~',
  '2010s': '2010년대',
  classic: '~2009',
};

export const RATING_LABELS: Record<FilterRating, string> = {
  all: '별점',
  '7': '7+',
  '8': '8+',
  '9': '9+',
};

/** TMDB 장르 ID — 예능(Variety) 판별용 */
export const VARIETY_GENRE_IDS = [10764, 10767];
