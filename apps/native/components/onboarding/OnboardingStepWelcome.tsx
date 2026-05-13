import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, fonts, fontSizePx } from '../../lib/tokens';

interface Props {
  onNext: () => void;
}

export default function OnboardingStepWelcome({ onNext }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.body}>
        <Text style={styles.logo}>neq,</Text>
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
  logo: {
    color: colors.accent,
    fontSize: 40,
    fontFamily: fonts.display,
    letterSpacing: 1,
    marginBottom: spacing.xl,
  },
  heading: {
    color: colors.textPrimary,
    fontFamily: fonts.displayReg,
    fontStyle: 'italic',
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
