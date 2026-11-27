import { useRef, useCallback } from 'react';
import { View, StyleSheet, useWindowDimensions, Animated, Easing } from 'react-native';
import { Text } from '../Text';
import { Button } from '../Button';
import { colors, spacing, fontsV2 } from '../../lib/tokens';
import { WORDMARK_ASPECT_RATIO } from './data';
import NeqAbsorptionIntro from './NeqAbsorptionIntro';

interface Props {
  onNext: () => void;
}

// 2026-11-27 Night Pool — Quiet Ink 잔재 정리:
//   - 갈색 vignette + 앰버 glow SVG 제거 → 평평한 bg (DESIGN.md 워드마크: 글로우·그라디언트 금지).
//   - Lottie 워드마크는 아쿠아 재색칠본 (NeqAbsorptionIntro).
//   - 세리프 이탤릭 heading PNG → SUIT 900 텍스트 (세리프는 워드마크에만).
//   - 영문 푸터 "CURATED · NEQ," 제거 (영문 마케팅 카피 금지).

export default function OnboardingStepWelcome({ onNext }: Props) {
  // useWindowDimensions — 회전/멀티태스킹 대응. 모듈 레벨 Dimensions.get 대신 hook 사용.
  const { width: SCREEN_W } = useWindowDimensions();
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

        <Animated.View style={{ opacity: contentOpacity }}>
          <Text style={styles.heading}>당신의 취향을 발견하세요</Text>
        </Animated.View>
      </View>

      <Animated.View style={[styles.ctaWrap, { opacity: contentOpacity }]}>
        <Button label="시작하기" variant="primary" onPress={onNext} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
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
  // 한글 제목 SUIT 900 + 음수 자간 (DESIGN.md Typography 시그니처)
  heading: {
    fontFamily: fontsV2.title,
    fontSize: 22,
    lineHeight: 29,
    letterSpacing: -0.66,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  ctaWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm + 4,
  },
});
