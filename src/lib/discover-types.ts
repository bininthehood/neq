export type FilterType = "all" | "movie" | "series";
export type FilterOrigin = "all" | "kr" | "foreign";

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
};

export const ORIGIN_LABELS: Record<FilterOrigin, string> = {
  all: "국가",
  kr: "국내",
  foreign: "해외",
};
