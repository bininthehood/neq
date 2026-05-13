import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  cancelAnimation,
  withTiming,
  withDelay,
  withSequence,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { colors, spacing, fonts, fontSizePx, easings } from '../../lib/tokens';
import { track } from '../../lib/analytics';
import { getActivePersona } from '../../lib/store';
import type { FavoriteMeta } from '../../lib/types';

/**
 * Onboarding V2 (D4a, native) — Bridge 화면.
 *
 * 5단계 완료 후 1.5초 (디자인 산출물 StepDone) 표시 후 Discover (`/`) 자동 전환.
 * web `apps/web/src/app/onboarding/complete/page.tsx` 와 동일한 시점/이벤트:
 *  - bridge_shown / bridge_completed 발사
 *  - 추천 prefetch 는 native 의 useRecommendations 가 첫 진입 시 알아서 처리하므로
 *    Bridge 단계에선 단순 시각 효과만 (web 의 sessionStorage prefetch 패턴은 native 에선 불필요).
 *
 * Q4=A: native push 발급 영역 X — 본 화면도 push 호출 0.
 *
 * 시각 패턴 (web 정본 globals.css `@keyframes bridge-orbit` + `bridge-pulse-glow` 포팅):
 *  - 중앙 amber pulse halo (scale 1↔1.15, opacity 0.5↔0.9, 2.4s loop)
 *  - 5장 포스터가 외곽 (반지름 100) → 중앙으로 converge + 페이드아웃 (3.6s loop, stagger 160ms)
 *  - 포스터 source: getActivePersona().favoritesMeta (최대 5장). 미가용 시 amber dot placeholder.
 */

const MIN_DISPLAY_MS = 1500;
const POSTER_RADIUS = 100;
const POSTER_COUNT = 5;
const ORBIT_DURATION_MS = 3600;
const ORBIT_STAGGER_MS = 160;
const PULSE_DURATION_MS = 2400;
const easingSpring = Easing.bezier(...easings.spring);
const easingEnter = Easing.bezier(...easings.enter);

interface OrbitPosterProps {
  meta: FavoriteMeta | null;
  index: number;
}

/**
 * Orbit 포스터 1장 — web `bridge-orbit` keyframe 포팅.
 *
 * 시작: (txStart, tyStart) + rotStart, scale 1, opacity 0.85
 * 60%:  중심 30% 위치 + rotation 30%, scale 0.85, opacity 0.6
 * 100%: (0, 0), rotation 0, scale 0.7, opacity 0 → 0% 로 점프 리셋 → 반복
 *
 * Reanimated worklet 으로 60fps 보장. JS 스레드 부하 없음.
 */
