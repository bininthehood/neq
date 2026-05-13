import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, spacing, durations, easings, fonts } from '../../lib/tokens';
import { WORDMARK_ASSET, WORDMARK_ASPECT_RATIO } from './data';

/**
 * Onboarding V2 (D4a, native) 공통 헤더.
 *
 * 구성:
 *  - 뒤로가기 버튼 (1단계 제외)
 *  - "neq," 로고 (Quiet Ink amber, fonts.display)
 *  - 진행률 라벨 (1/5 ~ 5/5, fonts.data)
 *  - 5세그먼트 progress bar — Reanimated 로 부드러운 전환
 *
 * 모든 시각 토큰 = `colors.*` / `spacing.*`. 직접 hex/px 사용 X.
 */

interface StepHeaderProps {
  current: number; // 0..4
  total: number;
  onBack?: () => void;
}

const easingMove = Easing.bezier(...easings.move);

export default function StepHeader({ current, total, onBack }: StepHeaderProps) {
  const showBack = current > 0 && !!onBack;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {showBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            accessibilityLabel="이전 단계"
            style={styles.backBtn}
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
        ) : (
          <View style={styles.backPlaceholder} />
        )}

        <Image
          source={WORDMARK_ASSET}
          accessibilityLabel="neq,"
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.counter}>
          {current + 1} / {total}
        </Text>
      </View>

      <View style={styles.progressRow}>
        {Array.from({ length: total }, (_, i) => (
          <ProgressSegment key={i} index={i} current={current} />
        ))}
      </View>
    </View>
  );
}

function ProgressSegment({ index, current }: { index: number; current: number }) {
  const targetActive = index <= current ? 1 : 0;
  const opacityTarget = index < current ? 0.7 : 1;

  const activeProgress = useDerivedValue(() =>
    withTiming(targetActive, {
      duration: durations.quick,
      easing: easingMove,
    }),
  );

  const opacityProgress = useDerivedValue(() =>
    withTiming(opacityTarget, {
      duration: durations.quick,
      easing: easingMove,
    }),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor:
      activeProgress.value > 0.5 ? colors.accent : colors.border,
    opacity: opacityProgress.value,
  }));

  return <Animated.View style={[styles.segment, animatedStyle]} />;
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm + 4,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPlaceholder: { width: 32, height: 32 },
  backIcon: {
    color: colors.textSecondary,
    fontSize: 18,
    lineHeight: 18,
  },
  // web 정본 StepHeader `<img className="h-5">` (20px) 매핑.
  logo: {
    height: 20,
    width: 20 * WORDMARK_ASPECT_RATIO,
  },
  counter: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.dataReg,
    letterSpacing: 0.5,
    minWidth: 32,
    textAlign: 'right',
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.md,
  },
  segment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
});
