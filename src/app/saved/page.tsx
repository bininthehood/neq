"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  getSaved,
  removeSaved,
  getWatchReport,
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
import type { SavedItem, WatchReaction } from "@/lib/types";
import Image from "next/image";
import BottomNav from "@/components/BottomNav";
import { IconStar, IconClose, IconCheck, IconHeart, IconShare } from "@/components/Icons";
import { getOTTLink, getOTTIcon } from "@/lib/ott-links";

const REACTIONS: { key: WatchReaction; label: string; color: string; bg: string }[] = [
  { key: "loved", label: "인생작", color: "var(--accent)", bg: "var(--accent-dim)" },
  { key: "good", label: "재밌었어", color: "var(--text-secondary)", bg: "var(--surface-raised)" },
  { key: "meh", label: "그저 그래", color: "var(--text-muted)", bg: "var(--surface)" },
  { key: "dropped", label: "포기했어", color: "var(--danger)", bg: "var(--danger-dim)" },
];

type ViewFilter = "all" | "unwatched" | "watched" | "archived" | "history";

function ReactionLabel({ reaction }: { reaction: WatchReaction }) {
  const r = REACTIONS.find((x) => x.key === reaction)!;
  return (
    <span
      className="px-2 py-0.5 text-xs font-semibold rounded-sm"
      style={{ color: r.color, background: r.bg }}
    >
      {r.label}
    </span>
  );
}

/** OTT 이름에서 그룹 키 추출 */
function ottGroupKey(item: SavedItem): string {
  const providers = item.recommendation.providers;
  if (!providers || providers.length === 0) return "기타";
  return providers[0].name;
}

