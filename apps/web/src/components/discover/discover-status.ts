export type DiscoverEmptyStateKind = "filter-empty" | "fallback-loader";
export type DiscoverLoadingStateKind = "card-skeleton" | "refresh-loader";

export function chooseDiscoverEmptyState({
  hasFilter,
}: {
  hasFilter: boolean;
}): DiscoverEmptyStateKind {
  return hasFilter ? "filter-empty" : "fallback-loader";
}

export function chooseDiscoverLoadingState({
  refreshing,
  isColdStart: _isColdStart,
}: {
  refreshing: boolean;
  isColdStart: boolean;
}): DiscoverLoadingStateKind {
  return refreshing ? "refresh-loader" : "card-skeleton";
}

export function getDiscoverErrorCopy() {
  return {
    headline: "잠시 멈췄어요",
    body: "잠시 후 다시 시도해주세요",
  };
}
