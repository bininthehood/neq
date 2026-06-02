import { useEffect, useRef } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import LottieView from 'lottie-react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * neq, 흡수 인트로 (NeqAbsorptionIntro) — 4차 라운드 (정본 Lottie)
 *
 * Onboarding Welcome 화면 진입 시 1회 재생되는 브랜드 흡수 모션.
 * 정본 자산: `assets/lottie/neq-absorption.lottie.json` (After Effects export, 300×133, 60fps, 78 frames ≈ 1.3s).
 *
 * 이전 라운드 (자체 Reanimated 키프레임) 의 디테일 차이 — easing, breath peak, overshoot,
 * letter stagger 정확도 — 를 정본 Lottie JSON 그대로 재생해 해결.
 *
 * onComplete 콜백: Lottie `onAnimationFinish` 시 1회 호출.
 *
 * 안전 패턴:
 *   - Lottie 는 단일 cycle (loop=false). worklet 미사용 → Fabric 무한재귀 위험 없음
 *     (메모리 `feedback_reanimated_fabric_crash` 회피).
 *   - reduced motion (iOS Settings > Accessibility > Reduce Motion) — 정적 wordmark 이미지
 *     폴백 + 즉시 onComplete 호출. MOTION-SPEC.md 'Reduced motion' 섹션 정합.
 *
 * 통합 위치:
 *   `OnboardingStepWelcome.tsx` — wordmark 자리에 본 컴포넌트 노출.
 *   onComplete (~1.3s) 후 heading/subtitle/CTA fade-in 400ms 트리거.
 */

interface Props {
  /** 흡수 종료 시 호출 (1회). reduced motion 일 때도 즉시 호출. */
  onComplete?: () => void;
  /** wordmark 박스 width — Welcome 의 logo width 와 동일하게 받음. */
  width: number;
  /** wordmark 박스 height. */
  height: number;
  /**
   * 재생 시작 지연 (ms). 기본 0.
   * splash → Welcome 자연 연결 용도 — splash fade out 동안 frame 0 (호흡 시작 전
   * 정적 콤마) 만 노출하다 fade 거의 종료 시점에 호흡/흡수 시작.
   * reduced motion 일 때는 이 prop 영향 없음 (즉시 onComplete).
   */
  startDelayMs?: number;
}

// 정본 Lottie 자산 (After Effects export).
// 확장자 `.lottie.json` 끝이 `.json` 이라 Metro bundler 가 JSON 으로 처리 가능.
const absorption = require('../../assets/lottie/neq-absorption.lottie.json');

// reduced motion 폴백용 정적 wordmark.
const STATIC_WORDMARK = require('../../assets/neq-logo.png');

export default function NeqAbsorptionIntro({ onComplete, width, height, startDelayMs = 0 }: Props) {
  const reduced = useReducedMotion();
  const lottieRef = useRef<LottieView>(null);

  useEffect(() => {
    if (reduced) {
      // reduced motion: Lottie 안 그리고 정적 wordmark + onComplete 즉시.
      onComplete?.();
      return;
    }
    // startDelayMs > 0 인 경우 autoPlay 대신 수동 트리거. mount 직후 frame 0 정적
    // 노출 → 지연 후 play() 호출 → 호흡 시작.
    if (startDelayMs > 0) {
      const timer = setTimeout(() => {
        lottieRef.current?.play();
      }, startDelayMs);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  if (reduced) {
    return (
      <View
        style={[styles.container, { width, height }]}
        accessibilityLabel="neq,"
        accessibilityRole="image"
      >
        <Image source={STATIC_WORDMARK} style={styles.fallback} resizeMode="contain" />
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { width, height }]}
      accessibilityLabel="neq,"
      accessibilityRole="image"
    >
      <LottieView
        ref={lottieRef}
        source={absorption}
        // startDelayMs > 0 면 autoPlay 끄고 useEffect 의 setTimeout 으로 수동 play.
        // 0 일 때는 기존 동작 (mount 직후 즉시 호흡) 유지.
        autoPlay={startDelayMs === 0}
        loop={false}
        speed={1}
        resizeMode="contain"
        style={{ width, height }}
        onAnimationFinish={() => onComplete?.()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  fallback: {
    width: '100%',
    height: '100%',
  },
});
