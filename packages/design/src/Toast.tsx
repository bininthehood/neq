"use client";

/**
 * Toast — Quiet Ink 글로벌 알림.
 *
 * 사용 패턴:
 *   <ToastProvider>{children}</ToastProvider>  // app root에 1회 mount
 *   const toast = useToast();
 *   toast.success("저장됐어요")
 *   toast.error("문제가 생겼어요")
 *   toast.info("알림")
 *
 * 모션 (motion-demos.jsx #3):
 *   - enter: 250ms `--ease-enter` (translateY(-8 → 0) + opacity 0 → 1)
 *   - hold:  2500ms 기본 (per-call override)
 *   - exit:  150ms `--ease-exit`
 *
 * Queue: FIFO, 최대 3개 동시. 4번째 이상은 가장 오래된 것이 먼저 사라진 후 표시.
 *
 * Reduced motion: opacity transition만 유지 (translate 제거).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "info";

export interface ToastOptions {
  /** ms 단위 체류 시간 (default 2500) */
  duration?: number;
}

export interface ToastEntry {
  id: number;
  message: string;
  variant: ToastVariant;
  duration: number;
  /** 등장 직후 true. exit 시 false → CSS opacity transition 트리거. */
  visible: boolean;
}

export interface ToastApi {
  success: (message: string, options?: ToastOptions) => number;
  error: (message: string, options?: ToastOptions) => number;
  info: (message: string, options?: ToastOptions) => number;
  /** 내부 — 특정 toast 강제 dismiss */
  dismiss: (id: number) => void;
}

// ─────────────────────────────────────────────────────
// Pure logic — 외부 의존 0, 단위 테스트 대상
// ─────────────────────────────────────────────────────

export const TOAST_DEFAULT_DURATION = 2500;
export const TOAST_ENTER_DURATION = 250;
export const TOAST_EXIT_DURATION = 150;
export const TOAST_MAX_VISIBLE = 3;

/**
 * Queue에 신규 toast push. 최대 길이 초과 시 가장 오래된 visible 항목을 hide 표시 (id 반환).
 *
 * @returns 신규 entry + (있다면) hide 대상 id 리스트
 */
export function pushToastEntry(
  queue: ToastEntry[],
  next: Omit<ToastEntry, "visible"> & { visible?: boolean },
  maxVisible: number = TOAST_MAX_VISIBLE,
): { queue: ToastEntry[]; hideIds: number[] } {
  const newEntry: ToastEntry = { ...next, visible: next.visible ?? true };
  const merged = [...queue, newEntry];
  const visibleEntries = merged.filter((t) => t.visible);
  const hideIds: number[] = [];
  if (visibleEntries.length > maxVisible) {
    // FIFO: 가장 오래된 visible 항목부터 hide
    const toHideCount = visibleEntries.length - maxVisible;
    for (let i = 0; i < toHideCount; i++) {
      hideIds.push(visibleEntries[i].id);
    }
  }
  const updated = merged.map((t) =>
    hideIds.includes(t.id) ? { ...t, visible: false } : t,
  );
  return { queue: updated, hideIds };
}

/** Variant → 토큰 매핑 (visual 결정). 단위 테스트 검증 가능. */
export function toastVariantStyles(variant: ToastVariant): {
  background: string;
  color: string;
  border: string;
  accent: string;
} {
  switch (variant) {
    case "success":
      return {
        background: "var(--surface-raised)",
        color: "var(--text-primary)",
        border: "1px solid var(--border-strong, #3A3833)",
        accent: "var(--success)",
      };
    case "error":
      return {
        background: "var(--surface-raised)",
        color: "var(--text-primary)",
        border: "1px solid var(--danger)",
        accent: "var(--danger)",
      };
    case "info":
    default:
      return {
        background: "var(--surface-raised)",
        color: "var(--text-primary)",
        border: "1px solid var(--border-strong, #3A3833)",
        accent: "var(--info)",
      };
  }
}

// ─────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // SSR-safe + 누락 시 silent no-op으로 강건 (토스트는 보조 UI).
    return {
      success: () => -1,
      error: () => -1,
      info: () => -1,
      dismiss: () => {},
    };
  }
  return ctx;
}

// ─────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────

