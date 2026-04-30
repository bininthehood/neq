"use client";

/**
 * NeqSpinner — Quiet Ink 로딩 인디케이터.
 *
 * 패턴 (motion-demos.jsx #5):
 *   - 컨테이너: 1400ms linear infinite 회전
 *   - 3 dots, 120deg 간격, 각 dot 150ms phase 차로 opacity pulse (0.4 → 1.0 → 0.4)
 *   - 색상: --color-accent 기본
 *
 * Reduced motion: 회전·pulse 정지. dot 정적 패턴 (균등 opacity).
 */

import type { CSSProperties } from "react";

export type NeqSpinnerSize = "sm" | "md" | "lg";

export interface NeqSpinnerProps {
  /** 16 / 24 / 32 px (default 'md' = 24) */
  size?: NeqSpinnerSize;
  /** dot 색상 (default: var(--accent)) */
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
export const NEQ_SPINNER_PHASE_DELAY_MS = 150;

export interface NeqSpinnerDimensions {
  /** 컨테이너 px */
  container: number;
  /** dot px */
  dot: number;
  /** 회전 반경 px */
  radius: number;
}

export function neqSpinnerDimensions(
  size: NeqSpinnerSize = "md",
): NeqSpinnerDimensions {
  switch (size) {
    case "sm":
      return { container: 16, dot: 3, radius: 5 };
    case "lg":
      return { container: 32, dot: 6, radius: 11 };
    case "md":
    default:
      return { container: 24, dot: 4, radius: 8 };
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
  const dotColor = color ?? "var(--accent)";

  const containerStyle: CSSProperties = {
    width: dims.container,
    height: dims.container,
    position: "relative",
    display: "inline-block",
    animation: `neqSpinnerRotate ${NEQ_SPINNER_DURATION_MS}ms linear infinite`,
    ...style,
  };

  return (
    <span
      role="status"
      aria-label={label}
      className={className}
      style={containerStyle}
    >
      {/* keyframes는 inline <style>로 주입 (packages/design는 globals.css에 의존 X) */}
      <style>{NEQ_SPINNER_KEYFRAMES}</style>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: dims.dot,
            height: dims.dot,
            borderRadius: "50%",
            background: dotColor,
            marginTop: -dims.dot / 2,
            marginLeft: -dims.dot / 2,
            transform: `rotate(${i * 120}deg) translateY(-${dims.radius}px)`,
            transformOrigin: "center",
            animation: `neqSpinnerPulse ${NEQ_SPINNER_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1) infinite`,
            animationDelay: `${i * NEQ_SPINNER_PHASE_DELAY_MS}ms`,
          }}
        />
      ))}
    </span>
  );
}

// ─────────────────────────────────────────────────────
// Keyframes
// ─────────────────────────────────────────────────────

/**
 * Reduced motion 분기 포함:
 *   - prefers-reduced-motion: reduce 환경에서 회전/pulse animation은 globals.css의
 *     `* { animation-duration: 0.01ms !important; }` rule 로 즉시 정지.
 *   - 추가로 명시적 분기 — opacity 정적 (0.7 균일) 으로 LP 표현 유지.
 */
const NEQ_SPINNER_KEYFRAMES = `
@keyframes neqSpinnerRotate {
  to { transform: rotate(360deg); }
}
@keyframes neqSpinnerPulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes neqSpinnerPulse {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 0.7; }
  }
}
`;
