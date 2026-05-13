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
import MockCard from './MockCard';
import { easings, fonts } from '@neq/design';
import { colors, spacing } from '../../lib/tokens';

/**
 * TutorialFlow v3 — 2단계: 우 스와이프 (이전 카드 overlay).
 *
 * web 정본: `apps/web/src/components/discover/tutorial/SwipeRightDemo.tsx`.
 *
 * 모션 매핑:
 *   `@keyframes tut-demo-right` — 1500ms detailMorph infinite
 *     0% translateX 0 → 35% +72/+6deg → 65% 유지 → 100% 0
 *
 *   prev overlay hint: 카드 뒤편 좌측에 살짝 작고 어두운 mock 카드 1장 (정적).
 *   - left: -28, top: 6, scale 0.94, rotate -3deg, opacity 0.45, saturation 0.8
 *
 *   화살표 (`tut-arrow-right`) — 1500ms infinite, opacity 0.35↔1, translateX 0↔+6
 *
 * 실습 트리거: rightSwipeCount baseline 대비 증가.
 */
const EASE_DEMO = Easing.bezier(...easings.detailMorph);

interface Props {
  recForDemo: Recommendation;
}

export default function SwipeRightDemo({ recForDemo }: Props) {
  const cardTx = useSharedValue(0);
  const cardRot = useSharedValue(0);
  const arrowOpacity = useSharedValue(0.35);
  const arrowTx = useSharedValue(0);

  useEffect(() => {
    cardTx.value = withRepeat(
      withSequence(
        withTiming(72, { duration: 525, easing: EASE_DEMO }),
        withTiming(72, { duration: 450, easing: EASE_DEMO }),
        withTiming(0, { duration: 525, easing: EASE_DEMO }),
      ),
      -1,
      false,
    );
    cardRot.value = withRepeat(
      withSequence(
        withTiming(6, { duration: 525, easing: EASE_DEMO }),
        withTiming(6, { duration: 450, easing: EASE_DEMO }),
        withTiming(0, { duration: 525, easing: EASE_DEMO }),
      ),
      -1,
      false,
    );
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
    // unmount 시 worklet cancel — shadow tree clone 누적 방지 (SIGABRT crash fix).
    return () => {
      cancelAnimation(cardTx);
      cancelAnimation(cardRot);
      cancelAnimation(arrowOpacity);
      cancelAnimation(arrowTx);
    };
  }, [cardTx, cardRot, arrowOpacity, arrowTx]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: cardTx.value }, { rotate: `${cardRot.value}deg` }],
  }));
  const arrowStyle = useAnimatedStyle(() => ({
    opacity: arrowOpacity.value,
    transform: [{ translateX: arrowTx.value }],
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.stackWrap}>
        {/* prev hint — 좌측 뒤 카드. RN 은 CSS filter saturate 가 없어 opacity 만으로 dim. */}
        <View style={styles.prevHint}>
          <MockCard rec={recForDemo} />
        </View>
        {/* 메인 카드 — 우측 푸시 모션 */}
        <Animated.View style={[styles.mainCardSlot, cardStyle]}>
          <MockCard rec={recForDemo} />
        </Animated.View>
      </View>
      <View style={styles.copyBlock}>
        <Animated.View style={arrowStyle}>
          <Svg width={22} height={22} viewBox="0 0 24 24">
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
  stackWrap: {
    width: 220,
    height: 320,
    position: 'relative',
  },
  prevHint: {
    position: 'absolute',
    left: -28,
    top: 6,
    opacity: 0.45,
    transform: [{ scale: 0.94 }, { rotate: '-3deg' }],
  },
  mainCardSlot: {
    position: 'absolute',
    top: 0,
    left: 0,
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
