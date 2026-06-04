import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, type LayoutRectangle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Recommendation } from '../lib/types';
import { track } from '../lib/analytics';
import SwipeLeftDemo from './tutorial/SwipeLeftDemo';
import SwipeRightDemo from './tutorial/SwipeRightDemo';
import SwipeDownDemo from './tutorial/SwipeDownDemo';
import TapDemo from './tutorial/TapDemo';
import { colors, spacing, radius } from '../lib/tokens';
import { easings, durations, fonts, fontsV2 } from '@neq/design';

/**
 * TutorialFlow v3 — Discover 첫 진입 4단계 튜토리얼 (native).
 *
 * web 정본: `apps/web/src/components/discover/tutorial/TutorialFlow.tsx`. 1:1 포팅.
 *
 * 4단계 (순서 고정, ↑ 위로 스와이프 미포함 — memory `feedback_swipe_ux` 정합):
 *   1. swipe_left  — 다음 작품
 *   2. swipe_right — 이전 카드 overlay
 *   3. swipe_down  — 저장
 *   4. tap         — Detail 진입
 *
 * 동작 모델:
 *   - 자체 dim 풀스크린 (`pointerEvents="box-none"`).
 *   - 데모 카드는 dim 위 mock 카드로 시연. 실제 카드(Discover stack) 는 그대로 노출되어
 *     사용자가 진짜 카드를 만져야 진행. 데모 컨테이너는 pointerEvents="none" 으로 차단.
 *   - 부모 Discover 가 4개 카운터를 emit. 단계 활성일 때 baseline 보다 카운터 증가하면
 *     자동으로 다음 단계로 전진. 마지막 단계 완료 시 `onClose("completed", ...)`.
 *
 * 노출 정책 (부모 Discover 의 책임):
 *   - AsyncStorage `tutorialV3Shown === "1"` 이면 마운트 X (`hasSeenTutorialV3()`).
 *   - 첫 카드 로드 완료 후 마운트.
 */

export type TutorialStep = 'swipe_left' | 'swipe_right' | 'swipe_down' | 'tap';

const STEPS: TutorialStep[] = ['swipe_left', 'swipe_right', 'swipe_down', 'tap'];

const STEP_INDEX: Record<TutorialStep, number> = {
  swipe_left: 0,
  swipe_right: 1,
  swipe_down: 2,
  tap: 3,
};

export interface TutorialUserSignals {
  leftSwipeCount: number;
  rightSwipeCount: number;
  saveActionCount: number;
  detailOpenCount: number;
}

interface Props {
  recForDemo: Recommendation;
  /** 실제 SwipeCard 부모 (stackWrap) 의 측정 좌표. 데모 카드가 이 영역 안에서 SwipeCard 와 정합. */
  stackRect: LayoutRectangle;
  /** 사용자가 실제 카드를 drag 중인지. dim overlay 를 drag 중 투명화하여 swipe 인지 강화. */
  isDragging?: boolean;
  userActionSignals: TutorialUserSignals;
  /** 현재 step 변경 시 부모에 emit — 부모가 step 별 action whitelist 가드에 사용. */
  onStepChange?: (step: TutorialStep) => void;
  onClose: (
    reason: 'completed' | 'skipped',
    payload: { stepsCompleted: number; atStep: TutorialStep },
  ) => void;
}

// dot 모핑 트랜지션 (web `--ease-detail-morph` 200ms 와 동일).
const DOT_DURATION = 200;
const DOT_EASING = Easing.bezier(...easings.detailMorph);

// 단계 진입 시 fade+slide entrance (web `coach-enter` keyframe 정합).
//   0.4s cubic-bezier(0.34, 1.3, 0.64, 1) = easings.spring.
const ENTER_DURATION = 400;
const ENTER_EASING = Easing.bezier(...easings.spring);

