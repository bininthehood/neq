import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { getSaved } from '../lib/store';
import { track } from '../lib/analytics';
import { setPendingMixSeed } from '../lib/mix-bridge';
import {
  buildRecentSavedThemes,
  buildGenreThemes,
  buildDirectorThemes,
  type MixTheme,
} from '../lib/mix-themes';
import type { SavedItem } from '../lib/types';
import { colors, spacing, radius } from '../lib/tokens';
import { fontsV2 } from '@neq/design';

/**
 * Seeded Mix 2차 (2026-07-08) — Mix 탭.
 *
 * 장르/감독/최근 저장작 테마를 제안하고, 탭 시 해당 seed 로 Discover 의 seeded mix
 * (덱 주입) 를 시작한다. 데이터 소스는 전부 로컬(saved) — 신규 API 0. 장르/감독
 * 테마는 해당 조건의 최신 저장작을 seed 로 쓰는 근사 (mix-themes.ts 주석 참조).
 * 브리지: setPendingMixSeed → router.push('/') → Discover focus 시 consume.
 */
export default function MixScreen() {
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getSaved().then((items) => {
        if (cancelled) return;
        setSaved(items);
        setLoaded(true);
        track('mix_tab_viewed', { saved_count: items.length });
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const recentThemes = buildRecentSavedThemes(saved);
  const genreThemes = buildGenreThemes(saved);
  const directorThemes = buildDirectorThemes(saved);
  const empty = loaded && recentThemes.length === 0;

  function handleThemePress(theme: MixTheme) {
    track('mix_theme_clicked', {
      theme_kind: theme.kind,
      seed_tmdb_id: theme.seed.tmdbId,
      seed_title: theme.seed.title,
      ...(theme.genreId != null && { genre_id: theme.genreId }),
    });
    // 3차 — theme 동반 전달: 큐 바 라벨(테마 title) + 장르 큐 하이브리드 후보 조회 키.
    setPendingMixSeed(theme.seed, 'native_mix_tab', {
      kind: theme.kind,
      title: theme.title,
      genreId: theme.genreId,
    });
    router.push('/');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        {/* 3차 — 영문 display 관례 (Saved 정합): Mix → Cue */}
        <Text style={styles.title}>Cue</Text>
      </View>

      {empty ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>저장작이 아직 없어요</Text>
          <Text style={styles.emptyHint}>작품을 저장하면 테마 큐를 제안해요</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {recentThemes.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>최근 저장작으로</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.posterRow}>
                {recentThemes.map((t, i) => (
                  <Pressable
                    key={`${t.seed.type}:${t.seed.tmdbId}`}
                    style={styles.posterCard}
                    onPress={() => handleThemePress(t)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.title} 시작`}
                    testID={`mix-theme-recent-${i}`}
                  >
                    {t.seed.posterUrl ? (
                      <Image source={{ uri: t.seed.posterUrl }} style={styles.poster} contentFit="cover" transition={0} />
                    ) : (
                      <View style={[styles.poster, styles.posterFallback]}>
                        <Text style={styles.posterFallbackText}>N</Text>
                      </View>
                    )}
                    <Text style={styles.posterTitle} numberOfLines={1}>
                      {t.title}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {genreThemes.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>장르 테마</Text>
              <View style={styles.grid}>
                {genreThemes.map((t, i) => (
                  <ThemeCard key={`g-${t.title}`} theme={t} testID={`mix-theme-genre-${i}`} onPress={handleThemePress} />
                ))}
              </View>
            </View>
          )}

          {directorThemes.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>감독 테마</Text>
              <View style={styles.grid}>
                {directorThemes.map((t, i) => (
                  <ThemeCard key={`d-${t.title}`} theme={t} testID={`mix-theme-director-${i}`} onPress={handleThemePress} />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/**
 * 2열 격자 테마 카드 (사용자 피드백 2026-07-08) — 장르: seed 작품 스틸컷(backdrop),
 * 감독: 프로필 사진. 이미지 전무 시 이니셜 fallback. 기반 작품명은 비노출.
 */
function ThemeCard({
  theme,
  testID,
  onPress,
}: {
  theme: MixTheme;
  testID: string;
  onPress: (t: MixTheme) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.themeCard, pressed && styles.rowPressed]}
      onPress={() => onPress(theme)}
      accessibilityRole="button"
      accessibilityLabel={`${theme.title} 시작`}
      testID={testID}
    >
      {theme.imageUrl ? (
        <Image source={{ uri: theme.imageUrl }} style={styles.themeImage} contentFit="cover" transition={0} />
      ) : (
        <View style={[styles.themeImage, styles.themeImageFallback]}>
          <Text style={styles.themeImageFallbackText}>{theme.title.slice(0, 1)}</Text>
        </View>
      )}
      <Text style={styles.rowTitle} numberOfLines={1}>
        {theme.title}
      </Text>
      <Text style={styles.rowSubtitle} numberOfLines={1}>
        {theme.subtitle}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  // saved.tsx 헤더 정합 — h48 고정 + display 폰트 타이틀.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    height: 48,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '500',
    letterSpacing: -0.7,
    lineHeight: 36,
    fontFamily: fontsV2.display,
  },
  scrollContent: { paddingBottom: spacing.xl },
  section: { marginTop: spacing.lg },
  // 섹션 라벨 — ChapterMark 위계 (amber 는 화면당 1개 규칙이라 전부 secondary).
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  posterRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  posterCard: { width: 104 },
  poster: {
    width: 104,
    aspectRatio: 2 / 3,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  posterFallback: { alignItems: 'center', justifyContent: 'center' },
  posterFallbackText: { color: colors.textMuted, fontSize: 22 },
  posterTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 6,
  },
  // 2열 격자 — 카드 2개 + gap 이 가로 패딩 안에 정확히 분할되도록 % 대신 flexBasis.
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    columnGap: spacing.sm,
    rowGap: spacing.md,
  },
  themeCard: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: radius.md,
  },
  themeImage: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  themeImageFallback: { alignItems: 'center', justifyContent: 'center' },
  themeImageFallbackText: { color: colors.textMuted, fontSize: 24, fontWeight: '600' },
  rowPressed: { opacity: 0.7 },
  rowTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', marginTop: 8 },
  rowSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '500' },
  emptyHint: { color: colors.textMuted, fontSize: 13 },
});
