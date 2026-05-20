/**
 * SearchSheet (native) — D10n grouped 카로셀 리뉴얼.
 *
 * D10 web SearchSheet 의 1:1 포팅. `/api/search?grouped=1` 응답
 * (`{ works, directors, actors }`) 기반으로 카테고리별 가로 스크롤 카로셀을 렌더한다.
 *
 * 4 상태 매핑 (web 동일):
 *   - 비입력 (idle):  hint 텍스트
 *   - 로딩 (loading): <ActivityIndicator /> (D11 native Spinner 별도 트랙)
 *   - 결과 0 (empty): <Illust name="noResults" /> + 안내 본문
 *   - 에러 (error):   <Illust name="error" /> + 다시 시도 버튼
 *   - 정상 (ok):      카테고리 그룹 카로셀 (FlatList horizontal)
 *
 * 디바운싱 200ms — 빠른 입력 시 이전 fetch 는 AbortController 로 취소.
 * 순수 함수(`resolveSearchUiState`, `buildCategoryGroups`, `SEARCH_DEBOUNCE_MS`)는
 * `@neq/core/search` 에서 import — web 과 동일 구현 공유.
 *
 * 호환성: 호출처(`apps/native/app/index.tsx`)의 prop API (`visible`, `onClose`) 보존.
 *
 * 본 위임 범위 외:
 *   - Toast (native ToastProvider 부재) → 에러는 인라인 영역에서만 노출
 *   - Recent/Trending/Voice (D10b 별도)
 *   - 인물 카드 클릭 진입 (별도 트랙)
 *   - 선택된 작품 상세 패널 (저장/OTT/상세) — D10n 후속 트랙
 */

import { useCallback, useEffect, useRef, useState } from 'react'; // useCallback 활용 (WorkCard)
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  Keyboard,
  Modal,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
  Easing,
} from 'react-native-reanimated';
import {
  resolveSearchUiState,
  buildCategoryGroups,
  SEARCH_DEBOUNCE_MS,
  type CategoryGroup,
} from '@neq/core';
import type {
  GroupedSearchResponse,
  PersonResult,
  Recommendation,
  SearchResult,
} from '../lib/types';
import { env } from '../lib/env';
import { colors, radius, spacing } from '../lib/tokens';
import { IconClose } from './Icons';
import { fonts, easings } from '@neq/design';
import { Illust } from './Illust';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.9;
const CLOSE_THRESHOLD = SHEET_MAX_HEIGHT * 0.3;

// 2026-05-20 — PWA SearchSheet 정합. 기존 `withSpring(damping:20, stiffness:160)` 는
// underdamped 스프링(ζ≈0.79) 으로 ~700px 이동거리에 큰 진폭 오버슈트("띠용") 발생.
// PWA 는 `transform 0.3s cubic-bezier(0.34, 1.3, 0.64, 1)` = `easings.spring` 곡선의
// 짧은 미세 오버슈트 30% — withTiming 으로 동일 인지 재현.
const SHEET_ENTER_BEZIER = Easing.bezier(...easings.spring);
const SHEET_ENTER_MS = 300;

interface Props {
  visible: boolean;
  onClose: () => void;
  /**
   * 위임 O #1.2 — DetailSheet Cast 클릭 진입용.
   * sheet 가 visible=true 로 전이될 때 query 에 자동 주입 + 즉시 검색 발사.
   * 빈 문자열은 무시. 이전 검색 잔해 제거를 원하면 부모가 빈 문자열로 reset.
   * (web `apps/web/src/components/discover/SearchSheet.tsx` initialQuery prop 동등.)
   */
  initialQuery?: string;
  /**
   * 2026-05-20 — 작품 탭 시 hydrate 후 부모로 Recommendation 전달.
   * 부모는 SearchSheet 닫고 DetailSheet 띄우는 흐름. PWA 의 SearchSheet 내부
   * detail panel 정합은 별도 트랙(D10n+) — 우선 단순 흐름 (sheet 전환).
   */
  onWorkSelected?: (rec: Recommendation) => void;
}

