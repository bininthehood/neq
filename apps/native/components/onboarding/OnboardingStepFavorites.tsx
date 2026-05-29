import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { GENRE_CHIPS, type GenreChip } from './data';
import { IconClose } from '../Icons';
import { env } from '../../lib/env';
import { getAccountPrefs } from '../../lib/store';
import { addSaved, archiveItem } from '../../lib/store';
import { track } from '../../lib/analytics';
import { colors, spacing, radius, fontSizePx } from '../../lib/tokens';
import type { Recommendation } from '../../lib/types';

/**
 * Onboarding V2 (P0-2) — Step 4: Taste (작품 선택).
 *
 * 직전 단계(Genre)에서 선택한 장르 slug 들을 `account_prefs.tasteGenres` 에서 읽어와
 * 각 장르별 추천 작품 카로셀 + 검색 input 노출. 사용자는 자유롭게 3-5개 선택.
 *
 * 저장 시점: "다음" 클릭. native 에서는 saved 가 favorites 신호 (app/index.tsx 가
 * `saved.map(s => s.recommendation.title)` 로 favorites 추출). 따라서 web 의 별도
 * `setFavorites/setFavoritesMeta` 대신 **addSaved + archiveItem** 으로 시드 + 즉시 숨김.
 *
 * web 정본: `apps/web/src/components/onboarding/OnboardingStepTaste.tsx`
 */

interface SearchItem {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
}

const MIN_FAVORITES = 3;
const MAX_FAVORITES = 5;

interface Props {
  onNext: (opts?: { random?: boolean }) => void;
}

interface GenreFeed {
  items: SearchItem[];
  page: number;
  hasMore: boolean;
  loading: boolean;
}

