import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { getOTTIcon } from '@neq/core';
import { colors, spacing, fonts, fontSizePx } from '../../lib/tokens';
import { setSubscribedOtt } from '../../lib/store';
import { OTT_OPTIONS } from './data';
import { IconCheck } from '../Icons';

// OTT_OPTIONS.id → @neq/core providers 키 매핑.
// web `apps/web/src/components/onboarding/OnboardingStepOTT.tsx` 와 동일.
// 매칭 안 되면 short text placeholder 폴백.
const OTT_ICON_LOOKUP: Record<string, string> = {
  netflix: 'Netflix',
  tving: 'TVING',
  wavve: 'wavve',
  watcha: 'Watcha',
  disney: 'Disney Plus',
  apple: 'Apple TV Plus',
  coupang: 'Coupang Play',
};

interface Props {
  onNext: () => void;
  initialProviders?: number[];
}

export default function OnboardingStepOTT({
  onNext,
  initialProviders = [],
}: Props) {
  // 2026-06-11 — comingSoon OTT 는 initial state 에서 자동 제외 (재진입 시 안전).
  // 기존 사용자가 Coupang Play 선택 상태로 onboarding 재진입해도 자동 deselect.
  const [selected, setSelected] = useState<Set<number>>(() => {
    const comingSoonIds = new Set(
      OTT_OPTIONS.filter((o) => o.comingSoon).map((o) => o.providerId),
    );
    return new Set(initialProviders.filter((id) => !comingSoonIds.has(id)));
  });

  const toggle = (providerId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  };

  const submit = async () => {
    await setSubscribedOtt(Array.from(selected));
    onNext();
  };

  const skip = async () => {
    await setSubscribedOtt([]);
    onNext();
  };

  const hasSelection = selected.size > 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.heading}>어디서 보세요?</Text>
        <Text style={styles.subtitle}>
          구독 중인 OTT를 알려 주시면 지금 보실 수 있는 작품만 추천해요
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
        {OTT_OPTIONS.map((o) => {
          const on = selected.has(o.providerId);
          const isComingSoon = o.comingSoon === true;
          const lookupName = OTT_ICON_LOOKUP[o.id];
          const iconUrl = lookupName ? getOTTIcon(lookupName) : null;
          return (
            <Pressable
              key={o.id}
              onPress={() => {
                if (isComingSoon) return;
                toggle(o.providerId);
              }}
              accessibilityState={{ disabled: isComingSoon }}
              accessibilityLabel={
                isComingSoon ? `${o.name} (곧 지원)` : o.name
              }
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: on ? colors.surfaceRaised : colors.surface,
                  borderColor: on ? colors.accent : colors.border,
                  opacity: isComingSoon ? 0.5 : pressed ? 0.92 : 1,
                },
              ]}
            >
              {iconUrl ? (
                <View style={[styles.logo, { backgroundColor: colors.surfaceRaised }]}>
                  <Image
                    source={{ uri: iconUrl }}
                    style={styles.logoImage}
                    contentFit="contain"
                    transition={0}
                    accessibilityLabel={o.name}
                  />
                </View>
              ) : (
                <View style={[styles.logo, { backgroundColor: o.color }]}>
                  <Text style={styles.logoLabel}>{o.short}</Text>
                </View>
              )}
              <Text style={styles.rowName}>{o.name}</Text>
              {isComingSoon ? (
                <Text style={styles.comingSoonLabel}>곧 지원</Text>
              ) : (
                <View
                  style={[
                    styles.check,
                    {
                      backgroundColor: on ? colors.accent : 'transparent',
                      borderColor: on ? colors.accent : colors.border,
                    },
                  ]}
                >
                  {on && <IconCheck size={12} color={colors.bg} />}
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.ctaWrap}>
        <Pressable
          onPress={submit}
          disabled={!hasSelection}
          style={({ pressed }) => [
            styles.cta,
            {
              backgroundColor: hasSelection ? colors.accent : colors.surfaceRaised,
              opacity: pressed && hasSelection ? 0.85 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.ctaLabel,
              { color: hasSelection ? colors.bg : colors.textMuted },
            ]}
          >
            시작하기
          </Text>
        </Pressable>
        <Pressable onPress={skip} style={styles.skipBtn}>
          <Text style={styles.skipLabel}>나중에 설정</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  head: {
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
  },
  scroll: { flex: 1 },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: 28,
    height: 28,
  },
  logoLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  rowName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingSoonLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
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
  ctaLabel: { fontSize: 14, fontWeight: '600' },
  skipBtn: { alignItems: 'center', paddingVertical: 12 },
  skipLabel: { color: colors.textSecondary, fontSize: 12 },
});