function PosterCard({
  item, index, report, isReporting, isArchived,
  onOpen, onReport, onUndoReport, onRemove, onStartReport, onCancelReport, onArchiveToggle,
}: {
  item: SavedItem;
  index: number;
  report: WatchReaction | undefined;
  isReporting: boolean;
  isArchived?: boolean;
  onOpen: (item: SavedItem) => void;
  onReport: (tmdbId: number, reaction: WatchReaction) => void;
  onUndoReport: (tmdbId: number) => void;
  onRemove: (tmdbId: number) => void;
  onStartReport: (tmdbId: number) => void;
  onCancelReport: () => void;
  onArchiveToggle?: (tmdbId: number) => void;
}) {
  const tmdbId = item.recommendation.tmdbId;

  return (
    <div
      className="relative group cursor-pointer overflow-hidden"
      style={{ height: index % 3 === 0 ? "240px" : "200px" }}
      onClick={() => onOpen(item)}
    >
      {item.recommendation.posterUrl ? (
        <Image src={item.recommendation.posterUrl} alt={item.recommendation.title} fill className="object-cover rounded-lg" sizes="(max-width: 480px) 50vw, 200px" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs p-2 text-center bg-surface rounded-lg text-muted">
          {item.recommendation.title}
        </div>
      )}

      {report && !isReporting && (
        <div className="absolute inset-0 pointer-events-none bg-overlay-light rounded-lg" />
      )}

      <div
        className="absolute bottom-0 left-0 right-0 p-2 pointer-events-none"
        style={{ background: "linear-gradient(transparent, var(--bg-overlay-heavy))", borderRadius: "0 0 var(--radius-lg) var(--radius-lg)" }}
      >
        <div className="text-xs font-medium truncate">{item.recommendation.title}</div>
        <div className="flex items-center gap-2">
          <span className="font-data text-xs flex items-center gap-0.5 text-muted"><IconStar size={10} />{item.recommendation.rating.toFixed(1)}</span>
          {report && <ReactionLabel reaction={report} />}
          {!report && item.recommendation.providers.slice(0, 2).map((p) => {
            const iconSrc = getOTTIcon(p.name) ?? p.logoUrl;
            return iconSrc ? (
              <Image key={p.name} src={iconSrc} alt={p.name} width={16} height={16} className="object-contain rounded-sm" unoptimized />
            ) : null;
          })}
        </div>
      </div>

      {!report && !isReporting && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onStartReport(tmdbId); }}
          className="absolute top-1.5 left-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center px-2 text-xs font-medium active:scale-90 transition-transform bg-overlay rounded-full text-secondary"
          style={{ backdropFilter: "blur(4px)" }}
        >
          봤어요?
        </button>
      )}

      {report && !isReporting && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUndoReport(tmdbId); }}
          className="absolute top-1.5 left-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center px-2 text-xs font-medium active:scale-90 transition-transform bg-overlay rounded-full"
          style={{ backdropFilter: "blur(4px)", color: REACTIONS.find((x) => x.key === report)?.color }}
          title="리포트 취소"
        >
          <IconCheck size={11} /> 시청
        </button>
      )}

      {isReporting && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center px-3 gap-3 animate-fade-in z-10 rounded-lg"
          style={{ backdropFilter: "blur(8px)", background: "linear-gradient(var(--bg) 20%, var(--bg-overlay-heavy) 70%, transparent)" }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancelReport(); }}
        >
          <div className="text-center">
            <div className="font-display text-sm font-bold">본 적 있나요?</div>
            <div className="text-xs mt-0.5 text-muted">알려주시면 더 좋은 추천을 드릴게요</div>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {([
              { key: "loved" as WatchReaction, label: "인생작" },
              { key: "good" as WatchReaction, label: "괜찮았어" },
              { key: "meh" as WatchReaction, label: "별로였어" },
              { key: "dropped" as WatchReaction, label: "안 맞았어" },
            ]).map((r) => (
              <button
                key={r.key}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReport(tmdbId, r.key); }}
                className="px-3 py-2 text-xs font-medium active:scale-95 transition-transform bg-surface text-secondary rounded-full border border-border"
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancelReport(); }}
            className="text-xs min-h-[44px] px-4 flex items-center active:scale-95 transition-transform text-muted"
          >
            닫기
          </button>
        </div>
      )}

      <div className="absolute top-1.5 right-1.5 flex gap-1">
        {report && onArchiveToggle && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onArchiveToggle(tmdbId); }}
            className="w-11 h-11 flex items-center justify-center text-xs sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-overlay rounded-full"
            style={{ color: isArchived ? "var(--accent)" : "var(--text-muted)" }}
            title={isArchived ? "복원" : "아카이브"}
          >
            {isArchived ? "↩" : "✓"}
          </button>
        )}
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(tmdbId); }}
          className="w-11 h-11 flex items-center justify-center text-xs sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-overlay rounded-full"
        >
          <IconClose size={12} />
        </button>
      </div>
    </div>
  );
}

