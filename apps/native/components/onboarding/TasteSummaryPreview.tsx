import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SurveySummaryOutput } from '@neq/core';
import { colors, fonts, fontSizePx, spacing } from '../../lib/tokens';

/**
 * Persona v2 - 통합 요약 preview (native).
 *
 * web `apps/web/src/components/onboarding/TasteSummaryPreview.tsx` 대응.
 * 자연어 요약 + axes + 맞아요/다시 받기 CTA.
 */

interface Props {
  summary: SurveySummaryOutput;
  onAccept: () => void;
  onRetry: () => void;
}

export default function TasteSummaryPreview({
  summary,
  onAccept,
  onRetry,
}: Props) {
  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.heading}>이런 분이시군요</Text>
        <Text style={styles.subtitle}>맞으면 그대로, 아니면 다시 받을게요</Text>

        <View style={styles.quoteWrap}>
          <Text style={styles.quote}>{summary.tasteSummary}</Text>
        </View>

        {summary.axes.length > 0 ? (
          <View style={styles.axesCol}>
            {summary.axes.map((axis, idx) => (
              <View
                key={`${axis.name}-${idx}`}
                style={[
                  styles.axisRow,
                  idx === 0 && {
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    paddingTop: 14,
                  },
                ]}
              >
                <Text style={styles.axisName}>{axis.name.toUpperCase()}</Text>
                <Text style={styles.axisValue}>{axis.value}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.ctaWrap}>
        <Pressable
          onPress={onAccept}
          accessibilityRole="button"
          accessibilityLabel="맞아요"
          style={({ pressed }) => [
            styles.acceptCta,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.acceptLabel}>맞아요</Text>
        </Pressable>
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="다시 받기"
          style={({ pressed }) => [
            styles.retryCta,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.retryLabel}>다시 받기</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: {
    paddingHorizontal: 28,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  heading: {
    color: colors.textPrimary,
    fontFamily: fonts.displayReg,
    fontStyle: 'italic',
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizePx.sm,
    lineHeight: 20,
    marginBottom: spacing.xl - 4,
  },
  quoteWrap: {
    backgroundColor: colors.accentDim,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginBottom: spacing.lg,
  },
  quote: {
    color: colors.textPrimary,
    fontFamily: fonts.displayReg,
    fontStyle: 'italic',
    fontSize: 17,
    lineHeight: 27,
    letterSpacing: -0.2,
  },
  axesCol: {
    gap: 10,
  },
  axisRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm + 4,
  },
  axisName: {
    color: colors.textMuted,
    fontFamily: fonts.dataReg,
    fontSize: 11,
    letterSpacing: 1,
    minWidth: 96,
  },
  axisValue: {
    color: colors.textSecondary,
    fontSize: fontSizePx.sm,
    fontWeight: '500',
    flex: 1,
  },
  ctaWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm + 4,
    gap: spacing.sm,
  },
  acceptCta: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.accent,
  },
  acceptLabel: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '600',
  },
  retryCta: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  retryLabel: {
    color: colors.textSecondary,
    fontSize: fontSizePx.sm,
  },
});
