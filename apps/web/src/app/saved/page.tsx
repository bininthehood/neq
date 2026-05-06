"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getSaved,
  removeSaved,
  getWatchReports,
  addWatchReport,
  removeWatchReport,
  getWatchStats,
  getArchivedIds,
  archiveItem,
  unarchiveItem,
  getRecHistory,
  addSaved,
} from "@/lib/store";
import type { RecHistoryEntry } from "@/lib/store";
import type { SavedItem, WatchReaction, Recommendation } from "@/lib/types";
import Image from "next/image";
import PosterFallback from "@/components/PosterFallback";
import {
  IconCheck,
  IconHeart,
  IconGrid,
  IconList,
  IconSearch,
  IconPreview,
} from "@/components/Icons";
import DetailSheet from "@/components/discover/DetailSheet";
import SearchSheet from "@/components/discover/SearchSheet";
import SavedFilterSheet from "@/components/saved/SavedFilterSheet";
import {
  SavedList,
  ReactionLabel,
  loadSavedView,
  persistSavedView,
  type SavedViewMode,
} from "@/components/saved/SavedList";
import { SavedHero } from "@/components/saved/SavedHero";
import { SavedFilters, type ViewFilter, type ViewFilterDef } from "@/components/saved/SavedFilters";
import {
  loadSavedSort,
  persistSavedSort,
  sortSavedItems,
  type SavedSort,
} from "@/components/saved/SavedSortControl";
import { useDetailSheet } from "@/hooks/useDetailSheet";
import { track } from "@/lib/analytics";
import { useToast } from "@neq/design";

// SavedSort 타입은 SavedSortControl 에서 export — 이전 파일 (page.tsx 내부 export) 외부 참조 호환.
export type { SavedSort };

