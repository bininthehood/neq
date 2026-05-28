import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, fonts, fontSizePx, spacing } from '../../lib/tokens';
import { env } from '../../lib/env';

/**
 * Persona v2 - 작품 픽 step (native).
 *
 * web `apps/web/src/components/onboarding/TasteSurveyFavoritesPicker.tsx`
 * 대응. mini search + suggestion grid + 선택 / 건너뛰기.
 * - 권장 3개 + 최대 5개
 * - 0개도 진행 가능 (건너뛰기)
 * - /api/trending + /api/search (env.API_BASE_URL prefix)
 */

export interface FavoritePickItem {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
}

interface Props {
  onNext: (items: FavoritePickItem[]) => void;
  onSkip: () => void;
}

const MAX_SELECT = 5;
const RECOMMENDED_SELECT = 3;

const MINI_FALLBACK: FavoritePickItem[] = [
  { id: 496243, title: '기생충', posterUrl: 'https://image.tmdb.org/t/p/w200/jjHccoFjbqlfr4VGLVLT7yek0Xn.jpg', year: '2019' },
  { id: 278, title: '쇼생크 탈출', posterUrl: 'https://image.tmdb.org/t/p/w200/oAt6OtpwYCdJI76AVtVKW1eorYx.jpg', year: '1994' },
  { id: 157336, title: '인터스텔라', posterUrl: 'https://image.tmdb.org/t/p/w200/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', year: '2014' },
  { id: 238, title: '대부', posterUrl: 'https://image.tmdb.org/t/p/w200/I1fkNd5CeJGv56mhrTDoOeMc2r.jpg', year: '1972' },
  { id: 372058, title: '너의 이름은.', posterUrl: 'https://image.tmdb.org/t/p/w200/wJsOzBoMSdkLJEFwpPIl0GTvPaJ.jpg', year: '2016' },
  { id: 550, title: '파이트 클럽', posterUrl: 'https://image.tmdb.org/t/p/w200/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', year: '1999' },
];

