import { useEffect } from 'react';
import { View, Text, StyleSheet, type LayoutRectangle } from 'react-native';
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
 * TutorialFlow v3.2 — 4단계: 탭 (Detail 진입).
 *
 * 2026-06-04 통합: 풀사이즈 데모 카드 복원. web 정본 keyframe `tut-demo-tap`
 * (scale 1 → 0.96 → 1.02 → 1, 900ms). 짧은 cycle 로 탭 행동 시연.
 *
 * 카드는 dim 위 오버레이 (pointerEvents="none"). 사용자는 dim 아래 실제 SwipeCard 를 직접
 * 탭하면 DetailSheet 진입.
 *
 * 모션 매핑:
 *   - 카드 scale: 1 → 0.96 → 1.02 → 1 (40% / 30% / 30% phase, 총 900ms)
 *   - ring (ripple): 1100ms infinite — opacity 0/scale 0.6 → opacity 0.9/scale 1 → opacity 0/scale 1.6
 *
 * 실습 트리거: detailOpenCount baseline 대비 증가.
 */
const EASE_DEMO = Easing.bezier(...easings.detailMorph);

// web `tut-demo-tap` keyframe 의 phase 분배 (총 900ms).
// 0% → 40% (360ms): 1 → 0.96
// 40% → 70% (270ms): 0.96 → 1.02
// 70% → 100% (270ms): 1.02 → 1
const TAP_PHASE_DOWN = 360;
const TAP_PHASE_OVERSHOOT = 270;
const TAP_PHASE_RETURN = 270;
const TAP_SCALE_DOWN = 0.96;
const TAP_SCALE_OVERSHOOT = 1.02;

interface Props {
  recForDemo?: Recommendation;
  stackRect: LayoutRectangle;
}

export default function TapDemo({ recForDemo, stackRect }: Props) {
  const insets = useSafeAreaInsets();
  const cardScale = useSharedValue(1);
  const ringScale = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0);

  useEffect(() => {
    // 카드 탭 시연 cycle.
    cardScale.value = withRepeat(
      withSequence(
        withTiming(TAP_SCALE_DOWN, { duration: TAP_PHASE_DOWN, easing: EASE_DEMO }),
        withTiming(TAP_SCALE_OVERSHOOT, { duration: TAP_PHASE_OVERSHOOT, easing: EASE_DEMO }),
        withTiming(1, { duration: TAP_PHASE_RETURN, easing: EASE_DEMO }),
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
    return () => {
      cancelAnimation(cardScale);
      cancelAnimation(ringScale);
      cancelAnimation(ringOpacity);
    };
  }, [cardScale, ringScale, ringOpacity]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {recForDemo && (
        <TutorialDemoCard rec={recForDemo} stackRect={stackRect} scale={cardScale} />
      )}

      {/* ripple ring — 카드 중앙 영역 펄스. transient overlay 라 amber 카운트 제외 (DESIGN.md L34). */}
      <View style={styles.ringSlot} pointerEvents="none">
        <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
      </View>

      {/* 안내 카피 — 카드 위 dim 상단 영역.
          Polish 사이클 1: safe-area 동적 + a11y 통합 라벨. */}
      <View
        style={[styles.copyBlock, { top: insets.top + 60 }]}
        pointerEvents="none"
        accessible
        accessibilityRole="text"
        accessibilityLabel="카드를 터치하면 자세히 볼 수 있어요. 감독, 출연, OTT 가용성 확인"
      >
        <Text style={styles.headline} importantForAccessibility="no-hide-descendants">
          카드를 터치하면 자세히 볼 수 있어요
        </Text>
        <Text style={styles.sub} importantForAccessibility="no-hide-descendants">
          감독, 출연, OTT 가용성 확인
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ring 은 화면 중앙 (카드 중앙과 동일 위치).
  ringSlot: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -36,
    marginLeft: -36,
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: 72,
    height: 72,
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: colors.accent,
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
