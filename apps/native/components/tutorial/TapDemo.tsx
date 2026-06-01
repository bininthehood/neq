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
import { easings, fontsV2 } from '@neq/design';
import { colors, spacing } from '../../lib/tokens';

/**
 * TutorialFlow v3 — 4단계: 탭 (Detail 진입).
 *
 * web 정본: `apps/web/src/components/discover/tutorial/TapDemo.tsx`.
 *
 * 03_p1-1#2/#6 — MockCard 시연 제거. 화면 중앙에 ripple ring 펄스 + 텍스트만 표시.
 * 실제 SwipeCard 를 사용자가 직접 탭하면 진행. ring 은 어디를 만질지 시각 가이드만 담당.
 *
 * 모션 매핑:
 *   ring (`tut-tap-ring`) — 1100ms infinite
 *     0% opacity 0 / scale 0.6 → 35% opacity 0.9 / scale 1 → 100% opacity 0 / scale 1.6
 *
 * 실습 트리거: detailOpenCount baseline 대비 증가.
 */
const EASE_DEMO = Easing.bezier(...easings.detailMorph);

interface Props {
  recForDemo?: Recommendation;
}

export default function TapDemo(_props: Props) {
  const ringScale = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0);

  useEffect(() => {
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
    return () => {
      cancelAnimation(ringScale);
      cancelAnimation(ringOpacity);
    };
  }, [ringScale, ringOpacity]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.ringSlot}>
        {/* ripple ring — 카드 중앙 영역 펄스. transient overlay 라 amber 카운트 제외 (DESIGN.md L34). */}
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
  ringSlot: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ring: {
    width: 72,
    height: 72,
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
    fontFamily: fontsV2.body,
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
