import { forwardRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, radius, spacing, easings, durations, shadowsNative } from '../lib/tokens';
import { IconRewind, IconShare, IconDetail, IconRefresh, IconSave } from './Icons';

interface Props {
  isSaved: boolean;
  canRewind?: boolean;
  onRewind?: () => void;
  onShare: () => void;
  onOpenDetail: () => void;
  onRefresh: () => void;
  onToggleSave: () => void;
  /** Stage 4 D1: save 직후 번쩍 강조 (600ms 자동 해제 호출자 책임) */
  saveFlash?: boolean;
  /** 사용자가 카드를 아래로 끌고 있는 중 — save 버튼 살짝 부풀음 */
  savePulling?: boolean;
}

const SPRING_BEZIER = Easing.bezier(...easings.spring);

const ActionBar = forwardRef<View, Props>(function ActionBar(
  {
    isSaved,
    canRewind = false,
    onRewind,
    onShare,
    onOpenDetail,
    onRefresh,
    onToggleSave,
    saveFlash = false,
    savePulling = false,
  },
  saveBtnRef,
) {
  const scale = useSharedValue(1);

  useEffect(() => {
    const target = saveFlash ? 1.15 : savePulling ? 1.05 : 1;
    scale.value = withTiming(target, {
      duration: durations.quick,
      easing: SPRING_BEZIER,
    });
  }, [saveFlash, savePulling, scale]);

  const saveBtnAnimStyle = useAnimatedStyle(() => {
    'worklet';
    // 2026-05-18 — Fabric NaN/Infinity guard.
    const s = scale.value;
    return { transform: [{ scale: Number.isFinite(s) ? s : 1 }] };
  });

  const saveActive = isSaved || saveFlash || savePulling;

  return (
    <View style={styles.wrap}>
      <View style={styles.left}>
        <Pressable
          style={({ pressed }) => [
            styles.iconBtn,
            !canRewind && styles.iconDisabled,
            pressed && styles.pressed,
          ]}
          onPress={onRewind}
          disabled={!canRewind}
          accessibilityLabel="처음으로"
          hitSlop={4}
        >
          <IconRewind size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          onPress={onShare}
          accessibilityLabel="공유"
          hitSlop={4}
        >
          <IconShare size={20} color={colors.textMuted} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          onPress={onOpenDetail}
          accessibilityLabel="상세보기"
          hitSlop={4}
        >
          <IconDetail size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          onPress={onRefresh}
          accessibilityLabel="새 추천"
          hitSlop={4}
        >
          <IconRefresh size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      <Animated.View
        ref={saveBtnRef}
        style={[
          styles.saveBtn,
          saveActive && styles.saveBtnActive,
          saveFlash && styles.saveBtnFlash,
          saveBtnAnimStyle,
        ]}
      >
        <Pressable
          onPress={onToggleSave}
          accessibilityLabel={isSaved ? '저장 해제' : '저장'}
          style={styles.saveBtnInner}
        >
          <IconSave
            size={24}
            // 신규-1 (2026-05-19 재검증) — Save 아이콘은 항상 어두운 bg 색.
            // B-5b 로 saveBtnActive 배경이 amber 가 된 뒤 amber 아이콘이면 amber-on-amber
            // 대비 소실. web ActionBar 정본도 항상 `var(--bg)` 고정.
            // idle: surfaceRaised 배경 위 bg 색 = 충분한 대비. active: amber 배경 위 bg 색 = 또렷.
            color={colors.bg}
            filled={saveActive}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
});

export default ActionBar;

// 2026-05-19 native↔PWA 정합 (항목 1) — ActionBar 높이를 PWA 정본에 맞춤.
// web ActionBar 정본: `px-4 pb-2` — 상단 패딩 0, 하단 8px. saveBtn 56(w-14 h-14).
// → 실제 높이 = 56(saveBtn) + 8(pb) = 64.
// 기존 native 는 `paddingVertical: spacing.sm` 으로 상하 8씩 → 72px (PWA 대비 +8).
// 상단 패딩을 제거해 64 로 정합 → Discover deck 세로 공간 +8 회복.
// ACTION_BAR_HEIGHT 는 index.tsx 의 placeholder 와 공유 (조건부 렌더 jank 방지, 증상 B).
export const ACTION_BAR_HEIGHT = 64;

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: 0,
    paddingBottom: spacing.sm,
  },
  left: {
    flexDirection: 'row',
    gap: spacing.sm + 4,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDisabled: {
    opacity: 0.3,
  },
  iconText: {
    color: colors.textMuted,
    fontSize: 17,
  },
  // 2026-05-06 A1 — Save 버튼 1.5px 잉크 윤곽 (idle border / active accent).
  // web ActionBar 정합 — Quiet Ink 잉크 윤곽 정체성.
  // T-2 — idle boxShadow var(--shadow-md). web ActionBar 가 항상 적용하는 깊이감.
  saveBtn: {
    width: 56,
    height: 56,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadowsNative.md,
  },
  saveBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  saveBtnFlash: {
    shadowColor: colors.accent,
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  saveBtnInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveIcon: {
    color: colors.textMuted,
    fontSize: 22,
  },
  saveIconActive: {
    color: colors.bg,
  },
  pressed: {
    opacity: 0.7,
  },
});
