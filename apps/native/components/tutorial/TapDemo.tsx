import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import type { Recommendation } from '../../lib/types';
import MockCard from './MockCard';
import { easings, fonts } from '@neq/design';
import { colors, spacing } from '../../lib/tokens';

/**
 * TutorialFlow v3 — 4단계: 탭 (Detail 진입).
 *
 * web 정본: `apps/web/src/components/discover/tutorial/TapDemo.tsx`.
 *
 * 모션 매핑:
 *   `@keyframes tut-demo-tap` — 900ms detailMorph
 *     0% scale 1 → 40% scale 0.96 → 70% scale 1.02 → 100% scale 1
 *
 *   ring (`tut-tap-ring`) — 1100ms infinite
 *     0% opacity 0 / scale 0.6 → 35% opacity 0.9 / scale 1 → 100% opacity 0 / scale 1.6
 *     카드 중앙에 펄스되는 amber 링.
 *
 * 실습 트리거: detailOpenCount baseline 대비 증가.
 */
const EASE_DEMO = Easing.bezier(...easings.detailMorph);

interface Props {
  recForDemo: Recommendation;
}

export default function TapDemo({ recForDemo }: Props) {
  // 카드 탭 ripple 모방: 900ms 1사이클 → 짧은 휴식 후 반복.
  // web 은 `tut-demo-tap` 이 `both` 라 1회만 재생되지만, native 에서는 사용자가 실습할 때까지
  // 무한 반복 (시각 강조 유지). 휴식 600ms 를 끝에 두어 호흡감 부여.
  const cardScale = useSharedValue(1);
  const ringScale = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0);

  useEffect(() => {
    cardScale.value = withRepeat(
      withSequence(
        withTiming(0.96, { duration: 360, easing: EASE_DEMO }), // 0% → 40% (40% of 900)
        withTiming(1.02, { duration: 270, easing: EASE_DEMO }), // 40% → 70%
        withTiming(1, { duration: 270, easing: EASE_DEMO }),     // 70% → 100%
        withTiming(1, { duration: 600, easing: EASE_DEMO }),     // 휴식
      ),
      -1,
      false,
    );

    // ring: 1100ms infinite — 35% 시점 (385ms) opacity 0.9 + scale 1, 100% opacity 0 + scale 1.6.
    ringScale.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 385, easing: EASE_DEMO }),
        withTiming(1.6, { duration: 715, easing: EASE_DEMO }),
      ),
      -1,
      false,
    );
    ringOpacity.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 385, easing: EASE_DEMO }),
        withTiming(0, { duration: 715, easing: EASE_DEMO }),
      ),
      -1,
      false,
    );
    // unmount 시 worklet cancel — shadow tree clone 누적 방지 (SIGABRT crash fix).
    return () => {
      cancelAnimation(cardScale);
      cancelAnimation(ringScale);
      cancelAnimation(ringOpacity);
    };
  }, [cardScale, ringScale, ringOpacity]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.cardSlot}>
        <Animated.View style={cardStyle}>
          <MockCard rec={recForDemo} />
        </Animated.View>
        {/* ripple ring — 카드 중앙 펄스. transient overlay 라 amber 카운트 제외 (DESIGN.md). */}
        <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
      </View>
      <View style={styles.copyBlock}>
        <Text style={styles.headline}>카드를 터치하면 자세히 볼 수 있어요</Text>
        <Text style={styles.sub}>감독, 출연, OTT 가용성 확인</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 28,
  },
  cardSlot: {
    width: 220,
    height: 320,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ring: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 56,
    height: 56,
    marginLeft: -28,
    marginTop: -28,
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  copyBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  headline: {
    color: colors.textPrimary,
    fontFamily: fonts.dataReg,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