export default function SavedPage() {
  const [saved, setSaved] = useState<SavedItem[]>([]);
  /**
   * detailItem 만 페이지가 보유. detailY/detailAnimating/detailBodyRef + 모션/터치 핸들러는
   * 사용자 직접 테스트 #4: `useDetailSheet` hook 으로 일원화 (Discover 와 동일 source).
   * Saved 의 인라인 DetailSheet 구현 (구 1080~1260) 제거 → `DetailSheet` 컴포넌트로 통합.
   */
  const [detailItem, setDetailItem] = useState<SavedItem | null>(null);
  const detail = useDetailSheet();
  // 헤더 search 버튼 → SearchSheet 자체 마운트. cancel 시 Saved 페이지 그대로 유지.
  const searchSheet = useDetailSheet();
  const [searchInitialQuery, setSearchInitialQuery] = useState<string>("");
  const [reportingId, setReportingId] = useState<number | null>(null);
  const [reports, setReports] = useState<Record<number, WatchReaction>>({});
  const [stats, setStats] = useState({ total: 0, loved: 0, good: 0, meh: 0, dropped: 0 });
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [groupByOTT, setGroupByOTT] = useState(false);
  const [ottFilter, setOttFilter] = useState<string | null>(null);
  const [archivedIds, setArchivedIds] = useState<Set<number>>(new Set());
  const [history, setHistory] = useState<RecHistoryEntry[]>([]);
  // 뷰 모드 (grid|list|preview). 첫 mount 시 localStorage 에서 복원.
  const [viewMode, setViewMode] = useState<SavedViewMode>("grid");
  // preview 모드 hero 작품 id. 카드 탭으로 변경. 첫 진입 시 첫 작품 자동 선택 (effect 처리).
  const [selectedPreviewId, setSelectedPreviewId] = useState<number | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SavedSort>("saved");
  const toast = useToast();

  const refreshData = () => {
    // 한 번만 읽고 Map으로 변환 (O(n))
    setSaved(getSaved());

    const reportsList = getWatchReports();
    const reportsMap: Record<number, WatchReaction> = {};
    for (const r of reportsList) {
      reportsMap[r.tmdbId] = r.reaction;
    }
    setReports(reportsMap);

    setStats(getWatchStats());
    setArchivedIds(new Set(getArchivedIds()));
    setHistory(getRecHistory());
  };

  useEffect(() => {
    refreshData();
    // 위임 L #6 — 뷰 모드 복원
    setViewMode(loadSavedView());
    setSortBy(loadSavedSort());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleViewModeChange = useCallback((mode: SavedViewMode) => {
    setViewMode(mode);
    persistSavedView(mode);
    track("saved_view_changed", { mode });
    // preview 모드는 단일 hero 모델이라 OTT 그룹과 충돌 → 자동 OFF.
    if (mode === "preview") {
      setGroupByOTT(false);
    }
  }, []);

  // 이 selection effect 는 ottFilteredSaved 가 정의된 후에 추가되어야 한다 — 아래 useMemo 다음에 위치.

  const filteredSaved = useMemo(() => {
    let items = [...saved];
    if (viewFilter === "archived") {
      return items.filter((s) => archivedIds.has(s.recommendation.tmdbId));
    }
    // 아카이브된 작품은 기본적으로 숨김
    items = items.filter((s) => !archivedIds.has(s.recommendation.tmdbId));
    if (viewFilter === "unwatched") {
      items = items.filter((s) => !reports[s.recommendation.tmdbId]);
    } else if (viewFilter === "watched") {
      items = items.filter((s) => !!reports[s.recommendation.tmdbId]);
    }
    // 봤어요 적용 여부에 따른 정렬은 제거 — 사용자가 설문 토글 시 위치 이동 불편 보고.
    // saved 원본 순서(저장 시점 역순) 그대로 유지.
    return items;
  }, [saved, reports, viewFilter, archivedIds]);

  // OTT 필터 적용
  const ottFilteredSaved = useMemo(() => {
    if (!ottFilter) return filteredSaved;
    return filteredSaved.filter((item) =>
      item.recommendation.providers.some((p) => p.name === ottFilter)
    );
  }, [filteredSaved, ottFilter]);

  const sortedSaved = useMemo(
    () => sortSavedItems(ottFilteredSaved, sortBy),
    [ottFilteredSaved, sortBy],
  );

  const handleSortChange = useCallback((s: SavedSort) => {
    setSortBy(s);
    persistSavedSort(s);
  }, []);

  // preview 모드 hero 자동 선택 — selectedPreviewId 가 sortedSaved 안에 없으면 첫 작품으로.
  // ottFilter / viewFilter / sort 변경 등으로 목록 변경 시 자동 보정.
  useEffect(() => {
    if (viewMode !== "preview") return;
    if (sortedSaved.length === 0) return;
    const exists = selectedPreviewId !== null
      && sortedSaved.some((item) => item.recommendation.tmdbId === selectedPreviewId);
    if (!exists) {
      setSelectedPreviewId(sortedSaved[0].recommendation.tmdbId);
    }
  }, [viewMode, sortedSaved, selectedPreviewId]);

  // ottFilter 활성 시 OTT 그룹핑 자동 해제 (그룹 토글 hide 와 동기화).
  useEffect(() => {
    if (ottFilter && groupByOTT) {
      setGroupByOTT(false);
    }
  }, [ottFilter, groupByOTT]);

  // Saved 작품에서 사용 가능한 OTT 목록 추출 (작품 수 많은 순)
  const availableOTTs = useMemo(() => {
    const ottCount = new Map<string, number>();
    for (const item of filteredSaved) {
      for (const p of item.recommendation.providers) {
        ottCount.set(p.name, (ottCount.get(p.name) ?? 0) + 1);
      }
    }
    return Array.from(ottCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [filteredSaved]);

  // OTT별 그룹핑 — 모든 availableOTTs 그룹 노출 (빈 그룹 포함, "없음" 메시지로 표시).
  // 작품이 여러 OTT 제공 시 각 그룹에 중복 노출 → "맨 앞 OTT 만 분류" 모호함 해결.
  // providers 가 빈 작품은 "기타" 그룹.
  // ottFilter 활성 시 해당 OTT 그룹만 노출 (다른 그룹 hide) — 사용자 의도 명확.
  const ottGroups = useMemo(() => {
    if (!groupByOTT) return null;
    const groups: Record<string, SavedItem[]> = {};
    for (const { name } of availableOTTs) {
      groups[name] = [];
    }
    for (const item of sortedSaved) {
      const providers = item.recommendation.providers;
      if (!providers || providers.length === 0) {
        if (!groups["기타"]) groups["기타"] = [];
        groups["기타"].push(item);
        continue;
      }
      for (const p of providers) {
        if (!groups[p.name]) groups[p.name] = [];
        groups[p.name].push(item);
      }
    }
    // ottFilter 있으면 해당 그룹만 (없으면 빈 배열로 "없음" 메시지)
    if (ottFilter) {
      return [[ottFilter, groups[ottFilter] ?? []] as [string, SavedItem[]]];
    }
    // 작품 수 많은 OTT 먼저, 빈 그룹은 마지막
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [sortedSaved, groupByOTT, availableOTTs, ottFilter]);

  // 히스토리 날짜별 그룹핑
  const historyGroups = useMemo(() => {
    if (viewFilter !== "history") return [];
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const groups: { label: string; items: RecHistoryEntry[] }[] = [
      { label: "오늘", items: [] },
      { label: "어제", items: [] },
      { label: "이전", items: [] },
    ];
    for (const entry of history) {
      if (entry.date === today) groups[0].items.push(entry);
      else if (entry.date === yesterday) groups[1].items.push(entry);
      else groups[2].items.push(entry);
    }
    return groups.filter((g) => g.items.length > 0);
  }, [history, viewFilter]);

  // saved에 있는 tmdbId Set
  const savedIdSet = useMemo(() => new Set(saved.map((s) => s.recommendation.tmdbId)), [saved]);

  /** history 항목 → TMDB 상세 조회로 full Recommendation 복원 */
  const hydrateEntry = async (entry: RecHistoryEntry): Promise<Recommendation | null> => {
    try {
      const params = new URLSearchParams({ id: String(entry.tmdbId) });
      if (entry.type) params.set("type", entry.type);
      const res = await fetch(`/api/tmdb/hydrate?${params.toString()}`);
      if (!res.ok) return null;
      return (await res.json()) as Recommendation;
    } catch {
      return null;
    }
  };

  const handleResave = async (entry: RecHistoryEntry) => {
    const full = await hydrateEntry(entry);
    if (full) {
      addSaved(full);
    } else {
      // hydrate 실패 시 최소 정보로 폴백 (평점/OTT 등 없음)
      addSaved({
        title: entry.title,
        tmdbId: entry.tmdbId,
        posterUrl: entry.posterUrl,
        reason: "",
        rating: 0,
        providers: [],
        type: entry.type ?? "movie",
        titleEn: "",
        overview: "",
        backdrop: null,
        date: entry.date,
        runtime: null,
        seasons: null,
        country: [],
        director: null,
        cast: [],
        watchLink: null,
      });
    }
    refreshData();
  };

  /** 히스토리 항목 클릭 시: saved면 그 기반으로, 아니면 hydrate 후 임시 SavedItem으로 detail 열기 */
  const handleHistoryClick = async (entry: RecHistoryEntry) => {
    const existing = saved.find((s) => s.recommendation.tmdbId === entry.tmdbId);
    if (existing) {
      openDetailFor(existing);
      return;
    }
    const full = await hydrateEntry(entry);
    if (!full) return;
    openDetailFor({ recommendation: full, savedAt: Date.now() });
  };

  const handleRemove = (tmdbId: number) => {
    // 삭제 전에 rec + 시청 리포트 보존 — toast undo 시 복원.
    const target = saved.find((s) => s.recommendation.tmdbId === tmdbId);
    const prevReport = reports[tmdbId];
    removeSaved(tmdbId);
    removeWatchReport(tmdbId);
    if (reportingId === tmdbId) setReportingId(null);
    refreshData();
    if (target) {
      toast.show("remove", {
        ctx: { title: target.recommendation.title },
        onAction: () => {
          addSaved(target.recommendation);
          if (prevReport) addWatchReport(tmdbId, prevReport);
          refreshData();
        },
      });
    }
  };

  const handleReport = (tmdbId: number, reaction: WatchReaction) => {
    addWatchReport(tmdbId, reaction);
    setReportingId(null);
    refreshData();
  };

  const handleUndoReport = (tmdbId: number) => {
    removeWatchReport(tmdbId);
    refreshData();
  };

  const handleArchiveToggle = useCallback((id: number) => {
    if (archivedIds.has(id)) {
      unarchiveItem(id);
    } else {
      archiveItem(id);
    }
    refreshData();
  }, [archivedIds]);

  const openDetailFor = useCallback((item: SavedItem) => {
    track("detail_opened", {
      tmdb_id: item.recommendation.tmdbId,
      source: "saved_tap",
    });
    setDetailItem(item);
    detail.openDetail();
  }, [detail]);

  const closeDetailWithReset = useCallback(() => {
    detail.closeDetail();
    // hook 의 closeDetail 내부 setTimeout(EXIT_MS) 후 showDetail false 되지만
    // detailItem 은 페이지가 보유 → exit 모션 종료 후 함께 정리.
    setTimeout(() => setDetailItem(null), 360);
  }, [detail]);

  // ESC로 detail sheet / reporting overlay 닫기
  useEffect(() => {
    if (!detailItem && reportingId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (detailItem) {
        closeDetailWithReset();
      } else if (reportingId !== null) {
        setReportingId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailItem, reportingId, closeDetailWithReset]);

  /**
   * 사용자 직접 테스트 #7 — Saved 페이지 DetailSheet 안에서 직접 save toggle.
   * Saved 컨텍스트라 보통 isSaved=true 상태로 진입 → "저장됨" 클릭 시 책장에서 빼냄.
   * 다만 history 항목 hydrate 후 임시 SavedItem 으로 진입한 경우 (savedIdSet 외부) 도 있어서
   * 양방향 토글 모두 지원.
   */
  const handleDetailSaveToggle = useCallback(
    (rec: Recommendation) => {
      const id = rec.tmdbId;
      const isCurrentlySaved = savedIdSet.has(id);
      if (isCurrentlySaved) {
        track("card_unsaved", { tmdb_id: id, source: "detail_save_button" });
        removeSaved(id);
        toast.show("remove", {
          ctx: { title: rec.title },
          onAction: () => {
            addSaved(rec);
            refreshData();
          },
        });
      } else {
        track("card_saved", {
          tmdb_id: id,
          title: rec.title,
          source: "detail_save_button",
        });
        addSaved(rec);
        toast.show("save", {
          ctx: { title: rec.title },
          onAction: () => {
            removeSaved(id);
            refreshData();
          },
        });
      }
      refreshData();
    },
    // savedIdSet 은 saved derived → saved 의존성으로 충분.
    // toast 는 stable. refreshData 는 매 render 새 함수지만 effect 의존성 아니므로 OK.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saved, toast],
  );

  const handleDetailShare = useCallback(async (rec: Recommendation) => {
    const shareUrl = `${window.location.origin}/share/${rec.tmdbId}?type=${rec.type}`;
    const providers = rec.providers.map((p) => p.name).join(", ");
    const body = `🎬 ${rec.title}\n${rec.reason}\n${
      providers ? `📺 ${providers}` : ""
    }\n\n${shareUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: rec.title, text: body, url: shareUrl });
        track("card_shared", { tmdb_id: rec.tmdbId, title: rec.title });
      } catch {
        // 사용자 취소 — 무시
      }
    } else {
      await navigator.clipboard.writeText(body);
      track("card_shared", { tmdb_id: rec.tmdbId, title: rec.title });
    }
  }, []);

  const archivedCount = archivedIds.size;
  const activeItems = saved.filter((s) => !archivedIds.has(s.recommendation.tmdbId));
  const watchedCount = activeItems.filter((s) => reports[s.recommendation.tmdbId]).length;
  const unwatchedCount = activeItems.length - watchedCount;

  const VIEW_FILTERS: ViewFilterDef[] = [
    { key: "all", label: "전체", count: activeItems.length },
    { key: "unwatched", label: "안 본 작품", count: unwatchedCount },
    { key: "watched", label: "시청 완료", count: watchedCount },
    ...(archivedCount > 0 ? [{ key: "archived" as ViewFilter, label: "아카이브", count: archivedCount }] : []),
    { key: "history" as ViewFilter, label: "히스토리", count: history.length },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header — Discover 와 동일한 좁은 height (h-12 = 48px) 패턴.
          좌: H1 / 가운데: Grid/List 토글 (Discover 페르소나 chip 자리와 동일) / 우: search.
          OTT별 보기 텍스트 버튼은 헤더 다음 줄로 분리. */}
      <div className="flex items-center justify-between px-5 h-12 shrink-0 gap-3">
        <h1
          className="font-display"
          style={{
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: "-0.025em",
            color: "var(--text-primary)",
            lineHeight: 1,
          }}
        >
          Saved
        </h1>
        {/* Grid/List/Preview 토글 — 3-way segmented. saved 있을 때만.
            button w-11 h-11 (44, a11y 표준) + segmented padding 1 + border 1 = 48 = h-12 fit. */}
        {saved.length > 0 && viewFilter !== "history" && (
          <div
            role="group"
            aria-label="뷰 모드 전환"
            className="flex items-center rounded-full flex-shrink-0"
            style={{ background: "var(--surface)", padding: 1, border: "1px solid var(--border-subtle)" }}
          >
            <button
              type="button"
              onClick={() => handleViewModeChange("grid")}
              aria-pressed={viewMode === "grid"}
              aria-label="그리드 보기"
              className="w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
              style={{
                background: viewMode === "grid" ? "var(--accent-dim)" : "transparent",
                color: viewMode === "grid" ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              <IconGrid size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange("list")}
              aria-pressed={viewMode === "list"}
              aria-label="리스트 보기"
              className="w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
              style={{
                background: viewMode === "list" ? "var(--accent-dim)" : "transparent",
                color: viewMode === "list" ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              <IconList size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange("preview")}
              aria-pressed={viewMode === "preview"}
              aria-label="미리보기"
              className="w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
              style={{
                background: viewMode === "preview" ? "var(--accent-dim)" : "transparent",
                color: viewMode === "preview" ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              <IconPreview size={14} />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            track("search_opened");
            setSearchInitialQuery("");
            searchSheet.openDetail();
          }}
          aria-label="검색 열기"
          className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
        >
          <IconSearch size={18} color="var(--text-muted)" />
        </button>
      </div>

      {!saved.length && (
        <p className="px-5 pb-2 text-sm text-muted">
          저장한 작품이 여기에 모여요
        </p>
      )}

      {/* 헤더 바로 아래 필터 영역 — VIEW_FILTERS chip 행 + 활성 필터 chip 행 + "필터 ▾" 트리거.
          (분할 후) SavedFilters 컴포넌트로 위임. */}
      {(saved.length > 0 || history.length > 0) && (
        <SavedFilters
          viewFilters={VIEW_FILTERS}
          viewFilter={viewFilter}
          onViewFilterChange={setViewFilter}
          showSheetTrigger={
            saved.length > 0
            && viewFilter !== "history"
            && availableOTTs.length > 1
          }
          filterSheetOpen={filterSheetOpen}
          onOpenFilterSheet={() => setFilterSheetOpen(true)}
          ottFilter={ottFilter}
          groupByOTT={groupByOTT}
          sortBy={sortBy}
          onClearOttFilter={() => setOttFilter(null)}
          onClearGroupByOTT={() => setGroupByOTT(false)}
          showActiveChips={(ottFilter !== null || groupByOTT) && viewFilter !== "history"}
        />
      )}

      {/* Watch Stats */}
      {stats.total > 0 && (viewFilter === "watched" || viewFilter === "archived") && (
        <div className="mx-5 mt-2 mb-3">
          <div
            className="p-3 flex items-center gap-3 rounded-lg"
            style={{ background: "var(--surface)", boxShadow: "0 1px 6px rgba(0,0,0,0.15)" }}
          >
            <div className="flex-1">
              <div className="text-xs font-semibold text-muted">
                시청 리포트
              </div>
              <div className="flex gap-3 mt-1.5">
                {stats.loved > 0 && (
                  <span className="text-xs text-accent">
                    인생작 {stats.loved}
                  </span>
                )}
                {stats.good > 0 && (
                  <span className="text-xs text-secondary">
                    재밌었어 {stats.good}
                  </span>
                )}
                {stats.meh > 0 && (
                  <span className="text-xs text-muted">
                    그저 그래 {stats.meh}
                  </span>
                )}
                {stats.dropped > 0 && (
                  <span className="text-xs text-danger">
                    안 맞았어 {stats.dropped}
                  </span>
                )}
              </div>
            </div>
            <div className="font-data text-2xl font-bold">
              {stats.total}
            </div>
          </div>
        </div>
      )}

      {/* Poster grid — 스크롤 영역 */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
      {viewFilter === "history" ? (
        /* 히스토리 뷰 */
        <div className="pb-4">
          {history.length === 0 ? (
            // D5 / Round 3 v2 — 책장 메타포 일관 ("쌓다" 유지, 톤만 정리)
            <div className="flex-1 flex flex-col justify-center px-8 py-12 text-muted">
              <p className="font-display text-lg font-semibold text-foreground">아직 추천 기록이 없어요</p>
              <p className="text-sm mt-1.5">Discover에서 카드를 넘겨 보세요</p>
            </div>
          ) : (
            historyGroups.map((group) => (
              <div key={group.label} className="mb-5">
                <div className="px-5 mb-2">
                  <span className="text-xs font-medium text-muted">{group.label}</span>
                </div>
                <div className="flex gap-3 px-5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                  {group.items.map((entry) => {
                    const isSaved = savedIdSet.has(entry.tmdbId);
                    // savedItem 플래그는 handleHistoryClick 내부에서 재조회
                    return (
                      <div
                        key={entry.tmdbId}
                        className="flex-shrink-0 w-16 cursor-pointer rounded-md focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] focus:outline-none"
                        role="button"
                        tabIndex={0}
                        aria-label={`${entry.title}${isSaved ? " (저장됨)" : ""} 상세보기`}
                        onClick={() => handleHistoryClick(entry)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleHistoryClick(entry);
                          }
                        }}
                      >
                        <div className="relative w-16 h-24 overflow-hidden rounded-md">
                          {entry.posterUrl ? (
                            <Image
                              src={entry.posterUrl}
                              alt={entry.title}
                              fill
                              className="object-cover"
                              sizes="64px"
                            />
                          ) : (
                            <PosterFallback title={entry.title} size="xs" />
                          )}
                          {isSaved && (
                            <div className="absolute top-0.5 right-0.5 w-4 h-4 flex items-center justify-center rounded-full" style={{ background: "var(--accent-dim)" }}>
                              <IconHeart size={8} />
                            </div>
                          )}
                        </div>
                        <p className="text-xs mt-1 truncate">{entry.title}</p>
                        {!isSaved && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleResave(entry); }}
                            onKeyDown={(e) => { e.stopPropagation(); }}
                            aria-label={`${entry.title} 저장`}
                            className="mt-1 w-full py-1 text-xs font-medium active:scale-95 transition-transform rounded-sm focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                            style={{
                              background: "var(--surface)",
                              color: "var(--text-secondary)",
                              border: "1px solid var(--border)",
                            }}
                          >
                            저장
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      ) : saved.length === 0 ? (
        // D5 / Round 3 v2 — S-01 "책장이 비어 있어요", S-03 "담아 보세요"
        <div className="flex-1 flex flex-col justify-center px-8 text-muted">
          <IconHeart size={32} />
          <p className="mt-4 font-display text-lg font-semibold text-foreground">책장이 비어 있어요</p>
          <p className="text-sm mt-1.5 whitespace-pre-line">{`Discover에서 마음에 드는 걸\n하나씩 담아 보세요`}</p>
        </div>
      ) : ottFilteredSaved.length === 0 ? (
        // viewFilter / ottFilter 별로 빈 상태 안내 분기.
        <div className="flex-1 flex flex-col justify-center px-8 text-muted">
          <IconCheck size={32} />
          <p className="mt-4 font-display text-lg font-semibold text-foreground">
            {ottFilter
              ? "이 조건엔 아무것도"
              : viewFilter === "unwatched"
                ? "모두 시청했어요!"
                : viewFilter === "archived"
                  ? "보관한 작품이 없어요"
                  : viewFilter === "watched"
                    ? "아직 시청 기록이 없어요"
                    : "표시할 작품이 없어요"}
          </p>
          <p className="text-sm mt-1.5">
            {ottFilter
              ? "필터를 조금만 느슨해 보세요"
              : viewFilter === "unwatched"
                ? "Discover에서 새로운 작품을 찾아보세요"
                : viewFilter === "archived"
                  ? "시청한 작품을 보관 아이콘으로 정리할 수 있어요"
                  : viewFilter === "watched"
                    ? "Saved의 작품에서 '봤어요?' 버튼을 눌러보세요"
                    : "Discover에서 아래로 스와이프하거나 하트 버튼으로 담아보세요"}
          </p>
        </div>
      ) : viewMode === "preview" && !ottGroups ? (
        /* Preview (Coverflow) — SavedHero 위임. groupByOTT 시엔 SavedList 의 OTT 그룹 분기 우선. */
        <SavedHero
          items={sortedSaved}
          selectedPreviewId={selectedPreviewId}
          reports={reports}
          reportingId={reportingId}
          onSelectPreview={setSelectedPreviewId}
          onOpen={openDetailFor}
          onReport={handleReport}
          onUndoReport={handleUndoReport}
          onStartReport={setReportingId}
          onCancelReport={() => setReportingId(null)}
        />
      ) : (
        /* grid / list / OTT 그룹 — SavedList 통합. */
        <SavedList
          items={sortedSaved}
          reports={reports}
          reportingId={reportingId}
          archivedIds={archivedIds}
          viewMode={viewMode}
          ottGroups={ottGroups}
          onOpen={openDetailFor}
          onReport={handleReport}
          onUndoReport={handleUndoReport}
          onRemove={handleRemove}
          onStartReport={setReportingId}
          onCancelReport={() => setReportingId(null)}
          onArchiveToggle={handleArchiveToggle}
        />
      )}
      </div>{/* 스크롤 영역 끝 */}

      {/* Detail bottom sheet — 사용자 직접 테스트 #4 통합:
          Discover 와 동일한 `DetailSheet` 컴포넌트 사용 (D3 풍부화: HeroLarge, №ID, ChapterMark,
          CastRow, Synopsis→Cast→Where to watch→Related). 인라인 구현 (구 ~190 라인) 제거.
          ReactionLabel 은 reactionBadge slot 으로 전달 (Saved 전용 배지). */}
      {detailItem && (
        <DetailSheet
          rec={detailItem.recommendation}
          showDetail={detail.showDetail}
          detailY={detail.detailY}
          detailAnimating={detail.detailAnimating}
          detailBodyRef={detail.detailBodyRef}
          onClose={closeDetailWithReset}
          onDetailTouchStart={detail.onDetailTouchStart}
          onDetailTouchMove={detail.onDetailTouchMove}
          onDetailTouchEnd={detail.onDetailTouchEnd}
          onShare={handleDetailShare}
          savedIds={savedIdSet}
          onToggleSave={handleDetailSaveToggle}
          reactionBadge={
            reports[detailItem.recommendation.tmdbId] ? (
              <ReactionLabel reaction={reports[detailItem.recommendation.tmdbId]} />
            ) : undefined
          }
          onSearchPerson={(name) => {
            // 옵션 E — Saved 자체 SearchSheet 사용. detail 은 닫지 않고 SearchSheet 을 위에 띄움.
            // 사용자가 cancel 하면 SearchSheet 만 닫히고 DetailSheet 그대로 노출.
            track("detail_to_search_person", { name, from: "saved" });
            setSearchInitialQuery(name);
            searchSheet.openDetail();
          }}
        />
      )}
      {/* 필터 sheet — OTT 선택 + OTT별 그룹화 토글. Row 2 OTT chips 폐기 후 격하 위치. */}
      <SavedFilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        ottFilter={ottFilter}
        setOttFilter={setOttFilter}
        groupByOTT={groupByOTT}
        setGroupByOTT={setGroupByOTT}
        availableOTTs={availableOTTs}
        sortBy={sortBy}
        setSortBy={handleSortChange}
      />
      {/* SearchSheet — Saved 페이지 자체 마운트. 헤더 search 버튼 또는 DetailSheet cast 클릭으로 진입. */}
      <SearchSheet
        show={searchSheet.showDetail}
        sheetY={searchSheet.detailY}
        animating={searchSheet.detailAnimating}
        bodyRef={searchSheet.detailBodyRef}
        onClose={searchSheet.closeDetail}
        onTouchStart={searchSheet.onDetailTouchStart}
        onTouchMove={searchSheet.onDetailTouchMove}
        onTouchEnd={searchSheet.onDetailTouchEnd}
        initialQuery={searchInitialQuery}
      />
    </div>
  );
}