function OrbitPoster({ meta, index }: OrbitPosterProps) {
  const angle = (index / POSTER_COUNT) * Math.PI * 2 - Math.PI / 2;
  const txStart = Math.cos(angle) * POSTER_RADIUS;
  const tyStart = Math.sin(angle) * POSTER_RADIUS;
  const rotStart = (index % 2 === 0 ? 1 : -1) * (6 + index * 2);

  // 0 → 1 progress (반복). loop 가 reverse=false 라 매 사이클 0 에서 다시 시작.
  const progress = useSharedValue(0);

  useEffect(() => {
    // Bridge 는 1.5s 후 dismiss → 무한 loop 불필요. 1 cycle 충분.
    // 무한 loop + Reanimated cloneShadowTreeWithNewPropsRecursive 가 5 worklet
    // × 60fps × shadow tree clone 누적 = 메모리 폭증 → SIGABRT crash 발생함.
    progress.value = withDelay(
      index * ORBIT_STAGGER_MS,
      withTiming(1, { duration: ORBIT_DURATION_MS, easing: easingSpring }),
    );
    return () => {
      cancelAnimation(progress);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const animatedStyle = useAnimatedStyle(() => {
    // web keyframe 정확 포팅:
    //   0%   → 100% 외곽 위치, scale 1, opacity 0.85
    //   60%  → 30% 위치, scale 0.85, opacity 0.6
    //   100% → 0 위치, scale 0.7, opacity 0
    const p = progress.value;
    const tx = interpolate(p, [0, 0.6, 1], [txStart, txStart * 0.3, 0]);
    const ty = interpolate(p, [0, 0.6, 1], [tyStart, tyStart * 0.3, 0]);
    const rot = interpolate(p, [0, 0.6, 1], [rotStart, rotStart * 0.3, 0]);
    const scale = interpolate(p, [0, 0.6, 1], [1, 0.85, 0.7]);
    const opacity = interpolate(p, [0, 0.6, 1], [0.85, 0.6, 0]);
    return {
      opacity,
      transform: [
        { translateX: tx },
        { translateY: ty },
        { rotate: `${rot}deg` },
        { scale },
      ],
    };
  });

  return (
    <Animated.View
      style={[styles.poster, animatedStyle]}
      importantForAccessibility="no"
    >
      {meta?.posterUrl ? (
        <Image
          source={{ uri: meta.posterUrl }}
          style={styles.posterImage}
          contentFit="cover"
          transition={0}
        />
      ) : (
        // Fallback — amber dot. web 정본도 posterUrl 없으면 bg-surface 빈 박스.
        <View style={styles.posterFallback} />
      )}
    </Animated.View>
  );
}

export default function OnboardingCompleteScreen() {
  const navigatedRef = useRef(false);
  const mountedAtRef = useRef<number>(Date.now());
  const [favoritesMeta, setFavoritesMeta] = useState<FavoriteMeta[]>([]);

  // pulse-glow shared value — 0 ↔ 1
  const pulse = useSharedValue(0);

  useEffect(() => {
    track('bridge_shown');
    mountedAtRef.current = Date.now();

    // favoritesMeta 비동기 로드 — getActivePersona() 가 AsyncStorage 호출.
    // 로드 전엔 fallback (amber dot) 5개 표시 → 로드 후 포스터 교체. 시각 끊김 없음.
    (async () => {
      try {
        const persona = await getActivePersona();
        setFavoritesMeta(persona.favoritesMeta.slice(0, POSTER_COUNT));
      } catch {
        // 무시 — fallback dot 유지
      }
    })();

    // pulse-glow: Bridge 1.5s 동안 1 cycle 만. 무한 loop crash 회피.
    pulse.value = withSequence(
      withTiming(1, { duration: PULSE_DURATION_MS / 2, easing: easingEnter }),
      withTiming(0, { duration: PULSE_DURATION_MS / 2, easing: easingEnter }),
    );

    const timer = setTimeout(() => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      const wait = Date.now() - mountedAtRef.current;
      track('bridge_completed', {
        wait_duration_ms: wait,
        prefetch_completed: false, // native 는 별도 prefetch 안 함
      });
      router.replace('/');
    }, MIN_DISPLAY_MS);

    return () => {
      clearTimeout(timer);
      cancelAnimation(pulse);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pulse-glow: web `bridge-pulse-glow` keyframe 정확 포팅
  //   0%, 100% → opacity 0.5, scale 1
  //   50%      → opacity 0.9, scale 1.15
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.5, 0.9]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.15]) }],
  }));

  // 5개 슬롯 강제 생성 — meta 가 부족하면 null (fallback dot)
  const slots: (FavoriteMeta | null)[] = Array.from({ length: POSTER_COUNT }, (_, i) => favoritesMeta[i] ?? null);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView
        style={styles.wrap}
        edges={['top', 'bottom']}
        accessibilityLiveRegion="polite"
      >
        <View
          style={styles.center}
          accessibilityLabel="오늘의 한 편이 준비됐어요. 매일 자정에 새 큐레이션이 도착해요."
        >
          {/* Orbit + glow 컨테이너 — 포스터의 절대 배치 anchor */}
          <View style={styles.orbitArea}>
            {/* 중앙 amber pulse halo */}
            <Animated.View
              style={[styles.glow, pulseStyle]}
              importantForAccessibility="no"
            />
            {/* 5장 포스터 orbit */}
            {slots.map((meta, i) => (
              <OrbitPoster key={meta?.id ?? `slot-${i}`} meta={meta} index={i} />
            ))}
          </View>

          <Text style={styles.title} accessibilityRole="header">
            취향을 모아{'\n'}추천을 짜고 있어요
          </Text>
          <Text style={styles.subtitle}>매일 자정, 새 큐레이션이 도착해요</Text>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  // 포스터의 절대 배치 anchor — 288 = 포스터 radius(100) * 2 + 포스터 자체 88
  orbitArea: {
    width: 288,
    height: 288,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.accentDim,
    // shadow 로 halo 추가 (RN 은 radial-gradient 없으므로 shadow 로 대체)
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  poster: {
    position: 'absolute',
    width: 64,
    height: 96,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surfaceRaised,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.displayReg,
    fontStyle: 'italic',
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
    letterSpacing: -0.4,
    marginTop: spacing.xl,
    marginBottom: spacing.md - 4,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizePx.sm,
    lineHeight: 21,
    textAlign: 'center',
  },
});
