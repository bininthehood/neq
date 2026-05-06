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
import BottomNav from "@/components/BottomNav";
import PosterFallback from "@/components/PosterFallback";
import { IconStar, IconClose, IconCheck, IconHeart, IconGrid, IconList, IconSearch, IconPreview, IconArchive } from "@/components/Icons";
import DetailSheet from "@/components/discover/DetailSheet";
import SearchSheet from "@/components/discover/SearchSheet";
import { useDetailSheet } from "@/hooks/useDetailSheet";
import { getOTTIcon } from "@/lib/ott-links";
import { track } from "@/lib/analytics";
import { useToast } from "@neq/design";

const REACTIONS: { key: WatchReaction; label: string; color: string; bg: string }[] = [
  { key: "loved", label: "인생작", color: "var(--accent)", bg: "var(--accent-dim)" },
  { key: "good", label: "재밌었어", color: "var(--text-secondary)", bg: "var(--surface-raised)" },
  { key: "meh", label: "그저 그래", color: "var(--text-muted)", bg: "var(--surface)" },
  { key: "dropped", label: "안 맞았어", color: "var(--danger)", bg: "var(--danger-dim)" },
];

type ViewFilter = "all" | "unwatched" | "watched" | "archived" | "history";

/**
 * Saved 뷰 모드.
 * - "grid": 2열 그리드 (CSS columns mason packing)
 * - "list": 1열 가로 카드 (60×90 포스터 + 제목/메타/액션)
 * - "preview": Coverflow 스타일 — 큰 hero + 하단 가로 스크롤 카드들 (히스토리 패턴 활용)
 * localStorage 키: neq_saved_view
 */
type SavedViewMode = "grid" | "list" | "preview";
const SAVED_VIEW_KEY = "neq_saved_view";

function loadSavedView(): SavedViewMode {
  if (typeof window === "undefined") return "grid";
  try {
    const v = localStorage.getItem(SAVED_VIEW_KEY);
    if (v === "list" || v === "grid" || v === "preview") return v;
  } catch {
    /* ignore */
  }
  return "grid";
}

function persistSavedView(mode: SavedViewMode) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SAVED_VIEW_KEY, mode);
  } catch {
    /* ignore */
  }
}

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
      className="relative group cursor-pointer overflow-hidden rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] focus:outline-none"
      style={{
        height: index % 3 === 0 ? "240px" : "200px",
        // CSS columns mason packing — 부모 컨테이너가 column-count:2 일 때 자식이 column-by-column 으로 자연 배치되어
        // 좌-우 height 차이로 생기는 빈 row 공간 없이 위로 밀어 올림.
        breakInside: "avoid",
        marginBottom: "12px",
        display: "block",
      }}
      role="button"
      tabIndex={0}
      aria-label={`${item.recommendation.title} 상세보기`}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(item);
        }
      }}
    >
      {item.recommendation.posterUrl ? (
        <Image src={item.recommendation.posterUrl} alt={item.recommendation.title} fill className="object-cover rounded-lg" sizes="(max-width: 480px) 50vw, 200px" />
      ) : (
        <PosterFallback title={item.recommendation.title} size="md" />
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
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onStartReport(tmdbId); }}
          aria-label={`${item.recommendation.title} 시청 리포트 작성`}
          className="absolute top-1.5 left-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center px-2 text-xs font-medium active:scale-90 transition-transform bg-overlay rounded-full text-secondary focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          style={{ backdropFilter: "blur(4px)" }}
        >
          봤어요?
        </button>
      )}

      {report && !isReporting && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUndoReport(tmdbId); }}
          aria-label={`${item.recommendation.title} 시청 리포트 취소`}
          aria-pressed={true}
          className="absolute top-1.5 left-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center px-2 text-xs font-medium active:scale-90 transition-transform bg-overlay rounded-full focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
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
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onCancelReport();
            }
          }}
          role="dialog"
          aria-label="시청 리포트 선택"
        >
          <div className="text-center">
            <div className="font-display text-sm font-bold">본 적 있나요?</div>
            <div className="text-xs mt-0.5 text-muted">알려주시면 더 좋은 추천을 드릴게요</div>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {([
              { key: "loved" as WatchReaction, label: "인생작", bg: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--accent-border-light)" },
              { key: "good" as WatchReaction, label: "괜찮았어", bg: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border)" },
              { key: "meh" as WatchReaction, label: "별로였어", bg: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" },
              { key: "dropped" as WatchReaction, label: "안 맞았어", bg: "var(--danger-dim)", color: "var(--danger)", border: "none" },
            ]).map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReport(tmdbId, r.key); }}
                aria-label={`${r.label} 리포트`}
                className="px-3 py-2 text-xs font-medium active:scale-95 transition-transform rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                style={{ background: r.bg, color: r.color, border: r.border }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancelReport(); }}
            aria-label="리포트 닫기"
            className="text-xs min-h-[44px] px-4 flex items-center active:scale-95 transition-transform text-muted focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
          >
            닫기
          </button>
        </div>
      )}

      <div className="absolute top-1.5 right-1.5 flex gap-1">
        {(report || isArchived) && onArchiveToggle && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onArchiveToggle(tmdbId); }}
            aria-label={isArchived ? `${item.recommendation.title} 복원` : `${item.recommendation.title} 보관`}
            aria-pressed={isArchived}
            className="w-11 h-11 flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-overlay rounded-full focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none focus-visible:opacity-100"
            style={{ color: isArchived ? "var(--accent)" : "var(--text-muted)" }}
            title={isArchived ? "복원" : "보관"}
          >
            <IconArchive size={14} color={isArchived ? "var(--accent)" : "var(--text-muted)"} />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(tmdbId); }}
          aria-label={`${item.recommendation.title} 저장 취소`}
          className="w-11 h-11 flex items-center justify-center text-xs sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-overlay rounded-full focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none focus-visible:opacity-100"
        >
          <IconClose size={12} />
        </button>
      </div>
    </div>
  );
}

