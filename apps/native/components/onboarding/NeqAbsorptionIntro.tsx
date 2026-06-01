import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  cancelAnimation,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * neq, 흡수 인트로 (NeqAbsorptionIntro)
 *
 * Onboarding Welcome 화면 진입 시 1.3s 동안 1회 재생되는 브랜드 흡수 모션.
 * MOTION-SPEC.md `Deliverable 02 — Absorption` 정확 포팅.
 *
 * 4 레이어 (Reanimated worklet, 단일 cycle, cleanup 보장):
 *   1. comma  — 좌측 중앙 (0%) → 우측 wordmark 컴마 위치 (80%) 로 travel + scale-down.
 *               0–250ms: breath peak (37.3% scale @117ms)
 *               250–800ms: cinematic ease-in-out, scale 36.2% → 22.3%, x 0.50→0.89 (정규화)
 *               800–1000ms: lock-in (overshoot 21.1% → 21.3%)
 *   2. letter-n — 400ms 지연 진입, 60ms 페이드+슬라이드 (-12px → 0)
 *   3. letter-e — 480ms 지연 (80ms stagger)
 *   4. letter-q — 560ms 지연 (160ms stagger)
 *
 * onComplete 콜백: 흡수 종료 (1300ms) 후 1회 호출.
 *
 * 안전 패턴:
 *   - 메모리 `feedback_reanimated_fabric_crash` — 무한 worklet × Fabric SIGABRT 위험 회피:
 *     모든 sharedValue 가 1 cycle (loop X). useEffect cleanup 에서 cancelAnimation.
 *   - 메모리 `feedback_root_layout_dual_tree_cycle` — leaf 컴포넌트로 isolated.
 *     부모 (Welcome) 가 절대 토글하지 않음 (props 변경 0). onComplete 후에도 mount 유지.
 *   - reduced motion — useReducedMotion=true 면 모든 sharedValue 즉시 종료 상태로 set.
 *
 * MOTION-SPEC 정합:
 *   - comp 300×133 비율 ≈ 2.26:1 (wordmark aspect 와 동일)
 *   - 컴마 위치 (151.9, 69.3) 시작 → (267.9, 97.3) 종료 (정규화 좌표 0.506 → 0.893)
 *   - 컴마 scale 36.2% → 21.3% (정규화 1.0 → 0.589)
 *
 * 통합 위치:
 *   `OnboardingStepWelcome.tsx` — wordmark Image 자리에 본 컴포넌트 노출.
 *   1.3s 종료 후 정적 wordmark 로 fade-out 없이 그대로 자리잡음 (letter+comma 모두
 *   final position 에 lock-in 된 상태라 추가 swap 불필요).
 */

const TOTAL_MS = 1300;

// letter fade-in: gentle ease-out (MOTION-SPEC 정합)
const easeOutLetter = Easing.bezier(0.25, 0.1, 0.25, 1);

interface Props {
  /** 흡수 1.3s 완료 시 호출 (1회). reduced motion 일 때도 즉시 호출. */
  onComplete?: () => void;
  /** wordmark 박스 width — Welcome 의 logo width 와 동일하게 받음. */
  width: number;
  /** wordmark 박스 height. */
  height: number;
}

