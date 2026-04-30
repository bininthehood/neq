import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import Animated, {
  useDerivedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, spacing, fonts, fontSizePx, durations, easings } from '../../lib/tokens';
import { updateNotificationPrefs } from '../../lib/store';
import { NOTIF_OPTIONS, type NotifOption } from './data';

/**
 * Onboarding V2 — Step 5: Notify (native).
 *
 * DECISIONS.md #23 + 사용자 confirm Q4=A:
 *  - native 환경에서는 Web Push subscription 발급을 하지 않는다.
 *  - 토글 자체는 활성 — account_prefs.notificationPrefs 에 저장하여 추후 iOS 출시 시
 *    native push 인프라 재가동되면 자동 적용. 사용자 도중 종료해도 보존.
 *  - 화면에는 "iOS 출시 후 활성화" 안내 라벨을 명시한다.
 *
 * 디자인 산출물 StepNotif (iOS-style switch) 매핑.
 */

interface Props {
  onNext: () => void;
}

type Settings = Record<NotifOption['id'], boolean>;

function defaultSettings(): Settings {
  return Object.fromEntries(
    NOTIF_OPTIONS.map((n) => [n.id, n.defaultOn]),
  ) as Settings;
}

const easingSpring = Easing.bezier(...easings.spring);

export default function OnboardingStepNotify({ onNext }: Props) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [submitting, setSubmitting] = useState(false);

  const toggle = (id: NotifOption['id']) => {
    setSettings((s) => ({ ...s, [id]: !s[id] }));
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    // 1. 4종 토글 → account_prefs.notificationPrefs 즉시 저장.
    //    native 는 push subscription 발급 X (DECISIONS.md #23) — pushSubscription 은 변경 X.
    await updateNotificationPrefs((prev) => ({
      ...prev,
      weeklyRec: settings.weeklyRec,
      newRelease: settings.newRelease,
      ottExpiry: settings.ottExpiry,
      monthlyReport: settings.monthlyReport,
    }));
    setSubmitting(false);
    onNext();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.heading}>어떤 알림을 받을까요?</Text>
        <Text style={styles.subtitle}>나중에 설정에서 언제든 바꿀 수 있어요</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
        {NOTIF_OPTIONS.map((n) => {
          const on = settings[n.id];
          return (
            <Pressable
              key={n.id}
              onPress={() => toggle(n.id)}
              style={styles.row}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{n.title}</Text>
                <Text style={styles.rowDesc}>{n.desc}</Text>
              </View>
              <Switch on={on} />
            </Pressable>
          );
        })}

        <Text style={styles.notice}>
          ※ iOS 출시 후 알림이 활성화됩니다. 지금 설정하면 출시 시점에 자동 적용돼요.
        </Text>
      </ScrollView>

      <View style={styles.ctaWrap}>
        <Pressable
          onPress={submit}
          disabled={submitting}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: colors.accent, opacity: pressed || submitting ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.ctaLabel, { color: colors.bg }]}>
            {submitting ? '준비 중...' : '시작하기'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Switch({ on }: { on: boolean }) {
  // 0..1 progress for thumb position + bg color
  const progress = useDerivedValue(() =>
    withTiming(on ? 1 : 0, { duration: durations.quick, easing: easingSpring }),
  );

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: progress.value > 0.5 ? colors.accent : colors.border,
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * 18 }],
  }));

  return (
    <Animated.View style={[styles.track, trackStyle]}>
      <Animated.View style={[styles.thumb, thumbStyle]} />
    </Animated.View>
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
    paddingHorizontal: 28,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowText: { flex: 1 },
  rowTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
  },
  rowDesc: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  track: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 2,
  },
  thumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  notice: {
    marginTop: spacing.md,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 17,
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
