import { forwardRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { JellyPressable } from './JellyPressable';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, radius, spacing, easings, durations, shadowsNative, useThemeColors } from '../lib/tokens';
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
  // Animated.View 색은 hex 만 (lib/tokens.ts Reanimated 규칙) — StyleSheet 대신 inline.
  const t = useThemeColors();

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.left}>
        <JellyPressable
          style={styles.iconBtn}
          containerStyle={!canRewind && styles.iconDisabled}
          onPress={onRewind}
          disabled={!canRewind}
          accessibilityLabel="처음으로"
          hitSlop={4}
        >
          <IconRewind size={18} color={colors.textPrimary} />
        </JellyPressable>
        <JellyPressable style={styles.iconBtn} onPress={onShare} accessibilityLabel="공유" hitSlop={4}>
          <IconShare size={18} color={colors.textPrimary} />
        </JellyPressable>
        <JellyPressable style={styles.iconBtn} onPress={onOpenDetail} accessibilityLabel="상세보기" hitSlop={4}>
          <IconDetail size={18} color={colors.textPrimary} />
        </JellyPressable>
        <JellyPressable style={styles.iconBtn} onPress={onRefresh} accessibilityLabel="새 추천" hitSlop={4}>
          <IconRefresh size={18} color={colors.textPrimary} />
        </JellyPressable>
      </View>

      <JellyPressable
        size="large"
        onPress={onToggleSave}
        accessibilityLabel={isSaved ? '저장 해제' : '저장'}
        style={styles.saveHit}
      >
        <Animated.View
          ref={saveBtnRef}
          style={[
            styles.saveBtn,
            saveActive
              ? { backgroundColor: t.lime, borderColor: t.lime }
              : { backgroundColor: t.surfaceRaised, borderColor: t.border },
            saveFlash && [styles.saveBtnFlash, { shadowColor: t.lime }],
            saveBtnAnimStyle,
          ]}
        >
          {/* idle: raised 면 위 textPrimary / active: 라임 채움 위 textInverse */}
          <IconSave size={24} color={saveActive ? colors.textInverse : colors.textPrimary} filled={saveActive} />
        </Animated.View>
      </JellyPressable>
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
    gap: spacing.sm,
  },
  // 원형 버튼 (radius full). 카드 위에 뜨므로 불투명 raised + 1px border — 4단계 유리 전 대체 모양.
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconDisabled: {
    opacity: 0.4,
  },
  saveHit: {
    width: 56,
    height: 56,
  },
  // 저장 버튼 radius 16 (DESIGN.md Shape 위계). 색은 inline (Animated.View 정적 style 에 동적 색 금지).
  saveBtn: {
    width: 56,
    height: 56,
    borderRadius: radius.save,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowsNative.md,
  },
  saveBtnFlash: {
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
});
