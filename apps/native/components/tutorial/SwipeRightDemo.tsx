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
 * TutorialFlow v3 — 2단계: 우 스와이프 (이전 카드 overlay).
 *
 * web 정본: `apps/web/src/components/discover/tutorial/SwipeRightDemo.tsx`.
 *
 * 03_p1-1#2/#6 — MockCard + prev hint stack 제거. 실제 SwipeCard 위에 화살표 +
 * 안내선만 오버레이로 표시. 이전 카드 표시는 사용자가 직접 우 스와이프 시작 시
 * 자동으로 보이는 prev overlay 가 시각 가이드 역할을 함.
 *
 * 모션 매핑 (화살표만):
 *   `tut-arrow-right` — opacity 0.35↔1, translateX 0↔+6, 1500ms infinite
 *
 * 실습 트리거: rightSwipeCount baseline 대비 증가.
 */
const EASE_DEMO = Easing.bezier(...easings.detailMorph);

interface Props {
  recForDemo?: Recommendation;
}

export default function SwipeRightDemo(_props: Props) {
  const arrowOpacity = useSharedValue(0.35);
  const arrowTx = useSharedValue(0);

  useEffect(() => {
    arrowOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 750, easing: EASE_DEMO }),
        withTiming(0.35, { duration: 750, easing: EASE_DEMO }),
      ),
      -1,
      false,
    );
    arrowTx.value = withRepeat(
      withSequence(
        withTiming(6, { duration: 750, easing: EASE_DEMO }),
        withTiming(0, { duration: 750, easing: EASE_DEMO }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(arrowOpacity);
      cancelAnimation(arrowTx);
    };
  }, [arrowOpacity, arrowTx]);

  const arrowStyle = useAnimatedStyle(() => ({
    opacity: arrowOpacity.value,
    transform: [{ translateX: arrowTx.value }],
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.copyBlock}>
        <Animated.View style={arrowStyle}>
          <Svg width={32} height={32} viewBox="0 0 24 24">
            <Line x1={5} y1={12} x2={19} y2={12} stroke={colors.accent} strokeWidth={2} strokeLinecap="round" />
            <Polyline
              points="12 5 19 12 12 19"
              stroke={colors.accent}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </Animated.View>
        <Text style={styles.headline}>오른쪽으로 밀면 직전 작품이 다시 와요</Text>
        <Text style={styles.sub}>되돌아갈 수 있어요</Text>
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
