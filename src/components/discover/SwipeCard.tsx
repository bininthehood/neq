"use client";

import { useRef } from "react";
import NextImage from "next/image";
import type { Recommendation } from "@/lib/types";
import type { WatchReaction } from "@/lib/types";
import { IconStar } from "@/components/Icons";
import { getOTTIcon } from "@/lib/ott-links";

interface SwipeCardProps {
  rec: Recommendation;
  isTop: boolean;
  depth: number;
  dragX: number;
  isDragging: boolean;
  swiping: boolean;
  showWatched: boolean;
  immersive: boolean;
  onCardTap: () => void;
  onWatchedReaction: (reaction: WatchReaction) => void;
  onWatchedSkip: () => void;
  onNotInterested: () => void;
  onCloseWatched: () => void;
  onOpenDetail: () => void;
  metaInfo: string;
}

export default function SwipeCard({
  rec,
  immersive,
  isTop,
  depth,
  dragX,
  isDragging,
  swiping,
  showWatched,
  onCardTap,
  onWatchedReaction,
  onWatchedSkip,
  onNotInterested,
  onCloseWatched,
  onOpenDetail,
  metaInfo,
}: SwipeCardProps) {
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const scaleVal = 1 - depth * 0.04;
  const yOffset = depth * 12;
  const tx = isTop ? dragX : 0;
  const ty = yOffset; // 카드는 수직 이동하지 않음 — 아래 스와이프는 오버레이로 처리
  const rot = isTop
    ? Math.sign(dragX) * Math.min(Math.abs(dragX) * 0.06, 15)
    : 0;

  return (
    <div
      className="absolute overflow-hidden will-change-transform"
      style={{
        top: immersive ? "-12px" : 0,
        bottom: immersive ? "-8px" : "8px",
        left: immersive ? "-12px" : "12px",
        right: immersive ? "-12px" : "12px",
        borderRadius: immersive ? 0 : "var(--radius-xl)",
        transform: `translateX(${tx}px) translateY(${ty}px) rotate(${rot}deg) scale(${scaleVal})`,
        transition:
          isTop && isDragging
            ? "none"
            : isTop
              ? "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), top 0.3s ease-out, bottom 0.3s ease-out, left 0.3s ease-out, right 0.3s ease-out, border-radius 0.3s ease-out"
              : "transform 0.3s ease-out",
        zIndex: 10 - depth,
      }}
    >
      {rec.posterUrl ? (
        <NextImage
          src={rec.posterUrl}
          alt={rec.title}
          fill
          className="object-cover"
          sizes="(max-width: 480px) 90vw, 400px"
          priority={isTop}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-surface">
          <span className="font-display text-5xl text-muted">N</span>
        </div>
      )}

      {/* Tap area - pointer-based tap detection (drag-safe) */}
      {isTop && (
        <div
          className="absolute inset-0 z-[5]"
          onPointerDown={(e) => {
            pointerStartRef.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            const dx = Math.abs(e.clientX - pointerStartRef.current.x);
            const dy = Math.abs(e.clientY - pointerStartRef.current.y);
            if (dx < 10 && dy < 10 && !swiping) onCardTap();
          }}
        />
      )}

      {/* Info overlay: render for depth 0 and 1, fade in when becoming top, hide in immersive */}
      {depth <= 1 && (
        <div
          style={{
            opacity: isTop && !immersive ? 1 : 0,
            transition: "opacity 0.25s ease-out",
            pointerEvents: isTop && !immersive ? "auto" : "none",
          }}
        >
          <div className="absolute top-4 right-4 backdrop-blur-sm px-3 py-1.5 flex items-center gap-1.5 z-10 bg-overlay rounded-md">
            <IconStar size={13} color="var(--accent)" />
            <span className="font-data font-semibold text-accent">
              {rec.rating.toFixed(1)}
            </span>
          </div>
          <div className="absolute top-4 left-4 backdrop-blur-sm px-3 py-1.5 text-sm z-10 bg-overlay rounded-md">
            {rec.type === "series" ? "시리즈" : "영화"}
          </div>
          <div
            className="absolute bottom-0 left-0 right-0 p-5 pt-16 z-10"
            style={{
              background:
                "linear-gradient(transparent, var(--bg-overlay-heavy) 40%, var(--bg))",
              pointerEvents: "none",
            }}
          >
            <h2 className="font-display text-3xl font-bold">{rec.title}</h2>
            <div className="flex items-center gap-2 mt-1.5">
              {metaInfo && (
                <span className="text-xs text-muted">{metaInfo}</span>
              )}
              <div className="flex gap-1 items-center">
                {rec.providers.slice(0, 4).map((p) => {
                  const iconSrc = getOTTIcon(p.name) ?? p.logoUrl;
                  return iconSrc ? (
                    <NextImage
                      key={p.name}
                      src={iconSrc}
                      alt={p.name}
                      width={24}
                      height={24}
                      className="object-contain rounded-sm"
                      unoptimized
                    />
                  ) : null;
                })}
              </div>
            </div>
            <div
              className="mt-2 px-2.5 py-1.5 text-sm rounded-md text-secondary"
              style={{ background: "var(--accent-dim)" }}
            >
              {rec.reason}
            </div>
          </div>
        </div>
      )}

      {/* "봤어요?" overlay — 상단에서 내려오는 방향 */}
      {isTop && showWatched && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-start pt-16 px-5 gap-3 z-20 rounded-xl"
          style={{
            background:
              "linear-gradient(var(--bg) 30%, var(--bg-overlay-heavy) 70%, transparent)",
          }}
          onClick={(e) => { e.stopPropagation(); onCloseWatched(); }}
        >
          <div className="text-center">
            <div className="font-display text-lg font-bold">
              본 적 있나요?
            </div>
            <div className="text-xs mt-1 text-muted">
              알려주시면 더 좋은 추천을 드릴게요
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {(
              [
                { key: "loved" as WatchReaction, label: "인생작", bg: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--accent-border-light)", px: "px-5" },
                { key: "good" as WatchReaction, label: "괜찮았어", bg: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border)", px: "px-4" },
                { key: "meh" as WatchReaction, label: "별로였어", bg: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)", px: "px-4" },
                { key: "dropped" as WatchReaction, label: "안 맞았어", bg: "var(--danger-dim)", color: "var(--danger)", border: "none", px: "px-4" },
              ] as const
            ).map((r) => (
              <button
                key={r.key}
                onClick={(e) => {
                  e.stopPropagation();
                  onWatchedReaction(r.key);
                }}
                className={`${r.px} py-2.5 text-sm font-medium active:scale-95 transition-transform rounded-lg`}
                style={{ background: r.bg, color: r.color, border: r.border }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex gap-3 mt-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onWatchedSkip();
              }}
              className="px-4 py-2 text-xs active:scale-95 transition-transform text-muted"
            >
              안 봤어요
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNotInterested();
              }}
              className="px-4 py-2 text-xs active:scale-95 transition-transform text-danger"
            >
              관심 없어요
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
