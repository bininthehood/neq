export type FilterType = "all" | "movie" | "series" | "variety";
export type FilterOrigin = "all" | "kr" | "foreign";
export type FilterYear = "all" | "recent" | "2010s" | "classic";

export const OTT_OPTIONS = [
  "Netflix",
  "Disney Plus",
  "Watcha",
  "wavve",
  "Coupang Play",
  "TVING",
  "Apple TV Plus",
];

export const TYPE_LABELS: Record<FilterType, string> = {
  all: "유형",
  movie: "영화",
  series: "시리즈",
  variety: "예능",
};

export const ORIGIN_LABELS: Record<FilterOrigin, string> = {
  all: "국가",
  kr: "국내",
  foreign: "해외",
};

export const YEAR_LABELS: Record<FilterYear, string> = {
  all: "년도",
  recent: "2020~",
  "2010s": "2010년대",
  classic: "~2009",
};

/** TMDB 장르 ID — 예능(Variety) 판별용 */
export const VARIETY_GENRE_IDS = [10764, 10767]; // Reality, Talk
