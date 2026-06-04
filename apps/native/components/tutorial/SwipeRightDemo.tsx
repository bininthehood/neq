import { useEffect } from 'react';
import { View, Text, StyleSheet, type LayoutRectangle } from 'react-native';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Recommendation } from '../../lib/types';
import { easings, fontsV2 } from '@neq/design';
import { colors, spacing } from '../../lib/tokens';
import TutorialDemoCard from './TutorialDemoCard';

/**
 * TutorialFlow v3.2 — 2단계: 우 스와이프 (이전 카드 overlay).
 *
 * 2026-06-04 통합: 풀사이즈 데모 카드 복원. web 정본 keyframe `tut-demo-right`
 * (translateX 0 → +72 → 0, rotate 0 → +6deg → 0, 1500ms).
 *
 * 카드는 dim 위 오버레이 (pointerEvents="none"). 사용자는 dim 아래 실제 SwipeCard 를 직접
 * 만져 진행.
 *
 * 모션 매핑:
 *   - 카드 translateX: 0 → +72 → +72 → 0
 *   - 카드 rotate:    0 → +6 → +6 → 0
 *   - 화살표 opacity: 0.35 ↔ 1, translateX 0 ↔ +6, 1500ms
 *
 * 실습 트리거: rightSwipeCount baseline 대비 증가.
 */
const EASE_DEMO = Easing.bezier(...easings.detailMorph);

const PHASE_ENTER = 525;
const PHASE_HOLD = 450;
const PHASE_RETURN = 525;
const CARD_DRIFT = 72;
const CARD_ROT = 6;

interface Props {
  recForDemo?: Recommendation;
  stackRect: LayoutRectangle;
}

export default function SwipeRightDemo({ recForDemo, stackRect }: Props) {
  const insets = useSafeAreaInsets();
  const cardTx = useSharedValue(0);
  const cardRot = useSharedValue(0);
  const arrowOpacity = useSharedValue(0.35);
  const arrowTx = useSharedValue(0);

  useEffect(() => {
    cardTx.value = withRepeat(
      withSequence(
        withTiming(CARD_DRIFT, { duration: PHASE_ENTER, easing: EASE_DEMO }),
        withTiming(CARD_DRIFT, { duration: PHASE_HOLD, easing: EASE_DEMO }),
        withTiming(0, { duration: PHASE_RETURN, easing: EASE_DEMO }),
      ),
      -1,
      false,
    );
    cardRot.value = withRepeat(
      withSequence(
        withTiming(CARD_ROT, { duration: PHASE_ENTER, easing: EASE_DEMO }),
        withTiming(CARD_ROT, { duration: PHASE_HOLD, easing: EASE_DEMO }),
        withTiming(0, { duration: PHASE_RETURN, easing: EASE_DEMO }),
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

    return () => {
      cancelAnimation(cardTx);
      cancelAnimation(cardRot);
      cancelAnimation(arrowOpacity);
      cancelAnimation(arrowTx);
    };
  }, [cardTx, cardRot, arrowOpacity, arrowTx]);

  const arrowStyle = useAnimatedStyle(() => ({
    opacity: arrowOpacity.value,
    transform: [{ translateX: arrowTx.value }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {recForDemo && (
        <TutorialDemoCard
          rec={recForDemo}
          stackRect={stackRect}
          translateX={cardTx}
          rotate={cardRot}
        />
      )}

      <View style={styles.arrowHint} pointerEvents="none">
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
      </View>

      {/* 안내 카피 — Polish 사이클 1: safe-area 동적 + a11y 통합 라벨. */}
      <View
        style={[styles.copyBlock, { top: insets.top + 60 }]}
        pointerEvents="none"
        accessible
        accessibilityRole="text"
        accessibilityLabel="오른쪽으로 밀면 직전 작품이 다시 와요. 되돌아갈 수 있어요"
      >
        <Text style={styles.headline} importantForAccessibility="no-hide-descendants">
          오른쪽으로 밀면 직전 작품이 다시 와요
        </Text>
        <Text style={styles.sub} importantForAccessibility="no-hide-descendants">
          되돌아갈 수 있어요
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 화살표는 카드 우측 가장자리 바로 옆 — 카드 wrap (right: 12) 와 동일 라인.
  // spacing.md = 16 은 4px 안쪽이라 모서리 겹침 (ux-reviewer 사이클 2 P3) → 12 직접 명시.
  arrowHint: {
    position: 'absolute',
    top: '50%',
    right: 12,
    marginTop: -16,
  },
  // Polish 사이클 1 (ux-reviewer WARN): top 은 인라인에서 insets.top + 60 동적 계산.
  copyBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
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
