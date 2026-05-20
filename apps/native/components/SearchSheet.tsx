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
  /**
   * 2026-05-20 — true 면 visible=false 시 query/data 리셋 안 함.
   * 작품 탭 → DetailSheet 진입 흐름에서 검색 컨텍스트 보존용. DetailSheet 닫고
   * SearchSheet 재오픈 시 이전 검색어/결과 그대로 복귀 (사용자 보고: "검색어가
   * 유지되는게 자연스러워 보입니다"). 일반 close (취소 버튼/dim 탭) 일 때는
   * 부모가 false 로 두고 리셋 동작 유지.
   */
  preserveStateOnClose?: boolean;
}

export default function SearchSheet({
  visible,
  onClose,
  initialQuery,
  onWorkSelected,
  preserveStateOnClose = false,
}: Props) {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<GroupedSearchResponse | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [hasError, setHasError] = useState(false);
  // 2026-05-20 — PWA 정합. 인물 카드 클릭 시 person-works 표시 (필모그래피).
  // selectedPersonId 가 매칭되는 PeopleCarousel 항목 아래에 inline 카로셀 노출.
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [personWorks, setPersonWorks] = useState<SearchResult[]>([]);
  const [personWorksLoading, setPersonWorksLoading] = useState(false);
  const [personWorksError, setPersonWorksError] = useState(false);

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
      // 2026-05-20 — preserveStateOnClose 면 query/data 유지 (DetailSheet → 복귀 흐름).
      // in-flight fetch 는 어느 경우든 취소 (안 끝난 요청 stale 응답 방지).
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortRef.current) abortRef.current.abort();
      if (!preserveStateOnClose) {
        setQuery('');
        setData(null);
        setIsFetching(false);
        setHasError(false);
        // 인물 선택 상태도 같이 정리.
        setSelectedPersonId(null);
        setPersonWorks([]);
        setPersonWorksError(false);
      }
    }
  }, [visible, translateY, preserveStateOnClose]);

  // 2026-05-20 — 인물 카드 클릭 핸들러. PWA `handleSelectPerson` 정합:
  //   - 같은 카드 다시 누르면 닫음 (toggle).
  //   - 다른 카드 누르면 갈아탐.
  //   - /api/tmdb/person-works?id=X&dept=Directing|Acting 호출 → top 10.
  const handleSelectPerson = useCallback(
    async (person: PersonResult) => {
      if (selectedPersonId === person.id) {
        setSelectedPersonId(null);
        setPersonWorks([]);
        setPersonWorksError(false);
        return;
      }
      setSelectedPersonId(person.id);
      setPersonWorks([]);
      setPersonWorksError(false);
      setPersonWorksLoading(true);
      try {
        const dept =
          person.knownForDept === 'Directing' ? 'Directing' : 'Acting';
        const res = await fetch(
          `${env.API_BASE_URL}/api/tmdb/person-works?id=${person.id}&dept=${dept}`,
        );
        if (!res.ok) throw new Error(`person-works failed (${res.status})`);
        const works = (await res.json()) as SearchResult[];
        setPersonWorks(Array.isArray(works) ? works.slice(0, 10) : []);
      } catch {
        setPersonWorksError(true);
        setPersonWorks([]);
      } finally {
        setPersonWorksLoading(false);
      }
    },
    [selectedPersonId],
  );

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
                        <PeopleCarousel
                          items={data.directors}
                          selectedId={selectedPersonId}
                          onSelect={handleSelectPerson}
                        />
                      )}
                      {g.key === 'actors' && (
                        <PeopleCarousel
                          items={data.actors}
                          selectedId={selectedPersonId}
                          onSelect={handleSelectPerson}
                        />
                      )}
                      {/* 2026-05-20 — 선택된 인물의 person-works 카로셀 (그 인물이
                          현재 group 에 속해있을 때만). PWA SearchSheet 의 inline
                          panel 동작 정합. */}
                      {(g.key === 'directors' || g.key === 'actors') &&
                        selectedPersonId !== null &&
                        (g.key === 'directors' ? data.directors : data.actors).some(
                          (p) => p.id === selectedPersonId,
                        ) && (
                          <PersonWorksPanel
                            loading={personWorksLoading}
                            error={personWorksError}
                            works={personWorks}
                            onSelect={onWorkSelected}
                            onRetry={() => {
                              const p = (g.key === 'directors'
                                ? data.directors
                                : data.actors
                              ).find((x) => x.id === selectedPersonId);
                              if (p) void handleSelectPerson(p);
                            }}
                          />
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
// PeopleCarousel — 감독/배우. 2026-05-20 PWA 정합 — 인물 클릭 시 person-works 표시.
// ─────────────────────────────────────────────────────

const PERSON_CARD_W = 96;

function PeopleCarousel({
  items,
  selectedId,
  onSelect,
}: {
  items: PersonResult[];
  selectedId: number | null;
  onSelect: (p: PersonResult) => void;
}) {
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
      renderItem={({ item }) => (
        <PersonCard
          person={item}
          isSelected={item.id === selectedId}
          onSelect={onSelect}
        />
      )}
    />
  );
}

function PersonCard({
  person,
  isSelected,
  onSelect,
}: {
  person: PersonResult;
  isSelected: boolean;
  onSelect: (p: PersonResult) => void;
}) {
  const knownForText =
    person.knownFor.length > 0
      ? person.knownFor.map((k) => k.title).join(', ')
      : null;
  return (
    <Pressable
      onPress={() => onSelect(person)}
      accessibilityLabel={`${person.name} 필모그래피 ${isSelected ? '닫기' : '보기'}`}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      style={({ pressed }) => [
        styles.personCard,
        pressed && { opacity: 0.6 },
      ]}
    >
      <View
        style={[
          styles.personAvatar,
          isSelected && { borderColor: colors.accent, borderWidth: 2 },
        ]}
      >
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
      <Text
        style={[
          styles.personName,
          isSelected && { color: colors.accent, fontWeight: '600' },
        ]}
        numberOfLines={1}
      >
        {person.name}
      </Text>
      {knownForText && (
        <Text style={styles.personKnownFor} numberOfLines={1}>
          {knownForText}
        </Text>
      )}
    </Pressable>
  );
}

// 2026-05-20 — 선택된 인물의 필모그래피 panel. PWA SearchSheet 의 inline panel 정합.
function PersonWorksPanel({
  loading,
  error,
  works,
  onSelect,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  works: SearchResult[];
  onSelect?: (rec: Recommendation) => void;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <View style={styles.personWorksLoading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.personWorksError}>
        <Text style={styles.personWorksErrorText}>필모그래피를 불러올 수 없어요</Text>
        <Pressable
          onPress={onRetry}
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
    );
  }
  if (works.length === 0) return null;
  return (
    <View style={styles.personWorksWrap}>
      <WorksCarousel items={works} onSelect={onSelect} />
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
  // 2026-05-20 — person-works inline panel (PWA SearchSheet 정합).
  personWorksWrap: {
    marginTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  personWorksLoading: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  personWorksError: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  personWorksErrorText: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