export default function OnboardingStepFavorites({ onNext }: Props) {
  const [genreSlugs, setGenreSlugs] = useState<string[]>([]);
  const [genreRecs, setGenreRecs] = useState<Record<string, GenreFeed>>({});
  const [loadingGenres, setLoadingGenres] = useState(true);
  const [selected, setSelected] = useState<SearchItem[]>([]);
  // 무한 스크롤 race 가드 — 같은 장르에 동시 onEndReached 가 여러 번 발화하는 것 차단.
  const loadMoreInflightRef = useRef<Set<string>>(new Set());

  // 검색 state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<TextInput>(null);

  // mount: 직전 Genre 단계의 tasteGenres 슬러그 로드 + 장르별 추천 fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const prefs = await getAccountPrefs();
      const slugs = prefs.tasteGenres ?? [];
      if (cancelled) return;
      setGenreSlugs(slugs);

      const selectedChips = slugs
        .map((slug) => GENRE_CHIPS.find((g) => g.id === slug))
        .filter((g): g is GenreChip => !!g);

      const entries: [string, GenreFeed][] = await Promise.all(
        selectedChips.map(async (g) => {
          const empty: GenreFeed = { items: [], page: 1, hasMore: false, loading: false };
          if (g.tmdbMovieId == null) return [g.id, empty] as [string, GenreFeed];
          try {
            // 2026-05-29 — 무한 스크롤 활성화: page=1 명시 시 서버가 paged 객체 반환.
            const res = await fetch(
              `${env.API_BASE_URL}/api/tmdb/by-genre?genre=${g.tmdbMovieId}&page=1`,
            );
            if (!res.ok) return [g.id, empty] as [string, GenreFeed];
            const data = await res.json();
            const items = Array.isArray(data?.items) ? (data.items as SearchItem[]) : [];
            const hasMore = !!data?.hasMore;
            return [g.id, { items, page: 1, hasMore, loading: false }] as [string, GenreFeed];
          } catch {
            return [g.id, empty] as [string, GenreFeed];
          }
        }),
      );
      if (cancelled) return;
      setGenreRecs(Object.fromEntries(entries));
      setLoadingGenres(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`${env.API_BASE_URL}/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        setResults([]);
        setSearching(false);
        return;
      }
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setResults([]);
    }
    setSearching(false);
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  /**
   * 장르 carousel 끝 도달 시 다음 페이지 fetch. 동일 장르 race 가드.
   * page 누적 + items append. hasMore=false 면 추가 fetch 안 함.
   * 결과 중복은 id 기반으로 차단 (TMDB 응답이 페이지 간 약간 겹치는 케이스 대비).
   */
  const loadMoreForGenre = useCallback(
    async (genreSlug: string) => {
      const chip = GENRE_CHIPS.find((g) => g.id === genreSlug);
      if (!chip || chip.tmdbMovieId == null) return;
      // race 가드: 동일 장르 inflight 차단.
      if (loadMoreInflightRef.current.has(genreSlug)) return;
      const current = genreRecs[genreSlug];
      if (!current || !current.hasMore || current.loading) return;
      loadMoreInflightRef.current.add(genreSlug);
      setGenreRecs((prev) => ({
        ...prev,
        [genreSlug]: { ...prev[genreSlug], loading: true },
      }));
      const nextPage = current.page + 1;
      try {
        const res = await fetch(
          `${env.API_BASE_URL}/api/tmdb/by-genre?genre=${chip.tmdbMovieId}&page=${nextPage}`,
        );
        if (!res.ok) {
          setGenreRecs((prev) => ({
            ...prev,
            [genreSlug]: { ...prev[genreSlug], loading: false, hasMore: false },
          }));
          return;
        }
        const data = await res.json();
        const newItems: SearchItem[] = Array.isArray(data?.items) ? data.items : [];
        const hasMore = !!data?.hasMore;
        setGenreRecs((prev) => {
          const existing = prev[genreSlug] ?? { items: [], page: 1, hasMore: false, loading: false };
          const seen = new Set(existing.items.map((i) => i.id));
          const merged = [...existing.items, ...newItems.filter((i) => !seen.has(i.id))];
          return {
            ...prev,
            [genreSlug]: { items: merged, page: nextPage, hasMore, loading: false },
          };
        });
      } catch {
        setGenreRecs((prev) => ({
          ...prev,
          [genreSlug]: { ...prev[genreSlug], loading: false },
        }));
      } finally {
        loadMoreInflightRef.current.delete(genreSlug);
      }
    },
    [genreRecs],
  );

  const toggleSelect = (item: SearchItem) => {
    setSelected((prev) => {
      if (prev.some((s) => s.id === item.id)) {
        return prev.filter((s) => s.id !== item.id);
      }
      if (prev.length >= MAX_FAVORITES) return prev;
      track('onboarding_favorite_added', { total: prev.length + 1 });
      return [...prev, item];
    });
  };

  const enoughFavorites = selected.length >= MIN_FAVORITES;
  const ctaLabel = enoughFavorites
    ? '다음'
    : `${MIN_FAVORITES - selected.length}개 더 선택해주세요`;

  const handleNext = async () => {
    // saved 자동 시드 + 즉시 archive. native 의 app/index.tsx 가 saved 에서 favorites 를
    // derive 하므로 별도 setFavorites/setFavoritesMeta 호출 불필요.
    for (const s of selected) {
      try {
        await archiveItem(s.id);
        const res = await fetch(`${env.API_BASE_URL}/api/tmdb/hydrate?id=${s.id}`);
        if (!res.ok) continue;
        const rec = (await res.json()) as Recommendation;
        if (rec) await addSaved(rec);
      } catch {
        /* silent — 일부 hydrate 실패해도 onboarding 진행 보장 */
      }
    }
    onNext();
  };

  const handleRandom = () => {
    setSelected([]);
    onNext({ random: true });
  };

  const showSearchResults = query.length > 0;
  const selectedGenres = genreSlugs
    .map((slug) => GENRE_CHIPS.find((g) => g.id === slug))
    .filter((g): g is GenreChip => !!g);

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>이런 작품은 어때요?</Text>
        <Text style={styles.subtitle}>좋아하는 작품 3-5개를 골라주세요</Text>
      </View>

      {/* 선택 슬롯 5칸 */}
      <View style={styles.slots}>
        {Array.from({ length: MAX_FAVORITES }).map((_, i) => {
          const item = selected[i];
          if (item) {
            return (
              <Pressable
                key={item.id}
                onPress={() => toggleSelect(item)}
                style={styles.slotFilled}
                accessibilityLabel={`${item.title} 선택 해제`}
                accessibilityRole="button"
              >
                {item.posterUrl ? (
                  <Image
                    source={{ uri: item.posterUrl }}
                    style={styles.slotImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.slotImage, styles.slotPlaceholder]}>
                    <Text style={styles.slotPlaceholderText}>{item.title.slice(0, 3)}</Text>
                  </View>
                )}
                <View style={styles.slotRemove}>
                  <Text style={styles.slotRemoveText}>×</Text>
                </View>
              </Pressable>
            );
          }
          return <View key={`empty-${i}`} style={styles.slotEmpty}><Text style={styles.slotEmptyPlus}>+</Text></View>;
        })}
      </View>

      {/* 검색 input — clear 버튼 (SearchSheet 패턴 정합) */}
      <View style={styles.searchWrap}>
        <View style={styles.searchInputWrap}>
          <TextInput
            ref={searchInputRef}
            value={query}
            onChangeText={handleInput}
            placeholder="작품 검색"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => {
                handleInput('');
                searchInputRef.current?.focus();
              }}
              hitSlop={10}
              accessibilityLabel="검색어 지우기"
              accessibilityRole="button"
              style={styles.searchClear}
            >
              <IconClose size={14} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* 스크롤 영역 */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: spacing.md }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {searching && (
          <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: spacing.sm }} />
        )}

        {showSearchResults && results.length > 0 && (
          <View style={styles.searchResults}>
            {results.map((item) => {
              const isSelected = selected.some((s) => s.id === item.id);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => toggleSelect(item)}
                  style={[styles.searchResult, isSelected && styles.searchResultSelected]}
                  accessibilityLabel={`${item.title}${isSelected ? ' 선택됨' : ''}`}
                  accessibilityState={{ selected: isSelected }}
                >
                  {item.posterUrl ? (
                    <Image source={{ uri: item.posterUrl }} style={styles.searchResultImage} contentFit="cover" />
                  ) : (
                    <View style={[styles.searchResultImage, styles.slotPlaceholder]} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.searchResultTitle}>{item.title}</Text>
                    {!!item.year && <Text style={styles.searchResultYear}>{item.year}</Text>}
                  </View>
                  {isSelected && <Text style={styles.checkMark}>✓</Text>}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* 장르별 가로 carousel — 2026-05-29 무한 스크롤. FlatList horizontal +
            onEndReached. onEndReachedThreshold 0.5 = 절반 남았을 때 loadMore. */}
        {!showSearchResults && (
          <View style={{ gap: spacing.lg }}>
            {selectedGenres.map((g) => {
              const feed = genreRecs[g.id];
              const items = feed?.items ?? [];
              if (loadingGenres && items.length === 0) {
                return (
                  <View key={g.id} style={styles.carouselSection}>
                    <Text style={styles.carouselLabel}>{g.ko}</Text>
                    <Text style={styles.carouselLoading}>추천 불러오는 중...</Text>
                  </View>
                );
              }
              if (items.length === 0) return null;
              return (
                <View key={g.id} style={styles.carouselSection}>
                  <Text style={styles.carouselLabel}>{g.ko}</Text>
                  <FlatList
                    horizontal
                    data={items}
                    keyExtractor={(item) => String(item.id)}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.carousel}
                    onEndReached={() => {
                      void loadMoreForGenre(g.id);
                    }}
                    onEndReachedThreshold={0.5}
                    ListFooterComponent={
                      feed?.loading ? (
                        <View style={styles.carouselFooter}>
                          <ActivityIndicator size="small" color={colors.accent} />
                        </View>
                      ) : null
                    }
                    renderItem={({ item }) => {
                      const isSelected = selected.some((s) => s.id === item.id);
                      return (
                        <Pressable
                          onPress={() => toggleSelect(item)}
                          style={styles.carouselItem}
                          accessibilityLabel={`${item.title}${isSelected ? ' 선택됨' : ''}`}
                          accessibilityState={{ selected: isSelected }}
                        >
                          <View style={[styles.carouselImageWrap, isSelected && styles.carouselImageSelected]}>
                            {item.posterUrl ? (
                              <Image source={{ uri: item.posterUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                            ) : (
                              <View style={[StyleSheet.absoluteFill, styles.slotPlaceholder]}>
                                <Text style={styles.slotPlaceholderText}>{item.title.slice(0, 6)}</Text>
                              </View>
                            )}
                            {isSelected && (
                              <View style={styles.carouselCheck}>
                                <Text style={styles.carouselCheckText}>✓</Text>
                              </View>
                            )}
                          </View>
                          <Text numberOfLines={1} style={[styles.carouselTitle, isSelected && styles.carouselTitleSelected]}>{item.title}</Text>
                        </Pressable>
                      );
                    }}
                  />
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* CTA */}
      <View style={styles.footer}>
        <Pressable
          onPress={handleNext}
          disabled={!enoughFavorites}
          style={[styles.cta, enoughFavorites ? styles.ctaActive : styles.ctaDisabled]}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
        >
          <Text style={[styles.ctaText, enoughFavorites ? styles.ctaTextActive : styles.ctaTextDisabled]}>
            {ctaLabel}
          </Text>
        </Pressable>
        <Pressable onPress={handleRandom} style={styles.skip} accessibilityRole="button" accessibilityLabel="작품 정하지 않고 시작">
          <Text style={styles.skipText}>작품 정하지 않고 시작</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  title: { color: colors.textPrimary, fontSize: 26, fontWeight: '700', marginBottom: spacing.xs, lineHeight: 32 },
  subtitle: { color: colors.textSecondary, fontSize: fontSizePx.sm, lineHeight: 22 },

  slots: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md, marginBottom: spacing.sm, paddingHorizontal: spacing.lg },
  slotFilled: { position: 'relative', width: 56, height: 80 },
  slotImage: { width: 56, height: 80, borderRadius: radius.sm, backgroundColor: colors.surface },
  slotPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  slotPlaceholderText: { color: colors.textMuted, fontSize: fontSizePx.xs },
  slotRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger ?? '#d54e4e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotRemoveText: { color: colors.textPrimary, fontSize: 12, lineHeight: 14 },
  slotEmpty: {
    width: 56,
    height: 80,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotEmptyPlus: { color: colors.textMuted, fontSize: 18 },

  searchWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSizePx.base,
  },
  searchClear: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },

  scroll: { flex: 1 },

  searchResults: { paddingHorizontal: spacing.lg, gap: 4 },
  searchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  searchResultSelected: { backgroundColor: colors.accentDim ?? 'rgba(218,165,32,0.15)', borderColor: colors.accent },
  searchResultImage: { width: 48, height: 72, borderRadius: radius.sm, backgroundColor: colors.surface },
  searchResultTitle: { color: colors.textPrimary, fontSize: fontSizePx.base, fontWeight: '500' },
  searchResultYear: { color: colors.textMuted, fontSize: fontSizePx.sm, marginTop: 2 },
  checkMark: { color: colors.accent, fontSize: 18, marginLeft: 'auto' },

  carouselSection: {},
  carouselLabel: { color: colors.textPrimary, fontSize: fontSizePx.sm, fontWeight: '600', paddingHorizontal: spacing.lg, marginBottom: spacing.xs },
  carouselLoading: { color: colors.textMuted, fontSize: fontSizePx.xs, paddingHorizontal: spacing.lg },
  carousel: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: 4 },
  carouselItem: { width: 80 },
  carouselImageWrap: {
    width: 80,
    height: 112,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  carouselImageSelected: { borderColor: colors.accent, borderWidth: 1.5 },
  carouselCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselCheckText: { color: colors.bg, fontSize: 12, lineHeight: 14, fontWeight: '700' },
  carouselTitle: { color: colors.textMuted, fontSize: fontSizePx.xs, marginTop: 4 },
  carouselTitleSelected: { color: colors.textPrimary },
  carouselFooter: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },

  footer: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, paddingTop: spacing.xs, gap: spacing.xs },
  cta: { paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  ctaActive: { backgroundColor: colors.accent },
  ctaDisabled: { backgroundColor: colors.surface },
  ctaText: { fontSize: fontSizePx.base, fontWeight: '700' },
  ctaTextActive: { color: colors.bg },
  ctaTextDisabled: { color: colors.textMuted },
  skip: { paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  skipText: { color: colors.textSecondary, fontSize: fontSizePx.sm },
});
