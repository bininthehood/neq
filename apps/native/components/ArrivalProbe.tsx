import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { Recommendation } from '../lib/types';
import { track } from '../lib/analytics';
import { fetchForeignAvailability } from '../lib/api';
import { hasNotified, markNotified } from '../lib/arrival-probe';
import { colors, radius, spacing } from '../lib/tokens';

/**
 * ArrivalProbe (native) — 미서비스(KR provider 0) 상세의 입고 알림 프로브.
 *
 * web `apps/web/src/components/discover/detail/ArrivalProbe.tsx` 정합.
 * 계측 전용 (실발송 없음). 타국 pill = 3s 타임아웃 + abort. 버튼은 라이브 콜과
 * 무관하게 즉시 노출. 탭 시 track + AsyncStorage 저장 + "알림 신청됨" 전환.
 *
 * 부모(DetailSheet)가 flag(isArrivalProbeEnabled) + watchProviders.length===0 게이팅.
 * rec 당 remount 되도록 부모가 key 부여 → state/effect 자연 리셋.
 */

const FETCH_TIMEOUT_MS = 3000;

export function ArrivalProbe({ rec }: { rec: Recommendation }) {
  const mediaType = rec.type === 'movie' ? 'movie' : 'tv';
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([]);
  const [resolved, setResolved] = useState(false);
  const [notified, setNotified] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    hasNotified(rec.tmdbId, rec.type).then((v) => {
      if (!cancelled) setNotified(v);
    });
    return () => {
      cancelled = true;
    };
  }, [rec.tmdbId, rec.type]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let cancelled = false;

    fetchForeignAvailability(rec.tmdbId, rec.type, controller.signal)
      .then((list) => {
        if (!cancelled) setCountries(list);
      })
      .finally(() => {
        if (!cancelled) setResolved(true);
      });

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [rec.tmdbId, rec.type]);

  useEffect(() => {
    if (!resolved || shownRef.current) return;
    shownRef.current = true;
    track('arrival_probe_shown', {
      tmdb_id: rec.tmdbId,
      media_type: mediaType,
      pill_shown: countries.length > 0,
    });
  }, [resolved, countries.length, rec.tmdbId, mediaType]);

  function onNotifyTap() {
    if (notified) return;
    setNotified(true);
    markNotified(rec.tmdbId, rec.type);
    track('arrival_notify_tapped', {
      tmdb_id: rec.tmdbId,
      media_type: mediaType,
      foreign_countries: countries.map((c) => c.code).join(',') || null,
    });
  }

  return (
    <View style={styles.wrap}>
      {/* ux W1 — 캡션 삭제 (순한글 eyebrow DESIGN.md L109 위반, pill 자명 — web 정합).
          ux W2 — settle 전 pill row 높이 예약 skeleton. 타국 0/실패 시 collapse. */}
      {!resolved && !notified ? (
        <View style={styles.pillRowBlock} accessibilityElementsHidden>
          {[0, 1].map((i) => (
            <View key={i} style={styles.pillSkeleton} />
          ))}
        </View>
      ) : countries.length > 0 ? (
        <View style={styles.pillRowBlock}>
          {countries.map((c) => (
            <View key={c.code} style={styles.pill}>
              <Text style={styles.pillText}>{c.name}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Pressable
        onPress={onNotifyTap}
        disabled={notified}
        accessibilityRole="button"
        accessibilityState={{ disabled: notified, selected: notified }}
        accessibilityLabel={notified ? '입고 알림 신청됨' : '한국에 들어오면 알림 받기'}
        style={({ pressed }) => [
          styles.button,
          notified ? styles.buttonDone : styles.buttonIdle,
          pressed && !notified && { transform: [{ scale: 0.98 }] },
        ]}
      >
        <Text style={notified ? styles.buttonTextDone : styles.buttonTextIdle}>
          {notified ? '알림 신청됨' : '한국에 들어오면 알려드릴게요'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm + 4,
  },
  pillRowBlock: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: 10,
  },
  // pill 과 동일 높이(paddingVertical 5 + fontSize 12 lineHeight ≈ 27) 예약 — pop-in 시프트 방지
  pillSkeleton: {
    width: 56,
    height: 27,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    opacity: 0.5,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceRaised,
  },
  pillText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  button: {
    minHeight: 44,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIdle: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: 'rgba(196, 163, 90, 0.25)', // --accent-border
  },
  buttonDone: {
    backgroundColor: colors.surface,
  },
  buttonTextIdle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  buttonTextDone: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
});
