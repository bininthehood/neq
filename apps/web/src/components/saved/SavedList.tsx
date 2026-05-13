"use client";

/**
 * Saved 목록 렌더 — grid / list 모드 통합.
 * - PosterCard (grid) / ListCard (list) 자식.
 * - groupByOTT / ottGroups 분기, 빈 상태 메시지, 작품 없음 분기 모두 통합.
 * - history / preview 모드는 page.tsx (Saved page) 가 직접 렌더.
 *
 * 위임 L #6 — List 모드 카드. PosterCard 와 데이터·핸들러 시그니처 동일 → 페이지가 mode 스위치만.
 */

import Image from "next/image";
import PosterFallback from "@/components/PosterFallback";
import {
  IconStar,
  IconClose,
  IconCheck,
  IconHeart,
  IconArchive,
} from "@/components/Icons";
import { getOTTIcon } from "@/lib/ott-links";
import type { SavedItem, WatchReaction } from "@/lib/types";

export type SavedViewMode = "grid" | "list" | "preview";
export const SAVED_VIEW_KEY = "neq_saved_view";

export function loadSavedView(): SavedViewMode {
  if (typeof window === "undefined") return "grid";
  try {
    const v = localStorage.getItem(SAVED_VIEW_KEY);
    if (v === "list" || v === "grid" || v === "preview") return v;
  } catch {
    /* ignore */
  }
  return "grid";
}

export function persistSavedView(mode: SavedViewMode) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SAVED_VIEW_KEY, mode);
  } catch {
    /* ignore */
  }
}

export const REACTIONS: { key: WatchReaction; label: string; color: string; bg: string }[] = [
  { key: "loved", label: "인생작", color: "var(--text-primary)", bg: "var(--accent-dim)" },
  { key: "good", label: "재밌었어", color: "var(--text-secondary)", bg: "var(--surface-raised)" },
  { key: "meh", label: "그저 그래", color: "var(--text-muted)", bg: "var(--surface)" },
  { key: "dropped", label: "안 맞았어", color: "var(--danger)", bg: "var(--danger-dim)" },
];

