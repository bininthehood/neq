import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import type { Recommendation } from '../../lib/types';
import MockCard from './MockCard';
import { easings } from '@neq/design';
import { colors, spacing } from '../../lib/tokens';
import { fonts } from '@neq/design';

/**
 * TutorialFlow v3 — 1단계: 좌 스와이프 (다음 작품).
 *
 * web 정본: `apps/web/src/components/discover/tutorial/SwipeLeftDemo.tsx`.
 *
 * 모션 매핑 (web CSS keyframe → Reanimated):
 *   `@keyframes tut-demo-left` — 1500ms `var(--ease-detail-morph)` (=detailMorph) infinite
 *     0% (0ms)    translateX 0 / rotate 0
 *     35% (525ms) translateX -72 / rotate -6deg
 *     65% (975ms) translateX -72 / rotate -6deg  ← 유지 구간
 *     100% (1500) translateX 0 / rotate 0
 *
 *   화살표 (`tut-arrow-left`) — opacity 0.35↔1, translateX 0↔-6, 1500ms infinite
 *
 * 실습 트리거: 부모(TutorialFlow)가 leftSwipeCount 의 baseline 대비 증가 감지로 진행.
 *   본 컴포넌트 자체는 시연만 책임 — pointerEvents 차단됨.
 */
const EASE_DEMO = Easing.bezier(...easings.detailMorph);

interface Props {
  recForDemo: Recommendation;
}

export default function SwipeLeftDemo({ recForDemo }: Props) {
  const cardTx = useSharedValue(0);
  const cardRot = useSharedValue(0);
  const arrowOpacity = useSharedValue(0.35);
  const arrowTx = useSharedValue(0);

  useEffect(() => {
    // 카드 푸시 사이클: 0 → -72 (525ms) → -72 유지 (450ms) → 0 (525ms).
    // 35/30/35 비율은 web keyframe 의 0~35~65~100 % 시점과 일치.
    cardTx.value = withRepeat(
      withSequence(
        withTiming(-72, { duration: 525, easing: EASE_DEMO }),
        withTiming(-72, { duration: 450, easing: EASE_DEMO }),
        withTiming(0, { duration: 525, easing: EASE_DEMO }),
      ),
      -1,
      false,
    );
    cardRot.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 525, easing: EASE_DEMO }),
        withTiming(-6, { duration: 450, easing: EASE_DEMO }),
        withTiming(0, { duration: 525, easing: EASE_DEMO }),
      ),
      -1,
      false,
    );
    // 화살표 펄스: 0.35 → 1 → 0.35 + translateX 0 → -6 → 0. 1500ms infinite.
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
  }, [cardTx, cardRot, arrowOpacity, arrowTx]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: cardTx.value }, { rotate: `${cardRot.value}deg` }],
  }));
  const arrowStyle = useAnimatedStyle(() => ({
    opacity: arrowOpacity.value,
    transform: [{ translateX: arrowTx.value }],
  }));
  // ESLint hooks dep 노이즈 방지 — delay 헬퍼 참조 유지
  void withDelay;

  return (
    <View style={styles.wrap}>
      <Animated.View style={cardStyle}>
        <MockCard rec={recForDemo} />
      </Animated.View>
      <View style={styles.copyBlock}>
        <Animated.View style={arrowStyle}>
          <Svg width={22} height={22} viewBox="0 0 24 24">
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
