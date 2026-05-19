import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, radius, spacing, durations, easings, fontsV2 } from '../lib/tokens';

/**
 * ToastContext — native 글로벌 토스트/스낵바.
 *
 * web `@neq/design` ToastProvider/useToast 의 **API 만 참고**한 RN 신규 구현.
 * web 은 DOM(`position:fixed` + CSS keyframe) 이라 그대로 못 옮겨, RN reanimated 로
 * 새로 만들었다. 호출 시그니처(`show(type, { ctx, onAction, duration })`) 는
 * web 과 정합 — 향후 추가 type 이관 시 호출처 변경 최소화.
 *
 * 설계 결정:
 *   - **동시 1개 모델.** web 은 FIFO queue(최대 3) 지만 native 의 현 의존 항목
 *     (undo toast / 첫 카드 힌트) 은 단발성이고, DESIGN.md L260 "동시 2개 금지" 와도
 *     정합. 새 toast 가 뜨면 기존 것을 즉시 교체한다.
 *   - **애니메이션은 1회성 withTiming + cleanup.** feedback_reanimated_fabric_crash
 *     (무한 worklet × Fabric → cloneShadowTree 무한재귀 SIGABRT) 회피. 무한 loop /
 *     repeat / sequence 미사용. 모든 타이머는 unmount/교체 시 clear.
 *   - DESIGN.md Toast 토큰 준수: bottom 위치, surface-raised 배경, radius-lg,
 *     인디케이터 dot(성공=accent / 에러=danger / info=accent), 페이드+슬라이드.
 *
 * 사용:
 *   const toast = useToast();
 *   toast.show('remove', { ctx: { title }, onAction: () => restore() });
 *   toast.show('info', { ctx: { message: '첫 번째 작품이에요' } });
 *   toast.dismiss();   // 강제 제거
 */

// ─────────────────────────────────────────────────────
// Types — web @neq/design Toast 시그니처 정합 (RN 구현)
// ─────────────────────────────────────────────────────

/** native 가 현재 사용하는 toast type. web 6종 중 의존 항목만. */
export type ToastType = 'remove' | 'save' | 'info' | 'error';

export interface ToastContextData {
  /** 작품 제목 (save/remove) */
  title?: string;
  /** primary 텍스트 직접 지정 (info/error) */
  message?: string;
}

export interface ToastOptions {
  /** 체류 시간 ms. 미지정 시 type 기본값. */
  duration?: number;
  /** 토스트 컨텍스트 — title/message */
  ctx?: ToastContextData;
  /** 액션 버튼 콜백 (undo 등). 지정 시 액션 버튼 노출. */
  onAction?: () => void;
}

export interface ToastApi {
  /** 토스트 표시. 기존 토스트가 있으면 즉시 교체. */
  show: (type: ToastType, options?: ToastOptions) => void;
  /** 현재 토스트 강제 제거. */
  dismiss: () => void;
}

interface ToastEntry {
  id: number;
  type: ToastType;
  ctx: ToastContextData;
  duration: number;
  onAction?: () => void;
}

// ─────────────────────────────────────────────────────
// Pure logic — type 별 카피/색
// ─────────────────────────────────────────────────────

const TOAST_DEFAULT_DURATION = 2500; // DESIGN.md L258 체류 2500ms
const TOAST_ENTER_DURATION = durations.moderate; // 250
const TOAST_EXIT_DURATION = durations.quick; // 150 — 닫힘은 열림보다 짧게

/** type 별 hold duration (ms). error 는 길게(읽고 retry 결정). */
function defaultDurationFor(type: ToastType): number {
  if (type === 'error') return 4000;
  return TOAST_DEFAULT_DURATION;
}

interface ToastCopy {
  primary: string;
  secondary: string | null;
  /** 액션 라벨. onAction 이 있을 때만 노출. */
  action: string;
}

