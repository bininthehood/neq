import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getOTTLink, getOTTIcon, getPrimaryCountryName } from '@neq/core';
import type { Recommendation } from '../../lib/types';
import { env } from '../../lib/env';
import { addSaved, isSaved } from '../../lib/store';
import { track } from '../../lib/analytics';
import { colors, spacing, radius, fontSizePx } from '../../lib/tokens';

/**
 * Universal Link 진입 화면 — `https://<domain>/share/<id>?type=movie|series` 매칭.
 * web `apps/web/src/app/share/[id]/page.tsx` + `ShareClient.tsx` 정합.
 *
 * W7 자격증명 발급 후 (`associatedDomains`, `intentFilters`) 활성. 라우트 자체는 사전 등록.
 */
export default function ShareScreen() {
  const params = useLocalSearchParams<{ id: string; type?: string }>();
  const insets = useSafeAreaInsets();

  const tmdbId = Number(params.id);
  const type: 'movie' | 'series' = params.type === 'series' ? 'series' : 'movie';

  const [rec, setRec] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // hydrate — web fetchWork 동등. `/api/tmdb/hydrate` 는 Recommendation 풀 객체를 반환.
  useEffect(() => {
    if (!tmdbId || isNaN(tmdbId)) {
      setError('유효하지 않은 작품이에요');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${env.API_BASE_URL}/api/tmdb/hydrate?id=${tmdbId}&type=${type}`,
        );
        if (!res.ok) {
          if (!cancelled) {
            setError('작품을 찾지 못했어요');
            setLoading(false);
          }
          return;
        }
        const data = (await res.json()) as Recommendation;
        if (cancelled) return;
        setRec(data);
        setSaved(await isSaved(data.tmdbId));
        setLoading(false);
        track('share_viewed', { tmdb_id: data.tmdbId, title: data.title });
      } catch {
        if (!cancelled) {
          setError('네트워크 오류가 발생했어요');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tmdbId, type]);

  const handleSave = useCallback(async () => {
    if (!rec || saved) return;
    await addSaved(rec);
    setSaved(true);
    track('share_saved', { tmdb_id: rec.tmdbId, title: rec.title });
  }, [rec, saved]);

  const handleOpenProvider = useCallback(
    async (providerName: string, watchLink: string | null) => {
      if (!rec) return;
      const url =
        getOTTLink(providerName, rec.title, true) ||
        watchLink ||
        `https://www.google.com/search?q=${encodeURIComponent(providerName + ' ' + rec.title)}`;
      track('ott_link_clicked', {
        tmdb_id: rec.tmdbId,
        title: rec.title,
        provider: providerName,
        url,
        source: 'native_share',
      });
      try {
        const supported = await Linking.canOpenURL(url);
        if (supported) await Linking.openURL(url);
      } catch {
        /* OS 거부 — 무시 */
      }
    },
    [rec],
  );

  const handleGoDiscover = useCallback(() => {
    router.replace('/');
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    );
  }

  if (error || !rec) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.errorText}>{error ?? '작품을 찾지 못했어요'}</Text>
        <Pressable style={styles.errorButton} onPress={handleGoDiscover}>
          <Text style={styles.errorButtonText}>추천 보기</Text>
        </Pressable>
      </View>
    );
  }

  const meta = [
    getPrimaryCountryName(rec.country),
    rec.date?.slice(0, 4),
    rec.runtime ? `${rec.runtime}분` : null,
    rec.seasons ? `시즌 ${rec.seasons}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const heroSrc = rec.backdrop || rec.posterUrl;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          {heroSrc && (
            <Image
              source={{ uri: heroSrc }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={0}
            />
          )}
          <LinearGradient
            colors={['transparent', colors.bg]}
            locations={[0.4, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={[styles.heroBody, { paddingTop: insets.top + spacing.md }]}>
            <View style={styles.heroBadges}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>★ {rec.rating.toFixed(1)}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeTextMuted}>
                  {rec.type === 'series' ? '시리즈' : '영화'}
                </Text>
              </View>
            </View>
            <Text style={styles.title} numberOfLines={2}>
              {rec.title}
            </Text>
            {rec.titleEn !== rec.title && (
              <Text style={styles.titleEn}>{rec.titleEn}</Text>
            )}
            {!!meta && <Text style={styles.meta}>{meta}</Text>}
          </View>
        </View>

        {/* Credits */}
        {(rec.director || rec.cast.length > 0) && (
          <View style={styles.section}>
            {rec.director && (
              <Text style={styles.creditRow}>
                감독 <Text style={styles.creditValue}>{rec.director}</Text>
              </Text>
            )}
            {rec.cast.length > 0 && (
              <Text style={styles.creditRow}>
                출연 <Text style={styles.creditValue}>{rec.cast.slice(0, 4).join(', ')}</Text>
              </Text>
            )}
          </View>
        )}

        {/* Overview */}
        {!!rec.overview && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>줄거리</Text>
            <Text style={styles.overview}>{rec.overview}</Text>
          </View>
        )}

        {/* OTT */}
        {rec.providers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>시청 가능</Text>
            <View style={styles.providers}>
              {rec.providers.map((p) => {
                const iconUrl = getOTTIcon(p.name) ?? p.logoUrl;
                return (
                  <Pressable
                    key={p.name}
                    style={styles.provider}
                    onPress={() => handleOpenProvider(p.name, rec.watchLink ?? null)}
                  >
                    {iconUrl && (
                      <Image
                        source={{ uri: iconUrl }}
                        style={styles.providerIcon}
                        contentFit="contain"
                      />
                    )}
                    <Text style={styles.providerName}>{p.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={[styles.actions, { marginHorizontal: spacing.lg }]}>
          <Pressable
            style={[styles.actionPrimary, saved && styles.actionDisabled]}
            onPress={handleSave}
            disabled={saved}
          >
            <Text style={[styles.actionPrimaryText, saved && styles.actionDisabledText]}>
              {saved ? '저장됨' : '내 리스트에 저장'}
            </Text>
          </Pressable>
          <Pressable style={styles.actionSecondary} onPress={handleGoDiscover}>
            <Text style={styles.actionSecondaryText}>추천 더 보기</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  errorText: { color: colors.textMuted, fontSize: fontSizePx.base },
  errorButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  errorButtonText: { color: colors.textPrimary, fontWeight: '600' },
  hero: { height: 480, position: 'relative', overflow: 'hidden' },
  heroBody: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.md,
  },
  heroBadges: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  badgeText: { color: colors.accent, fontWeight: '600', fontSize: fontSizePx.sm },
  badgeTextMuted: { color: colors.textMuted, fontSize: fontSizePx.sm },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: '700' },
  titleEn: { color: colors.textMuted, fontSize: fontSizePx.sm, marginTop: 2 },
  meta: { color: colors.textMuted, fontSize: fontSizePx.xs, marginTop: 4 },
  section: {
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizePx.sm,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  creditRow: {
    color: colors.textMuted,
    fontSize: fontSizePx.sm,
    marginBottom: 4,
  },
  creditValue: { color: colors.textSecondary },
  overview: {
    color: colors.textSecondary,
    fontSize: fontSizePx.sm,
    lineHeight: 22,
  },
  providers: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  provider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    minHeight: 44,
  },
  providerIcon: { width: 20, height: 20, borderRadius: 4 },
  providerName: { color: colors.textPrimary, fontSize: fontSizePx.sm },
  actions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  actionPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    minHeight: 48,
  },
  actionPrimaryText: { color: colors.bg, fontWeight: '700', fontSize: fontSizePx.sm },
  actionDisabled: { backgroundColor: colors.surface },
  actionDisabledText: { color: colors.textMuted },
  actionSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    minHeight: 48,
  },
  actionSecondaryText: { color: colors.textPrimary, fontWeight: '700', fontSize: fontSizePx.sm },
});