export default function TutorialFlow({ recForDemo, stackRect, isDragging, userActionSignals, onStepChange, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [stepIdx, setStepIdx] = useState(0);
  const currentStep = STEPS[stepIdx];

  // 각 단계 진입 시점의 신호값 baseline. 그 이후 증가분만 진행 트리거로 인정.
  // userActionSignals 자체는 매 렌더마다 갱신되므로 ref 로 캡처.
  const baselineRef = useRef<TutorialUserSignals>(userActionSignals);

  // 단계 진입 시 baseline 갱신 + `tutorial_step_shown` 계측 + 부모에 step emit.
  useEffect(() => {
    baselineRef.current = { ...userActionSignals };
    track('tutorial_step_shown', { step: currentStep });
    onStepChange?.(currentStep);
    // userActionSignals 는 의존성 제외 — 단계 진입 시점에만 baseline 캡처.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  // 신호 변동 → 진행 트리거.
  useEffect(() => {
    const baseline = baselineRef.current;
    let triggered = false;
    if (
      currentStep === 'swipe_left' &&
      userActionSignals.leftSwipeCount > baseline.leftSwipeCount
    ) {
      triggered = true;
    } else if (
      currentStep === 'swipe_right' &&
      userActionSignals.rightSwipeCount > baseline.rightSwipeCount
    ) {
      triggered = true;
    } else if (
      currentStep === 'swipe_down' &&
      userActionSignals.saveActionCount > baseline.saveActionCount
    ) {
      triggered = true;
    } else if (
      currentStep === 'tap' &&
      userActionSignals.detailOpenCount > baseline.detailOpenCount
    ) {
      triggered = true;
    }
    if (triggered) {
      const nextIdx = stepIdx + 1;
      if (nextIdx >= STEPS.length) {
        track('tutorial_completed', { steps_completed: STEPS.length });
        onClose('completed', {
          stepsCompleted: STEPS.length,
          atStep: currentStep,
        });
      } else {
        setStepIdx(nextIdx);
      }
    }
  }, [userActionSignals, currentStep, stepIdx, onClose]);

  // 단계 본체 entrance — key={currentStep} 으로 step 전환 시 재마운트.
  const entranceOpacity = useSharedValue(0);
  const entranceTy = useSharedValue(6);
  useEffect(() => {
    entranceOpacity.value = 0;
    entranceTy.value = 6;
    entranceOpacity.value = withTiming(1, { duration: ENTER_DURATION, easing: ENTER_EASING });
    entranceTy.value = withTiming(0, { duration: ENTER_DURATION, easing: ENTER_EASING });
  }, [stepIdx, entranceOpacity, entranceTy]);
  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entranceOpacity.value,
    transform: [{ translateY: entranceTy.value }],
  }));

  // dim 투명도 — drag 중 0 (투명) / idle 0.7 (default overlay). swipe 진행 인지 강화.
  // withTiming 으로 자연스러운 fade.
  const dimOpacity = useSharedValue(1);
  useEffect(() => {
    dimOpacity.value = withTiming(isDragging ? 0 : 1, {
      duration: 200,
      easing: DOT_EASING,
    });
  }, [isDragging, dimOpacity]);
  const dimStyle = useAnimatedStyle(() => ({ opacity: dimOpacity.value }));

  const handleSkip = () => {
    track('tutorial_skipped', { at_step: currentStep });
    onClose('skipped', { stepsCompleted: stepIdx, atStep: currentStep });
  };

  const stepNumberLabel = useMemo(
    () => `${stepIdx + 1} / ${STEPS.length}`,
    [stepIdx],
  );

  // suppress unused-import (durations 는 RN 에서 직접 안 쓰지만 디자인 토큰 일관성을 위해 import).
  void durations;

  return (
    <Animated.View
      // root 자체에 opacity 적용 — drag 중 튜토리얼 UI 전체 (dim + 카드 + 화살표 + 카피 +
      // 스킵 + 도트) 한꺼번에 fade. 사용자가 실제 카드 swipe 진행을 가려짐 없이 인지.
      style={[StyleSheet.absoluteFill, styles.dimRoot, dimStyle]}
      // box-none: dim 자체는 통과 — 사용자가 dim 아래의 실제 카드를 만질 수 있어야 함.
      // skip 버튼만 자체 Pressable 로 흡수.
      pointerEvents="box-none"
      accessibilityRole="alert"
      accessibilityLabel="첫 사용 안내"
    >
      {/* dim 배경 — overlay 0.7 톤. root 의 opacity 가 drag 중 fade 담당. */}
      <View style={[StyleSheet.absoluteFill, styles.dim]} pointerEvents="none" />

      {/* 건너뛰기 — pointerEvents 활성. safe-area top 보정.
          03_p1-1#4: insets.top + lg (24px) 로 Dynamic Island/노치 안전 마진 확보. */}
      <View style={[styles.skipWrap, { top: insets.top + spacing.lg }]}>
        <Pressable
          onPress={handleSkip}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="튜토리얼 건너뛰기"
          style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.skipText}>건너뛰기</Text>
        </Pressable>
      </View>

      {/* 단계 번호 */}
      <View
        style={[styles.stepNumberWrap, { top: insets.top + spacing.md + 4 }]}
        pointerEvents="none"
      >
        <Text style={styles.stepNumber}>{stepNumberLabel}</Text>
      </View>

      {/* 본체 — fade+slide entrance. pointerEvents="none" 으로 실제 카드 진입 차단 X.
          entrance View 도 absoluteFill — 자식 Demo 의 absolute 좌표 (카드 top:0/bottom:8/left:12/right:12)
          가 화면 좌표계 기준으로 정상 잡히도록. 미지정 시 height 0 squash 로 포스터 미표시. */}
      <View style={styles.bodyWrap} pointerEvents="none">
        <Animated.View key={currentStep} style={[StyleSheet.absoluteFill, entranceStyle]}>
          {currentStep === 'swipe_left' && <SwipeLeftDemo recForDemo={recForDemo} stackRect={stackRect} />}
          {currentStep === 'swipe_right' && <SwipeRightDemo recForDemo={recForDemo} stackRect={stackRect} />}
          {currentStep === 'swipe_down' && <SwipeDownDemo recForDemo={recForDemo} stackRect={stackRect} />}
          {currentStep === 'tap' && <TapDemo recForDemo={recForDemo} stackRect={stackRect} />}
        </Animated.View>
      </View>

      {/* 진행 도트 — 4단계 진척도. amber 카운트 1건 (active dot). */}
      <View
        style={[styles.dotsWrap, { bottom: insets.bottom + 40 }]}
        pointerEvents="none"
      >
        {STEPS.map((s) => {
          const idx = STEP_INDEX[s];
          return (
            <Dot key={s} active={idx === stepIdx} passed={idx < stepIdx} />
          );
        })}
      </View>
    </Animated.View>
  );
}

