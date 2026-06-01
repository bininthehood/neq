import { useEffect } from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  cancelAnimation,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { colors, fontSizePx } from '../../lib/tokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * ApertureBreathLoader — Loading C2 "Aperture Breath"
 *
 * BRAND-EXTRAS-SPEC.md §C 정확 포팅.
 * 렌즈 조리개 호흡 — 동심원 3겹 (38% / 56% / 74% diameter) + 중앙 빛점.
 * 콤마/스피너 없음. 검색·범용 대기 자리 기본.
 *
 * 사양:
 *   ring r1 (38%)  scale 0.92→1.04→0.92  opacity .5  → 1.0  → .5    delay 0ms
 *   ring r2 (56%)  scale 동일             opacity .15 → .30  → .15   delay 180ms
 *   ring r3 (74%)  scale 동일             opacity .08 → .16  → .08   delay 360ms
 *   center dot     scale 고정 1.0         opacity .55 → 1.0  → .55   delay 0ms
 *
 *   2.4s ease-in-out sinusoidal 무한 루프, seamless.
 *   ring stroke: rgba(196,163,90, .16~.5)  ← opacity 키프레임으로 modulate.
 *   dot: #C4A35A + fake glow (boxShadow / RN 미지원 → 다중 ring View로 흉내).
 *
 * 안전 패턴 (메모리 feedback_reanimated_fabric_crash 준수):
 *   - 4 sharedValue (ring1, ring2, ring3, dot) — 각각 0..1 progress.
 *   - withRepeat(REPEAT_CYCLES, true) — 무한 (-1) 회피. 1000 cycle ≈ 40분 후 정지.
 *     실사용에서 loader 가 40분 이상 떠 있을 가능성은 사실상 0. 정지 시 호흡 valley
 *     상태 (scale 0.92, opacity 하한) 로 자연 멈춤. 이후 화면 재진입 시 새 mount = 재시작.
 *   - cancelAnimation × 4 cleanup, 단일 useEffect, leaf 컴포넌트로 사용 (부모 mount 토글 없음).
 *   - 회피하는 위험: cloneShadowTreeWithNewPropsRecursive 무한재귀 SIGABRT (OrbitPoster 회피 패턴 정합).
 *
 * Reduced motion (useReducedMotion=true):
 *   - 모든 sharedValue 정지. ring scale 1.0, opacity 중간값 (.5/.3/.16/1.0) 고정.
 *   - 메시지는 그대로 표시.
 */

const CYCLE_MS = 2400;
const DELAY_R2 = 180;
const DELAY_R3 = 360;
// 무한 (-1) 회피. 1000 cycle × 2.4s ≈ 40분 — 실사용 영구 노출 확률 0%, valley 에서 정지.
const REPEAT_CYCLES = 1000;

// sinusoidal 근사 — sine easing 으로 호흡감 (BRAND-EXTRAS-SPEC: ease-in-out sinusoidal)
const easeBreath = Easing.inOut(Easing.sin);

interface Props {
  /** 메시지 슬롯 — undefined / "" 면 미노출. 기본 노출하려면 "취향을 살펴보는 중" 같은 값 전달. */
  message?: string;
  /** 컨테이너 정사각형 크기 (px). default 64. */
  size?: number;
}

