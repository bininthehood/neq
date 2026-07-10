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
 * 2026-07-10 정합 재작성 (사용자 피드백): 기존 데모는 현재 카드가 우측으로 +72
 * 드리프트 (좌 스와이프의 미러) 였는데, 실제 우 스와이프는 **직전(pass 된) 작품이
 * 왼쪽 가장자리에서 현재 카드 위로 쓸려 들어오는** prev overlay 모션
 * (`app/index.tsx` prevOverlayX: -SCREEN_W + dx, 회전 없음). 데모를 실제와 동일하게:
 *
 *   - 카드 translateX: -OFF(화면 밖) → -OFF*0.62 (약 38% 쓸려 들어옴 ≈ 실제
 *     커밋 임계 PREV_OVERLAY_TRIGGER 0.3 직후 시점) → hold → -OFF 복귀
 *   - 회전 없음 (실제 overlay 는 translateX 만)
 *   - 화살표 opacity: 0.35 ↔ 1, translateX 0 ↔ +6, 1500ms (손가락 방향 = 우)
 *
 * 실습 트리거: rightSwipeCount baseline 대비 증가.
 */
const EASE_DEMO = Easing.bezier(...easings.detailMorph);

const PHASE_ENTER = 525;
const PHASE_HOLD = 450;
const PHASE_RETURN = 525;
// 쓸려 들어온 정점 — 카드 폭의 38% 노출 (커밋 임계 0.3 직후의 "되돌아오는 중" 시점).
const PEAK_PROGRESS = 0.38;

interface Props {
  recForDemo?: Recommendation;
  stackRect: LayoutRectangle;
}

export default function SwipeRightDemo({ recForDemo, stackRect }: Props) {
  const insets = useSafeAreaInsets();
  // 오프스크린 기준 — 데모 카드 폭(stackRect.width - 24) + 좌 인셋 12 를 넉넉히 덮음.
  const off = stackRect.width;
  const cardTx = useSharedValue(-off);
  const arrowOpacity = useSharedValue(0.35);
  const arrowTx = useSharedValue(0);

  useEffect(() => {
    // prev overlay 재현 — 왼쪽 화면 밖에서 진입 → hold → 화면 밖 복귀.
    cardTx.value = -off;
    cardTx.value = withRepeat(
      withSequence(
        withTiming(-off * (1 - PEAK_PROGRESS), { duration: PHASE_ENTER, easing: EASE_DEMO }),
        withTiming(-off * (1 - PEAK_PROGRESS), { duration: PHASE_HOLD, easing: EASE_DEMO }),
        withTiming(-off, { duration: PHASE_RETURN, easing: EASE_DEMO }),
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
      cancelAnimation(arrowOpacity);
      cancelAnimation(arrowTx);
    };
  }, [cardTx, arrowOpacity, arrowTx, off]);

  const arrowStyle = useAnimatedStyle(() => ({
    opacity: arrowOpacity.value,
    transform: [{ translateX: arrowTx.value }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* 직전 작품이 왼쪽에서 쓸려 들어오는 overlay 재현 — recForDemo(직전에 넘긴
          recs[0])가 실제로도 우 스와이프 시 되돌아올 그 카드라 의미 정합. 회전 없음. */}
      {recForDemo && (
        <TutorialDemoCard
          rec={recForDemo}
          stackRect={stackRect}
          translateX={cardTx}
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