export default function NeqAbsorptionIntro({ onComplete, width, height }: Props) {
  const reduced = useReducedMotion();

  // 컴마: progress 0..1 (0=시작, 1=lock-in 종료)
  // MOTION-SPEC keyframes 와 동일 시간 비율로 보간:
  //   0%       → t=0 (breath peak 직전)
  //   ~9%      → t=117/1300 = 0.090 breath peak
  //   ~19%     → t=250/1300 = 0.192 breath return
  //   ~62%     → t=800/1300 = 0.615 travel 종료
  //   ~77%     → t=1000/1300 = 0.769 lock-in 종료 (이후 hold)
  const commaProgress = useSharedValue(0);

  // letter sublayer (n=400ms, e=480ms, q=560ms) — 각 60ms 페이드+슬라이드
  const letterN = useSharedValue(0);
  const letterE = useSharedValue(0);
  const letterQ = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      // reduced motion: 모든 값 즉시 최종 상태. fire onComplete 즉시.
      commaProgress.value = 1;
      letterN.value = 1;
      letterE.value = 1;
      letterQ.value = 1;
      onComplete?.();
      return;
    }

    // 컴마 — 1 cycle, 단일 withSequence:
    //   breath (peak @ 9%, return @ 19%) → travel (~62%) → lock-in (~77%) → hold
    //   하지만 worklet 에선 multi-keyframe 보다 단일 progress 0→1 + interpolate 가 안정.
    //   여기서는 TOTAL_MS 동안 0→1 단일 timing, useAnimatedStyle 에서 구간별 interpolate.
    commaProgress.value = withTiming(1, {
      duration: TOTAL_MS,
      easing: Easing.linear, // 구간별 곡선은 useAnimatedStyle 의 interpolate 가 처리
    });

    // letter fade-in: delay 후 60ms 페이드+슬라이드
    letterN.value = withDelay(400, withTiming(1, { duration: 60, easing: easeOutLetter }));
    letterE.value = withDelay(480, withTiming(1, { duration: 60, easing: easeOutLetter }));
    letterQ.value = withDelay(560, withTiming(1, { duration: 60, easing: easeOutLetter }));

    // onComplete fire — 메인 흡수 종료 (1200ms) 후 100ms 안전 마진
    const timer = setTimeout(() => {
      onComplete?.();
    }, TOTAL_MS);

    return () => {
      clearTimeout(timer);
      cancelAnimation(commaProgress);
      cancelAnimation(letterN);
      cancelAnimation(letterE);
      cancelAnimation(letterQ);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  // MOTION-SPEC 정규화:
  //   comp 300×133, 컴마 위치 시작 (151.9, 69.3) → 종료 (267.9, 97.3)
  //   x 정규화: 151.9/300 = 0.506 → 267.9/300 = 0.893
  //   y 정규화: 69.3/133 = 0.521 → 97.3/133 = 0.732
  //   따라서 wordmark 박스 (width×height) 안에서 동일 비율로 translate.
  //
  //   시작 위치 (정규화):    cx_start = 0.506 → translateX = (0.506 - 0.5) * width = 0.006 * width
  //                          cy_start = 0.521 → translateY = (0.521 - 0.5) * height = 0.021 * height
  //   종료 위치 (정규화):    cx_end = 0.893 → translateX = (0.893 - 0.5) * width = 0.393 * width
  //                          cy_end = 0.732 → translateY = (0.732 - 0.5) * height = 0.232 * height
  //
  //   하지만 letter 자산도 692×306 풀 캔버스이므로, comma 도 풀 캔버스 (width×height) 로
  //   띄우고 컴마 위치는 자산 내부에 이미 박힌 위치 그대로 → translate 0, scale 변동만.
  //   즉, comma 자산 = wordmark 와 동일 캔버스 (692×306) 에 컴마만 그려진 형태.
  //   그래서 wordmark 전체와 같은 박스에 absolute fill 로 깔면 컴마는 자연스럽게 wordmark
  //   내 컴마 위치에 자리잡는다 (자산이 이미 그 위치를 가리킴).
  //
  //   wait — comma.png 는 692×306 이 아닐 수 있다. 확인 필요.
  //   `comma.png` 는 _neq-design-review 의 neq-comma-dramatic.png 이고 220×392 (MOTION-SPEC L17).
  //   그래서 comma 는 별도 박스 + travel 로 처리. letter 자산은 692×306 풀 캔버스 그대로 깔면 됨.
  //
  //   comma 박스: width×height 의 ~36% (MOTION-SPEC 시작 scale 36.2%). 박스를 wordmark 박스에
  //   absolute 로 띄우고 anchor center 로 translate.
  //
  // 구간별 보간 (단일 progress 0→1 기준, TOTAL_MS=1300):
  //   - breath: 0 → 0.09 → 0.19 → 0.62 (scale 36.2% → 37.3% → 36.2% → 22.3%)
  //   - travel: 0.19 → 0.62 (x_norm 0.006 → 0.393, y_norm 0.021 → 0.232)
  //   - lock-in: 0.62 → 0.77 (scale 22.3% → 21.1% → 21.3%)
  //   - hold: 0.77 → 1.0 (정적)
  // comma 박스 — wordmark 박스 width 기준 36% 가 시작 visual scale 이므로
  //   commaBoxW = width * 0.36
  //   commaBoxH = commaBoxW * (392 / 220)  (자산 비율 220×392)
  // useAnimatedStyle 의 worklet 이 capture 할 때 JS scope 의 값으로 고정.
  const commaBoxW = width * 0.36;
  const commaBoxH = commaBoxW * (392 / 220);

  const commaStyle = useAnimatedStyle(() => {
    const p = commaProgress.value;

    // commaBox 의 좌상단이 wordmark box (0,0) 에 있는 상태가 base.
    // 컴마 *중심* 의 정규화 좌표 (cx_norm, cy_norm) 를 따라가게 하려면:
    //   translateX = cx_norm * width - commaBoxW / 2
    //   translateY = cy_norm * height - commaBoxH / 2
    //
    // 단계:
    //   start (0 ~ 0.19): cx 0.506, cy 0.521  (breath, no travel)
    //   travel (0.19 ~ 0.62): cx 0.506 → 0.893, cy 0.521 → 0.732
    //   end (0.62 ~ 1.0): cx 0.893, cy 0.732 (lock-in + hold)
    const txStart = 0.506 * width - commaBoxW / 2;
    const tyStart = 0.521 * height - commaBoxH / 2;
    const txEnd = 0.893 * width - commaBoxW / 2;
    const tyEnd = 0.732 * height - commaBoxH / 2;

    const tx = interpolate(
      p,
      [0, 0.19, 0.62, 1],
      [txStart, txStart, txEnd, txEnd],
    );
    const ty = interpolate(
      p,
      [0, 0.19, 0.62, 1],
      [tyStart, tyStart, tyEnd, tyEnd],
    );

    // scale: 36.2% → breath 37.3% @0.09 → 36.2% @0.19 → 22.3% @0.62 → 21.1% @0.65 → 21.3% @0.77 → hold
    // 단순화: keyframe 6개 interpolate
    const scale = interpolate(
      p,
      [0, 0.09, 0.19, 0.62, 0.65, 0.77, 1],
      [0.362, 0.373, 0.362, 0.223, 0.211, 0.213, 0.213],
    );

    return {
      transform: [
        { translateX: tx },
        { translateY: ty },
        { scale },
      ],
    };
  });

  // letter style: 각 letter 의 opacity 0→1, translateX -12 → 0
  const letterNStyle = useAnimatedStyle(() => ({
    opacity: letterN.value,
    transform: [{ translateX: interpolate(letterN.value, [0, 1], [-12, 0]) }],
  }));
  const letterEStyle = useAnimatedStyle(() => ({
    opacity: letterE.value,
    transform: [{ translateX: interpolate(letterE.value, [0, 1], [-12, 0]) }],
  }));
  const letterQStyle = useAnimatedStyle(() => ({
    opacity: letterQ.value,
    transform: [{ translateX: interpolate(letterQ.value, [0, 1], [-12, 0]) }],
  }));

  return (
    <View
      style={[styles.container, { width, height }]}
      accessibilityLabel="neq,"
      accessibilityRole="image"
    >
      {/* letter 레이어 — 각각 692×306 풀 캔버스라 wordmark 박스에 absolute fill */}
      <Animated.View style={[styles.fill, letterNStyle]} pointerEvents="none">
        <Image
          source={require('../../assets/lottie/letter-n.png')}
          style={styles.letterImage}
          contentFit="contain"
          transition={0}
        />
      </Animated.View>
      <Animated.View style={[styles.fill, letterEStyle]} pointerEvents="none">
        <Image
          source={require('../../assets/lottie/letter-e.png')}
          style={styles.letterImage}
          contentFit="contain"
          transition={0}
        />
      </Animated.View>
      <Animated.View style={[styles.fill, letterQStyle]} pointerEvents="none">
        <Image
          source={require('../../assets/lottie/letter-q.png')}
          style={styles.letterImage}
          contentFit="contain"
          transition={0}
        />
      </Animated.View>

      {/* comma 레이어 — 별도 박스로 travel + scale.
          base position = (0,0). 박스 *중심* 이 wordmark box 의 (cx*w, cy*h) 좌표에
          위치하도록 commaStyle 의 translateX/Y 가 (cx*w - commaBoxW/2, cy*h - commaBoxH/2) 를 적용. */}
      <Animated.View
        style={[
          styles.commaWrap,
          {
            width: commaBoxW,
            height: commaBoxH,
          },
          commaStyle,
        ]}
        pointerEvents="none"
      >
        <Image
          source={require('../../assets/lottie/comma.png')}
          style={styles.commaImage}
          contentFit="contain"
          transition={0}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  letterImage: {
    width: '100%',
    height: '100%',
  },
  commaWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  commaImage: {
    width: '100%',
    height: '100%',
  },
});
