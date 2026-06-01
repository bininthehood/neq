import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
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
 * TutorialFlow v3 — 3단계: 아래 스와이프 (저장).
 *
 * web 정본: `apps/web/src/components/discover/tutorial/SwipeDownDemo.tsx`.
 *
 * 03_p1-1#2/#6 — MockCard 시연 제거. 화살표 + 안내선만 dim 위 오버레이.
 *
 * 모션 매핑 (화살표만):
 *   `tut-arrow-down` — opacity 0.35↔1, translateY 0↔+6, 1500ms infinite
 *
 * 실습 트리거: saveActionCount baseline 대비 증가.
 */
const EASE_DEMO = Easing.bezier(...easings.detailMorph);

interface Props {
  recForDemo?: Recommendation;
}

export default function SwipeDownDemo(_props: Props) {
  const arrowOpacity = useSharedValue(0.35);
  const arrowTy = useSharedValue(0);

  useEffect(() => {
    arrowOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 750, easing: EASE_DEMO }),
        withTiming(0.35, { duration: 750, easing: EASE_DEMO }),
      ),
      -1,
      false,
    );
    arrowTy.value = withRepeat(
      withSequence(
        withTiming(6, { duration: 750, easing: EASE_DEMO }),
        withTiming(0, { duration: 750, easing: EASE_DEMO }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(arrowOpacity);
      cancelAnimation(arrowTy);
    };
  }, [arrowOpacity, arrowTy]);

  const arrowStyle = useAnimatedStyle(() => ({
    opacity: arrowOpacity.value,
    transform: [{ translateY: arrowTy.value }],
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.copyBlock}>
        <Animated.View style={arrowStyle}>
          <Svg width={32} height={32} viewBox="0 0 24 24">
            <Line x1={12} y1={5} x2={12} y2={19} stroke={colors.accent} strokeWidth={2} strokeLinecap="round" />
            <Polyline
              points="19 12 12 19 5 12"
              stroke={colors.accent}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </Animated.View>
        <Text style={styles.headline}>아래로 밀어 마음에 드는 작품을 저장해요</Text>
        <Text style={styles.sub}>나중에 보고 싶은 작품을 모아둬요</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 28,
  },
  copyBlock: {
    alignItems: 'center',
    gap: spacing.sm + 4,
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
