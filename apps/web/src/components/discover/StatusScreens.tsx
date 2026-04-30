"use client";

import type { Recommendation } from "@/lib/types";
import type { FilterType, FilterOrigin, FilterYear } from "@/lib/discover-types";
import { Button, Illust, NeqSpinner } from "@neq/design";
import BottomNav from "@/components/BottomNav";
import FilterChips from "@/components/discover/FilterChips";

interface FilterChipsPassthrough {
  filterType: FilterType;
  filterOrigin: FilterOrigin;
  filterYear: FilterYear;
  filterOTTs: Set<string>;
  recs: Recommendation[];
  loading: boolean;
  onFilterChange: (t: FilterType, o: FilterOrigin) => void;
  onYearChange: (y: FilterYear) => void;
  onOTTChange: (otts: Set<string>) => void;
  onResetTopIdx: () => void;
}

interface LoadingScreenProps extends FilterChipsPassthrough {
  filterLabel: string;
}

/**
 * Discover 첫 로딩 / 추천 계산 중.
 * D9 매핑: <Illust name="calibrating"> + <NeqSpinner size="lg">
 */
export function LoadingScreen({ filterLabel, ...chips }: LoadingScreenProps) {
  return (
    <div className="h-dvh flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        <span className="font-display text-lg text-accent">neq,</span>
      </div>
      <FilterChips {...chips} />
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">
        <Illust
          name="calibrating"
          style="editorial"
          size="lg"
          aria-label="추천을 준비하고 있어요"
        />
        <NeqSpinner size="lg" label="추천 로딩 중" />
        <p
          className="text-sm text-center"
          style={{ color: "var(--text-secondary)" }}
        >
          {filterLabel
            ? `${filterLabel} 추천을 찾고 있어요`
            : "오늘의 한 편을 골라드릴게요"}
        </p>
      </div>
      <BottomNav active="discover" />
    </div>
  );
}

interface ErrorScreenProps extends FilterChipsPassthrough {
  error: string;
  onRetry: () => void;
}

/**
 * Discover 네트워크 / 시스템 에러.
 * D9 매핑: <Illust name="error"> + <Button variant="secondary">
 */
export function ErrorScreen({ error, onRetry, ...chips }: ErrorScreenProps) {
  return (
    <div className="h-dvh flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        <span className="font-display text-lg text-accent">neq,</span>
      </div>
      <FilterChips {...chips} />
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-5 text-center">
        <Illust name="error" style="editorial" size="lg" aria-label="오류 발생" />
        <div>
          <p className="font-display text-lg font-semibold">잠시 문제가 생겼어요</p>
          <p
            className="text-sm mt-1.5"
            style={{ color: "var(--text-secondary)" }}
          >
            {error}
          </p>
        </div>
        <Button variant="secondary" size="md" onClick={onRetry}>
          다시 시도
        </Button>
      </div>
      <BottomNav active="discover" />
    </div>
  );
}

interface EmptyScreenProps extends FilterChipsPassthrough {
  hasFilter: boolean;
  isColdStart: boolean;
  onResetFilter: () => void;
  onRefresh: () => void;
}

/**
 * Discover 추천 0개 (필터 너무 좁거나, cold start 빈 결과).
 * D9 매핑:
 *  - 필터 좁음 → <Illust name="emptyDiscover"> + ghost "필터 초기화"
 *  - 추천 0 / cold + 필터 → <Illust name="noResults"> + secondary "필터 조정"
 */
export function EmptyScreen({
  hasFilter,
  isColdStart,
  onResetFilter,
  onRefresh,
  ...chips
}: EmptyScreenProps) {
  // cold start + 필터 조합 → 필터가 너무 좁은 경우
  const isColdFilterTooNarrow = isColdStart && hasFilter;

  // 일러 매핑: 필터로 인한 빈 결과(이 필터에 맞는 작품 없음) → emptyDiscover
  //          그 외 추천 0개 (LLM/네트워크 등 알 수 없는 사유) → noResults
  const illustName: "emptyDiscover" | "noResults" = hasFilter
    ? "emptyDiscover"
    : "noResults";

  const headline = isColdFilterTooNarrow
    ? "조건이 너무 좁아요"
    : hasFilter
      ? "이 필터에 맞는 작품이 없어요"
      : "추천할 작품이 부족해요";

  const sub = isColdFilterTooNarrow
    ? "먼저 전체 필터로 작품을 둘러보고 취향을 알려주세요"
    : hasFilter
      ? "다른 필터를 시도해보세요"
      : "잠시 후 다시 시도해주세요";

  return (
    <div className="h-dvh flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        <span className="font-display text-lg text-accent">neq,</span>
      </div>
      <FilterChips {...chips} />
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-5 text-center">
        <Illust
          name={illustName}
          style="editorial"
          size="lg"
          aria-label={hasFilter ? "필터 조건에 맞는 작품 없음" : "추천 결과 없음"}
        />
        <div>
          <p className="font-display text-lg font-semibold">{headline}</p>
          <p
            className="text-sm mt-1.5"
            style={{ color: "var(--text-secondary)" }}
          >
            {sub}
          </p>
        </div>
        <div className="flex gap-3">
          {hasFilter && (
            <Button
              variant={isColdFilterTooNarrow ? "primary" : "ghost"}
              size="md"
              onClick={onResetFilter}
            >
              {isColdFilterTooNarrow ? "전체 보기" : "필터 초기화"}
            </Button>
          )}
          {!isColdFilterTooNarrow && (
            <Button variant="secondary" size="md" onClick={onRefresh}>
              다시 시도
            </Button>
          )}
        </div>
      </div>
      <BottomNav active="discover" />
    </div>
  );
}