/** type + ctx → 카피. web toastCopy 정합 (R3 마이크로카피). */
export function toastCopy(type: ToastType, ctx: ToastContextData = {}): ToastCopy {
  const title = ctx.title || '';
  switch (type) {
    case 'remove':
      return { primary: '책장에서 뺐어요', secondary: title || null, action: '실행 취소' };
    case 'save':
      return { primary: '책장에 담았어요', secondary: title || null, action: '실행 취소' };
    case 'error':
      return {
        primary: ctx.message || '문제가 생겼어요',
        secondary: ctx.message ? null : '다시 시도하면 보통 돼요',
        action: '다시',
      };
    case 'info':
    default:
      return { primary: ctx.message || '', secondary: null, action: '확인' };
  }
}

/** type → 인디케이터 dot 색. DESIGN.md L256: 성공=accent / 에러=danger. */
function toastDotColor(type: ToastType): string {
  return type === 'error' ? colors.danger : colors.accent;
}

// ─────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────

const ToastContextRef = createContext<ToastApi | null>(null);

/** toast API 훅. Provider 밖에서도 silent no-op 으로 안전 (보조 UI). */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContextRef);
  if (!ctx) {
    return { show: () => {}, dismiss: () => {} };
  }
  return ctx;
}

// ─────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<ToastEntry | null>(null);
  const idCounterRef = useRef(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  // 실제 entry 제거 — exit 애니메이션 완료 후 호출.
  const removeEntry = useCallback(() => {
    setEntry(null);
  }, []);

  // exit 애니메이션은 ToastCard 가 entry===null 전이를 감지해 처리하지 않고,
  // dismiss 시 명시적으로 트리거한다. dismiss → exit anim → removeEntry 순서.
  const dismissRef = useRef<(() => void) | null>(null);

  const dismiss = useCallback(() => {
    clearHoldTimer();
    dismissRef.current?.();
  }, [clearHoldTimer]);

  const show = useCallback(
    (type: ToastType, options?: ToastOptions) => {
      clearHoldTimer();
      const id = ++idCounterRef.current;
      const duration = options?.duration ?? defaultDurationFor(type);
      // 새 entry 로 교체 — key 가 바뀌면서 ToastCard 가 재마운트, enter 애니메이션 재생.
      setEntry({
        id,
        type,
        ctx: options?.ctx ?? {},
        duration,
        onAction: options?.onAction,
      });
      // hold 후 자동 dismiss.
      holdTimerRef.current = setTimeout(() => {
        dismissRef.current?.();
      }, duration);
    },
    [clearHoldTimer],
  );

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  // unmount 시 타이머 정리.
  useEffect(() => clearHoldTimer, [clearHoldTimer]);

  return (
    <ToastContextRef.Provider value={api}>
      {children}
      {entry && (
        <ToastCard
          key={entry.id}
          entry={entry}
          dismissRef={dismissRef}
          onRemoved={removeEntry}
          onActionPress={() => {
            clearHoldTimer();
            entry.onAction?.();
          }}
        />
      )}
    </ToastContextRef.Provider>
  );
}

// ─────────────────────────────────────────────────────
// ToastCard — 실제 렌더 + 1회성 enter/exit 애니메이션
// ─────────────────────────────────────────────────────

