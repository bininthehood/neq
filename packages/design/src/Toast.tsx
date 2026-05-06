"use client";

/**
 * Toast — Quiet Ink 글로벌 알림.
 *
 * Phase B (핸드오프 v2 D8):
 *   - 6종 시맨틱 variant 추가: save, pass, remove, watched, sync-warn, error
 *   - secondary text + action 버튼 + glyph 지원
 *   - per-type auto-dismiss: save/pass/remove/watched=2400ms, sync-warn=3200ms, error=4000ms
 *   - 기존 success/error/info API 는 호환 유지 (호출처 3곳: SearchSheet `toast.error` x3)
 *
 * 사용 패턴 (legacy):
 *   const toast = useToast();
 *   toast.success("저장됐어요")
 *   toast.error("문제가 생겼어요")
 *   toast.info("알림")
 *
 * 사용 패턴 (v2):
 *   toast.show("save", { ctx: { title: "Past Lives" }, onAction: () => undoSave() })
 *   toast.show("sync-warn", { ctx: { pending: 3 } })
 *   toast.show("error", { onAction: () => retry() })
 *
 * 모션 (motion-demos.jsx #3):
 *   - enter: 250ms `--ease-enter` (translateY(20→0) + scale 0.96→1 + opacity 0→1) — bottom 등장
 *   - hold:  type 별 (위 참조)
 *   - exit:  150ms `--ease-exit`
 *
 * Queue: FIFO, 최대 3개 동시. 4번째 이상은 가장 오래된 것이 먼저 사라진 후 표시.
 *
 * Reduced motion: opacity transition만 유지 (translate/scale 제거).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

/** Legacy semantic variants — 호환 유지. */
export type ToastVariant = "success" | "error" | "info";

/**
 * v2 semantic types — 핸드오프 v2 R3 microcopy 잠금.
 * 'error' 는 legacy 와 이름 동일하지만 의미 동일 (저장 실패 등).
 */
export type ToastType =
  | "save"
  | "pass"
  | "remove"
  | "watched"
  | "sync-warn"
  | "error"
  | "success"
  | "info";

export const TOAST_TYPES_V2: readonly ToastType[] = [
  "save",
  "pass",
  "remove",
  "watched",
  "sync-warn",
  "error",
] as const;

export interface ToastContext {
  /** 작품 제목 (save/remove/watched) */
  title?: string;
  /** 대기 변경사항 개수 (sync-warn) */
  pending?: number;
  /** primary text 직접 override (legacy 호환 — message string) */
  message?: string;
}

export interface ToastOptions {
  /** ms 단위 체류 시간. 미지정 시 type 기본값. */
  duration?: number;
  /** 토스트 카드 컨텍스트 — title/pending 등 */
  ctx?: ToastContext;
  /** action 버튼 클릭 콜백 */
  onAction?: () => void;
}

export interface ToastEntry {
  id: number;
  type: ToastType;
  ctx: ToastContext;
  duration: number;
  /** 등장 직후 true. exit 시 false → CSS opacity transition 트리거. */
  visible: boolean;
  /** action 콜백 (cleanup 시 호출 X — 만료는 silent) */
  onAction?: () => void;
}

export interface ToastApi {
  /** v2 — 6종 type. ctx/onAction 지원. id 반환. */
  show: (type: ToastType, options?: ToastOptions) => number;
  /** legacy success — 'save' 류 success 톤으로 매핑되지 않고 별도 success 톤 유지 */
  success: (message: string, options?: ToastOptions) => number;
  error: (message: string, options?: ToastOptions) => number;
  info: (message: string, options?: ToastOptions) => number;
  /** 내부 — 특정 toast 강제 dismiss */
  dismiss: (id: number) => void;
}

// ─────────────────────────────────────────────────────
// Pure logic — 외부 의존 0, 단위 테스트 대상
// ─────────────────────────────────────────────────────

export const TOAST_DEFAULT_DURATION = 2400;
export const TOAST_ENTER_DURATION = 250;
export const TOAST_EXIT_DURATION = 150;
export const TOAST_MAX_VISIBLE = 3;

/**
 * Type 별 hold duration (ms).
 * - error: 4000 — 사용자가 메시지 읽고 retry 결정할 시간
 * - sync-warn: 3200 — 변경사항 대기 안내 (덜 긴급)
 * - 그 외: 2400 — 기본
 */
export function defaultDurationFor(type: ToastType): number {
  if (type === "error") return 4000;
  if (type === "sync-warn") return 3200;
  return TOAST_DEFAULT_DURATION;
}

/**
 * Type → tone ('ok' | 'warn' | 'err') 매핑. 색상/배경 결정.
 */
export function toastTone(type: ToastType): "ok" | "warn" | "err" {
  if (type === "sync-warn") return "warn";
  if (type === "error") return "err";
  return "ok";
}

/**
 * Type 별 microcopy. R3 v2 잠금 카피.
 * legacy success/info 는 message 를 그대로 primary 로 사용.
 */
export interface ToastCopy {
  primary: string;
  secondary: string | null;
  action: string | null;
}

