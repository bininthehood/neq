"use client";

/**
 * Preview (Coverflow) — 큰 hero (포스터 비율 유지) + 하단 가로 스크롤 카드들.
 * - hero 클릭 → DetailSheet 진입.
 * - hero 우측상단 봤어요 reaction 진입 (PosterCard 패턴).
 * - hero reaction badge (✓ 인생작 등 — F2) 표시.
 * - 카로셀 카드 탭 → selectedPreviewId 변경.
 */

import Image from "next/image";
import PosterFallback from "@/components/PosterFallback";
import { IconStar, IconCheck } from "@/components/Icons";
import { getOTTIcon } from "@/lib/ott-links";
import type { SavedItem, WatchReaction } from "@/lib/types";
import { ReactionLabel, REACTIONS } from "./SavedList";

export function SavedHero({
  items,
  selectedPreviewId,
  reports,
  reportingId,
  onSelectPreview,
  onOpen,
  onReport,
  onUndoReport,
  onStartReport,
  onCancelReport,
}: {
  items: SavedItem[];
  selectedPreviewId: number | null;
  reports: Record<number, WatchReaction>;
  reportingId: number | null;
  onSelectPreview: (tmdbId: number) => void;
  onOpen: (item: SavedItem) => void;
  onReport: (tmdbId: number, reaction: WatchReaction) => void;
  onUndoReport: (tmdbId: number) => void;
  onStartReport: (tmdbId: number) => void;
  onCancelReport: () => void;
}) {
  const heroItem =
    items.find((item) => item.recommendation.tmdbId === selectedPreviewId)
    ?? items[0];
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
          onOpen(heroItem);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!heroIsReporting) onOpen(heroItem);
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
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onStartReport(heroId); }}
            aria-label={`${heroRec.title} 시청 리포트 작성`}
            className="absolute top-2 right-2 min-h-[44px] px-3 text-xs font-medium active:scale-90 transition-transform bg-overlay rounded-full text-secondary focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
            style={{ backdropFilter: "blur(4px)" }}
          >
            봤어요?
          </button>
        )}
        {heroReport && !heroIsReporting && (() => {
          const reaction = REACTIONS.find((x) => x.key === heroReport);
          return (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUndoReport(heroId); }}
              aria-label={`${heroRec.title} 시청 리포트 (${reaction?.label}) 취소`}
              aria-pressed={true}
              className="absolute top-2 right-2 min-h-[44px] px-3 text-xs font-medium active:scale-90 transition-transform bg-overlay rounded-full focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none flex items-center gap-1"
              style={{ backdropFilter: "blur(4px)", color: reaction?.color }}
              title="리포트 취소"
            >
              <IconCheck size={12} /> {reaction?.label}
            </button>
          );
        })()}
        {/* reporting overlay — PosterCard 패턴 hero 적용 */}
        {heroIsReporting && (
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
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReport(heroId, r.key); }}
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
      </div>
      {/* 가로 스크롤 카드들 — 히스토리 탭 패턴 (w-16 h-24 포스터). active 카드 amber 보더. */}
      <div
        className="flex gap-3 px-5 mt-4 pb-4 overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
        role="listbox"
        aria-label="작품 목록"
      >
        {items.map((item) => {
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
              onClick={() => onSelectPreview(id)}
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
}