export default function SavedPage() {
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [selected, setSelected] = useState<SavedItem | null>(null);
  const [detailItem, setDetailItem] = useState<SavedItem | null>(null);
  const [detailY, setDetailY] = useState(100);
  const [detailAnimating, setDetailAnimating] = useState(false);
  const detailStartY = useRef(0);
  const detailDragging = useRef(false);
  const [reportingId, setReportingId] = useState<number | null>(null);
  const [reports, setReports] = useState<Record<number, WatchReaction>>({});
  const [stats, setStats] = useState({ total: 0, loved: 0, good: 0, meh: 0, dropped: 0 });
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [groupByOTT, setGroupByOTT] = useState(false);
  const [archivedIds, setArchivedIds] = useState<Set<number>>(new Set());
  const [history, setHistory] = useState<RecHistoryEntry[]>([]);

  const refreshData = () => {
    setSaved(getSaved());
    const allReports: Record<number, WatchReaction> = {};
    for (const s of getSaved()) {
      const r = getWatchReport(s.recommendation.tmdbId);
      if (r) allReports[s.recommendation.tmdbId] = r.reaction;
    }
    setReports(allReports);
    setStats(getWatchStats());
    setArchivedIds(new Set(getArchivedIds()));
    setHistory(getRecHistory());
  };

  useEffect(() => { refreshData(); }, []);

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
    } else {
      items.sort((a, b) => {
        const aWatched = reports[a.recommendation.tmdbId] ? 1 : 0;
        const bWatched = reports[b.recommendation.tmdbId] ? 1 : 0;
        return aWatched - bWatched;
      });
    }
    return items;
  }, [saved, reports, viewFilter, archivedIds]);

  // OTT별 그룹핑
  const ottGroups = useMemo(() => {
    if (!groupByOTT) return null;
    const groups: Record<string, SavedItem[]> = {};
    for (const item of filteredSaved) {
      const key = ottGroupKey(item);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    // 작품 수 많은 OTT 먼저
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [filteredSaved, groupByOTT]);

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

  const handleResave = (entry: RecHistoryEntry) => {
    addSaved({
      title: entry.title,
      tmdbId: entry.tmdbId,
      posterUrl: entry.posterUrl,
      reason: "",
      rating: 0,
      providers: [],
      type: "movie",
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
    refreshData();
  };

  const handleRemove = (tmdbId: number) => {
    removeSaved(tmdbId);
    removeWatchReport(tmdbId);
    if (selected?.recommendation.tmdbId === tmdbId) setSelected(null);
    if (reportingId === tmdbId) setReportingId(null);
    refreshData();
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

  const snapDetail = useCallback((target: number) => {
    setDetailAnimating(true);
    setDetailY(target);
    setTimeout(() => {
      setDetailAnimating(false);
      if (target === 100) setDetailItem(null);
    }, 300);
  }, []);

  const openDetailFor = useCallback((item: SavedItem) => {
    setDetailItem(item);
    setDetailY(100);
    requestAnimationFrame(() => snapDetail(0));
  }, [snapDetail]);

  const closeDetail = useCallback(() => {
    snapDetail(100);
  }, [snapDetail]);

  const onDetailTouchStart = useCallback((e: React.TouchEvent) => {
    detailStartY.current = e.touches[0].clientY;
    detailDragging.current = true;
  }, []);

  const onDetailTouchMove = useCallback((e: React.TouchEvent) => {
    if (!detailDragging.current) return;
    const dy = e.touches[0].clientY - detailStartY.current;
    if (dy > 0) {
      e.preventDefault();
      setDetailY(Math.min(100, (dy / window.innerHeight) * 120));
    }
  }, []);

  const onDetailTouchEnd = useCallback(() => {
    detailDragging.current = false;
    if (detailY > 30) snapDetail(100);
    else snapDetail(0);
  }, [detailY, snapDetail]);

  const handlePickTonight = () => {
    if (saved.length === 0) return;
    const unwatched = saved.filter((s) => !reports[s.recommendation.tmdbId]);
    const pool = unwatched.length > 0 ? unwatched : saved;

    const hour = new Date().getHours();
    const isLateNight = hour >= 22 || hour < 6;
    const isWeekend = [0, 6].includes(new Date().getDay());

    // 가중치: 늦은 밤 → 짧은 영화 우선, 주말 → 시리즈 우선
    const weighted = pool.map((item) => {
      let weight = 1;
      const rec = item.recommendation;
      if (isLateNight && rec.type === "movie" && rec.runtime && rec.runtime < 120) weight += 2;
      if (isWeekend && rec.type === "series") weight += 2;
      if (!isLateNight && !isWeekend) weight = 1; // 평일 낮 = 균등
      return { item, weight };
    });

    const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
    let random = Math.random() * totalWeight;
    for (const { item, weight } of weighted) {
      random -= weight;
      if (random <= 0) { setSelected(item); return; }
    }
    setSelected(pool[0]);
  };

  const archivedCount = archivedIds.size;
  const activeItems = saved.filter((s) => !archivedIds.has(s.recommendation.tmdbId));
  const watchedCount = activeItems.filter((s) => reports[s.recommendation.tmdbId]).length;
  const unwatchedCount = activeItems.length - watchedCount;

  const pickSubtext = (() => {
    const hour = new Date().getHours();
    const isLateNight = hour >= 22 || hour < 6;
    const isWeekend = [0, 6].includes(new Date().getDay());
    if (isLateNight) return "짧은 영화 위주로 골라드릴게요";
    if (isWeekend) return "주말이니까 시리즈도 좋아요";
    if (unwatchedCount > 0) return `안 본 ${unwatchedCount}편 중 하나를 골라드릴게요`;
    return "저장한 작품 중에서 하나 골라드릴게요";
  })();

  const VIEW_FILTERS: { key: ViewFilter; label: string; count: number }[] = [
    { key: "all", label: "전체", count: activeItems.length },
    { key: "unwatched", label: "안 본 작품", count: unwatchedCount },
    { key: "watched", label: "시청 완료", count: watchedCount },
    ...(archivedCount > 0 ? [{ key: "archived" as ViewFilter, label: "아카이브", count: archivedCount }] : []),
    { key: "history" as ViewFilter, label: "히스토리", count: history.length },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-6 pb-2">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold">Saved</h1>
          {saved.length > 0 && viewFilter !== "history" && (
            <button
              onClick={() => setGroupByOTT(!groupByOTT)}
              className="px-3 py-1.5 text-xs font-medium active:scale-95 transition-all duration-200 min-h-[44px]"
              style={{
                background: groupByOTT ? "var(--accent-dim)" : "transparent",
                color: groupByOTT ? "var(--accent)" : "var(--accent)",
                borderRadius: "var(--radius-full)",
                border: "1px solid var(--accent-border)",
              }}
            >
              OTT별 보기
            </button>
          )}
        </div>
        {/* Progress bar — 안 본 작품 진행률 */}
        {saved.length > 0 && viewFilter !== "history" && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-muted">
                저장 {saved.length}편{watchedCount > 0 && ` · 시청 ${watchedCount}편`}
              </p>
              {unwatchedCount > 0 && (
                <p className="text-xs font-medium text-accent">
                  {unwatchedCount}편 남음
                </p>
              )}
            </div>
            {watchedCount > 0 && (
              <div className="h-1 overflow-hidden bg-surface rounded-full">
                <div
                  className="h-full transition-all duration-500 bg-accent rounded-full"
                  style={{
                    width: `${(watchedCount / saved.length) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}
        {!saved.length && (
          <p className="text-sm mt-1 text-muted">
            저장한 작품이 여기에 모여요
          </p>
        )}
      </div>

      {/* Filter tabs */}
      {saved.length > 0 && (
        <div className="flex gap-2 px-5 mt-2 mb-1 overflow-x-auto">
          {VIEW_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setViewFilter(f.key)}
              className="px-3 py-1.5 text-xs font-medium whitespace-nowrap active:scale-95 transition-all min-h-[44px]"
              style={{
                background: viewFilter === f.key ? "var(--accent-dim)" : "var(--surface)",
                color: viewFilter === f.key ? "var(--accent)" : "var(--text-secondary)",
                borderRadius: "var(--radius-full)",
                border: viewFilter === f.key ? "1px solid var(--accent-border-light)" : "1px solid transparent",
              }}
            >
              {f.label} {f.count > 0 && <span className="font-data">{f.count}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Watch Stats */}
      {stats.total > 0 && viewFilter !== "history" && (
        <div className="mx-5 mt-2 mb-3">
          <div
            className="p-3 flex items-center gap-3 bg-surface rounded-lg"
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
                    포기 {stats.dropped}
                  </span>
                )}
              </div>
            </div>
            <div className="font-data text-2xl font-bold text-accent">
              {stats.total}
            </div>
          </div>
        </div>
      )}

      {/* Tonight banner */}
      {saved.length > 0 && viewFilter !== "history" && (
        <div className="mx-5 mt-1 mb-4">
          <button
            onClick={handlePickTonight}
            className="w-full p-4 flex items-center justify-between active:scale-[0.98] transition-transform bg-surface border border-border rounded-lg"
          >
            <div className="text-left">
              <div className="font-display font-semibold">오늘 뭐 볼까?</div>
              <div className="text-xs mt-0.5 text-muted">
                {pickSubtext}
              </div>
            </div>
            <div
              className="px-4 py-2 text-sm font-semibold bg-accent text-background rounded-md"
            >
              고르기
            </div>
          </button>
        </div>
      )}

      {/* Tonight pick */}
      {selected && viewFilter !== "history" && (
        <div
          className="mx-5 mb-4 p-4 animate-fade-in cursor-pointer active:scale-[0.98] transition-transform bg-accent-dim rounded-lg"
          style={{ border: "1px solid var(--accent-border-light)" }}
          onClick={() => { if (selected) openDetailFor(selected); }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider mb-2 text-accent">
            오늘의 선택
          </div>
          <div className="flex gap-3">
            {selected.recommendation.posterUrl && (
              <Image
                src={selected.recommendation.posterUrl}
                alt={selected.recommendation.title}
                width={64}
                height={96}
                className="object-cover flex-shrink-0 rounded-md"
                sizes="64px"
              />
            )}
            <div>
              <div className="font-display font-bold text-lg">{selected.recommendation.title}</div>
              <div className="text-sm mt-1 text-secondary">
                {selected.recommendation.reason}
              </div>
              <div className="flex gap-1 mt-2">
                {selected.recommendation.providers.slice(0, 3).map((p) => {
                  const iconSrc = getOTTIcon(p.name) ?? p.logoUrl;
                  return iconSrc ? (
                    <Image key={p.name} src={iconSrc} alt={p.name} width={24} height={24} className="object-contain rounded-sm bg-surface" unoptimized />
                  ) : null;
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Poster grid — 스크롤 영역 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
      {viewFilter === "history" ? (
        /* 히스토리 뷰 */
        <div className="pb-4">
          {history.length === 0 ? (
            <div className="flex-1 flex flex-col justify-center px-8 py-12 text-muted">
              <p className="font-display text-lg font-semibold text-foreground">아직 추천 기록이 없어요</p>
              <p className="text-sm mt-1.5">Discover에서 스와이프하면 여기 쌓여요</p>
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
                    const savedItem = isSaved ? saved.find((s) => s.recommendation.tmdbId === entry.tmdbId) : null;
                    return (
                      <div
                        key={entry.tmdbId}
                        className="flex-shrink-0 w-16 cursor-pointer"
                        onClick={() => {
                          if (savedItem) openDetailFor(savedItem);
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
                            <div className="w-full h-full flex items-center justify-center text-xs text-center bg-surface text-muted p-1">
                              {entry.title.slice(0, 4)}
                            </div>
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
                            onClick={(e) => { e.stopPropagation(); handleResave(entry); }}
                            className="mt-1 w-full py-1 text-xs font-medium active:scale-95 transition-transform rounded-sm"
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
        <div className="flex-1 flex flex-col justify-center px-8 text-muted">
          <IconHeart size={32} />
          <p className="mt-4 font-display text-lg font-semibold text-foreground">아직 저장한 작품이 없어요</p>
          <p className="text-sm mt-1.5">Discover에서 마음에 드는 작품을 저장해보세요</p>
        </div>
      ) : filteredSaved.length === 0 ? (
        <div className="flex-1 flex flex-col justify-center px-8 text-muted">
          <IconCheck size={32} />
          <p className="mt-4 font-display text-lg font-semibold text-foreground">
            {viewFilter === "unwatched" ? "모두 시청했어요!" : "아직 시청 기록이 없어요"}
          </p>
          <p className="text-sm mt-1.5">
            {viewFilter === "unwatched" ? "Discover에서 새로운 작품을 찾아보세요" : "포스터의 '봤어요?' 버튼으로 기록해보세요"}
          </p>
        </div>
      ) : groupByOTT && ottGroups ? (
        /* OTT 그룹핑 뷰 */
        <div className="flex-1 pb-4 overflow-y-auto">
          {ottGroups.map(([ottName, items]) => (
            <div key={ottName} className="mb-5">
              {/* OTT 섹션 헤더 */}
              <div className="flex items-center gap-2 px-5 mb-2">
                {(getOTTIcon(ottName)) && (
                  <Image
                    src={getOTTIcon(ottName)!}
                    alt={ottName}
                    width={20}
                    height={20}
                    className="object-contain rounded-sm"
                    unoptimized
                  />
                )}
                <span className="text-sm font-semibold">{ottName}</span>
                <span className="text-xs font-data text-muted">{items.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 px-5 auto-rows-min">
                {items.map((item, i) => (
                  <PosterCard
                    key={item.recommendation.tmdbId}
                    item={item}
                    index={i}
                    report={reports[item.recommendation.tmdbId]}
                    isReporting={reportingId === item.recommendation.tmdbId}
                    onOpen={openDetailFor}
                    onReport={handleReport}
                    onUndoReport={handleUndoReport}
                    onRemove={handleRemove}
                    onStartReport={setReportingId}
                    onCancelReport={() => setReportingId(null)}
                    isArchived={archivedIds.has(item.recommendation.tmdbId)}
                    onArchiveToggle={(id) => { if (archivedIds.has(id)) { unarchiveItem(id); } else { archiveItem(id); } refreshData(); }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* 기본 그리드 뷰 */
        <div className="grid grid-cols-2 gap-3 px-5 pb-4 auto-rows-min">
          {filteredSaved.map((item, i) => (
            <PosterCard
              key={item.recommendation.tmdbId}
              item={item}
              index={i}
              report={reports[item.recommendation.tmdbId]}
              isReporting={reportingId === item.recommendation.tmdbId}
              onOpen={openDetailFor}
              onReport={handleReport}
              onUndoReport={handleUndoReport}
              onRemove={handleRemove}
              onStartReport={setReportingId}
              onCancelReport={() => setReportingId(null)}
            />
          ))}
        </div>
      )}
      </div>{/* 스크롤 영역 끝 */}

      {/* Detail bottom sheet — 제스처 기반 */}
      {detailItem && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          onClick={closeDetail}
        >
          <div className="absolute inset-0" style={{ background: "var(--bg-overlay-heavy)", opacity: 1 - detailY / 100, transition: detailAnimating ? "opacity 0.3s ease-out" : "none" }} />
          <div
            className="relative w-full max-w-[480px] max-h-[85dvh] overflow-y-auto p-5 pb-8 bg-background"
            style={{
              borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
              transform: `translateY(${detailY}%)`,
              transition: detailAnimating ? "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
              touchAction: "pan-y",
            }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={onDetailTouchStart}
            onTouchMove={onDetailTouchMove}
            onTouchEnd={onDetailTouchEnd}
          >
            {/* Handle bar */}
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 rounded-full" style={{ background: "var(--border)" }} />
            </div>

            <button
              className="absolute top-4 right-4 w-11 h-11 flex items-center justify-center bg-surface rounded-full"
              onClick={closeDetail}
            >
              <IconClose size={16} color="var(--text-secondary)" />
            </button>

            {/* 스틸컷 */}
            {detailItem.recommendation.backdrop && (
              <div className="relative w-full h-40 mb-4 -mt-1 overflow-hidden rounded-md">
                <Image src={detailItem.recommendation.backdrop} alt="" fill className="object-cover" sizes="(max-width: 480px) 100vw, 480px" />
              </div>
            )}

            {/* Poster + Title */}
            <div className="flex gap-4">
              {detailItem.recommendation.posterUrl && (
                <Image
                  src={detailItem.recommendation.posterUrl}
                  alt={detailItem.recommendation.title}
                  width={96}
                  height={144}
                  className="object-cover flex-shrink-0 rounded-md"
                  sizes="96px"
                />
              )}
              <div className="flex-1 min-w-0 pt-1">
                <h2 className="font-display text-xl font-bold">{detailItem.recommendation.title}</h2>
                <p className="text-sm mt-0.5 text-muted">
                  {detailItem.recommendation.titleEn}
                </p>
                <p className="text-xs mt-0.5 text-muted">
                  {[
                    detailItem.recommendation.country?.join("/"),
                    detailItem.recommendation.date?.slice(0, 4),
                    detailItem.recommendation.runtime ? `${detailItem.recommendation.runtime}분` : null,
                    detailItem.recommendation.seasons ? `시즌 ${detailItem.recommendation.seasons}` : null,
                  ].filter(Boolean).join(" · ")}
                </p>
                <div className="flex items-center gap-1.5 mt-2">
                  <IconStar size={13} color="var(--accent)" />
                  <span className="font-data text-sm font-semibold text-accent">{detailItem.recommendation.rating.toFixed(1)}</span>
                </div>
                {reports[detailItem.recommendation.tmdbId] && (
                  <div className="mt-2">
                    <ReactionLabel reaction={reports[detailItem.recommendation.tmdbId]} />
                  </div>
                )}
              </div>
            </div>

            {/* Reason */}
            <div className="mt-5">
              <div className="px-3 py-2 text-sm bg-accent-dim rounded-md">
                {detailItem.recommendation.reason}
              </div>
            </div>

            {/* Credits */}
            {(detailItem.recommendation.director || detailItem.recommendation.cast?.length > 0) && (
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
                {detailItem.recommendation.director && (
                  <div>
                    <span className="text-xs text-muted">감독 </span>
                    <span className="text-sm">{detailItem.recommendation.director}</span>
                  </div>
                )}
                {detailItem.recommendation.cast?.length > 0 && (
                  <div>
                    <span className="text-xs text-muted">출연 </span>
                    <span className="text-sm">{detailItem.recommendation.cast.join(", ")}</span>
                  </div>
                )}
              </div>
            )}

            {/* Overview */}
            {detailItem.recommendation.overview && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-2 text-muted">줄거리</h3>
                <p className="text-sm leading-relaxed text-secondary">{detailItem.recommendation.overview}</p>
              </div>
            )}

            {/* OTT links */}
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2 text-muted">시청 가능</h3>
              <div className="flex flex-col gap-2">
                {detailItem.recommendation.providers.map((p) => {
                  const ottUrl = getOTTLink(p.name, detailItem.recommendation.title);
                  return (
                    <a
                      key={p.name}
                      href={ottUrl ?? detailItem.recommendation.watchLink ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 text-sm font-medium active:scale-[0.98] transition-transform bg-surface-raised rounded-md"
                    >
                      {(getOTTIcon(p.name) ?? p.logoUrl) ? (
                        <Image src={(getOTTIcon(p.name) ?? p.logoUrl)!} alt={p.name} width={32} height={32} className="object-contain flex-shrink-0 rounded-sm bg-surface" unoptimized />
                      ) : (
                        <div className="w-8 h-8 flex-shrink-0 rounded-sm bg-surface" />
                      )}
                      <span className="flex-1">{p.name}</span>
                      <span className="text-xs text-accent">열기</span>
                    </a>
                  );
                })}
              </div>
            </div>
            {/* 공유 */}
            <button
              onClick={async () => {
                const rec = detailItem!.recommendation;
                const text = `${rec.title} — ${rec.reason}`;
                const providers = rec.providers.map((p) => p.name).join(", ");
                const body = `${text}\n${providers}에서 볼 수 있어요\n\nNeko에서 발견`;
                if (navigator.share) {
                  try { await navigator.share({ title: rec.title, text: body }); } catch {}
                } else {
                  await navigator.clipboard.writeText(body);
                }
              }}
              className="w-full mt-4 py-3 text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform rounded-lg"
              style={{ background: "transparent", border: "1px solid var(--accent-border)", color: "var(--accent)" }}
            >
              <IconShare size={16} color="var(--accent)" />
              공유하기
            </button>
          </div>
        </div>
      )}

      <BottomNav active="saved" />
    </div>
  );
}