export function toastCopy(type: ToastType, ctx: ToastContext = {}): ToastCopy {
  const title = ctx.title || "";
  switch (type) {
    case "save":
      return { primary: "책장에 담았어요", secondary: title || null, action: "실행 취소" };
    case "pass":
      return { primary: "다음 카드", secondary: "취향 학습에 반영해요", action: "되돌리기" };
    case "remove":
      return { primary: "책장에서 뺐어요", secondary: title || null, action: "실행 취소" };
    case "watched":
      return {
        primary: "봤음 표시",
        secondary: title ? `${title} · 좋았어요?` : "좋았어요?",
        action: "평가",
      };
    case "sync-warn":
      return {
        primary: "연결되면 동기화돼요",
        secondary: ctx.pending ? `변경사항 ${ctx.pending}개 대기` : "변경사항 대기",
        action: null,
      };
    case "error":
      return {
        primary: ctx.message || "저장 못 했어요",
        secondary: ctx.message ? null : "다시 시도하면 보통 돼요",
        action: "다시",
      };
    case "success":
      return { primary: ctx.message || "", secondary: null, action: null };
    case "info":
      return { primary: ctx.message || "", secondary: null, action: null };
    default:
      return { primary: "", secondary: null, action: null };
  }
}

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

/**
 * Variant → 토큰 매핑 (legacy 시각). 단위 테스트 검증 가능.
 * Legacy variant ('success' | 'error' | 'info') 만 처리.
 */
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

/**
 * v2 toast type → 색/배경 토큰. tone 별로 분기.
 */
export function toastV2Styles(type: ToastType): {
  background: string;
  border: string;
  glyphBg: string;
  glyphStroke: string;
  actionColor: string;
} {
  const tone = toastTone(type);
  if (tone === "warn") {
    return {
      background: "var(--warning-dim, rgba(212,162,69,0.14))",
      border: "1px solid color-mix(in srgb, var(--warning) 40%, transparent)",
      glyphBg: "color-mix(in srgb, var(--warning) 14%, transparent)",
      glyphStroke: "var(--warning)",
      actionColor: "var(--warning)",
    };
  }
  if (tone === "err") {
    return {
      background: "var(--danger-dim)",
      border: "1px solid color-mix(in srgb, var(--danger) 50%, transparent)",
      glyphBg: "color-mix(in srgb, var(--danger) 14%, transparent)",
      glyphStroke: "var(--danger)",
      actionColor: "var(--danger)",
    };
  }
  // ok — accent (amber)
  // remove 는 muted glyph (회색)
  const isRemove = type === "remove";
  return {
    background: "var(--surface-raised)",
    border: "1px solid var(--accent-border)",
    glyphBg: isRemove
      ? "var(--text-primary-dim)"
      : "color-mix(in srgb, var(--accent) 14%, transparent)",
    glyphStroke: isRemove ? "var(--text-secondary)" : "var(--accent)",
    actionColor: "var(--accent)",
  };
}

// ─────────────────────────────────────────────────────
// Glyph SVG — type 별 미니멀 모노라인
// ─────────────────────────────────────────────────────

