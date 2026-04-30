"use client";

/**
 * Button — Quiet Ink 글로벌 버튼.
 *
 * 패턴 (motion-demos.jsx #7):
 *   - active: transform: scale(0.97) — NOT 0.9. Quiet Ink "미묘한 응답" 원칙.
 *   - 80ms cubic-bezier(0.4, 0, 0.2, 1) (--ease-soft)
 *
 * Variants:
 *   - primary: amber CTA (background: --accent, color: --text-inverse)
 *   - secondary: transparent border (background: --surface, color: --text-primary)
 *   - ghost: text only (background: transparent, color: --accent)
 *
 * Sizes:
 *   - sm: 7px 12px / 12px font / 8px radius
 *   - md: 10px 18px / 13px font / 10px radius
 *   - lg: 13px 24px / 15px font / 12px radius
 *
 * States: disabled, loading (NeqSpinner 통합)
 *
 * Reduced motion: 글로벌 globals.css/tokens.css `prefers-reduced-motion: reduce` rule이
 * `transition-duration: 0.01ms !important`로 active scale을 사실상 즉시 종료.
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { NeqSpinner, type NeqSpinnerSize } from "./NeqSpinner";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children?: ReactNode;
  /** loading=true 시 NeqSpinner 사이즈 override (기본: size에 매핑) */
  spinnerSize?: NeqSpinnerSize;
}

// ─────────────────────────────────────────────────────
// Pure logic — variant/size 매핑. 단위 테스트 대상.
// ─────────────────────────────────────────────────────

export const BUTTON_ACTIVE_DURATION_MS = 80;
export const BUTTON_ACTIVE_SCALE = 0.97;

export interface ButtonSizeStyles {
  padding: string;
  fontSize: string;
  borderRadius: string;
  /** loading 상태일 때 spinner 크기 자동 매핑 */
  spinnerSize: NeqSpinnerSize;
}

export function buttonSizeStyles(size: ButtonSize): ButtonSizeStyles {
  switch (size) {
    case "sm":
      return {
        padding: "7px 12px",
        fontSize: "var(--text-sm, 0.8125rem)",
        borderRadius: "var(--radius-md, 8px)",
        spinnerSize: "sm",
      };
    case "lg":
      return {
        padding: "13px 24px",
        fontSize: "var(--text-base, 0.9375rem)",
        borderRadius: "var(--radius-lg, 12px)",
        spinnerSize: "md",
      };
    case "md":
    default:
      return {
        padding: "10px 18px",
        fontSize: "var(--text-sm, 0.8125rem)",
        borderRadius: "var(--radius-lg, 12px)",
        spinnerSize: "sm",
      };
  }
}

export interface ButtonVariantStyles {
  background: string;
  color: string;
  border: string;
  hoverBackground: string;
}

export function buttonVariantStyles(variant: ButtonVariant): ButtonVariantStyles {
  switch (variant) {
    case "secondary":
      return {
        background: "var(--surface)",
        color: "var(--text-primary)",
        border: "1px solid var(--border-strong, #3A3833)",
        hoverBackground: "var(--surface-raised)",
      };
    case "ghost":
      return {
        background: "transparent",
        color: "var(--accent)",
        border: "1px solid transparent",
        hoverBackground: "var(--accent-dim)",
      };
    case "primary":
    default:
      return {
        background: "var(--accent)",
        color: "var(--text-inverse, #12110E)",
        border: "1px solid var(--accent)",
        hoverBackground: "var(--accent-hover)",
      };
  }
}

// ─────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      children,
      spinnerSize,
      style,
      className,
      type = "button",
      onPointerDown,
      onPointerUp,
      onPointerLeave,
      onPointerCancel,
      ...rest
    },
    ref,
  ) {
    const sizeS = buttonSizeStyles(size);
    const variantS = buttonVariantStyles(variant);
    const isDisabled = disabled || loading;
    const finalSpinnerSize = spinnerSize ?? sizeS.spinnerSize;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={className}
        data-neko-btn
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: sizeS.padding,
          fontSize: sizeS.fontSize,
          fontFamily: "var(--font-body)",
          fontWeight: 500,
          lineHeight: 1.3,
          borderRadius: sizeS.borderRadius,
          background: variantS.background,
          color: variantS.color,
          border: variantS.border,
          cursor: isDisabled ? "not-allowed" : "pointer",
          opacity: isDisabled && !loading ? 0.5 : 1,
          transform: "scale(1)",
          transition: `transform ${BUTTON_ACTIVE_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1)`,
          touchAction: "manipulation",
          ...style,
        }}
        onPointerDown={(e) => {
          if (!isDisabled) {
            e.currentTarget.style.transform = `scale(${BUTTON_ACTIVE_SCALE})`;
          }
          onPointerDown?.(e);
        }}
        onPointerUp={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          onPointerUp?.(e);
        }}
        onPointerLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          onPointerLeave?.(e);
        }}
        onPointerCancel={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          onPointerCancel?.(e);
        }}
        {...rest}
      >
        {loading && (
          <NeqSpinner
            size={finalSpinnerSize}
            color={variant === "primary" ? "var(--text-inverse, #12110E)" : "var(--accent)"}
          />
        )}
        {children}
      </button>
    );
  },
);