function ToastCard({
  entry,
  dismissRef,
  onRemoved,
  onActionPress,
}: {
  entry: ToastEntry;
  dismissRef: React.MutableRefObject<(() => void) | null>;
  onRemoved: () => void;
  onActionPress: () => void;
}) {
  const insets = useSafeAreaInsets();
  const copy = toastCopy(entry.type, entry.ctx);
  const dotColor = toastDotColor(entry.type);

  // progress: 0 = 숨김(아래), 1 = 표시.
  const progress = useSharedValue(0);

  // enter — 마운트 시 1회 withTiming. 무한 loop 없음.
  useEffect(() => {
    progress.value = withTiming(1, {
      duration: TOAST_ENTER_DURATION,
      easing: Easing.bezier(...easings.enter),
    });
    // cleanup — unmount 시 worklet 정리. (withTiming 은 1회성이라 추가 cancel 불필요하나
    // 명시적으로 값 고정해 잔여 worklet 차단.)
    return () => {
      progress.value = 0;
    };
    // entry 마운트 시 1회 — entry.id 가 바뀌면 key 변경으로 재마운트되므로 deps 비움.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // exit — Provider 가 dismissRef 로 트리거. 1회성 withTiming, 완료 콜백에서 removeEntry.
  useEffect(() => {
    dismissRef.current = () => {
      progress.value = withTiming(
        0,
        {
          duration: TOAST_EXIT_DURATION,
          easing: Easing.bezier(...easings.exit),
        },
        (finished) => {
          if (finished) runOnJS(onRemoved)();
        },
      );
    };
    return () => {
      dismissRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      // 등장: translateY(20→0) — DESIGN.md Toast 모션 정합.
      { translateY: (1 - progress.value) * 20 },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.viewport,
        // ActionBar(~64px) + BottomNav 위에 떠야 함. safe-area 보정.
        { bottom: 92 + insets.bottom },
      ]}
    >
      <Animated.View
        // role=status — RN 접근성. 에러는 alert 톤.
        accessibilityLiveRegion="polite"
        accessibilityRole={entry.type === 'error' ? 'alert' : 'text'}
        style={[styles.card, animStyle]}
      >
        {/* 인디케이터 dot — DESIGN.md L256 (6×6). info/save/remove=accent, error=danger. */}
        {entry.type === 'error' ? (
          <Svg width={16} height={16} viewBox="0 0 16 16" style={styles.glyph}>
            <Path
              d="M8 3.5V8.5M8 11V11.5"
              stroke={dotColor}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          </Svg>
        ) : entry.type === 'info' ? (
          <Svg width={16} height={16} viewBox="0 0 16 16" style={styles.glyph}>
            <Circle cx={8} cy={8} r={5.2} stroke={dotColor} strokeWidth={1.5} />
            <Path
              d="M8 7V10.5M8 5V5.4"
              stroke={dotColor}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          </Svg>
        ) : (
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
        )}

        {/* 텍스트 */}
        <View style={styles.textCol}>
          <Text style={styles.primary} numberOfLines={1}>
            {copy.primary}
          </Text>
          {copy.secondary && (
            <Text style={styles.secondary} numberOfLines={1}>
              {copy.secondary}
            </Text>
          )}
        </View>

        {/* 액션 버튼 — onAction 이 있을 때만. 터치 타겟 44 보장. */}
        {entry.onAction && (
          <Pressable
            onPress={onActionPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={copy.action}
            style={({ pressed }) => [
              styles.action,
              pressed && styles.actionPressed,
            ]}
          >
            <Text style={styles.actionText}>{copy.action}</Text>
          </Pressable>
        )}
      </Animated.View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────
// Styles — DESIGN.md Toast 토큰
// ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  viewport: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 12,
    // 토스트는 모든 화면 콘텐츠 위.
    zIndex: 1000,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md, // 12 → md(16) 가 web 의 gap 12 와 근접. DESIGN.md 4px 배수 준수.
    maxWidth: 360,
    width: '100%',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    // DESIGN.md shadow-toast 톤 — 짙은 그림자.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  glyph: {
    flexShrink: 0,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
    // dot 은 6×6 라 glyph(16) 와 시각 정렬 — 좌우 5px 패딩으로 폭 보정.
    marginHorizontal: 5,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  primary: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    letterSpacing: -0.1,
  },
  secondary: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  action: {
    flexShrink: 0,
    // 터치 타겟 44 보장.
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  actionPressed: {
    opacity: 0.6,
  },
  actionText: {
    // Geist Mono medium (web font-data 정합) — _layout.tsx useFonts 로 로드.
    // 미로드 시 RN 이 system 으로 graceful fallback.
    fontFamily: fontsV2.dataMedium,
    fontSize: 11,
    fontWeight: '600',
    color: colors.accent,
    letterSpacing: 1.6, // uppercase 톤 — Geist Mono eyebrow (web 0.15em ≈ 1.6px@11)
  },
});
