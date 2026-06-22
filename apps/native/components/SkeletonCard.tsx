import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { colors, radius, shadowsNative } from '../lib/tokens';
import { useReducedMotion } from '../hooks/useReducedMotion';

/**
 * SkeletonCard — Discover 로딩 카드 스켈레톤 (2026-06-22).
 *
 * 배경: 게이트 0 측정상 Discover first_card_p50 = 11.9s. 로딩 동안 빈 화면 노출이
 * 길어 이탈 유발. 첫 진입 / 필터 변경 로딩 시 ApertureBreathLoader (중앙 호흡) 대신
 * SwipeCard 윤곽을 그대로 모방한 스켈레톤을 노출해 "곧 카드가 온다" 인지 단서 제공.
 * 새로고침(origin='refresh')은 기존 ApertureBreathLoader 유지 — index.tsx 분기.
 *
 * 레이아웃 정합 — SwipeCard.tsx (CardInner) 1:1 모방:
 *   - 카드 컨테이너: 풀블리드 포스터 = 카드 자체 (top0 / bottom8 / left12 / right12,
 *     radius-xl, shadow-lg) → SwipeCard styles.card 동일.
 *   - top row: 카테고리 칩(좌) + 별점 칩(우).
 *   - bottom info: subtitle(year·titleEn) 라인 → title 라인 → meta(reason) 2라인 →
 *     OTT 칩 3개.
 *
 * DESIGN.md L224-228 스켈레톤 토큰 준수:
 *   - 배경 `--surface` (colors.surface), 펄스 요소 `--surface-raised` (colors.surfaceRaised).
 *   - 펄스 opacity 1 ↔ 0.4, 2s ease-soft (var(--ease-soft) = cubic-bezier(0.4,0,0.2,1)).
 *   - 각 요소 기본 radius 따름 (칩 radius-sm, 텍스트 라인 radius-sm, OTT 22×22 radius-sm).
 *
 * 안전 패턴 (메모리 feedback_reanimated_fabric_crash + ApertureBreathLoader 정합):
 *   - 단일 sharedValue (pulse) — 0..1 progress. 무한(-1) 회피.
 *   - withRepeat(REPEAT_CYCLES=1000, true) → 1000 cycle × 2s ≈ 33분 후 자연 정지.
 *     실사용 로더가 33분 이상 떠 있을 확률 0% (로딩은 11.9s p50). 정지 시 opacity
 *     valley(0.4) 고정.
 *   - cancelAnimation(pulse) cleanup, 단일 useEffect, leaf 컴포넌트(부모 mount 토글 없음).
 *   - 회피하는 위험: cloneShadowTreeWithNewPropsRecursive 무한재귀 SIGABRT.
 *
 * Reduced motion (useReducedMotion=true) — DESIGN.md L292:
 *   - pulse 정지. 정적 단색 surface (opacity 중간값 0.7 고정).
 */

// 무한(-1) 회피. 1000 cycle × 2s(half 1s × reverse) ≈ 33분 — 실사용 영구 노출 확률 0%.
const REPEAT_CYCLES = 1000;
const HALF_CYCLE_MS = 1000; // 0→1 1s, withRepeat reverse → 2s 1 cycle (DESIGN.md 2s).
// var(--ease-soft) cubic-bezier(0.4, 0, 0.2, 1) — easings.soft 가 없으면 직접.
const easeSoft = Easing.bezier(0.4, 0, 0.2, 1);

export default function SkeletonCard() {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      // 정적 단색 surface — 중간 opacity 고정.
      pulse.value = 0.5;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: HALF_CYCLE_MS, easing: easeSoft }),
      REPEAT_CYCLES,
      true,
    );
    return () => {
      // Reanimated 4 / Fabric SIGABRT 회피 — 명시 cancel.
      cancelAnimation(pulse);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  // opacity 1 ↔ 0.4 (DESIGN.md L226). reduced 시 pulse=0.5 → opacity 0.7 고정.
  const pulseStyle = useAnimatedStyle(() => {
    const opacity = interpolate(pulse.value, [0, 1], [0.4, 1.0]);
    return { opacity };
  });

  // bar(텍스트/칩 placeholder) 헬퍼 — surfaceRaised + pulse opacity.
  return (
    <View
      style={styles.card}
      accessibilityRole="progressbar"
      accessibilityLabel="추천을 준비하고 있어요"
      // DESIGN.md L219 — Skeleton: aria-busy 부모, 자식 aria-hidden.
      accessibilityState={{ busy: true }}
    >
      {/* top row — 카테고리 칩(좌) + 별점 칩(우) */}
      <View style={styles.topRow} pointerEvents="none">
        <Animated.View style={[styles.catChip, pulseStyle]} />
        <Animated.View style={[styles.ratingChip, pulseStyle]} />
      </View>

      {/* bottom info — subtitle / title / meta 2라인 / OTT 3칩 */}
      <View style={styles.bottomInfo} pointerEvents="none">
        <Animated.View style={[styles.subTitleBar, pulseStyle]} />
        <Animated.View style={[styles.titleBar, pulseStyle]} />
        <Animated.View style={[styles.metaBar, pulseStyle]} />
        <Animated.View style={[styles.metaBarShort, pulseStyle]} />
        <View style={styles.ottRow}>
          <Animated.View style={[styles.ottChip, pulseStyle]} />
          <Animated.View style={[styles.ottChip, pulseStyle]} />
          <Animated.View style={[styles.ottChip, pulseStyle]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // SwipeCard styles.card 정합 — 풀블리드, radius-xl, shadow-lg, bg surface.
  card: {
    position: 'absolute',
    top: 0,
    bottom: 8,
    left: 12,
    right: 12,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    ...shadowsNative.lg,
  },
  // SwipeCard topRow 정합 — top/left/right 14, space-between.
  topRow: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  // 카테고리 칩 placeholder — CatChip(~48×24) 근사, radius-sm.
  catChip: {
    width: 52,
    height: 24,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
  // 별점 칩 placeholder — RatingChip(~52×24) 근사, radius-sm.
  ratingChip: {
    width: 52,
    height: 24,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
  // SwipeCard bottomInfo 정합 — left/right 18, bottom 16.
  bottomInfo: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 16,
  },
  // subtitle(year·titleEn) — text-sm 한 줄, marginBottom 6 (SwipeCard subTitle 정합).
  subTitleBar: {
    width: '45%',
    height: 13,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    marginBottom: 8,
  },
  // title — text-2xl(28) 한 줄, marginBottom 10 (SwipeCard title 정합).
  titleBar: {
    width: '70%',
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    marginBottom: 12,
  },
  // meta(reason) — 2라인, lineHeight 18 (SwipeCard reason 정합).
  metaBar: {
    width: '85%',
    height: 13,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    marginBottom: 6,
  },
  metaBarShort: {
    width: '60%',
    height: 13,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    marginBottom: 14,
  },
  // OTT row — gap 6, 22×22 radius-sm (SwipeCard ottRow/ottChip 정합).
  ottRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  ottChip: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
});
