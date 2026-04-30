"use client";

/**
 * Skeleton — Quiet Ink 로딩 placeholder.
 *
 * 패턴 (motion-demos.jsx #5):
 *   - 2000ms pulse cubic-bezier(0.4, 0, 0.2, 1) (--ease-soft) infinite
 *   - opacity 0.3 → 0.6 → 0.3 (조급하지 않은 호흡)
 *   - background: var(--surface-raised) 기본
 *
 * Variants:
 *   - text: 1줄 height (height prop), width 가변 (lines × gap 자동)
 *   - poster: 2:3 aspect 카드 자리 표시
 *   - card: 전체 카드 자리 표시자 (poster + text 묶음)
 *
 * Reduced motion: pulse 정지 + opacity 정적 (0.45)
 */

import type { CSSProperties } from "react";

export type SkeletonVariant = "text" | "poster" | "card";

export interface SkeletonProps {
  variant?: SkeletonVariant;
  /** text variant 줄 수 (default 1) */
  lines?: number;
  /** width override (default 100%) */
  width?: number | string;
  /** height override — text variant 1줄 height (default 14px) */
  height?: number | string;
  className?: string;
  style?: CSSProperties;
}

// ─────────────────────────────────────────────────────
// Pure logic — variant → CSS class. 단위 테스트 대상.
// ─────────────────────────────────────────────────────

export const SKELETON_PULSE_DURATION_MS = 2000;

/**
 * Variant 별 기본 dimensions.
 */
export function skeletonVariantDefaults(variant: SkeletonVariant): {
  width: string | number;
  height: string | number;
  borderRadius: string;
} {
  switch (variant) {
    case "poster":
      return {
        width: "100%",
        height: "auto",
        borderRadius: "var(--radius-lg, 12px)",
      };
    case "card":
      return {
        width: "100%",
        height: "auto",
        borderRadius: "var(--radius-xl, 16px)",
      };
    case "text":
    default:
      return {
        width: "100%",
        height: 14,
        borderRadius: "var(--radius-sm, 4px)",
      };
  }
}

// ─────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────

export function Skeleton({
  variant = "text",
  lines = 1,
  width,
  height,
  className,
  style,
}: SkeletonProps) {
  const defaults = skeletonVariantDefaults(variant);
  const finalWidth = width ?? defaults.width;
  const finalHeight = height ?? defaults.height;

  if (variant === "text" && lines > 1) {
    return (
      <span
        aria-hidden="true"
        className={className}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          width: finalWidth,
          ...style,
        }}
      >
        <style>{SKELETON_KEYFRAMES}</style>
        {Array.from({ length: lines }).map((_, i) => {
          // 각 줄 width 변동: 마지막 줄 60%, 나머지 100% — 자연스러운 텍스트 모양
          const isLast = i === lines - 1;
          const lineWidth = isLast && lines > 1 ? "60%" : "100%";
          return (
            <span
              key={i}
              style={{
                display: "block",
                width: lineWidth,
                height: finalHeight,
                borderRadius: defaults.borderRadius,
                background: "var(--surface-raised)",
                animation: `neqSkeletonPulse ${SKELETON_PULSE_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1) infinite`,
                animationDelay: `${i * 80}ms`,
              }}
            />
          );
        })}
      </span>
    );
  }

  if (variant === "poster") {
    return (
      <span
        aria-hidden="true"
        className={className}
        style={{
          display: "block",
          width: finalWidth,
          aspectRatio: "2 / 3",
          borderRadius: defaults.borderRadius,
          background: "var(--surface-raised)",
          animation: `neqSkeletonPulse ${SKELETON_PULSE_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1) infinite`,
          ...style,
        }}
      >
        <style>{SKELETON_KEYFRAMES}</style>
      </span>
    );
  }

  if (variant === "card") {
    return (
      <span
        aria-hidden="true"
        className={className}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          width: finalWidth,
          ...style,
        }}
      >
        <style>{SKELETON_KEYFRAMES}</style>
        <span
          style={{
            display: "block",
            width: "100%",
            aspectRatio: "2 / 3",
            borderRadius: defaults.borderRadius,
            background: "var(--surface-raised)",
            animation: `neqSkeletonPulse ${SKELETON_PULSE_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1) infinite`,
          }}
        />
        <span
          style={{
            display: "block",
            width: "70%",
            height: 18,
            borderRadius: "var(--radius-sm, 4px)",
            background: "var(--surface-raised)",
            animation: `neqSkeletonPulse ${SKELETON_PULSE_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1) infinite`,
            animationDelay: "80ms",
          }}
        />
        <span
          style={{
            display: "block",
            width: "50%",
            height: 12,
            borderRadius: "var(--radius-sm, 4px)",
            background: "var(--surface-raised)",
            animation: `neqSkeletonPulse ${SKELETON_PULSE_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1) infinite`,
            animationDelay: "160ms",
          }}
        />
      </span>
    );
  }

  // text — 단일 줄
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: "block",
        width: finalWidth,
        height: finalHeight,
        borderRadius: defaults.borderRadius,
        background: "var(--surface-raised)",
        animation: `neqSkeletonPulse ${SKELETON_PULSE_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1) infinite`,
        ...style,
      }}
    >
      <style>{SKELETON_KEYFRAMES}</style>
    </span>
  );
}

// ─────────────────────────────────────────────────────
// Keyframes
// ─────────────────────────────────────────────────────

const SKELETON_KEYFRAMES = `
@keyframes neqSkeletonPulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes neqSkeletonPulse {
    0%, 100% { opacity: 0.45; }
    50% { opacity: 0.45; }
  }
}
`;