/**
 * 위임 L #6 — List 모드 카드.
 * 가로 카드 = 포스터 60×90 + 제목/평점/OTT/리포트 + 트레일링 액션.
 * PosterCard 와 데이터·핸들러 시그니처 동일 → 페이지가 mode 스위치만.
 */
function ListCard({
  item, report, isReporting, isArchived,
  onOpen, onReport, onUndoReport, onRemove, onStartReport, onCancelReport, onArchiveToggle,
}: {
  item: SavedItem;
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
  const rec = item.recommendation;

  return (
    <div
      className="relative flex items-center gap-3 px-3 py-2.5 cursor-pointer rounded-lg active:scale-[0.99] transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] focus:outline-none"
      style={{
        background: "var(--surface)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
      }}
      role="button"
      tabIndex={0}
      aria-label={`${rec.title} 상세보기`}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(item);
        }
      }}
    >
      <div className="relative flex-shrink-0 w-[60px] h-[90px] rounded-md overflow-hidden">
        {rec.posterUrl ? (
          <Image src={rec.posterUrl} alt={rec.title} fill className="object-cover" sizes="60px" />
        ) : (
          <PosterFallback title={rec.title} size="xs" />
        )}
        {report && (
          <div className="absolute inset-0 pointer-events-none bg-overlay-light" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{rec.title}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="font-data text-xs flex items-center gap-0.5 text-muted">
            <IconStar size={10} />{rec.rating.toFixed(1)}
          </span>
          {rec.runtime && rec.type === "movie" && (
            <span className="text-xs text-muted">· {rec.runtime}분</span>
          )}
          {rec.type === "series" && rec.seasons && (
            <span className="text-xs text-muted">· 시즌 {rec.seasons}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          {report ? (
            <ReactionLabel reaction={report} />
          ) : (
            rec.providers.slice(0, 3).map((p) => {
              const iconSrc = getOTTIcon(p.name) ?? p.logoUrl;
              return iconSrc ? (
                <Image key={p.name} src={iconSrc} alt={p.name} width={16} height={16} className="object-contain rounded-sm" unoptimized />
              ) : null;
            })
          )}
        </div>
      </div>

      {/* 트레일링 액션 */}
      {!isReporting && (
        <div className="flex-shrink-0 flex items-center gap-1">
          {!report ? (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onStartReport(tmdbId); }}
              aria-label={`${rec.title} 시청 리포트 작성`}
              className="min-h-[44px] px-3 text-xs font-medium active:scale-95 transition-transform rounded-full focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
              style={{ background: "var(--surface-raised)", color: "var(--text-secondary)" }}
            >
              봤어요?
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUndoReport(tmdbId); }}
              aria-label={`${rec.title} 시청 리포트 취소`}
              aria-pressed={true}
              className="min-h-[44px] px-2 text-xs font-medium active:scale-95 transition-transform rounded-full flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
              style={{ background: "var(--surface-raised)", color: REACTIONS.find((x) => x.key === report)?.color }}
              title="리포트 취소"
            >
              <IconCheck size={11} />
            </button>
          )}
          {(report || isArchived) && onArchiveToggle && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onArchiveToggle(tmdbId); }}
              aria-label={isArchived ? `${rec.title} 복원` : `${rec.title} 보관`}
              aria-pressed={isArchived}
              className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform rounded-full focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
              style={{ color: isArchived ? "var(--accent)" : "var(--text-muted)" }}
              title={isArchived ? "복원" : "보관"}
            >
              <IconArchive size={14} color={isArchived ? "var(--accent)" : "var(--text-muted)"} />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(tmdbId); }}
            aria-label={`${rec.title} 저장 취소`}
            className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform rounded-full focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
            style={{ color: "var(--text-muted)" }}
          >
            <IconClose size={12} />
          </button>
        </div>
      )}

      {/* List 모드의 reporting overlay — 카드 전체 덮기 */}
      {isReporting && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center px-3 gap-2 animate-fade-in z-10 rounded-lg"
          style={{ backdropFilter: "blur(8px)", background: "linear-gradient(var(--bg) 20%, var(--bg-overlay-heavy) 70%, transparent)" }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancelReport(); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onCancelReport();
            }
          }}
          role="dialog"
          aria-label="시청 리포트 선택"
        >
          <div className="text-center">
            <div className="font-display text-sm font-bold">본 적 있나요?</div>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {([
              { key: "loved" as WatchReaction, label: "인생작", bg: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--accent-border-light)" },
              { key: "good" as WatchReaction, label: "괜찮았어", bg: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border)" },
              { key: "meh" as WatchReaction, label: "별로였어", bg: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" },
              { key: "dropped" as WatchReaction, label: "안 맞았어", bg: "var(--danger-dim)", color: "var(--danger)", border: "none" },
            ]).map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReport(tmdbId, r.key); }}
                aria-label={`${r.label} 리포트`}
                className="px-3 py-2 text-xs font-medium active:scale-95 transition-transform rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                style={{ background: r.bg, color: r.color, border: r.border }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SavedPage() {
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [selected, setSelected] = useState<SavedItem | null>(null);
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
  const toast = useToast();

  // --- Nudge: 저장 후 24시간+ 미시청 작품 개별 넛지 ---
  const NUDGE_DISMISS_KEY = "neq_nudge_dismissed";
  const [dismissedNudges, setDismissedNudges] = useState<Set<number>>(new Set());

  const loadDismissedNudges = useCallback((): Set<number> => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(NUDGE_DISMISS_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw) as Array<{ id: number; until: number }>;
      const now = Date.now();
      const valid = parsed.filter((p) => p.until > now);
      localStorage.setItem(NUDGE_DISMISS_KEY, JSON.stringify(valid));
      return new Set(valid.map((p) => p.id));
    } catch {
      return new Set();
    }
  }, []);

  const nudgeItems = useMemo(() => {
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    return saved
      .filter(
        (s) =>
          !reports[s.recommendation.tmdbId] &&
          !archivedIds.has(s.recommendation.tmdbId) &&
          now - s.savedAt > ONE_DAY &&
          !dismissedNudges.has(s.recommendation.tmdbId)
      )
      .slice(0, 2);
  }, [saved, reports, archivedIds, dismissedNudges]);

  // Track nudge shown
  useEffect(() => {
    for (const item of nudgeItems) {
      track("nudge_shown", { tmdb_id: item.recommendation.tmdbId });
    }
  }, [nudgeItems]);

  const handleDismissNudge = useCallback((tmdbId: number) => {
    track("nudge_dismissed", { tmdb_id: tmdbId });
    try {
      const raw = localStorage.getItem(NUDGE_DISMISS_KEY);
      const parsed = raw
        ? (JSON.parse(raw) as Array<{ id: number; until: number }>)
        : [];
      parsed.push({ id: tmdbId, until: Date.now() + 48 * 60 * 60 * 1000 });
      localStorage.setItem(NUDGE_DISMISS_KEY, JSON.stringify(parsed));
    } catch {
      // ignore
    }
    setDismissedNudges((prev) => new Set(prev).add(tmdbId));
  }, []);

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
    setDismissedNudges(loadDismissedNudges());
    // 위임 L #6 — 뷰 모드 복원
    setViewMode(loadSavedView());
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

  // preview 모드 hero 자동 선택 — selectedPreviewId 가 ottFilteredSaved 안에 없으면 첫 작품으로.
  // ottFilter 변경, viewFilter 변경 등으로 목록 변경 시 자동 보정.
  useEffect(() => {
    if (viewMode !== "preview") return;
    if (ottFilteredSaved.length === 0) return;
    const exists = selectedPreviewId !== null
      && ottFilteredSaved.some((item) => item.recommendation.tmdbId === selectedPreviewId);
    if (!exists) {
      setSelectedPreviewId(ottFilteredSaved[0].recommendation.tmdbId);
    }
  }, [viewMode, ottFilteredSaved, selectedPreviewId]);

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
    for (const item of ottFilteredSaved) {
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
  }, [ottFilteredSaved, groupByOTT, availableOTTs, ottFilter]);

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
    if (selected?.recommendation.tmdbId === tmdbId) setSelected(null);
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
      {/* Header — Discover 와 동일한 좁은 height (h-12 = 48px) 패턴.
          좌: H1 / 가운데: Grid/List 토글 (Discover 페르소나 chip 자리와 동일) / 우: search.
          OTT별 보기 텍스트 버튼은 헤더 다음 줄로 분리. */}
      <div className="flex items-center justify-between px-5 h-12 shrink-0 gap-3">
        <h1
          className="font-display"
          style={{
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "-0.01em",
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

      {/* Filter tabs row — 좌측 VIEW_FILTERS (가로 스크롤) + 우측 OTT별 보기 토글 (underline 디자인). */}
      {(saved.length > 0 || history.length > 0) && (
        <div className="flex items-center justify-between gap-3 px-5 mt-2 mb-1">
          <div
            className="flex gap-4 overflow-x-auto flex-1 min-w-0"
            role="tablist"
            aria-label="저장 필터"
            style={{ scrollbarWidth: "none" }}
          >
            {VIEW_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={viewFilter === f.key}
                onClick={() => setViewFilter(f.key)}
                className="text-xs whitespace-nowrap active:scale-95 transition-all min-h-[44px] flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                style={{
                  background: viewFilter === f.key ? "var(--accent)" : "transparent",
                  color: viewFilter === f.key ? "var(--text-inverse)" : "var(--text-muted)",
                  fontWeight: viewFilter === f.key ? 600 : 400,
                  borderRadius: "9999px",
                  padding: "6px 12px",
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
          {/* OTT별 보기 — underline 토글. saved 있고 history 아니고 preview 아니고 ottFilter null 일 때만 노출.
              preview 모드는 단일 hero, ottFilter 활성 시 단일 그룹이라 OTT 그룹핑 의미 약함 → 자동 hide. */}
          {saved.length > 0
            && viewFilter !== "history"
            && viewMode !== "preview"
            && !ottFilter && (
            <button
              type="button"
              onClick={() => setGroupByOTT(!groupByOTT)}
              aria-pressed={groupByOTT}
              aria-label={groupByOTT ? "전체 그리드 보기로 전환" : "OTT별 그룹 보기로 전환"}
              className="text-xs whitespace-nowrap active:scale-95 transition-all duration-200 min-h-[44px] px-1 flex items-center flex-shrink-0 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-sm"
              style={{
                color: "var(--accent)",
                textDecoration: groupByOTT ? "underline" : "none",
                textUnderlineOffset: "3px",
              }}
            >
              OTT별 보기
            </button>
          )}
        </div>
      )}

      {/* OTT filter tabs */}
      {availableOTTs.length > 1 && viewFilter !== "history" && saved.length > 0 && (
        <div className="flex gap-2 px-5 mt-1 mb-1 overflow-x-auto" role="tablist" aria-label="OTT 필터" style={{ scrollbarWidth: "none" }}>
          <button
            type="button"
            role="tab"
            aria-selected={ottFilter === null}
            onClick={() => setOttFilter(null)}
            className="px-3 py-2 text-xs whitespace-nowrap active:scale-95 transition-all min-h-[44px] flex items-center gap-1.5 flex-shrink-0 rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
            style={{
              background: ottFilter === null ? "var(--accent)" : "transparent",
              color: ottFilter === null ? "var(--text-inverse)" : "var(--text-muted)",
              fontWeight: ottFilter === null ? 600 : 400,
            }}
          >
            전체
          </button>
          {availableOTTs.map(({ name, count }) => {
            const isActive = ottFilter === name;
            const iconSrc = getOTTIcon(name);
            return (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`${name} (${count}편) ${isActive ? "선택됨" : "선택"}`}
                onClick={() => setOttFilter(isActive ? null : name)}
                className="px-3 py-2 text-xs whitespace-nowrap active:scale-95 transition-all min-h-[44px] flex items-center gap-1.5 flex-shrink-0 rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                style={{
                  background: isActive ? "var(--accent)" : "transparent",
                  color: isActive ? "var(--text-inverse)" : "var(--text-muted)",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {iconSrc && (
                  <Image
                    src={iconSrc}
                    alt=""
                    width={16}
                    height={16}
                    className="object-contain rounded-sm"
                    unoptimized
                  />
                )}
                {name}
                <span className="font-data" style={{ fontSize: "11px", opacity: isActive ? 0.75 : 0.6 }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Individual nudge cards — 저장 후 24시간 이상, 미시청 작품 개별 넛지 */}
      {nudgeItems.length > 0 && viewFilter !== "history" && (
        <div className="mx-5 mb-3">
          {nudgeItems.map((item) => (
            <div
              key={item.recommendation.tmdbId}
              className="flex items-center gap-3 p-3 mb-2 rounded-lg"
              style={{
                background: "var(--surface)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
              }}
            >
              {item.recommendation.posterUrl && (
                <Image
                  src={item.recommendation.posterUrl}
                  alt={item.recommendation.title}
                  width={40}
                  height={60}
                  className="rounded-md object-cover flex-shrink-0"
                  sizes="40px"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {item.recommendation.title}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  봤어요?
                </div>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    track("nudge_reported", { tmdb_id: item.recommendation.tmdbId });
                    handleReport(item.recommendation.tmdbId, "good");
                  }}
                  aria-label={`${item.recommendation.title} 봤어요로 리포트`}
                  className="px-2.5 py-1.5 text-xs rounded-lg active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none min-h-[44px]"
                  style={{
                    background: "var(--accent-dim)",
                    color: "var(--accent)",
                  }}
                >
                  봤어요
                </button>
                <button
                  type="button"
                  onClick={() => handleDismissNudge(item.recommendation.tmdbId)}
                  aria-label={`${item.recommendation.title} 넛지 나중에`}
                  className="px-2 py-1.5 text-xs active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md min-h-[44px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  나중에
                </button>
              </div>
            </div>
          ))}
        </div>
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

      {/* Tonight banner — '안 보았/탐색 중' 컨텍스트 (all / unwatched) 에서만 노출. */}
      {saved.length > 0 && (viewFilter === "all" || viewFilter === "unwatched") && (
        <div className="mx-5 mt-1 mb-4">
          <button
            type="button"
            onClick={handlePickTonight}
            aria-label="오늘의 작품 무작위로 고르기"
            className="w-full p-4 flex items-center justify-between active:scale-[0.98] transition-transform rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
            style={{
              background: "var(--surface)",
              boxShadow: "0 1px 8px rgba(0,0,0,0.2)",
            }}
          >
            <div className="text-left">
              <div className="font-display font-semibold">오늘 뭐 볼까?</div>
              <div className="text-xs mt-0.5 text-muted">
                {pickSubtext}
              </div>
            </div>
            <span aria-hidden="true" style={{ color: "var(--text-secondary)", fontSize: "20px" }}>&#8594;</span>
          </button>
        </div>
      )}

      {/* Tonight pick */}
      {selected && viewFilter !== "history" && (
        <div
          className="mx-5 mb-4 p-4 animate-fade-in cursor-pointer active:scale-[0.98] transition-transform bg-accent-dim rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] focus:outline-none"
          style={{ border: "1px solid var(--accent-border-light)" }}
          role="button"
          tabIndex={0}
          aria-label={`${selected.recommendation.title} 상세보기`}
          onClick={() => { if (selected) openDetailFor(selected); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (selected) openDetailFor(selected);
            }
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-accent">
              오늘의 선택
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSelected(null); }}
              onKeyDown={(e) => { e.stopPropagation(); }}
              aria-label="오늘의 선택 닫기"
              className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform -mr-1 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-full"
            >
              <IconClose size={14} color="var(--text-muted)" />
            </button>
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
              {/* OTT 그룹 안 작품들 — viewMode 따라 grid/list 분기.
                  items.length === 0 (해당 OTT 에 저장된 작품 없음) 시 placeholder 메시지. */}
              {items.length === 0 ? (
                <p className="px-5 text-xs text-muted">
                  이 OTT에는 저장된 작품이 없어요
                </p>
              ) : viewMode === "list" ? (
                <div className="flex flex-col gap-2 px-5">
                  {items.map((item) => (
                    <ListCard
                      key={item.recommendation.tmdbId}
                      item={item}
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
              ) : (
                <div className="px-5" style={{ columnCount: 2, columnGap: 12 }}>
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
              )}
            </div>
          ))}
        </div>
      ) : viewMode === "preview" ? (
        /* Preview (Coverflow) — 큰 hero (포스터 비율 유지) + 하단 가로 스크롤 카드들.
           hero 클릭 → DetailSheet 진입. hero 우측상단 봤어요 reaction 진입 (PosterCard 패턴). */
        (() => {
          const heroItem =
            ottFilteredSaved.find((item) => item.recommendation.tmdbId === selectedPreviewId)
            ?? ottFilteredSaved[0];
          const heroRec = heroItem.recommendation;
          const heroId = heroRec.tmdbId;
          const heroReport = reports[heroId];
          const heroIsReporting = reportingId === heroId;
          return (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Hero — 포스터 비율 (object-contain). flex-1 로 가용 height 가득 → no scroll. */}
              <div
                className="relative flex-1 mx-5 rounded-lg overflow-hidden cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] focus-visible:outline-none"
                style={{ background: "var(--surface)", minHeight: 0 }}
                role="button"
                tabIndex={0}
                aria-label={`${heroRec.title} 상세보기`}
                onClick={() => {
                  // reporting overlay 가 활성이면 hero 클릭은 무시 (reaction 선택 우선).
                  if (heroIsReporting) return;
                  openDetailFor(heroItem);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (!heroIsReporting) openDetailFor(heroItem);
                  }
                }}
              >
                {heroRec.posterUrl ? (
                  <Image
                    src={heroRec.posterUrl}
                    alt={heroRec.title}
                    fill
                    className="object-contain"
                    sizes="(max-width: 480px) 100vw, 480px"
                    priority
                  />
                ) : (
                  <PosterFallback title={heroRec.title} size="lg" />
                )}
                {/* 하단 그라디언트 + 메타 — 포스터 비율 유지로 좌우 빈 공간 가능 */}
                <div
                  className="absolute inset-x-0 bottom-0 flex flex-col p-4 pointer-events-none"
                  style={{
                    background: "linear-gradient(to bottom, transparent 0%, var(--bg-overlay-heavy) 100%)",
                  }}
                >
                  <h2
                    className="font-display text-xl font-bold mb-1"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {heroRec.title}
                  </h2>
                  {heroRec.reason && (
                    <p
                      className="text-sm opacity-95 line-clamp-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {heroRec.reason}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className="font-data text-xs flex items-center gap-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <IconStar size={12} /> {heroRec.rating.toFixed(1)}
                    </span>
                    {heroReport && <ReactionLabel reaction={heroReport} />}
                    {heroRec.providers.slice(0, 3).map((p) => {
                      const iconSrc = getOTTIcon(p.name) ?? p.logoUrl;
                      return iconSrc ? (
                        <Image
                          key={p.name}
                          src={iconSrc}
                          alt={p.name}
                          width={20}
                          height={20}
                          className="object-contain rounded-sm"
                          unoptimized
                        />
                      ) : null;
                    })}
                  </div>
                </div>
                {/* 봤어요 reaction 진입 — PosterCard 패턴. 우측상단. */}
                {!heroReport && !heroIsReporting && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReportingId(heroId); }}
                    aria-label={`${heroRec.title} 시청 리포트 작성`}
                    className="absolute top-2 right-2 min-h-[44px] px-3 text-xs font-medium active:scale-90 transition-transform bg-overlay rounded-full text-secondary focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                    style={{ backdropFilter: "blur(4px)" }}
                  >
                    봤어요?
                  </button>
                )}
                {heroReport && !heroIsReporting && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUndoReport(heroId); }}
                    aria-label={`${heroRec.title} 시청 리포트 취소`}
                    aria-pressed={true}
                    className="absolute top-2 right-2 min-h-[44px] px-3 text-xs font-medium active:scale-90 transition-transform bg-overlay rounded-full focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none flex items-center gap-1"
                    style={{ backdropFilter: "blur(4px)", color: REACTIONS.find((x) => x.key === heroReport)?.color }}
                    title="리포트 취소"
                  >
                    <IconCheck size={12} /> 시청
                  </button>
                )}
                {/* reporting overlay — PosterCard 패턴 hero 적용 */}
                {heroIsReporting && (
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center px-3 gap-3 animate-fade-in z-10 rounded-lg"
                    style={{ backdropFilter: "blur(8px)", background: "linear-gradient(var(--bg) 20%, var(--bg-overlay-heavy) 70%, transparent)" }}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReportingId(null); }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        setReportingId(null);
                      }
                    }}
                    role="dialog"
                    aria-label="시청 리포트 선택"
                  >
                    <div className="text-center">
                      <div className="font-display text-base font-bold">본 적 있나요?</div>
                      <div className="text-xs mt-0.5 text-muted">알려주시면 더 좋은 추천을 드릴게요</div>
                    </div>
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {([
                        { key: "loved" as WatchReaction, label: "인생작", bg: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--accent-border-light)" },
                        { key: "good" as WatchReaction, label: "괜찮았어", bg: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border)" },
                        { key: "meh" as WatchReaction, label: "별로였어", bg: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" },
                        { key: "dropped" as WatchReaction, label: "안 맞았어", bg: "var(--danger-dim)", color: "var(--danger)", border: "none" },
                      ]).map((r) => (
                        <button
                          key={r.key}
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleReport(heroId, r.key); }}
                          aria-label={`${r.label} 리포트`}
                          className="px-3 py-2 text-xs font-medium active:scale-95 transition-transform rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                          style={{ background: r.bg, color: r.color, border: r.border }}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReportingId(null); }}
                      aria-label="리포트 닫기"
                      className="text-xs min-h-[44px] px-4 flex items-center active:scale-95 transition-transform text-muted focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
                    >
                      닫기
                    </button>
                  </div>
                )}
              </div>
              {/* 가로 스크롤 카드들 — 히스토리 탭 패턴 (w-16 h-24 포스터). active 카드 amber 보더. */}
              <div
                className="flex gap-3 px-5 mt-4 pb-4 overflow-x-auto"
                style={{ scrollbarWidth: "none" }}
                role="listbox"
                aria-label="작품 목록"
              >
                {ottFilteredSaved.map((item) => {
                  const id = item.recommendation.tmdbId;
                  const isActive = id === selectedPreviewId;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      aria-label={`${item.recommendation.title}${isActive ? " (현재 미리보기)" : ""}`}
                      className="flex-shrink-0 w-16 active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
                      onClick={() => setSelectedPreviewId(id)}
                    >
                      <div
                        className="relative w-16 h-24 overflow-hidden rounded-md"
                        style={{
                          border: isActive ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                          boxShadow: isActive ? "0 0 0 3px var(--accent-dim)" : "none",
                          transition:
                            "border-color 180ms var(--ease-detail-morph), box-shadow 180ms var(--ease-detail-morph)",
                        }}
                      >
                        {item.recommendation.posterUrl ? (
                          <Image
                            src={item.recommendation.posterUrl}
                            alt={item.recommendation.title}
                            fill
                            className="object-cover"
                            sizes="64px"
                          />
                        ) : (
                          <PosterFallback title={item.recommendation.title} size="xs" />
                        )}
                      </div>
                      <p
                        className="text-xs mt-1 truncate"
                        style={{
                          color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                        }}
                      >
                        {item.recommendation.title}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()
      ) : viewMode === "list" ? (
        /* 위임 L #6 — List 뷰 (1열 가로 카드). */
        <div className="flex flex-col gap-2 px-5 pb-4">
          {ottFilteredSaved.map((item) => (
            <ListCard
              key={item.recommendation.tmdbId}
              item={item}
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
      ) : (
        /* 기본 그리드 뷰 — CSS columns mason packing (PosterCard height 240/200 변형 시각효과 유지하면서 빈 공간 제거). */
        <div className="px-5 pb-4" style={{ columnCount: 2, columnGap: 12 }}>
          {ottFilteredSaved.map((item, i) => (
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
          isSaved={savedIdSet.has(detailItem.recommendation.tmdbId)}
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
      <BottomNav active="saved" />
    </div>
  );
}
