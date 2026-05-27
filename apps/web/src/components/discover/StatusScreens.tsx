"use client";

import type { Recommendation } from "@/lib/types";
import type { FilterType, FilterOrigin, FilterYear, FilterRating } from "@/lib/discover-types";
import { Button, Illust, NeqSpinner } from "@neq/design";
import FilterChips from "@/components/discover/FilterChips";

interface FilterChipsPassthrough {
  filterType: FilterType;
  filterOrigin: FilterOrigin;
  filterYear: FilterYear;
  filterRating: FilterRating;
  filterOTTs: Set<string>;
  recs: Recommendation[];
  loading: boolean;
  onFilterChange: (t: FilterType, o: FilterOrigin) => void;
  onYearChange: (y: FilterYear) => void;
  onRatingChange: (r: FilterRating) => void;
  onOTTChange: (otts: Set<string>) => void;
  onResetTopIdx: () => void;
}

interface LoadingScreenProps extends FilterChipsPassthrough {
  filterLabel: string;
}

/**
 * Discover 첫 로딩 / 추천 계산 중.
 */
export function LoadingScreen({ filterLabel, ...chips }: LoadingScreenProps) {
  return (
    <div className="h-dvh flex flex-col">
      {/* 워드마크 = neq-logo.png 이미지 정본 (DESIGN.md Brand Identity).
          5/2 위임 R #1 후속 — 페르소나 전환 시 텍스트↔이미지 깜빡임 방지. */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element --
            neq 브랜드 워드마크. next/image 변환 시 LCP / aspect-ratio
            변화로 깜빡임 발생 (DESIGN.md Brand Identity, 위임 R #1). */}
        <img src="/neq-logo.png" alt="neq," className="h-5 object-contain" />
      </div>
      <FilterChips {...chips} />
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">
        <NeqSpinner size="lg" label="추천 로딩 중" />
        <p
          className="text-sm text-center"
          style={{ color: "var(--text-secondary)" }}
        >
          {filterLabel ? (
            <>
              {filterLabel}{" "}
              <span style={{ color: "var(--accent)" }}>고르는 중</span>
            </>
          ) : (
            <>
              오늘의 한 편,{" "}
              <span style={{ color: "var(--accent)" }}>고르는 중</span>
            </>
          )}
        </p>
      </div>
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
      {/* 위임 R #1 — discover/page.tsx 헤더와 동일 이미지 로고 (회귀 방지) */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element --
            neq 브랜드 워드마크. next/image 변환 시 LCP / aspect-ratio
            변화로 깜빡임 발생 (DESIGN.md Brand Identity, 위임 R #1). */}
        <img src="/neq-logo.png" alt="neq," className="h-5 object-contain" />
      </div>
      <FilterChips {...chips} />
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-5 text-center">
        <Illust name="error" style="editorial" size="lg" aria-label="오류 발생" />
        <div>
          {/* D7 / Round 3 v2 — N-03 title 유지, N-04 body 정렬 */}
          <p className="font-display text-lg font-semibold">신호가 흐릿해요.</p>
          <p
            className="text-sm mt-1.5 leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            잠시 숨 고르고 다시 와 주세요.
            <br />
            대부분 그새 풀려 있어요.
          </p>
          {error && error !== "신호가 흐릿해요." && (
            <p
              className="text-xs mt-3 font-data tracking-wider uppercase"
              style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}
            >
              err · {error.length > 32 ? "network_unavailable" : error}
            </p>
          )}
        </div>
        <Button variant="secondary" size="md" onClick={onRetry}>
          다시 시도
        </Button>
      </div>
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

  // D7 / Round 3 v2 — 필터 빈 결과는 Saved 의 S-02/S-04 톤 일치
  const headline = isColdFilterTooNarrow
    ? "조건이 너무 좁아요"
    : hasFilter
      ? "이 조건엔 아무것도"
      : "추천할 작품이 부족해요";

  const sub = isColdFilterTooNarrow
    ? "먼저 전체 필터로 둘러보고 취향을 알려 주세요"
    : hasFilter
      ? "필터를 조금만 느슨해 보세요"
      : "잠시 후 다시 시도해 주세요";

  return (
    <div className="h-dvh flex flex-col">
      {/* 위임 R #1 — discover/page.tsx 헤더와 동일 이미지 로고 (회귀 방지) */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element --
            neq 브랜드 워드마크. next/image 변환 시 LCP / aspect-ratio
            변화로 깜빡임 발생 (DESIGN.md Brand Identity, 위임 R #1). */}
        <img src="/neq-logo.png" alt="neq," className="h-5 object-contain" />
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
    </div>
  );
}
