import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, fonts, fontSizePx } from '../../lib/tokens';
import { setUserNickname } from '../../lib/user-prefs';

/**
 * Onboarding V2 — Step 2: Hello (native).
 *
 * 닉네임 입력. 빈 값 허용. 저장은 AsyncStorage (`neq_user_nickname`).
 */

interface Props {
  onNext: (nickname: string) => void;
  initialName?: string;
}

export default function OnboardingStepHello({ onNext, initialName = '' }: Props) {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();
  const hasValue = trimmed.length > 0;

  const submit = async () => {
    await setUserNickname(trimmed);
    onNext(trimmed);
  };

  const skip = async () => {
    await setUserNickname('');
    onNext('');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.body}>
        <Text style={styles.heading}>먼저, 어떻게 부를까요?</Text>
        <Text style={styles.subtitle}>리포트와 추천 메시지에 사용해요</Text>

        <View
          style={[
            styles.inputBox,
            { borderColor: hasValue ? colors.accentBorderLight : colors.border },
          ]}
        >
          <Text style={styles.inputLabel}>NAME · 이름</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="예: 민지"
            placeholderTextColor={colors.textMuted}
            maxLength={24}
            style={styles.input}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => { if (hasValue) submit(); }}
          />
        </View>

        <View style={styles.preview}>
          <Text style={styles.previewText}>
            “{hasValue ? trimmed : '○○○'} 님, 이번 주 한 편 어떠세요?”
          </Text>
        </View>
      </View>

      <View style={styles.ctaWrap}>
        <Pressable
          onPress={submit}
          disabled={!hasValue}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: hasValue ? colors.accent : colors.surfaceRaised },
            pressed && hasValue && styles.ctaPressed,
          ]}
        >
          <Text
            style={[styles.ctaLabel, { color: hasValue ? colors.bg : colors.textMuted }]}
          >
            다음
          </Text>
        </Pressable>
        <Pressable onPress={skip} style={styles.skipBtn}>
          <Text style={styles.skipLabel}>건너뛰기</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  body: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: spacing.xl,
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
    marginBottom: spacing.xl,
  },
  inputBox: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
  },
  inputLabel: {
    fontFamily: fonts.dataReg,
    fontSize: 9,
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  input: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '500',
    padding: 0,
  },
  preview: {
    marginTop: spacing.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.accentDim,
    borderRadius: 8,
  },
  previewText: {
    color: colors.textPrimary,
    fontFamily: fonts.displayReg,
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 21,
  },
  ctaWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm + 4,
    gap: spacing.sm,
  },
  cta: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  ctaPressed: { opacity: 0.85 },
  ctaLabel: { fontSize: 14, fontWeight: '600' },
  skipBtn: { alignItems: 'center', paddingVertical: 12 },
  skipLabel: { color: colors.textSecondary, fontSize: 12 },
});
