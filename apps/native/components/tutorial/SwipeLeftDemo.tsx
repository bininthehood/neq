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
import { easings } from '@neq/design';
import { colors, spacing } from '../../lib/tokens';
import { fontsV2 } from '@neq/design';

/**
 * TutorialFlow v3 — 1단계: 좌 스와이프 (다음 작품).
 *
 * web 정본: `apps/web/src/components/discover/tutorial/SwipeLeftDemo.tsx`.
 *
 * 03_p1-1#2/#6 — MockCard 시연 제거 (220×320 mock 카드와 실제 SwipeCard 풀블리드
 * 사이의 시각적/공간적 분리감이 "어디를 만져야 하는지" 혼란의 1차 원인). dim 위에
 * 화살표 + 안내선만 오버레이로 띄우고 실제 SwipeCard 를 사용자가 직접 만지도록 유도.
 *
 * 모션 매핑 (화살표만 유지):
 *   `tut-arrow-left` — opacity 0.35↔1, translateX 0↔-6, 1500ms infinite
 *
 * 실습 트리거: 부모(TutorialFlow)가 leftSwipeCount baseline 대비 증가 감지로 진행.
 */
const EASE_DEMO = Easing.bezier(...easings.detailMorph);

interface Props {
  // 시그니처 호환 유지 — MockCard 제거 후로도 부모 TutorialFlow 가 그대로 prop 주입.
  recForDemo?: Recommendation;
}

export default function SwipeLeftDemo(_props: Props) {
  const arrowOpacity = useSharedValue(0.35);
  const arrowTx = useSharedValue(0);

  useEffect(() => {
    // 화살표 펄스: opacity 0.35↔1 + translateX 0↔-6. 1500ms infinite.
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
        withTiming(-6, { duration: 750, easing: EASE_DEMO }),
        withTiming(0, { duration: 750, easing: EASE_DEMO }),
      ),
      -1,
      false,
    );
    // unmount 시 worklet cancel — shadow tree clone 누적 방지 (SIGABRT crash fix).
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
            <Line x1={19} y1={12} x2={5} y2={12} stroke={colors.accent} strokeWidth={2} strokeLinecap="round" />
            <Polyline
              points="12 19 5 12 12 5"
              stroke={colors.accent}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </Animated.View>
        <Text style={styles.headline}>왼쪽으로 밀어 다음 작품을 발견해요</Text>
        <Text style={styles.sub}>안 끌리는 작품은 그냥 밀어내세요</Text>
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