export default function ApertureBreathLoader({ message, size = 64 }: Props) {
  const reduced = useReducedMotion();

  // 4 progress (0..1). 단일 cycle 0→1→0 reverse repeat.
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);
  const ring3 = useSharedValue(0);
  const dot = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      // 중간 상태 (호흡 peak 직전) 로 고정. interpolate 가 ring scale 1.0 / opacity 상한 부근 산출.
      ring1.value = 1;
      ring2.value = 1;
      ring3.value = 1;
      dot.value = 1;
      return;
    }

    // half cycle 1200ms 0→1, withRepeat(REPEAT_CYCLES, true) 가 reverse 자동 → 2.4s 1 cycle.
    const HALF = CYCLE_MS / 2;
    ring1.value = withRepeat(
      withTiming(1, { duration: HALF, easing: easeBreath }),
      REPEAT_CYCLES,
      true,
    );
    ring2.value = withDelay(
      DELAY_R2,
      withRepeat(withTiming(1, { duration: HALF, easing: easeBreath }), REPEAT_CYCLES, true),
    );
    ring3.value = withDelay(
      DELAY_R3,
      withRepeat(withTiming(1, { duration: HALF, easing: easeBreath }), REPEAT_CYCLES, true),
    );
    dot.value = withRepeat(
      withTiming(1, { duration: HALF, easing: easeBreath }),
      REPEAT_CYCLES,
      true,
    );

    return () => {
      // Reanimated 4 / Fabric SIGABRT 회피 — 모든 sharedValue 명시 cancel.
      cancelAnimation(ring1);
      cancelAnimation(ring2);
      cancelAnimation(ring3);
      cancelAnimation(dot);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  // 동심원 비율 — diameter 가 컨테이너 size 의 %.
  const d1 = size * 0.38;
  const d2 = size * 0.56;
  const d3 = size * 0.74;
  const dotD = size * 0.1; // 빛점 — 컨테이너의 10% (적정값, BRAND-EXTRAS-SPEC 명시 없음).
  const glowD = dotD * 2.6; // glow 흉내 — 빛점 2.6배 ring + 낮은 alpha.

  // scale 0.92↔1.04 (peak), opacity 키프레임은 ring 별 다름.
  const ring1Style = useAnimatedStyle(() => {
    const scale = interpolate(ring1.value, [0, 1], [0.92, 1.04]);
    const opacity = interpolate(ring1.value, [0, 1], [0.5, 1.0]);
    return { transform: [{ scale }], opacity };
  });
  const ring2Style = useAnimatedStyle(() => {
    const scale = interpolate(ring2.value, [0, 1], [0.92, 1.04]);
    const opacity = interpolate(ring2.value, [0, 1], [0.15, 0.3]);
    return { transform: [{ scale }], opacity };
  });
  const ring3Style = useAnimatedStyle(() => {
    const scale = interpolate(ring3.value, [0, 1], [0.92, 1.04]);
    const opacity = interpolate(ring3.value, [0, 1], [0.08, 0.16]);
    return { transform: [{ scale }], opacity };
  });
  const dotStyle = useAnimatedStyle(() => {
    const opacity = interpolate(dot.value, [0, 1], [0.55, 1.0]);
    return { opacity };
  });
  const glowStyle = useAnimatedStyle(() => {
    // glow 도 dot 호흡과 동기 — 0.15~0.35 범위. blur 미사용, alpha 낮은 ring 으로 흉내.
    const opacity = interpolate(dot.value, [0, 1], [0.15, 0.35]);
    return { opacity };
  });

  // ring stroke color — opacity 는 animated style 이 modulate. base color 는 amber.
  const ringBorder = 'rgba(196,163,90,1)';

  return (
    <View
      style={styles.wrap}
      accessibilityRole="progressbar"
      accessibilityLabel={message ?? 'Loading'}
    >
      <View style={[styles.canvas, { width: size, height: size }]}>
        {/* ring r3 — 가장 바깥, 가장 옅음 */}
        <Animated.View
          style={[
            styles.ring,
            ringBox(d3, ringBorder),
            ring3Style,
          ]}
          pointerEvents="none"
        />
        {/* ring r2 */}
        <Animated.View
          style={[
            styles.ring,
            ringBox(d2, ringBorder),
            ring2Style,
          ]}
          pointerEvents="none"
        />
        {/* ring r1 — 가장 안쪽, 가장 진함 */}
        <Animated.View
          style={[
            styles.ring,
            ringBox(d1, ringBorder),
            ring1Style,
          ]}
          pointerEvents="none"
        />
        {/* fake glow — dot 주변 옅은 amber halo (boxShadow 미지원 대체) */}
        <Animated.View
          style={[
            styles.glow,
            {
              width: glowD,
              height: glowD,
              borderRadius: glowD / 2,
              backgroundColor: colors.accent,
            },
            glowStyle,
          ]}
          pointerEvents="none"
        />
        {/* center dot */}
        <Animated.View
          style={[
            styles.dot,
            {
              width: dotD,
              height: dotD,
              borderRadius: dotD / 2,
              backgroundColor: colors.accent,
            },
            dotStyle,
          ]}
          pointerEvents="none"
        />
      </View>
      {message ? (
        <Text style={styles.message} accessibilityElementsHidden importantForAccessibility="no">
          {message}
        </Text>
      ) : null}
    </View>
  );
}

function ringBox(diameter: number, color: string): ViewStyle {
  return {
    width: diameter,
    height: diameter,
    borderRadius: diameter / 2,
    borderWidth: 1,
    borderColor: color,
  };
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  dot: {
    position: 'absolute',
  },
  glow: {
    position: 'absolute',
  },
  message: {
    marginTop: 12,
    fontSize: fontSizePx.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