function Dot({ active, passed }: { active: boolean; passed: boolean }) {
  const width = useSharedValue(active ? 18 : 6);
  const color = useSharedValue(
    active ? 1 : passed ? 0.5 : 0, // 1=accent, 0.5=textMuted, 0=borderSubtle
  );

  useEffect(() => {
    width.value = withTiming(active ? 18 : 6, {
      duration: DOT_DURATION,
      easing: DOT_EASING,
    });
    color.value = withTiming(active ? 1 : passed ? 0.5 : 0, {
      duration: DOT_DURATION,
      easing: DOT_EASING,
    });
  }, [active, passed, width, color]);

  const dotStyle = useAnimatedStyle(() => {
    // tokens 가 `as const` 라 literal 타입이 좁게 잡혀 reassign 시 TS2322.
    // worklet 안에서 string 으로 우선 캐스팅 후 분기.
    let bg: string = colors.borderSubtle;
    if (color.value > 0.75) bg = colors.accent;
    else if (color.value > 0.25) bg = colors.textMuted;
    return {
      width: width.value,
      height: 6,
      backgroundColor: bg,
      borderRadius: 9999,
    };
  });
  return <Animated.View style={dotStyle} />;
}

const styles = StyleSheet.create({
  // root — zIndex 보유. 자식 dim 배경 + UI 요소가 이 안에 배치.
  dimRoot: {
    zIndex: 50,
  },
  // dim 배경 — 별도 Animated.View 로 분리하여 drag 중 opacity 0 토글.
  // 03_p1-1#3: overlayHeavy(0.85) → overlay(0.7) 톤 다운.
  dim: {
    backgroundColor: colors.overlay,
  },
  skipWrap: {
    position: 'absolute',
    right: spacing.sm + 4,
    // top: insets.top + lg — inline 으로 적용 (노치 안전 마진)
  },
  skipBtn: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    // 03_p1-1#1: 약한 pill 백판 — surface 70% (dim 위 가독성 확보).
    backgroundColor: 'rgba(26, 25, 22, 0.7)',
  },
  skipText: {
    // 03_p1-1#1: dataReg(Geist Mono — 한글 폴백 깨짐) → fontsV2.body
    // (= undefined → RN system font, iOS San Francisco. 한글 가독성 우수).
    // size 12→13, color textSecondary→textPrimary 로 시인성 승격.
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: fontsV2.body,
    fontWeight: '500',
  },
  stepNumberWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  stepNumber: {
    // 03_p1-1#5: textMuted → accent (amber). web tut-step-label 정합.
    // transient overlay 카운트 제외 정책 (DESIGN L34) — amber 안전.
    color: colors.accent,
    fontSize: 11,
    fontFamily: fonts.data,
    letterSpacing: 1.5,
  },
  bodyWrap: {
    // 2026-06-04 통합: 풀사이즈 데모 카드 대응. Demo 컴포넌트가 자체 absoluteFill 로
    // 카드/화살표/카피 영역을 절대 위치 배치. center 정렬은 각 Demo 의 자식 요소
    // (안내 카피, 화살표) 가 개별로 처리. 부모는 단순 fill 컨테이너만 제공.
    ...StyleSheet.absoluteFillObject,
  },
  dotsWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
