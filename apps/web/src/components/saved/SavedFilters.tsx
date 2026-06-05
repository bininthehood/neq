"use client";

/**
 * Saved 헤더 바로 아래 필터 영역 — 통합 컴포넌트.
 * Row 1: VIEW_FILTERS chip 행 (전체/안 본 작품/시청 완료/아카이브) + 우측 "필터 ▾" 트리거
 * Row 2: 활성 필터 chip 행 (ottFilter / groupByOTT 표시 — 클릭 시 제거)
 *
 * 필터 sheet 자체는 SavedFilterSheet.tsx (이번 분할 무관, page.tsx 에서 직접 mount).
 *
 * 2026-06-06 (P2 history 제거) — '히스토리' ViewFilter 항목 삭제.
 * 데이터 레이어 `getRecHistory`/`addRecHistory` 는 다양성 의존성으로 보존.
 */

import Image from "next/image";
import { IconClose } from "@/components/Icons";
import { getOTTIcon } from "@/lib/ott-links";
import type { SavedSort } from "./SavedSortControl";

export type ViewFilter = "all" | "unwatched" | "watched" | "archived";

export type ViewFilterDef = { key: ViewFilter; label: string; count: number };

export function SavedFilters({
  viewFilters,
  viewFilter,
  onViewFilterChange,
  // sheet 트리거 노출 조건
  showSheetTrigger,
  filterSheetOpen,
  onOpenFilterSheet,
  ottFilter,
  groupByOTT,
  sortBy,
  onClearOttFilter,
  onClearGroupByOTT,
  showActiveChips,
}: {
  viewFilters: ViewFilterDef[];
  viewFilter: ViewFilter;
  onViewFilterChange: (v: ViewFilter) => void;
  showSheetTrigger: boolean;
  filterSheetOpen: boolean;
  onOpenFilterSheet: () => void;
  ottFilter: string | null;
  groupByOTT: boolean;
  sortBy: SavedSort;
  onClearOttFilter: () => void;
  onClearGroupByOTT: () => void;
  /** 활성 chip row 노출 조건 (page 가 ottFilter / groupByOTT / viewFilter 보고 결정). */
  showActiveChips: boolean;
}) {
  return (
    <>
      {/* Filter tabs row — 좌측 VIEW_FILTERS (가로 스크롤) + 우측 OTT별 보기 토글 (underline 디자인). */}
      <div className="flex items-center justify-between gap-3 px-5 mt-2 mb-1">
        <div
          className="flex gap-4 overflow-x-auto flex-1 min-w-0"
          role="tablist"
          aria-label="저장 필터"
          style={{ scrollbarWidth: "none" }}
        >
          {viewFilters.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={viewFilter === f.key}
              onClick={() => onViewFilterChange(f.key)}
              className="py-2 text-xs whitespace-nowrap active:scale-95 transition-all min-h-[44px] flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
              style={{
                background: "transparent",
                color: viewFilter === f.key ? "var(--text-primary)" : "var(--text-muted)",
                fontWeight: viewFilter === f.key ? 600 : 500,
                borderRadius: 0,
                borderBottom: viewFilter === f.key ? "2px solid var(--accent)" : "2px solid transparent",
              }}
            >
              {f.label}
              {f.count > 0 && (
                <span className="font-data text-muted" style={{ fontSize: "11px" }}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
        {/* 필터 트리거 — OTT 선택 + OTT별 그룹화 토글을 모두 sheet 안으로 격하 (Letterboxd 패턴).
            availableOTTs >= 2 일 때만 의미 있음 (단일 OTT 환경에선 필터 자체 비활성). */}
        {showSheetTrigger && (
          <button
            type="button"
            onClick={onOpenFilterSheet}
            aria-haspopup="dialog"
            aria-expanded={filterSheetOpen}
            aria-label="필터 열기"
            className="text-xs whitespace-nowrap active:scale-95 transition-all duration-200 min-h-[44px] px-2 flex items-center gap-1.5 flex-shrink-0 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md relative"
            style={{
              color: "var(--text-secondary)",
              fontWeight: 500,
            }}
          >
            필터
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="square"
              aria-hidden
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            {(ottFilter !== null || groupByOTT || sortBy !== "saved") && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  top: 8,
                  right: 4,
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--accent)",
                }}
              />
            )}
          </button>
        )}
      </div>

      {/* 활성 필터 chip — OTT 또는 그룹화 적용 시에만 노출. 즉시 제거 가능. */}
      {showActiveChips && (
        <div className="flex flex-wrap gap-2 px-5 mt-1 mb-1">
          {ottFilter !== null && (() => {
            const iconSrc = getOTTIcon(ottFilter);
            return (
              <button
                type="button"
                onClick={onClearOttFilter}
                aria-label={`${ottFilter} 필터 제거`}
                className="text-xs whitespace-nowrap active:scale-95 transition-all min-h-[32px] px-2.5 flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-full"
                style={{
                  background: "var(--accent-dim)",
                  color: "var(--accent)",
                  fontWeight: 600,
                  border: "1px solid var(--accent-border-light)",
                }}
              >
                {iconSrc && (
                  <Image
                    src={iconSrc}
                    alt=""
                    width={14}
                    height={14}
                    className="object-contain rounded-sm"
                    unoptimized
                  />
                )}
                {ottFilter}
                <IconClose size={12} color="currentColor" />
              </button>
            );
          })()}
          {groupByOTT && (
            <button
              type="button"
              onClick={onClearGroupByOTT}
              aria-label="OTT별 그룹화 해제"
              className="text-xs whitespace-nowrap active:scale-95 transition-all min-h-[32px] px-2.5 flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-full"
              style={{
                background: "var(--accent-dim)",
                color: "var(--accent)",
                fontWeight: 600,
                border: "1px solid var(--accent-border-light)",
              }}
            >
              OTT별 그룹화
              <IconClose size={12} color="currentColor" />
            </button>
          )}
        </div>
      )}
    </>
  );
}
