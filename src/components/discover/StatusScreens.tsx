"use client";

import type { Recommendation } from "@/lib/types";
import type { FilterType, FilterOrigin } from "@/lib/discover-types";
import BottomNav from "@/components/BottomNav";
import FilterChips from "@/components/discover/FilterChips";
import { IconFilm, IconRefresh } from "@/components/Icons";

interface FilterChipsPassthrough {
  filterType: FilterType;
  filterOrigin: FilterOrigin;
  filterOTTs: Set<string>;
  recs: Recommendation[];
  loading: boolean;
  onFilterChange: (t: FilterType, o: FilterOrigin) => void;
  onOTTChange: (otts: Set<string>) => void;
  onResetTopIdx: () => void;
}

interface LoadingScreenProps extends FilterChipsPassthrough {
  filterLabel: string;
}

export function LoadingScreen({ filterLabel, ...chips }: LoadingScreenProps) {
  return (
    <div className="h-dvh flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        <span className="font-display text-lg text-accent">neq,</span>
      </div>
      <FilterChips {...chips} />
      <div className="flex-1 flex items-center justify-center px-3">
        <div className="relative w-full h-full max-h-[75dvh] animate-pulse rounded-xl bg-surface">
          <div className="absolute top-4 left-4 w-14 h-6 bg-surface-raised rounded-md" />
          <div className="absolute top-4 right-4 w-16 h-6 bg-surface-raised rounded-md" />
          <div className="absolute bottom-0 left-0 right-0 p-5 space-y-2.5">
            <div className="h-6 w-3/5 bg-surface-raised rounded-md" />
            <div className="h-3 w-2/5 bg-surface-raised rounded-sm" />
            <div className="h-4 w-4/5 bg-surface-raised rounded-sm" />
            <div className="flex gap-1.5 pt-1">
              <div className="w-8 h-8 bg-surface-raised rounded-md" />
              <div className="w-8 h-8 bg-surface-raised rounded-md" />
            </div>
          </div>
        </div>
      </div>
      <div className="px-4 pb-2 shrink-0">
        <p className="text-center text-xs py-2 text-muted">
          {filterLabel ? `${filterLabel} 추천 찾는 중...` : "취향을 분석하고 있어요..."}
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

export function ErrorScreen({ error, onRetry, ...chips }: ErrorScreenProps) {
  return (
    <div className="h-dvh flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        <span className="font-display text-lg text-accent">neq,</span>
      </div>
      <FilterChips {...chips} />
      <div className="flex-1 flex flex-col px-8 justify-center">
        <div className="space-y-5">
          <IconFilm size={36} color="var(--danger)" />
          <div>
            <p className="font-display text-lg font-semibold">{error}</p>
          </div>
          <button
            onClick={onRetry}
            className="px-5 py-2.5 text-sm font-medium flex items-center gap-2 active:scale-95 transition-transform bg-accent text-background rounded-full"
          >
            <IconRefresh size={14} /> 다시 시도
          </button>
        </div>
      </div>
      <BottomNav active="discover" />
    </div>
  );
}

interface EmptyScreenProps extends FilterChipsPassthrough {
  hasFilter: boolean;
  onResetFilter: () => void;
  onRefresh: () => void;
  onReset: () => void;
}

export function EmptyScreen({
  hasFilter,
  onResetFilter,
  onRefresh,
  onReset,
  ...chips
}: EmptyScreenProps) {
  return (
    <div className="h-dvh flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        <span className="font-display text-lg text-accent">neq,</span>
        <button
          onClick={onReset}
          className="text-xs px-2 min-h-[44px] flex items-center text-muted"
        >
          재설정
        </button>
      </div>
      <FilterChips {...chips} />
      <div className="flex-1 flex flex-col px-8 justify-center">
        <div className="space-y-5">
          <IconFilm size={36} color="var(--text-muted)" />
          <div>
            <p className="font-display text-lg font-semibold">
              {hasFilter ? "해당 조건의 결과가 없어요" : "추천을 만들지 못했어요"}
            </p>
            <p className="text-sm mt-1.5 text-secondary">
              {hasFilter ? "다른 필터를 시도해보세요" : "잠시 후 다시 시도해주세요"}
            </p>
          </div>
          <div className="flex gap-3">
            {hasFilter && (
              <button
                onClick={onResetFilter}
                className="px-5 py-2.5 text-sm font-medium active:scale-95 transition-transform bg-surface border border-border rounded-full"
              >
                필터 초기화
              </button>
            )}
            <button
              onClick={onRefresh}
              className="px-5 py-2.5 text-sm font-medium flex items-center gap-2 active:scale-95 transition-transform bg-accent text-background rounded-full"
            >
              <IconRefresh size={14} /> 다시 시도
            </button>
          </div>
        </div>
      </div>
      <BottomNav active="discover" />
    </div>
  );
}
