import { forwardRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, radius, spacing, easings, durations } from '../lib/tokens';
import { IconRewind, IconShare, IconInfo, IconRefresh, IconSave } from './Icons';

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
          <IconInfo size={22} color={colors.textMuted} />
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
            color={saveActive ? colors.accent : colors.textPrimary}
            filled={saveActive}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
});

export default ActionBar;

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
  saveBtn: {
    width: 56,
    height: 56,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.xl,
  },
  saveBtnActive: {
    backgroundColor: colors.accent,
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