export function ReactionLabel({ reaction }: { reaction: WatchReaction }) {
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

type CardCommonProps = {
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
};

export function PosterCard({
  item,
  index,
  report,
  isReporting,
  isArchived,
  onOpen,
  onReport,
  onUndoReport,
  onRemove,
  onStartReport,
  onCancelReport,
  onArchiveToggle,
}: CardCommonProps & { index: number }) {
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
              { key: "loved" as WatchReaction, label: "인생작", bg: "var(--accent-dim)", color: "var(--text-primary)", border: "1px solid var(--accent-border-light)" },
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
export function ListCard({
  item,
  report,
  isReporting,
  isArchived,
  onOpen,
  onReport,
  onUndoReport,
  onRemove,
  onStartReport,
  onCancelReport,
  onArchiveToggle,
}: CardCommonProps) {
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
              { key: "loved" as WatchReaction, label: "인생작", bg: "var(--accent-dim)", color: "var(--text-primary)", border: "1px solid var(--accent-border-light)" },
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

/**
 * SavedList — grid / list 모드 통합.
 * - groupByOTT 활성 시 OTT 그룹별 헤더 + 그룹 안 grid/list 분기.
 * - groupByOTT 비활성 시 단일 grid (CSS columns mason) 또는 list 1열.
 */
export function SavedList({
  items,
  reports,
  reportingId,
  archivedIds,
  viewMode,
  ottGroups,
  onOpen,
  onReport,
  onUndoReport,
  onRemove,
  onStartReport,
  onCancelReport,
  onArchiveToggle,
}: {
  items: SavedItem[];
  reports: Record<number, WatchReaction>;
  reportingId: number | null;
  archivedIds: Set<number>;
  viewMode: SavedViewMode;
  /** OTT 그룹 활성 시 [OTT name, items][]. null 이면 단일 리스트. */
  ottGroups: [string, SavedItem[]][] | null;
  onOpen: (item: SavedItem) => void;
  onReport: (tmdbId: number, reaction: WatchReaction) => void;
  onUndoReport: (tmdbId: number) => void;
  onRemove: (tmdbId: number) => void;
  onStartReport: (tmdbId: number) => void;
  onCancelReport: () => void;
  onArchiveToggle: (tmdbId: number) => void;
}) {
  if (ottGroups) {
    return (
      <div className="flex-1 pb-4 overflow-y-auto">
        {ottGroups.map(([ottName, groupItems]) => (
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
              <span className="text-xs font-data text-muted">{groupItems.length}</span>
            </div>
            {/* OTT 그룹 안 작품들 — viewMode 따라 grid/list 분기.
                items.length === 0 (해당 OTT 에 저장된 작품 없음) 시 placeholder 메시지. */}
            {groupItems.length === 0 ? (
              <p className="px-5 text-xs text-muted">
                이 OTT에는 저장된 작품이 없어요
              </p>
            ) : viewMode === "list" ? (
              <div className="flex flex-col gap-2 px-5">
                {groupItems.map((item) => (
                  <ListCard
                    key={item.recommendation.tmdbId}
                    item={item}
                    report={reports[item.recommendation.tmdbId]}
                    isReporting={reportingId === item.recommendation.tmdbId}
                    onOpen={onOpen}
                    onReport={onReport}
                    onUndoReport={onUndoReport}
                    onRemove={onRemove}
                    onStartReport={onStartReport}
                    onCancelReport={onCancelReport}
                    isArchived={archivedIds.has(item.recommendation.tmdbId)}
                    onArchiveToggle={onArchiveToggle}
                  />
                ))}
              </div>
            ) : (
              <div className="px-5" style={{ columnCount: 2, columnGap: 12 }}>
                {groupItems.map((item, i) => (
                  <PosterCard
                    key={item.recommendation.tmdbId}
                    item={item}
                    index={i}
                    report={reports[item.recommendation.tmdbId]}
                    isReporting={reportingId === item.recommendation.tmdbId}
                    onOpen={onOpen}
                    onReport={onReport}
                    onUndoReport={onUndoReport}
                    onRemove={onRemove}
                    onStartReport={onStartReport}
                    onCancelReport={onCancelReport}
                    isArchived={archivedIds.has(item.recommendation.tmdbId)}
                    onArchiveToggle={onArchiveToggle}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (viewMode === "list") {
    /* 위임 L #6 — List 뷰 (1열 가로 카드). */
    return (
      <div className="flex flex-col gap-2 px-5 pb-4">
        {items.map((item) => (
          <ListCard
            key={item.recommendation.tmdbId}
            item={item}
            report={reports[item.recommendation.tmdbId]}
            isReporting={reportingId === item.recommendation.tmdbId}
            onOpen={onOpen}
            onReport={onReport}
            onUndoReport={onUndoReport}
            onRemove={onRemove}
            onStartReport={onStartReport}
            onCancelReport={onCancelReport}
            isArchived={archivedIds.has(item.recommendation.tmdbId)}
            onArchiveToggle={onArchiveToggle}
          />
        ))}
      </div>
    );
  }

  /* 기본 그리드 뷰 — CSS columns mason packing (PosterCard height 240/200 변형 시각효과 유지하면서 빈 공간 제거). */
  return (
    <div className="px-5 pb-4" style={{ columnCount: 2, columnGap: 12 }}>
      {items.map((item, i) => (
        <PosterCard
          key={item.recommendation.tmdbId}
          item={item}
          index={i}
          report={reports[item.recommendation.tmdbId]}
          isReporting={reportingId === item.recommendation.tmdbId}
          onOpen={onOpen}
          onReport={onReport}
          onUndoReport={onUndoReport}
          onRemove={onRemove}
          onStartReport={onStartReport}
          onCancelReport={onCancelReport}
          isArchived={archivedIds.has(item.recommendation.tmdbId)}
          onArchiveToggle={onArchiveToggle}
        />
      ))}
    </div>
  );
}

// IconHeart export (page.tsx empty state 에서 사용 — 기존 import 경로 단순화)
export { IconHeart };