export default function TasteSurveyFavoritesPicker({ onNext, onSkip }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FavoritePickItem[]>([]);
  const [selected, setSelected] = useState<FavoritePickItem[]>([]);
  const [suggestions, setSuggestions] = useState<FavoritePickItem[]>(MINI_FALLBACK);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${env.API_BASE_URL}/api/trending`);
        const data = await res.json();
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setSuggestions(data);
        }
      } catch {
        // fallback 유지
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runSearch = useCallback(async (q: string) => {
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
    if (value.length < 1) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(value), 300);
  };

  const toggleSelect = (item: FavoritePickItem) => {
    if (selected.some((s) => s.id === item.id)) {
      setSelected(selected.filter((s) => s.id !== item.id));
    } else if (selected.length < MAX_SELECT) {
      setSelected([...selected, item]);
    }
  };

  const reachedMin = selected.length >= RECOMMENDED_SELECT;
  const canNext = selected.length > 0;
  const showResults = query.length > 0 && results.length > 0;
  const showSuggestions = query.length === 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerCol}>
        <Text style={styles.heading}>좋아하는 작품도 알려주세요</Text>
        <Text style={styles.subtitle}>
          {RECOMMENDED_SELECT}개 이상 권장 · 최대 {MAX_SELECT}개
        </Text>

        {selected.length > 0 ? (
          <ScrollView
            horizontal
            style={styles.selectedRow}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm }}
          >
            {selected.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => toggleSelect(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.title} 선택 해제`}
              >
                {item.posterUrl ? (
                  <Image
                    source={{ uri: item.posterUrl }}
                    style={styles.selectedPoster}
                  />
                ) : (
                  <View style={[styles.selectedPoster, styles.posterPlaceholder]}>
                    <Text style={styles.posterFallbackText}>{item.title.slice(0, 2)}</Text>
                  </View>
                )}
                <View style={styles.removeBadge}>
                  <Text style={styles.removeBadgeText}>✕</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <TextInput
          value={query}
          onChangeText={handleInput}
          placeholder="작품을 검색하세요"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
      </View>

      {/* 2026-05-27 (sub-bug a) — body 를 ScrollView 로 감싸 grid 영역이 화면을 넘어도
          스크롤 가능. FlatList 가 자체 스크롤 모드일 땐 ScrollView 가 비활성 (검색 모드).
          - showSuggestions 모드: ScrollView 가 grid 8칸 + 여유 패딩 스크롤
          - showResults 모드: FlatList 자체 스크롤 (기존)
          keyboardShouldPersistTaps="handled" — 검색 input 활성 중 grid 탭이 키보드 dismiss
          전에 발화되도록 (네이티브 HIG 정합). */}
      <View style={styles.body}>
        {searching ? (
          <Text style={styles.searchingText}>검색 중...</Text>
        ) : null}
        {showSuggestions ? (
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionLabel}>이런 작품은 어때요?</Text>
            <View style={styles.grid}>
              {suggestions.slice(0, 8).map((item) => {
                const isSelected = selected.some((s) => s.id === item.id);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => toggleSelect(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.title} ${isSelected ? '선택 해제' : '선택'}`}
                    style={[
                      styles.gridCell,
                      isSelected && styles.gridCellSelected,
                    ]}
                  >
                    {item.posterUrl ? (
                      <Image source={{ uri: item.posterUrl }} style={styles.gridPoster} />
                    ) : (
                      <View style={[styles.gridPoster, styles.posterPlaceholder]} />
                    )}
                    <View style={styles.gridLabelOverlay}>
                      <Text style={styles.gridLabel} numberOfLines={1}>
                        {item.title}
                      </Text>
                    </View>
                    {isSelected ? (
                      <View style={styles.checkBadge}>
                        <Text style={styles.checkBadgeText}>✓</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        ) : null}
        {showResults ? (
          <FlatList
            data={results}
            keyExtractor={(item) => `${item.id}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = selected.some((s) => s.id === item.id);
              return (
                <Pressable
                  onPress={() => toggleSelect(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title} ${isSelected ? '선택 해제' : '선택'}`}
                  style={[
                    styles.resultRow,
                    isSelected && { backgroundColor: colors.accentDim },
                  ]}
                >
                  {item.posterUrl ? (
                    <Image source={{ uri: item.posterUrl }} style={styles.resultPoster} />
                  ) : (
                    <View style={[styles.resultPoster, styles.posterPlaceholder]} />
                  )}
                  <View style={styles.resultBody}>
                    <Text style={styles.resultTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.year ? (
                      <Text style={styles.resultYear}>{item.year}</Text>
                    ) : null}
                  </View>
                  {isSelected ? (
                    <View style={styles.resultCheck}>
                      <Text style={styles.checkBadgeText}>✓</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            }}
          />
        ) : null}
      </View>

      {/* 2026-05-27 (sub-bug b) — ctaWrap 위 디바이더 추가.
          body 영역과 CTA 영역의 시각 경계가 없어 콘텐츠가 CTA 와 붙어보이는 결함 fix.
          colors.borderSubtle (#1F1E1A) — 디자인 토큰 정합, 너무 진하지 않게 hairline. */}
      <View style={styles.ctaWrap}>
        <Pressable
          onPress={() => onNext(selected)}
          disabled={!canNext}
          accessibilityRole="button"
          accessibilityLabel="다음"
          accessibilityState={{ disabled: !canNext }}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: canNext ? colors.accent : colors.surfaceRaised },
            pressed && canNext && { opacity: 0.85 },
          ]}
        >
          <Text style={[styles.ctaLabel, { color: canNext ? colors.bg : colors.textMuted }]}>
            {reachedMin ? '다음' : `${RECOMMENDED_SELECT - selected.length}개 더 권장`}
          </Text>
        </Pressable>
        {/* 2026-05-27 (sub-bug c) — "건너뛰기" 시인성 fix.
            기존: border + transparent bg → 어두운 박스가 묻혀 보임 + textSecondary 색상.
            변경: 다른 onboarding step (Hello/Taste/OTT/Notify) 의 skip 패턴 정합 —
            border 제거 + 텍스트만. 시각적 무게 감소 + 명확한 secondary action. */}
        <Pressable
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel="건너뛰기"
          style={({ pressed }) => [
            styles.skipBtn,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.skipLabel}>건너뛰기</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  headerCol: {
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
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizePx.sm,
    lineHeight: 20,
  },
  selectedRow: {
    flexGrow: 0,
    marginTop: spacing.md,
  },
  selectedPoster: {
    width: 44,
    height: 64,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  removeBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBadgeText: {
    color: colors.textPrimary,
    fontSize: 10,
    lineHeight: 12,
  },
  posterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterFallbackText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  searchInput: {
    marginTop: spacing.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSunken,
    color: colors.textPrimary,
    fontSize: fontSizePx.sm,
  },
  body: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: spacing.sm,
  },
  // 2026-05-27 (sub-bug a) — body 내부 ScrollView 스타일.
  bodyScroll: {
    flex: 1,
  },
  bodyScrollContent: {
    paddingBottom: spacing.md,
  },
  searchingText: {
    color: colors.textMuted,
    fontSize: fontSizePx.sm,
    textAlign: 'center',
    paddingVertical: 16,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridCell: {
    width: '48%',
    aspectRatio: 2 / 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  gridCellSelected: {
    borderWidth: 2,
    borderColor: colors.accent,
  },
  gridPoster: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
  },
  gridLabelOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  gridLabel: {
    color: colors.textPrimary,
    fontSize: 11,
  },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadgeText: {
    color: colors.bg,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '700',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
  },
  resultPoster: {
    width: 36,
    height: 54,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  resultBody: { flex: 1, minWidth: 0 },
  resultTitle: {
    color: colors.textPrimary,
    fontSize: fontSizePx.sm,
  },
  resultYear: {
    color: colors.textMuted,
    fontSize: 11,
  },
  resultCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 2026-05-27 (sub-bug b) — ctaWrap 상단 디바이더. body 와 CTA 영역 시각 경계 명확화.
  ctaWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm + 4,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  cta: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  ctaLabel: { fontSize: 14, fontWeight: '600' },
  // 2026-05-27 (sub-bug c) — 다른 onboarding step skip 패턴 정합. border 제거 + 텍스트만.
  skipBtn: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipLabel: {
    color: colors.textSecondary,
    fontSize: fontSizePx.sm,
  },
});
