import { useEffect } from 'react';
import { View, Text, StyleSheet, type LayoutRectangle } from 'react-native';
import {
  useSharedValue,
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
 * TutorialFlow v3.2 — 3단계: 아래 스와이프 (저장).
 *
 * 2026-06-04 통합: 풀사이즈 데모 카드 복원. web 정본 keyframe `tut-demo-down`
 * (translateY 0 → +72 → 0, scale 1 → 0.94 → 1, 1500ms).
 *
 * Polish 사이클 1 (2026-06-04, ux-reviewer P2):
 *   - 이전 `bottom: 140` 화살표 hint 는 카드 bottomInfo (title/reason/OTT chips, ~100~150px)
 *     영역과 시각 충돌. 시각 anchor 보다 카드 자체 슬라이드 모션이 메인 시연이므로 화살표 제거.
 *   - 카드 cycle (translateY +72 + scale 0.94) 자체가 "아래로 내려간다" 메타포 충분.
 *   - 헤드라인 "아래로 밀어 마음에 드는 작품을 저장해요" 가 방향 텍스트 명시 → 시각 anchor 부재 보완.
 *   - 누적 worklet 4→2 로 감소 (Reanimated 4 cleanup 비용 절감).
 *
 * 카드는 dim 위 오버레이 (pointerEvents="none"). 사용자는 dim 아래 실제 SwipeCard 를 직접
 * 아래로 밀어 진행 (또는 ActionBar Save 버튼).
 *
 * 모션 매핑:
 *   - 카드 translateY: 0 → +72 → +72 → 0
 *   - 카드 scale:    1 → 0.94 → 0.94 → 1
 *
 * 실습 트리거: saveActionCount baseline 대비 증가.
 */
const EASE_DEMO = Easing.bezier(...easings.detailMorph);

const PHASE_ENTER = 525;
const PHASE_HOLD = 450;
const PHASE_RETURN = 525;
const CARD_DRIFT_Y = 72;
const CARD_SCALE = 0.94;

interface Props {
  recForDemo?: Recommendation;
  stackRect: LayoutRectangle;
}

export default function SwipeDownDemo({ recForDemo, stackRect }: Props) {
  const insets = useSafeAreaInsets();
  const cardTy = useSharedValue(0);
  const cardScale = useSharedValue(1);

  useEffect(() => {
    cardTy.value = withRepeat(
      withSequence(
        withTiming(CARD_DRIFT_Y, { duration: PHASE_ENTER, easing: EASE_DEMO }),
        withTiming(CARD_DRIFT_Y, { duration: PHASE_HOLD, easing: EASE_DEMO }),
        withTiming(0, { duration: PHASE_RETURN, easing: EASE_DEMO }),
      ),
      -1,
      false,
    );
    cardScale.value = withRepeat(
      withSequence(
        withTiming(CARD_SCALE, { duration: PHASE_ENTER, easing: EASE_DEMO }),
        withTiming(CARD_SCALE, { duration: PHASE_HOLD, easing: EASE_DEMO }),
        withTiming(1, { duration: PHASE_RETURN, easing: EASE_DEMO }),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(cardTy);
      cancelAnimation(cardScale);
    };
  }, [cardTy, cardScale]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {recForDemo && (
        <TutorialDemoCard
          rec={recForDemo}
          stackRect={stackRect}
          translateY={cardTy}
          scale={cardScale}
        />
      )}

      {/* 안내 카피 — 카드 위 dim 상단 영역.
          Polish 사이클 1: safe-area 동적 + a11y 통합 라벨. */}
      <View
        style={[styles.copyBlock, { top: insets.top + 60 }]}
        pointerEvents="none"
        accessible
        accessibilityRole="text"
        accessibilityLabel="아래로 밀어 마음에 드는 작품을 저장해요. 나중에 보고 싶은 작품을 모아둬요"
      >
        <Text style={styles.headline} importantForAccessibility="no-hide-descendants">
          아래로 밀어 마음에 드는 작품을 저장해요
        </Text>
        <Text style={styles.sub} importantForAccessibility="no-hide-descendants">
          나중에 보고 싶은 작품을 모아둬요
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Polish 사이클 1 (ux-reviewer WARN): top 은 인라인에서 insets.top + 60 동적 계산.
  copyBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
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