export default function SearchSheet({
  visible,
  onClose,
  initialQuery,
  onWorkSelected,
}: Props) {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<GroupedSearchResponse | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [hasError, setHasError] = useState(false);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const translateY = useSharedValue(SHEET_MAX_HEIGHT);

  // ─────────────────────────────────────────────────────
  // grouped fetch — AbortController 로 빠른 입력 시 이전 fetch 취소.
  // ─────────────────────────────────────────────────────
  const search = useCallback(async (q: string) => {
    if (q.trim().length < 1) {
      setData(null);
      setHasError(false);
      setIsFetching(false);
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsFetching(true);
    setHasError(false);

    try {
      const res = await fetch(
        `${env.API_BASE_URL}/api/search?q=${encodeURIComponent(q)}&grouped=1`,
        { signal: controller.signal },
      );
      if (!res.ok) throw new Error(`search failed (${res.status})`);
      const body = (await res.json()) as GroupedSearchResponse;
      if (controller.signal.aborted) return;
      setData(body);
      setIsFetching(false);
    } catch (err) {
      if (controller.signal.aborted) return;
      // RN fetch 에서 AbortError 는 DOMException 이 아니라 일반 Error 로 올 수 있음.
      // 어떤 형태든 controller 가 abort 됐으면 stale 응답이므로 무시.
      const msg = err instanceof Error ? err.message : '';
      if (
        msg.includes('aborted') ||
        msg.includes('Abort') ||
        (err as { name?: string })?.name === 'AbortError'
      ) {
        return;
      }
      setHasError(true);
      setData(null);
      setIsFetching(false);
    }
  }, []);

  // ─────────────────────────────────────────────────────
  // 입력 핸들러 — 디바운싱 200ms (web 과 동일 상수)
  // ─────────────────────────────────────────────────────
  const handleInput = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      if (value.trim().length === 0) {
        if (abortRef.current) abortRef.current.abort();
        setData(null);
        setIsFetching(false);
        setHasError(false);
        return;
      }
      debounceTimerRef.current = setTimeout(() => {
        void search(value);
      }, SEARCH_DEBOUNCE_MS);
    },
    [search],
  );

  // unmount 정리
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // visible 토글 — 열릴 때 미세 spring(bezier) up, 닫힐 때 timing down + 상태 리셋.
  // PWA SearchSheet 와 동일 곡선 — 큰 오버슈트 없는 짧은 진입.
  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, {
        duration: SHEET_ENTER_MS,
        easing: SHEET_ENTER_BEZIER,
      });
    } else {
      translateY.value = withTiming(SHEET_MAX_HEIGHT, { duration: 280 });
      // 닫을 때 쿼리/결과 리셋 + in-flight 취소
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortRef.current) abortRef.current.abort();
      setQuery('');
      setData(null);
      setIsFetching(false);
      setHasError(false);
    }
  }, [visible, translateY]);

  // 위임 O #1.2 — initialQuery 자동 주입.
  // visible=true 전이 시 또는 visible 한 상태에서 initialQuery 가 바뀌면
  // query state 채우고 즉시 search 호출. 빈 문자열은 무시.
  // (web SearchSheet 의 initialQuery effect 와 동등.)
  useEffect(() => {
    if (!visible) return;
    if (!initialQuery || initialQuery.trim().length === 0) return;
    const q = initialQuery.trim();
    setQuery(q);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    void search(q);
    // visible / initialQuery 변경 시에만 — search 는 stable callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialQuery]);

  // pan-down 으로 sheet 닫기
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > CLOSE_THRESHOLD || e.velocityY > 1000) {
        translateY.value = withTiming(SHEET_MAX_HEIGHT, { duration: 220 }, () => {
          runOnJS(onClose)();
        });
      } else {
        translateY.value = withTiming(0, {
          duration: SHEET_ENTER_MS,
          easing: SHEET_ENTER_BEZIER,
        });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const dimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, SHEET_MAX_HEIGHT],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const handleRetry = () => {
    if (query.trim().length > 0) void search(query);
  };

  const uiState = resolveSearchUiState({ query, isFetching, hasError, data });
  const groups: CategoryGroup[] = data ? buildCategoryGroups(data) : [];

  return (
    <Modal visible={visible} animationType="none" transparent statusBarTranslucent>
      <View
        style={StyleSheet.absoluteFill}
        accessibilityViewIsModal
        accessibilityLabel="검색"
      >
        <Animated.View style={[styles.dim, dimStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityLabel="검색 닫기"
            accessibilityRole="button"
          />
        </Animated.View>

        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, sheetStyle]}>
            {/* handle */}
            <View style={styles.handleRow}>
              <View style={styles.handleBar} />
            </View>

            {/* search input + 취소 */}
            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <TextInput
                  value={query}
                  onChangeText={handleInput}
                  placeholder="작품, 감독, 배우"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  autoCorrect={false}
                  autoFocus
                  returnKeyType="search"
                  onSubmitEditing={() => Keyboard.dismiss()}
                  accessibilityLabel="검색"
                />
                {query.length > 0 && (
                  <Pressable
                    onPress={() => handleInput('')}
                    hitSlop={10}
                    accessibilityLabel="검색어 지우기"
                    accessibilityRole="button"
                  >
                    <IconClose size={14} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                accessibilityLabel="검색 닫기"
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.cancelBtn,
                  pressed && styles.cancelBtnPressed,
                ]}
              >
                <Text style={styles.cancelText}>취소</Text>
              </Pressable>
            </View>

            {/* body */}
            <View style={styles.body}>
              {uiState === 'idle' && (
                <View style={styles.idleWrap}>
                  <Text style={styles.hint}>
                    작품, 감독, 배우 이름으로 검색해보세요
                  </Text>
                </View>
              )}

              {uiState === 'loading' && (
                <View
                  style={styles.centered}
                  accessibilityLiveRegion="polite"
                  accessibilityLabel="검색 중"
                >
                  <ActivityIndicator
                    color={colors.accent}
                    accessibilityLabel="검색 결과 로딩 중"
                  />
                </View>
              )}

              {uiState === 'error' && (
                <View style={styles.statusWrap}>
                  <Illust
                    name="error"
                    style="editorial"
                    size="lg"
                    accessibilityLabel="검색 오류"
                  />
                  <Text style={styles.statusBody}>검색 중 문제가 생겼어요</Text>
                  <Pressable
                    onPress={handleRetry}
                    accessibilityRole="button"
                    accessibilityLabel="다시 시도"
                    style={({ pressed }) => [
                      styles.retryBtn,
                      pressed && styles.retryBtnPressed,
                    ]}
                  >
                    <Text style={styles.retryText}>다시 시도</Text>
                  </Pressable>
                </View>
              )}

              {uiState === 'empty' && (
                <View style={styles.statusWrap}>
                  <Illust
                    name="noResults"
                    style="editorial"
                    size="lg"
                    accessibilityLabel="검색 결과 없음"
                  />
                  <Text style={styles.emptyTitle}>
                    &ldquo;{query.trim()}&rdquo;에 맞는 게 없어요
                  </Text>
                  <Text style={styles.emptyHint}>
                    다른 키워드를 시도해보세요
                  </Text>
                </View>
              )}

              {uiState === 'ok' && data && (
                <ScrollView
                  style={styles.okScroll}
                  contentContainerStyle={styles.okContent}
                  keyboardShouldPersistTaps="handled"
                >
                  {groups.map((g) => (
                    <View
                      key={g.key}
                      accessibilityLabel={`${g.label} 검색 결과 ${g.count}건`}
                      style={styles.section}
                    >
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionLabel}>{g.label}</Text>
                        <Text style={styles.sectionCount}>{g.count}</Text>
                      </View>

                      {g.key === 'works' && (
                        <WorksCarousel
                          items={data.works}
                          onSelect={onWorkSelected}
                        />
                      )}
                      {g.key === 'directors' && (
                        <PeopleCarousel items={data.directors} />
                      )}
                      {g.key === 'actors' && (
                        <PeopleCarousel items={data.actors} />
                      )}
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────
// WorksCarousel — 작품 카로셀 (FlatList horizontal, snap)
// ─────────────────────────────────────────────────────

const WORK_CARD_W = 112;
const WORK_CARD_H = 168; // 2:3

function WorksCarousel({
  items,
  onSelect,
}: {
  items: SearchResult[];
  onSelect?: (rec: Recommendation) => void;
}) {
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => `w-${item.id}`}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.carouselContent}
      ItemSeparatorComponent={() => <View style={{ width: spacing.sm + 4 }} />}
      snapToInterval={WORK_CARD_W + spacing.sm + 4}
      decelerationRate="fast"
      renderItem={({ item }) => <WorkCard item={item} onSelect={onSelect} />}
    />
  );
}

function WorkCard({
  item,
  onSelect,
}: {
  item: SearchResult;
  onSelect?: (rec: Recommendation) => void;
}) {
  const [loading, setLoading] = useState(false);
  const handlePress = useCallback(async () => {
    if (!onSelect || loading) return;
    setLoading(true);
    try {
      const type = item.mediaType === 'tv' ? 'series' : 'movie';
      const res = await fetch(
        `${env.API_BASE_URL}/api/tmdb/hydrate?id=${item.id}&type=${type}`,
      );
      if (!res.ok) return;
      const rec = (await res.json()) as Recommendation;
      onSelect(rec);
    } catch {
      // 실패 시 silent — 사용자가 다시 시도 가능
    } finally {
      setLoading(false);
    }
  }, [item, onSelect, loading]);
  return (
    <Pressable
      onPress={handlePress}
      disabled={loading || !onSelect}
      style={({ pressed }) => [
        styles.workCard,
        pressed && { opacity: 0.6 },
      ]}
      accessibilityLabel={item.title}
      accessibilityRole="button"
    >
      <View style={styles.workPosterFrame}>
        {item.posterUrl ? (
          <Image
            source={{ uri: item.posterUrl }}
            style={styles.workPoster}
            contentFit="cover"
            transition={0}
          />
        ) : (
          <View style={[styles.workPoster, styles.workPosterFallback]}>
            <Text style={styles.workPosterFallbackText} numberOfLines={1}>
              {item.title.slice(0, 8)}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.workTitle} numberOfLines={1}>
        {item.title}
      </Text>
      <Text style={styles.workMeta} numberOfLines={1}>
        {item.mediaType === 'tv' ? '시리즈' : '영화'}
        {item.year ? ` · ${item.year}` : ''}
        {item.rating > 0 ? ` · ★ ${item.rating.toFixed(1)}` : ''}
      </Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────
// PeopleCarousel — 감독/배우 공용 (인물 클릭 진입은 별도 트랙)
// ─────────────────────────────────────────────────────

const PERSON_CARD_W = 96;

function PeopleCarousel({ items }: { items: PersonResult[] }) {
  return (
    <FlatList
      data={items}
      keyExtractor={(p) => `p-${p.id}`}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.carouselContent}
      ItemSeparatorComponent={() => <View style={{ width: spacing.sm + 4 }} />}
      snapToInterval={PERSON_CARD_W + spacing.sm + 4}
      decelerationRate="fast"
      renderItem={({ item }) => <PersonCard person={item} />}
    />
  );
}

function PersonCard({ person }: { person: PersonResult }) {
  const knownForText =
    person.knownFor.length > 0
      ? person.knownFor.map((k) => k.title).join(', ')
      : null;
  return (
    <View style={styles.personCard} accessibilityLabel={person.name}>
      <View style={styles.personAvatar}>
        {person.profileUrl ? (
          <Image
            source={{ uri: person.profileUrl }}
            style={styles.personAvatarImg}
            contentFit="cover"
            transition={0}
          />
        ) : (
          <Text style={styles.personAvatarFallback}>
            {person.name.charAt(0)}
          </Text>
        )}
      </View>
      <Text style={styles.personName} numberOfLines={1}>
        {person.name}
      </Text>
      {knownForText && (
        <Text style={styles.personKnownFor} numberOfLines={1}>
          {knownForText}
        </Text>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlayHeavy,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_MAX_HEIGHT,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },

  // search row
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    paddingVertical: spacing.sm + 4,
  },
  clear: { color: colors.textMuted, fontSize: 18, paddingHorizontal: 6 },
  cancelBtn: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm + 4,
  },
  cancelBtnPressed: { opacity: 0.6 },
  cancelText: { color: colors.textMuted, fontSize: 14, fontWeight: '500' },

  // body
  body: { flex: 1 },

  // idle
  idleWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  hint: { color: colors.textMuted, fontSize: 14 },

  // loading
  centered: {
    paddingVertical: spacing.xl + spacing.md,
    alignItems: 'center',
  },

  // empty / error 공용
  statusWrap: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl + spacing.md,
    alignItems: 'center',
    gap: spacing.md,
  },
  statusBody: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontFamily: fonts.display,
    textAlign: 'center',
  },
  emptyHint: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: -spacing.sm,
  },
  retryBtn: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryBtnPressed: { opacity: 0.7 },
  retryText: { color: colors.textPrimary, fontWeight: '600', fontSize: 14 },

  // ok
  okScroll: { flex: 1 },
  okContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  sectionLabel: {
    color: colors.accent,
    fontSize: 11,
    fontFamily: fonts.data,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  sectionCount: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.data,
  },

  // carousel content
  carouselContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },

  // works carousel cards
  workCard: { width: WORK_CARD_W },
  workPosterFrame: {
    width: WORK_CARD_W,
    height: WORK_CARD_H,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  workPoster: { width: '100%', height: '100%' },
  workPosterFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  workPosterFallbackText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  workTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: spacing.sm,
  },
  workMeta: {
    // anti-slop #8 정합 (web a3bbf94, SearchResults.tsx:330) — 한글 메타 ("시리즈 · 2024 · 평점")
    // uppercase tracking 부적합 → 10→11 상향 (DESIGN.md L?? 일반 폰트 최소 11px).
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },

  // people carousel cards
  personCard: {
    width: PERSON_CARD_W,
    alignItems: 'center',
  },
  personAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personAvatarImg: { width: '100%', height: '100%' },
  personAvatarFallback: {
    color: colors.accent,
    fontSize: 24,
    fontFamily: fonts.display,
  },
  personName: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: spacing.sm,
    textAlign: 'center',
    width: '100%',
  },
  personKnownFor: {
    // anti-slop #8 정합 (web a3bbf94, SearchResults.tsx:456) — known-for 텍스트 (배우 대표작 한글).
    // uppercase tracking 부적합 → 10→11 상향.
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
    width: '100%',
  },
});
