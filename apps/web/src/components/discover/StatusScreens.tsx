"use client";

import type { Recommendation } from "@/lib/types";
import type { FilterType, FilterOrigin, FilterYear, FilterRating } from "@/lib/discover-types";
import { Button, Illust, NeqSpinner } from "@neq/design";
import FilterChips from "@/components/discover/FilterChips";
import { getDiscoverErrorCopy } from "@/components/discover/discover-status";

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
  // 2026-06-18 ("내 OTT 만 보기" 토글 — 1.0.3 train) — FilterChips 신규 props.
  myOTTToggle: boolean;
  myOTTAvailable: boolean;
  onMyOTTToggle: (next: boolean) => void;
  onMyOTTSetupNavigate: () => void;
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

/**
 * Discover 첫 진입 / 필터 변경 로딩 — 카드 스켈레톤 (2026-06-22).
 *
 * 배경: 게이트 0 측정상 Discover first_card_p50 = 11.9s. NeqSpinner 만으로는 빈 화면
 * 인지가 길어 이탈 유발. 카드 윤곽 스켈레톤으로 "곧 카드가 온다" 단서 제공.
 * 새로고침(refreshing=true)은 기존 LoadingScreen(NeqSpinner) 유지 — page.tsx 분기.
 *
 * 라이브 카드(CardVariantA.tsx)의 풀블리드 포스터 구조를 1:1 모방 (ux WARN-1 정합 —
 * 스켈레톤 해제 시 레이아웃 점프 최소화). 라이브 FilterChips 헤더도 노출해 로딩 중
 * 필터 컨텍스트 유지.
 *
 * DESIGN.md L224-228 — 배경 --surface, 펄스 --surface-raised, opacity 1↔0.4
 * (animate-skeleton-pulse, valley 0.4 — Tailwind animate-pulse 0.5 대신 native 정합),
 * 요소별 기본 radius. L292 reduced motion: globals.css 의 prefers-reduced-motion 가드가
 * iteration-count:1 로 자동 정지 → 정적 단색 surface.
 */
export function SkeletonScreen(chips: FilterChipsPassthrough) {
  return (
    <div className="h-dvh flex flex-col" aria-busy="true" aria-label="추천 작품 불러오는 중">
      {/* 헤더 — 워드마크 이미지 정본 (DESIGN.md Brand Identity, 다른 status 화면과 동일) */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element --
            neq 브랜드 워드마크. next/image 변환 시 LCP / aspect-ratio 변화로 깜빡임. */}
        <img src="/neq-logo.png" alt="neq," className="h-5 object-contain" />
      </div>
      {/* 라이브 FilterChips — 로딩 중에도 필터 컨텍스트 유지 (다른 status 화면 정합) */}
      <FilterChips {...chips} />

      {/* Card skeleton — 라이브 카드(CardVariantA.tsx) 풀블리드 구조 1:1 정합.
          이전엔 discover/loading.tsx 의 "내부 포스터 슬랩 분할" 구조라 스켈레톤이
          사라질 때 레이아웃 재배치 발생 (ux WARN-1). native SkeletonCard 가
          SwipeCard 를 1:1 모방한 것과 동일 원칙 — 포스터가 카드 전체를 채우고
          top row(cat/rating) + bottom(subtitle/title/reason 2라인/OTT) 오버레이. */}
      <div className="flex-1 flex items-center justify-center px-5 pb-3 min-h-0">
        <div
          className="relative w-full max-w-[320px] overflow-hidden"
          style={{
            aspectRatio: "2 / 3",
            background: "var(--surface)",
            borderRadius: "var(--radius-xl)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {/* full-bleed poster (핵심) — 카드 전체를 채움 (CardVariantA L31-34) */}
          <div
            className="animate-skeleton-pulse absolute inset-0 bg-surface-raised"
            aria-hidden="true"
          />

          {/* top row — cat chip(좌) + rating chip(우) (CardVariantA L47-71) */}
          <div
            className="absolute flex justify-between items-start"
            style={{ top: 14, left: 14, right: 14 }}
            aria-hidden="true"
          >
            <div
              className="animate-skeleton-pulse bg-surface-raised"
              style={{ height: 24, width: 52, borderRadius: "var(--radius-sm)" }}
            />
            <div
              className="animate-skeleton-pulse bg-surface-raised"
              style={{ height: 24, width: 52, borderRadius: "var(--radius-sm)" }}
            />
          </div>

          {/* bottom — subtitle / title / reason 2라인 / OTT 3칩 (CardVariantA L73-125) */}
          <div
            className="absolute"
            style={{ left: 18, right: 18, bottom: 16 }}
            aria-hidden="true"
          >
            <div
              className="animate-skeleton-pulse rounded-sm bg-surface-raised"
              style={{ height: 13, width: "45%", marginBottom: 8 }}
            />
            <div
              className="animate-skeleton-pulse rounded-sm bg-surface-raised"
              style={{ height: 26, width: "70%", marginBottom: 12 }}
            />
            <div
              className="animate-skeleton-pulse rounded-sm bg-surface-raised"
              style={{ height: 13, width: "85%", marginBottom: 6 }}
            />
            <div
              className="animate-skeleton-pulse rounded-sm bg-surface-raised"
              style={{ height: 13, width: "60%", marginBottom: 14 }}
            />
            <div className="flex gap-1.5 items-center">
              <div
                className="animate-skeleton-pulse bg-surface-raised"
                style={{ height: 22, width: 22, borderRadius: "var(--radius-sm)" }}
              />
              <div
                className="animate-skeleton-pulse bg-surface-raised"
                style={{ height: 22, width: 22, borderRadius: "var(--radius-sm)" }}
              />
              <div
                className="animate-skeleton-pulse bg-surface-raised"
                style={{ height: 22, width: 22, borderRadius: "var(--radius-sm)" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RecommendationFallbackLoadingScreen(chips: FilterChipsPassthrough) {
  return (
    <div className="h-dvh flex flex-col" aria-busy="true" aria-label="추천을 더 가져오는 중">
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- neq 브랜드 워드마크 */}
        <img src="/neq-logo.png" alt="neq," className="h-5 object-contain" />
      </div>
      <FilterChips {...chips} />
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6 text-center">
        <NeqSpinner size="lg" label="추천을 더 가져오는 중" />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          추천을 더 가져오는 중
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
  const copy = getDiscoverErrorCopy();

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
          <p className="font-display text-lg font-semibold">{copy.headline}</p>
          <p
            className="text-sm mt-1.5 leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            {copy.body}
          </p>
          {error && error !== copy.body && (
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
