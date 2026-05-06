"use client";

/**
 * NeqSpinner — Quiet Ink 로딩 인디케이터.
 *
 * 패턴 (Loading Interaction, DESIGN.md):
 *   - Fraunces "neq" 글자가 amber로 채워졌다 비워지는 morph
 *   - 1400ms loop, --ease-soft (cubic-bezier(0.4, 0, 0.2, 1))
 *   - stroke만 → fill로 채워짐 → 다시 stroke만
 *
 * Reduced motion: 정적 amber fill (애니메이션 정지).
 */

import type { CSSProperties } from "react";

export type NeqSpinnerSize = "sm" | "md" | "lg";

export interface NeqSpinnerProps {
  /** 16 / 24 / 32 px (default 'md' = 24) */
  size?: NeqSpinnerSize;
  /** fill 색상 (default: var(--accent)) */
  color?: string;
  /** 접근성 라벨 */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

// ─────────────────────────────────────────────────────
// Pure logic — size 매핑. 단위 테스트 대상.
// ─────────────────────────────────────────────────────

export const NEQ_SPINNER_DURATION_MS = 1400;

export interface NeqSpinnerDimensions {
  /** 글자 박스 height px */
  container: number;
}

export function neqSpinnerDimensions(
  size: NeqSpinnerSize = "md",
): NeqSpinnerDimensions {
  switch (size) {
    case "sm":
      return { container: 16 };
    case "lg":
      return { container: 32 };
    case "md":
    default:
      return { container: 24 };
  }
}

// ─────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────

export function NeqSpinner({
  size = "md",
  color,
  label = "로딩 중",
  className,
  style,
}: NeqSpinnerProps) {
  const dims = neqSpinnerDimensions(size);
  const fillColor = color ?? "var(--accent)";

  // Fraunces 글자 morph: stroke만 → fill로 채워짐 → 다시 stroke만, 1400ms 루프.
  // SVG <text>로 출력. fontSize = container, fontWeight 800.
  return (
    <span
      role="status"
      aria-label={label}
      className={className}
      style={{
        display: "inline-block",
        lineHeight: 0,
        ...style,
      }}
    >
      <style>{NEQ_SPINNER_KEYFRAMES}</style>
      <svg
        width={dims.container * 2.4}
        height={dims.container}
        viewBox={`0 0 ${dims.container * 2.4} ${dims.container}`}
        aria-hidden="true"
        style={{ overflow: "visible" }}
      >
        <text
          x="0"
          y={dims.container * 0.82}
          fontFamily="var(--font-fraunces, 'Fraunces', serif)"
          fontWeight={800}
          fontSize={dims.container}
          fill="transparent"
          stroke={fillColor}
          strokeWidth={1.2}
          style={{
            animation: `neqSpinnerMorph ${NEQ_SPINNER_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1) infinite`,
            // CSS variable로 fill 색 전달 (keyframe에서 var() 사용)
            ['--neq-spinner-color' as never]: fillColor,
          }}
        >
          neq
        </text>
      </svg>
    </span>
  );
}

// ─────────────────────────────────────────────────────
// Keyframes
// ─────────────────────────────────────────────────────

const NEQ_SPINNER_KEYFRAMES = `
@keyframes neqSpinnerMorph {
  0%, 100% { fill: transparent; }
  50% { fill: var(--neq-spinner-color); }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes neqSpinnerMorph {
    0%, 100% { fill: var(--neq-spinner-color); opacity: 0.8; }
    50% { fill: var(--neq-spinner-color); opacity: 0.8; }
  }
}
`;
