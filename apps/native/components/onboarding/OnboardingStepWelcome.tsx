import { useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions, Animated, Easing, Image } from 'react-native';
import Svg, { Defs, RadialGradient as SvgRadialGradient, Stop, Rect } from 'react-native-svg';
import { colors, spacing, fontsV2 } from '../../lib/tokens';
import { WORDMARK_ASPECT_RATIO } from './data';
import NeqAbsorptionIntro from './NeqAbsorptionIntro';

interface Props {
  onNext: () => void;
}

// 2026-06-01 4차 라운드 (b1b0d5a) — Lottie 정본 + Vignette amber glow + splash 자연 연결
// 2026-06-02 4-1차 — 4차 라운드 미해결 2건 close:
//   (1) splash 자산은 b1b0d5a 시점에 이미 콤마 단독 PNG (1024×1024, #12110E bg) 로 교체
//       완료. 시뮬레이터에 보이던 이전 자산은 native ios/ storyboard 재생성 미실행
//       (`prebuild --clean`) 때문. 자산 교체 불필요, native 동기화만 필요.
//   (2) 메인 카피 — 워드마크 직하단에 PNG 이미지 자산 '당신의 취향을 발견하세요'.
//       BRAND-EXTRAS-SPEC.md B (OG) 의 메인 카피 정합. Warm Vignette + Lottie +
//       footer "CURATED · NEQ," + CTA 는 b1b0d5a 그대로 유지 (롤백 금지).
//       fade-in 은 footer/CTA 와 같은 contentOpacity 에 묶여 Lottie 흡수 완료 후
//       한 묶음 등장.
//   왜 이미지: 한글 italic Serif 폰트가 시스템/Google Fonts 양쪽 가용성 매우 낮고,
//   iOS RN 의 fontStyle:'italic' + 한글 fallback 폰트 (Apple SD Gothic Neo,
//   italic variant 없음) 조합에서 syn-italic 신호 무시되는 케이스 다수 — Fraunces
//   Italic 등록 + skewX transform 시도 모두 사용자 검수 통과 실패.
//   해결: ImageMagick 으로 AppleSDGothicNeo + shear 10° + #EDEDEF + transparent
//   PNG @1x/@2x/@3x 사전 생성 → assets/welcome-heading*.png. RN Image 가 디바이스
//   scale 에 맞는 해상도 자동 선택. 폰트 fallback 무관 픽셀 보장.

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

        {/* 2026-06-02 4-1차 — 워드마크 직하단 PNG 자산.
            assets/welcome-heading.png (@2x/@3x 세트) — AppleSDGothicNeo + shear 10°
            + #EDEDEF transparent. RN Image 가 디바이스 scale 자동 선택.
            contentOpacity 그룹에 묶여 흡수 완료(~1.3s) + 400ms fade-in. */}
        <Animated.Image
          source={require('../../assets/welcome-heading.png')}
          style={[styles.heading, { opacity: contentOpacity }]}
          resizeMode="contain"
          accessibilityLabel="당신의 취향을 발견하세요"
        />
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
  // body — 화면 정중앙 정렬. 워드마크 + heading 한 묶음 수직 center.
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  // splash 정합 워드마크 박스 — width/height 인라인 (SCREEN_W * 0.6 / AR).
  // marginBottom — 워드마크 ↔ heading 간격. 디자인 정본 14px 정합.
  logoBox: {
    marginBottom: 14,
  },
  // heading — PNG 이미지 자산 박스 (welcome-heading.png).
  // @1x 271×26 / @2x 541×51 / @3x 819×75. logical size = 271×26.
  // resizeMode 'contain' + width/height 명시로 자동 scale-down 시 비율 보존.
  heading: {
    width: 271,
    height: 26,
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
