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
 * TutorialFlow v3.2 — 1단계: 좌 스와이프 (다음 작품).
 *
 * 2026-06-04 통합: MockCard 폐기(6/1) 후 "포스터 가시성 회귀" 피드백 대응 — 풀사이즈 데모 카드
 * 복원. web 정본 keyframe `tut-demo-left` (translateX 0 → -72 → 0, rotate 0 → -6deg → 0,
 * 1500ms) 를 Reanimated `withRepeat + withSequence` 로 포팅.
 *
 * 카드는 dim 위 오버레이 (pointerEvents="none"). 사용자는 dim 아래 실제 SwipeCard 를 직접
 * 만져 진행. 데모 카드는 "어느 방향으로 무엇이 일어나는지" 시각 가이드만.
 *
 * 모션 매핑:
 *   - 카드 translateX: 0 → -72 → -72 → 0 (35% / 30% / 35% phase, 총 1500ms)
 *   - 카드 rotate:    0 → -6 → -6 → 0 (동일 phase)
 *   - 화살표 opacity: 0.35 ↔ 1, translateX 0 ↔ -6, 1500ms
 *
 * Reanimated 4 Fabric crash 회피:
 *   - withRepeat(-1, false) 무한 worklet 은 unmount 시 cancelAnimation cleanup 필수.
 *   - sharedValue 결과는 TutorialDemoCard 의 worklet 에서 finite 가드.
 *
 * 실습 트리거: 부모(TutorialFlow)가 leftSwipeCount baseline 대비 증가 감지로 진행.
 */
const EASE_DEMO = Easing.bezier(...easings.detailMorph);

// web `tut-demo-left` keyframe 의 phase 분배.
// 0% → 35% (525ms): 0 → -72
// 35% → 65% (450ms): -72 hold
// 65% → 100% (525ms): -72 → 0
const PHASE_ENTER = 525;
const PHASE_HOLD = 450;
const PHASE_RETURN = 525;
const CARD_DRIFT = -72;
const CARD_ROT = -6;

interface Props {
  recForDemo?: Recommendation;
  stackRect: LayoutRectangle;
}

export default function SwipeLeftDemo({ recForDemo, stackRect }: Props) {
  const insets = useSafeAreaInsets();

  // 카드 transform sharedValue.
  const cardTx = useSharedValue(0);
  const cardRot = useSharedValue(0);

  // 화살표 펄스 sharedValue.
  const arrowOpacity = useSharedValue(0.35);
  const arrowTx = useSharedValue(0);

  useEffect(() => {
    // 카드 cycle — enter → hold → return → (repeat).
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
      {/* 풀사이즈 데모 카드 (SwipeCard 동일 위치/사이즈) */}
      {recForDemo && (
        <TutorialDemoCard
          rec={recForDemo}
          stackRect={stackRect}
          translateX={cardTx}
          rotate={cardRot}
        />
      )}

      {/* 좌측 화살표 hint — 카드 좌측 중앙 영역. */}
      <View style={styles.arrowHint} pointerEvents="none">
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
      </View>

      {/* 안내 카피 — 카드 위 dim 영역 (상단). 카드와 겹치지 않도록 absolute top.
          stepNumber wrap (insets.top + spacing.md + 4 = insets.top + 16) 아래 ~44px 간격.
          a11y: 헤드라인 + sub 통합 라벨 — screen reader 단일 호흡 발화. */}
      <View
        style={[styles.copyBlock, { top: insets.top + 60 }]}
        pointerEvents="none"
        accessible
        accessibilityRole="text"
        accessibilityLabel="왼쪽으로 밀어 다음 작품을 발견해요. 안 끌리는 작품은 그냥 밀어내세요"
      >
        <Text style={styles.headline} importantForAccessibility="no-hide-descendants">
          왼쪽으로 밀어 다음 작품을 발견해요
        </Text>
        <Text style={styles.sub} importantForAccessibility="no-hide-descendants">
          안 끌리는 작품은 그냥 밀어내세요
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 화살표는 카드 좌측 가장자리 바로 옆 — 카드 wrap (left: 12) 와 동일 라인.
  // spacing.md = 16 은 4px 안쪽이라 모서리 겹침 (ux-reviewer 사이클 2 P3) → 12 직접 명시.
  arrowHint: {
    position: 'absolute',
    top: '50%',
    left: 12,
    marginTop: -16,
  },
  // 안내 카피 — 카드 위 dim 영역에 표시. SwipeCard 가 화면의 ~85% 차지하므로
  // 상단 dim 영역(insets.top + 단계번호 아래) 에 표시.
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
