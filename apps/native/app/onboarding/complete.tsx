import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, spacing, fonts, fontSizePx, easings } from '../../lib/tokens';
import { track } from '../../lib/analytics';

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
 */

const MIN_DISPLAY_MS = 1500;
const easingEnter = Easing.bezier(...easings.enter);

export default function OnboardingCompleteScreen() {
  const navigatedRef = useRef(false);
  const mountedAtRef = useRef<number>(Date.now());

  const pulse = useSharedValue(0.8);

  useEffect(() => {
    track('bridge_shown');
    mountedAtRef.current = Date.now();

    pulse.value = withRepeat(
      withTiming(1, { duration: 1200, easing: easingEnter }),
      -1,
      true,
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

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.85 + pulse.value * 0.15 }],
  }));

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
          <Animated.View
            style={[styles.glow, pulseStyle]}
            // 시각 단서만 (pulse glow) — 스크린리더는 무시.
            importantForAccessibility="no"
          />

          <ActivityIndicator
            color={colors.accent}
            size="large"
            accessibilityLabel="추천 준비 중"
          />

          <Text style={styles.title} accessibilityRole="header">
            오늘의 한 편이{'\n'}준비됐어요
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
  glow: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.accentDim,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.displayReg,
    fontStyle: 'italic',
    fontSize: 28,
    lineHeight: 34,
    textAlign: 'center',
    letterSpacing: -0.5,
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
