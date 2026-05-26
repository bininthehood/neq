import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import type { PersonaContext } from '@neq/core';
import { colors, fonts, fontSizePx, spacing } from '../../lib/tokens';

/**
 * Persona v2 - 컨텍스트 선택 (native).
 *
 * web `apps/web/src/components/onboarding/PersonaContextSelector.tsx` 대응.
 * 동일 spec: pill group × 2 (contentType + companion), 둘 다 선택 시 CTA 활성화.
 */

interface Props {
  onNext: (context: PersonaContext) => void;
  initial?: Partial<PersonaContext>;
}

const CONTENT_LABELS: Array<{
  value: PersonaContext['contentType'];
  label: string;
}> = [
  { value: 'movie', label: '영화' },
  { value: 'series', label: '시리즈' },
  { value: 'variety', label: '예능' },
];

const COMPANION_LABELS: Array<{
  value: PersonaContext['companion'];
  label: string;
}> = [
  { value: 'alone', label: '혼자' },
  { value: 'together', label: '같이' },
];

export default function PersonaContextSelector({ onNext, initial }: Props) {
  const [contentType, setContentType] = useState<
    PersonaContext['contentType'] | null
  >(initial?.contentType ?? null);
  const [companion, setCompanion] = useState<
    PersonaContext['companion'] | null
  >(initial?.companion ?? null);

  const ready = contentType !== null && companion !== null;

  const submit = () => {
    if (!ready) return;
    onNext({ contentType, companion });
  };

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>어떤 페르소나를 만들까요?</Text>
        <Text style={styles.subtitle}>기분이나 상황에 따라 따로 가질 수 있어요</Text>

        <Text style={styles.groupLabel}>콘텐츠 유형</Text>
        <View style={styles.pillRow} accessibilityRole="radiogroup">
          {CONTENT_LABELS.map((opt) => (
            <Pill
              key={opt.value}
              selected={contentType === opt.value}
              onPress={() => setContentType(opt.value)}
              label={opt.label}
            />
          ))}
        </View>

        <Text style={[styles.groupLabel, { marginTop: spacing.xl }]}>같이 보나요?</Text>
        <View style={styles.pillRow} accessibilityRole="radiogroup">
          {COMPANION_LABELS.map((opt) => (
            <Pill
              key={opt.value}
              selected={companion === opt.value}
              onPress={() => setCompanion(opt.value)}
              label={opt.label}
            />
          ))}
        </View>
      </ScrollView>

      <View style={styles.ctaWrap}>
        <Pressable
          onPress={submit}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityLabel="다음"
          accessibilityState={{ disabled: !ready }}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: ready ? colors.accent : colors.surfaceRaised },
            pressed && ready && styles.ctaPressed,
          ]}
        >
          <Text style={[styles.ctaLabel, { color: ready ? colors.bg : colors.textMuted }]}>
            다음
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Pill({
  selected,
  onPress,
  label,
}: {
  selected: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: selected ? colors.accent : colors.surface,
          borderColor: selected ? colors.accent : colors.border,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={[styles.pillLabel, { color: selected ? colors.bg : colors.textPrimary }]}>
        {label}
      </Text>
    </Pressable>
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
    marginBottom: spacing.sm + 2,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizePx.sm,
    lineHeight: 20,
    marginBottom: spacing.xl + 8,
  },
  groupLabel: {
    color: colors.textSecondary,
    fontSize: fontSizePx.sm,
    fontWeight: '500',
    marginBottom: spacing.sm + 2,
    letterSpacing: -0.1,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: {
    fontSize: fontSizePx.sm,
    fontWeight: '500',
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
    alignItems: 'center',
  },
  ctaPressed: { opacity: 0.85 },
  ctaLabel: { fontSize: 14, fontWeight: '600' },
});
