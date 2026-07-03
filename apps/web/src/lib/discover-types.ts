export type {
  FilterType,
  FilterOrigin,
  FilterYear,
  FilterRating,
} from "@neq/core";

export {
  OTT_OPTIONS,
  TYPE_LABELS,
  ORIGIN_LABELS,
  YEAR_LABELS,
  RATING_LABELS,
  VARIETY_GENRE_IDS,
} from "@neq/core";

/**
 * OTT 필터/구독 매칭 기준 — 구독(flatrate)으로 볼 수 있는 provider만 true.
 * rent/buy(구매·대여)는 제외. filterWatchProviders(표시)와 동일 기준으로
 * "필터로 걸리는 작품 == 칩에 뜨는 작품" 불변식을 유지한다.
 * (구버전 metadata는 category 없음 → 구독 간주.)
 */
export function isSubscriptionProvider(p: {
  category?: "subscription" | "rent" | "buy";
}): boolean {
  return !p.category || p.category === "subscription";
}
