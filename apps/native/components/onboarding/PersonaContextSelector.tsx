import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import type { PersonaContext } from '@neq/core';
import { colors, fonts, fontSizePx, spacing } from '../../lib/tokens';

/**
 * Persona v2 - 컨텍스트 선택 (native).
 *
 * web `apps/web/src/components/onboarding/PersonaContextSelector.tsx` 대응.
 * 동일 spec: pill group × 2 (contentType + companion), 둘 다 선택 시 CTA 활성화.
 *
 * 2026-05-27 — 콘텐츠 유형 multi-select.
 * 사용자가 "영화도 보고 시리즈도 본다"는 의도를 표현할 수 있도록 단일 선택 → 다중 선택.
 * `PersonaContext.contentType` 은 packages/core 의 공유 타입(`'movie' | 'series' | 'variety'`)
 * 이라 단일 값 그대로 유지 — UI 가 다중 선택을 받되 첫 선택값만 onNext 로 전달.
 * 추가 선택값(`additionalContentTypes`)은 향후 서버 측 추천 모집단 union 확장 위한
 * 옵셔널 메타 정보. 현재는 클라이언트 단에서만 전송, 서버 처리는 followup.
 */

type ContentTypeValue = PersonaContext['contentType'];

interface Props {
  onNext: (
    context: PersonaContext,
    options?: { additionalContentTypes?: ContentTypeValue[] },
  ) => void;
  initial?: Partial<PersonaContext>;
}

const CONTENT_LABELS: Array<{
  value: ContentTypeValue;
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
  // 2026-05-27 — multi-select. 선택 순서를 유지 (Set 대신 array) — 첫 값이 primary contentType.
  const initialTypes: ContentTypeValue[] = initial?.contentType ? [initial.contentType] : [];
  const [contentTypes, setContentTypes] = useState<ContentTypeValue[]>(initialTypes);
  const [companion, setCompanion] = useState<
    PersonaContext['companion'] | null
  >(initial?.companion ?? null);

  const ready = contentTypes.length > 0 && companion !== null;

  const toggleContentType = (value: ContentTypeValue) => {
    setContentTypes((prev) => {
      if (prev.includes(value)) return prev.filter((v) => v !== value);
      return [...prev, value];
    });
  };

  const submit = () => {
    if (!ready) return;
    const [primary, ...rest] = contentTypes;
    onNext(
      { contentType: primary, companion },
      rest.length > 0 ? { additionalContentTypes: rest } : undefined,
    );
  };

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>어떤 페르소나를 만들까요?</Text>
        <Text style={styles.subtitle}>기분이나 상황에 따라 따로 가질 수 있어요</Text>

        <Text style={styles.groupLabel}>콘텐츠 유형 (복수 선택 가능)</Text>
        {/* 2026-05-27 — multi-select 칩.
            accessibilityRole 을 radiogroup → 일반 group 으로. 각 Pill 은
            checkbox role 로 변경해 SR 가 multi-select 임을 정확히 안내. */}
        <View
          style={styles.pillRow}
          accessibilityRole="none"
          accessibilityHint="여러 개를 선택할 수 있어요"
        >
          {CONTENT_LABELS.map((opt) => (
            <Pill
              key={opt.value}
              selected={contentTypes.includes(opt.value)}
              onPress={() => toggleContentType(opt.value)}
              label={opt.label}
              multiSelect
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
  multiSelect = false,
}: {
  selected: boolean;
  onPress: () => void;
  label: string;
  multiSelect?: boolean;
}) {
  // multi-select 시 checkbox role + checked state. single-select 는 기존 radio 유지.
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={multiSelect ? 'checkbox' : 'radio'}
      accessibilityState={multiSelect ? { checked: selected } : { selected }}
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
      {multiSelect && selected ? (
        <Text style={[styles.pillCheck, { color: colors.bg }]}>✓ </Text>
      ) : null}
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
  // 2026-05-27 — 다른 onboarding step (Hello/Taste/OTT/Notify) 과 시각언어 통일.
  // heading marginBottom: sm+2 (10) / subtitle marginBottom: xl (32) 로 정합.
  // 기존 xl+8 (40) 은 다른 step 보다 8px 더 떨어져 있어 어색했음.
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
    marginBottom: spacing.xl,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillCheck: { fontSize: 11 },
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
