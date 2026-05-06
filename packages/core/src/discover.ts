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
