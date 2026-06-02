import { useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions, Animated, Easing } from 'react-native';
import Svg, { Defs, RadialGradient as SvgRadialGradient, Stop, Rect } from 'react-native-svg';
import { colors, spacing, fontsV2 } from '../../lib/tokens';
import { WORDMARK_ASPECT_RATIO } from './data';
import NeqAbsorptionIntro from './NeqAbsorptionIntro';

interface Props {
  onNext: () => void;
}

// 2026-06-01 4차 라운드 (working tree, 미커밋 — 후속 세션 인계)
// - NeqAbsorptionIntro: 정본 Lottie JSON 채택
// - Vignette 배경 svg + 정중앙 + 푸터 "CURATED · NEQ," + 메인 카피 제거 + CTA
// - 2026-06-01 Vignette amber glow 추가 — splash 스펙 (BRAND-EXTRAS-SPEC.md A)
//   "radial-gradient(...) + amber glow" 의 amber 레이어 누락분 보강.
// - 미해결: (1) splash native 자산 미적용 — prebuild --clean 필요
//          (2) 메인 카피 image 자산 처리 — splash crop 또는 디자이너 의뢰 잔여

export default function OnboardingStepWelcome({ onNext }: Props) {
  // useWindowDimensions — 회전/멀티태스킹 대응. 모듈 레벨 Dimensions.get 대신 hook 사용.
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const LOGO_WIDTH = SCREEN_W * 0.6;
  const LOGO_HEIGHT = LOGO_WIDTH / WORDMARK_ASPECT_RATIO;

  // RN Animated (not Reanimated) — 1회성 fade-in. native driver 안전 경로.
  // 메모리 feedback_reanimated_fabric_crash 영역 회피.
  const contentOpacity = useRef(new Animated.Value(0)).current;

  const handleIntroComplete = useCallback(() => {
    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 400,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [contentOpacity]);

  return (
    <View style={styles.wrap}>
      {/* Warm Vignette 배경 — splash 톤 정합 (BRAND-EXTRAS-SPEC.md A).
          base : radial-gradient(120% 90% at 50% 38%, #1c1813, #12110E 56%, #0c0b09)
          glow : amber #C4A35A 0.18 → 0 (워드마크 발산 효과)
          2 레이어 합성 = splash 자산과 같은 따뜻한 emission.
          정적 svg, worklet 0, leaf 추가만. */}
      <Svg
        width={SCREEN_W}
        height={SCREEN_H}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      >
        <Defs>
          <SvgRadialGradient
            id="welcomeVignette"
            cx={SCREEN_W * 0.5}
            cy={SCREEN_H * 0.38}
            rx={SCREEN_W * 1.2}
            ry={SCREEN_H * 0.9}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor="#1c1813" />
            <Stop offset="0.56" stopColor="#12110E" />
            <Stop offset="1" stopColor="#0c0b09" />
          </SvgRadialGradient>
          {/* amber glow — 워드마크 뒤에서 발산. cy 는 base 와 동일 (0.38) 로
              splash 의 focal point 유지. 반경은 작게 잡아 화면 전체가 amber 로
              물들지 않고 중앙에 집중되도록 한다. anti-slop: 네온/오버글로우 회피. */}
          <SvgRadialGradient
            id="welcomeAmberGlow"
            cx={SCREEN_W * 0.5}
            cy={SCREEN_H * 0.38}
            rx={SCREEN_W * 0.55}
            ry={SCREEN_W * 0.55}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor="#C4A35A" stopOpacity="0.18" />
            <Stop offset="0.6" stopColor="#C4A35A" stopOpacity="0.04" />
            <Stop offset="1" stopColor="#C4A35A" stopOpacity="0" />
          </SvgRadialGradient>
        </Defs>
        <Rect width={SCREEN_W} height={SCREEN_H} fill="url(#welcomeVignette)" />
        <Rect width={SCREEN_W} height={SCREEN_H} fill="url(#welcomeAmberGlow)" />
      </Svg>

      <View style={styles.body}>
        {/* 2026-06-01 NeqAbsorptionIntro — 4차 라운드 정본 Lottie.
            assets/lottie/neq-absorption.lottie.json (After Effects export, 300×133, 60fps, 78f ≈ 1.3s).
            이전 자체 Reanimated 키프레임의 디테일 차이 (easing / breath peak / overshoot / stagger)
            를 정본 JSON 그대로 재생해 해결.

            reduced motion 일 때 (iOS Settings > Accessibility > Reduce Motion):
              내부 useReducedMotion hook 이 정적 wordmark 이미지로 폴백 + 즉시 onComplete.

            onAnimationFinish → handleIntroComplete → heading/subtitle/CTA fade-in 400ms. */}
        <View style={[styles.logoBox, { width: LOGO_WIDTH, height: LOGO_HEIGHT }]}>
          {/* startDelayMs=180 — splash fade(250ms) 거의 종료 시점에 호흡 시작.
              splash 콤마 잔상 → Lottie frame 0 정적 콤마로 매끄럽게 이어진다.
              app/_layout.tsx 의 SplashScreen.setOptions duration 과 짝. */}
          <NeqAbsorptionIntro
            width={LOGO_WIDTH}
            height={LOGO_HEIGHT}
            startDelayMs={180}
            onComplete={handleIntroComplete}
          />
        </View>
      </View>

      {/* splash 자산 푸터 정합 — Geist Mono uppercase + letter-spacing. */}
      <Animated.View style={[styles.footer, { opacity: contentOpacity }]} pointerEvents="none">
        <Text style={styles.footerText}>CURATED · NEQ,</Text>
      </Animated.View>

      <Animated.View style={[styles.ctaWrap, { opacity: contentOpacity }]}>
        <Pressable onPress={onNext} style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}>
          <Text style={styles.ctaLabel}>시작하기</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  // body — 화면 정중앙 정렬. 워드마크 + heading + subtitle 한 묶음 수직 center.
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  // splash 정합 워드마크 박스 — width/height 인라인 (SCREEN_W * 0.6 / AR).
  // marginBottom — splash 자산의 워드마크-카피 간격 정합 (작게).
  logoBox: {
    marginBottom: 14,
  },
  // splash 자산 푸터 — 화면 하단 (CTA 위) Geist Mono uppercase + letter-spacing.
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 96,
    alignItems: 'center',
  },
  footerText: {
    color: colors.textMuted,
    fontFamily: fontsV2.data,
    fontSize: 11,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  ctaWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm + 4,
  },
  cta: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  ctaPressed: { opacity: 0.85 },
  ctaLabel: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '600',
  },
});
