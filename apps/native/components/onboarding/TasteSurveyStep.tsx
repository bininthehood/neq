import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SurveyOption, SurveyStepOutput } from '@neq/core';
import { colors, fonts, fontSizePx, spacing } from '../../lib/tokens';

/**
 * Persona v2 - LLM 분기 질문 한 단계 (native).
 *
 * web `apps/web/src/components/onboarding/TasteSurveyStep.tsx` 대응.
 * 세로 리스트 4 옵션 + hairline border. 선택 시 accent color + underline.
 */

interface Props {
  step: 1 | 2 | 3;
  totalSteps: 2 | 3;
  output: SurveyStepOutput;
  onAnswer: (selectedOption: SurveyOption) => void;
}

export default function TasteSurveyStep({
  step,
  totalSteps,
  output,
  onAnswer,
}: Props) {
  const [selectedId, setSelectedId] = useState<SurveyOption['id'] | null>(null);

  const submit = () => {
    if (selectedId === null) return;
    const opt = output.options.find((o) => o.id === selectedId);
    if (opt) onAnswer(opt);
  };

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.heading}>{output.question}</Text>
          <Text
            style={styles.progress}
            accessibilityLabel={`설문 진행 ${step} / ${totalSteps}`}
          >
            {step} / {totalSteps}
          </Text>
        </View>

        {output.axisHint ? (
          <Text style={styles.axisHint}>{output.axisHint.toUpperCase()}</Text>
        ) : (
          <View style={styles.axisHintSpacer} />
        )}

        <View accessibilityRole="radiogroup" accessibilityLabel={output.question}>
          {output.options.map((opt, idx) => (
            <View
              key={opt.id}
              style={[
                styles.optionWrap,
                { borderTopWidth: 1, borderTopColor: colors.border },
                idx === output.options.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <OptionRow
                option={opt}
                selected={selectedId === opt.id}
                onSelect={() => setSelectedId(opt.id)}
              />
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.ctaWrap}>
        <Pressable
          onPress={submit}
          disabled={selectedId === null}
          accessibilityRole="button"
          accessibilityLabel="다음"
          accessibilityState={{ disabled: selectedId === null }}
          style={({ pressed }) => [
            styles.cta,
            {
              backgroundColor:
                selectedId !== null ? colors.accent : colors.surfaceRaised,
            },
            pressed && selectedId !== null && { opacity: 0.85 },
          ]}
        >
          <Text
            style={[
              styles.ctaLabel,
              { color: selectedId !== null ? colors.bg : colors.textMuted },
            ]}
          >
            다음
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function OptionRow({
  option,
  selected,
  onSelect,
}: {
  option: SurveyOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={option.label}
      style={({ pressed }) => [styles.optionRow, pressed && { opacity: 0.7 }]}
    >
      <View
        style={[
          styles.radioMark,
          { borderColor: selected ? colors.accent : colors.borderStrong },
        ]}
      >
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.optionTextCol}>
        <Text
          style={[
            styles.optionLabel,
            {
              color: selected ? colors.accent : colors.textPrimary,
              textDecorationLine: selected ? 'underline' : 'none',
            },
          ]}
        >
          {option.label}
        </Text>
        {option.hint ? <Text style={styles.optionHint}>{option.hint}</Text> : null}
      </View>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm + 4,
    marginBottom: spacing.sm,
  },
  heading: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: fonts.displayReg,
    fontStyle: 'italic',
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
  },
  progress: {
    color: colors.textMuted,
    fontFamily: fonts.dataReg,
    fontSize: 11,
    letterSpacing: 0.5,
    marginTop: 8,
  },
  axisHint: {
    color: colors.textMuted,
    fontFamily: fonts.dataReg,
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: spacing.xl,
  },
  axisHintSpacer: { marginBottom: spacing.xl },
  optionWrap: {},
  optionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 4,
    paddingVertical: 14,
    minHeight: 64,
  },
  radioMark: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  optionTextCol: { flex: 1, gap: 2 },
  optionLabel: {
    fontSize: fontSizePx.base,
    fontWeight: '500',
  },
  optionHint: {
    color: colors.textMuted,
    fontSize: fontSizePx.sm,
    lineHeight: 20,
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
  ctaLabel: { fontSize: 14, fontWeight: '600' },
});
