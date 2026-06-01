import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, fontsV2, fontSizePx } from '../../lib/tokens';
import { WORDMARK_ASPECT_RATIO } from './data';
import NeqAbsorptionIntro from './NeqAbsorptionIntro';

interface Props {
  onNext: () => void;
}

// logo 박스 = web 정본 64px height × wordmark aspect ratio.
const LOGO_HEIGHT = 64;
const LOGO_WIDTH = LOGO_HEIGHT * WORDMARK_ASPECT_RATIO;

export default function OnboardingStepWelcome({ onNext }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.body}>
        {/* 2026-06-01 NeqAbsorptionIntro — splash → welcome 진입 시 1.3s 흡수 모션.
            MOTION-SPEC.md Deliverable 02 정확 포팅:
              comma 0~250ms breath → 250~800ms travel + scale-down → 800~1000ms lock-in
              letter n@400ms / e@480ms / q@560ms stagger fade+slide
            종료 후 letter+comma 모두 final wordmark position 에 lock-in → 정적 wordmark
            로 자연 전이 (별도 image swap 불필요).

            reduced motion 일 때 (iOS Settings > Accessibility > Reduce Motion):
              내부 useReducedMotion hook 이 즉시 final 상태로 set → 정적 wordmark 즉시 노출. */}
        <View style={styles.logoBox}>
          <NeqAbsorptionIntro width={LOGO_WIDTH} height={LOGO_HEIGHT} />
        </View>
        <Text style={styles.heading}>오늘의 한 편을{'\n'}고르는 시간</Text>
        <Text style={styles.subtitle}>
          리스트 대신, 한 편씩.{'\n'}당신의 취향에 맞춰 매일 한 작품씩.
        </Text>
      </View>

      <View style={styles.ctaWrap}>
        <Pressable onPress={onNext} style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}>
          <Text style={styles.ctaLabel}>시작하기</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  // web 정본 OnboardingStepWelcome `<img className="h-16">` (64px) 매핑.
  // NeqAbsorptionIntro 의 width/height 박스를 감싸는 wrapper — marginBottom 만 담당.
  logoBox: {
    height: LOGO_HEIGHT,
    width: LOGO_WIDTH,
    marginBottom: spacing.xl,
  },
  heading: {
    color: colors.textPrimary,
    // 2026-05-18 Fix B — fontsV2.displayItalic (Instrument Serif Italic) 적용. web 정합.
    fontFamily: fontsV2.displayItalic,
    fontSize: 28,
    lineHeight: 32,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: spacing.md - 2,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizePx.sm + 1,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 280,
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