function ToastGlyph({ type, color, size = 18 }: { type: ToastType; color: string; size?: number }) {
  switch (type) {
    case "save":
    case "success":
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M3 4.5L7 9L15 2" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "pass":
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M3 9H14M14 9L10 5M14 9L10 13" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "remove":
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M3 9H15" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "watched":
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="5" fill={color} />
        </svg>
      );
    case "sync-warn":
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path
            d="M3 9C3 5.7 5.7 3 9 3C11.3 3 13.3 4.3 14.3 6.3M15 9C15 12.3 12.3 15 9 15C6.7 15 4.7 13.7 3.7 11.7"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M14 3V6.5H10.5M4 14.5V11H7.5"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "error":
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M9 4V10M9 13V14" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "info":
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="6" stroke={color} strokeWidth="1.5" />
          <path d="M9 8V12M9 6V6.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────

const ToastContextRef = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContextRef);
  if (!ctx) {
    // SSR-safe + 누락 시 silent no-op으로 강건 (토스트는 보조 UI).
    return {
      show: () => -1,
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

  const pushTyped = useCallback(
    (type: ToastType, options?: ToastOptions): number => {
      const id = ++idCounterRef.current;
      const duration = options?.duration ?? defaultDurationFor(type);
      const ctx = options?.ctx ?? {};
      setQueue((q) => {
        const { queue: updated, hideIds } = pushToastEntry(
          q,
          { id, type, ctx, duration, onAction: options?.onAction },
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
      show: (type, options) => pushTyped(type, options),
      success: (message, options) =>
        pushTyped("success", { ...options, ctx: { ...options?.ctx, message } }),
      error: (message, options) =>
        pushTyped("error", { ...options, ctx: { ...options?.ctx, message } }),
      info: (message, options) =>
        pushTyped("info", { ...options, ctx: { ...options?.ctx, message } }),
      dismiss,
    }),
    [pushTyped, dismiss],
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
    <ToastContextRef.Provider value={api}>
      {children}
      <ToastViewport queue={queue} onDismiss={dismiss} />
    </ToastContextRef.Provider>
  );
}

// ─────────────────────────────────────────────────────
// Viewport — 실제 DOM 렌더
// ─────────────────────────────────────────────────────

function ToastViewport({
  queue,
  onDismiss,
}: {
  queue: ToastEntry[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: "fixed",
        // 핸드오프 v2: bottom-center stack (bottom 92px from viewport).
        // ActionBar 위에 떠야 하므로 BottomNav (~64px) + 여유 28px.
        // safe-area-inset-bottom — iOS notch/home indicator 가린 영역 보정.
        left: 0,
        right: 0,
        bottom: "calc(92px + env(safe-area-inset-bottom, 0px))",
        display: "flex",
        flexDirection: "column-reverse",
        alignItems: "center",
        gap: 8,
        pointerEvents: "none",
        zIndex: 1000,
        padding: "0 12px",
      }}
    >
      <style>{TOAST_KEYFRAMES_CSS}</style>
      <style>{TOAST_REDUCED_MOTION_CSS}</style>
      <style>{TOAST_FOCUS_CSS}</style>
      {queue.map((t) => (
        <ToastItem key={t.id} entry={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

const TOAST_KEYFRAMES_CSS = `
@keyframes neko-toast-in {
  0%   { transform: translateY(20px) scale(0.96); opacity: 0; }
  100% { transform: translateY(0) scale(1);       opacity: 1; }
}
`;

const TOAST_REDUCED_MOTION_CSS = `
@media (prefers-reduced-motion: reduce) {
  [data-neko-toast] {
    transform: none !important;
    animation: none !important;
    transition: opacity 0.01ms !important;
  }
}
`;

// focus-visible: 키보드 사용자만 outline 표시 (마우스 클릭 시에는 안 보임).
// inline onFocus/onBlur 보다 깔끔하고 mouse focus 와 keyboard focus 를 구분.
const TOAST_FOCUS_CSS = `
.neko-toast-action { outline: none; }
.neko-toast-action:focus-visible {
  box-shadow: 0 0 0 2px var(--accent);
}
`;

function ToastItem({
  entry,
  onDismiss,
}: {
  entry: ToastEntry;
  onDismiss: (id: number) => void;
}) {
  const copy = toastCopy(entry.type, entry.ctx);
  const v2 = toastV2Styles(entry.type);
  const isLegacy = entry.type === "success" || entry.type === "info";
  const exitTransition = `opacity ${TOAST_EXIT_DURATION}ms var(--ease-exit), transform ${TOAST_EXIT_DURATION}ms var(--ease-exit)`;

  // legacy 톤은 기존 시각 (top-banner 가 아닌 bottom 으로 이동했으므로 모션은 통일).
  // glyphBg 는 의미상 success/info 토큰으로 분리 (이전 accent 14% 일괄 사용 제거).
  const styles = isLegacy
    ? {
        background: "var(--surface-raised)",
        border: "1px solid var(--border-strong, #3A3833)",
        glyphBg:
          entry.type === "success" ? "var(--success-dim)" : "var(--info-dim)",
        glyphStroke:
          entry.type === "success" ? "var(--success)" : "var(--info)",
        actionColor: "var(--accent)",
      }
    : v2;

  // entry — keyframe 으로 진입. exit — visible:false 시 transition.
  const itemStyle: CSSProperties = {
    pointerEvents: "auto",
    width: 320,
    maxWidth: "calc(100vw - 24px)",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    background: styles.background,
    border: styles.border,
    borderRadius: "var(--radius-lg)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.3)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    opacity: entry.visible ? 1 : 0,
    transform: entry.visible ? "none" : "translateY(8px) scale(0.98)",
    transition: entry.visible ? undefined : exitTransition,
    animation: entry.visible
      ? `neko-toast-in ${TOAST_ENTER_DURATION}ms var(--ease-enter)`
      : undefined,
    transformOrigin: "bottom center",
  };

  return (
    <div role={entry.type === "error" ? "alert" : "status"} data-neko-toast style={itemStyle}>
      {/* Glyph */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "var(--radius-full)",
          background: styles.glyphBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <ToastGlyph type={entry.type} color={styles.glyphStroke} />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            color: "var(--text-primary)",
            lineHeight: 1.3,
            letterSpacing: "-0.005em",
          }}
        >
          {copy.primary}
        </div>
        {copy.secondary && (
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "var(--text-xs)",
              color: "var(--text-secondary)",
              lineHeight: 1.35,
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {copy.secondary}
          </div>
        )}
      </div>

      {/* Action */}
      {copy.action && (
        <button
          type="button"
          className="neko-toast-action"
          onClick={() => {
            entry.onAction?.();
            onDismiss(entry.id);
          }}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            // ux-reviewer F1: 터치 타겟 44×44 보장 + 폰트 11px (DESIGN.md 최소).
            padding: "10px 12px",
            minHeight: 44,
            minWidth: 44,
            fontFamily: "var(--font-data)",
            fontSize: "var(--text-xs)",
            color: styles.actionColor,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            fontWeight: 600,
            flexShrink: 0,
            borderRadius: 4,
          }}
        >
          {copy.action}
        </button>
      )}
    </div>
  );
}