export interface ToastProviderProps {
  children: ReactNode;
  /** 동시 표시 최대 개수 (기본 3) */
  maxVisible?: number;
}

export function ToastProvider({
  children,
  maxVisible = TOAST_MAX_VISIBLE,
}: ToastProviderProps) {
  const [queue, setQueue] = useState<ToastEntry[]>([]);
  const idCounterRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const removeEntry = useCallback((id: number) => {
    setQueue((q) => q.filter((t) => t.id !== id));
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      setQueue((q) => q.map((t) => (t.id === id ? { ...t, visible: false } : t)));
      const existing = timersRef.current.get(id);
      if (existing) clearTimeout(existing);
      const exitTimer = setTimeout(() => removeEntry(id), TOAST_EXIT_DURATION);
      timersRef.current.set(id, exitTimer);
    },
    [removeEntry],
  );

  const push = useCallback(
    (variant: ToastVariant, message: string, options?: ToastOptions): number => {
      const id = ++idCounterRef.current;
      const duration = options?.duration ?? TOAST_DEFAULT_DURATION;
      setQueue((q) => {
        const { queue: updated, hideIds } = pushToastEntry(
          q,
          { id, message, variant, duration },
          maxVisible,
        );
        // hideIds → exit timer 트리거
        hideIds.forEach((hideId) => {
          const existing = timersRef.current.get(hideId);
          if (existing) clearTimeout(existing);
          const exitTimer = setTimeout(
            () => removeEntry(hideId),
            TOAST_EXIT_DURATION,
          );
          timersRef.current.set(hideId, exitTimer);
        });
        return updated;
      });
      // hold → exit 스케줄
      const holdTimer = setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, holdTimer);
      return id;
    },
    [dismiss, maxVisible, removeEntry],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, options) => push("success", message, options),
      error: (message, options) => push("error", message, options),
      info: (message, options) => push("info", message, options),
      dismiss,
    }),
    [push, dismiss],
  );

  // unmount 시 타이머 정리
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport queue={queue} />
    </ToastContext.Provider>
  );
}

// ─────────────────────────────────────────────────────
// Viewport — 실제 DOM 렌더
// ─────────────────────────────────────────────────────

function ToastViewport({ queue }: { queue: ToastEntry[] }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: "fixed",
        top: 16,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        pointerEvents: "none",
        zIndex: 1000,
      }}
    >
      {/* Reduced motion 분기 — translate 제거, opacity transition만 유지 */}
      <style>{TOAST_REDUCED_MOTION_CSS}</style>
      {queue.map((t) => (
        <ToastItem key={t.id} entry={t} />
      ))}
    </div>
  );
}

const TOAST_REDUCED_MOTION_CSS = `
@media (prefers-reduced-motion: reduce) {
  [data-neko-toast] {
    transform: none !important;
    transition: opacity 0.01ms !important;
  }
}
`;

function ToastItem({ entry }: { entry: ToastEntry }) {
  const styles = toastVariantStyles(entry.variant);
  const enterTransition = `opacity ${TOAST_ENTER_DURATION}ms var(--ease-enter), transform ${TOAST_ENTER_DURATION}ms var(--ease-enter)`;
  const exitTransition = `opacity ${TOAST_EXIT_DURATION}ms var(--ease-exit), transform ${TOAST_EXIT_DURATION}ms var(--ease-exit)`;

  return (
    <div
      role={entry.variant === "error" ? "alert" : "status"}
      data-neko-toast
      style={{
        opacity: entry.visible ? 1 : 0,
        transform: entry.visible ? "translateY(0)" : "translateY(-8px)",
        transition: entry.visible ? enterTransition : exitTransition,
        background: styles.background,
        color: styles.color,
        border: styles.border,
        borderLeft: `2px solid ${styles.accent}`,
        padding: "10px 14px",
        borderRadius: "var(--radius-md, 8px)",
        fontFamily: "var(--font-body)",
        fontSize: "var(--text-sm, 0.8125rem)",
        lineHeight: 1.45,
        maxWidth: "min(440px, 90vw)",
        boxShadow: "var(--shadow-toast, 0 2px 12px rgba(0,0,0,0.4))",
        pointerEvents: "auto",
      }}
    >
      {entry.message}
    </div>
  );
}
