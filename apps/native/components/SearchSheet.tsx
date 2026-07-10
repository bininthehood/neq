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
  cancelAnimation,
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
import { track } from '../lib/analytics';
import {
  addRecentSearch,
  getRecentSearches,
  removeRecentSearch,
  type RecentSearch,
  type TrendingItem,
} from '../lib/recent-searches';
import { colors, radius, spacing } from '../lib/tokens';
import { IconClose } from './Icons';
import ApertureBreathLoader from './feedback/ApertureBreathLoader';
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
  // 2026-05-29 — PWA 정합. idle 상태에서 Recent + Trending 노출 (D10b 패턴).
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  const [trending, setTrending] = useState<TrendingItem[]>([]);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<TextInput>(null);
  const translateY = useSharedValue(SHEET_MAX_HEIGHT);

  // Reanimated 4 Fabric crash 메모리 정합 (feedback_reanimated_fabric_crash) —
  // unmount 시 in-flight withTiming worklet 취소. dismiss 애니메이션 도중 언마운트
  // 되면 완료 콜백이 stale tree 를 건드릴 수 있어 cancelAnimation 으로 차단.
  useEffect(() => {
    return () => cancelAnimation(translateY);
  }, [translateY]);

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
      // 2026-05-29 — recent 기록은 명시 의도 (submit 또는 결과 클릭) 시점에만 (PWA
      // 정책과 의도적 차이). 디바운싱 중간 키스트로크가 누적 저장되는 회귀 차단.
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

  // 2026-05-29 — sheet open 시 idle 컨텐츠 (Recent / Trending) 준비 (PWA D10b 정합).
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      const latest = await getRecentSearches();
      if (cancelled) return;
      setRecents(latest);
    })();
    (async () => {
      try {
        const res = await fetch(`${env.API_BASE_URL}/api/trending`);
        if (!res.ok) return;
        const data = (await res.json()) as TrendingItem[];
        if (cancelled) return;
        setTrending(Array.isArray(data) ? data : []);
      } catch {
        // 무시 — trending 은 보조 컨텐츠
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  // visible 토글 — 열릴 때 미세 spring(bezier) up, 닫힐 때 timing down + 상태 리셋.
  // PWA SearchSheet 와 동일 곡선 — 큰 오버슈트 없는 짧은 진입.
  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, {
        duration: SHEET_ENTER_MS,
        easing: SHEET_ENTER_BEZIER,
      });
      // 2026-05-29 v2 — TextInput 명시 focus. autoFocus 잔재 / Modal 첫 frame race
      // 회피 (사용자 보고: Profile 탭 검색 결과 0건 후속 회귀). Modal 의 mount 와
      // 키보드 표시 사이에 짧은 지연을 두어 안정적으로 focus.
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
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

  // 2026-05-29 — recent 기록 헬퍼. 현재 query 가 의미 있을 때만 add + UI 갱신.
  // 호출 시점 — onSubmitEditing (return 키) / 결과 클릭 (작품 / 인물).
  // fetch 안에서 자동 add 하지 않음 — 디바운싱 중간 키스트로크 누적 회귀 차단.
  const confirmRecent = useCallback(async () => {
    const trimmed = query.trim();
    if (trimmed.length === 0) return;
    await addRecentSearch(trimmed);
    const latest = await getRecentSearches();
    setRecents(latest);
  }, [query]);

  // 결과 작품 클릭 wrapper — parent onWorkSelected 호출 직전에 recent 기록.
  // 03_p2: 선택 시 키보드 dismiss — DetailSheet 진입 직전 시야 확보.
  const handleSelectWork = useCallback(
    (rec: Recommendation) => {
      void confirmRecent();
      Keyboard.dismiss();
      onWorkSelected?.(rec);
    },
    [confirmRecent, onWorkSelected],
  );

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
      // 명시 선택이므로 recent 기록 — 인물 결과 클릭 시점.
      // 03_p2: 새 인물 선택 시 키보드 dismiss — 필모그래피 영역 시야 확보.
      // toggle 닫기 분기는 위에서 return — query 입력 컨텍스트 유지를 위해 dismiss X.
      void confirmRecent();
      Keyboard.dismiss();
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
    [selectedPersonId, confirmRecent],
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

  // pan-down 으로 sheet 닫기. GestureDetector 는 상단 header(handle+search row)
  // 영역에만 부착 — body 의 idle ScrollView / 가로 카로셀 FlatList 와 세로 드래그가
  // 충돌하지 않도록. (DetailSheet 은 단일 ScrollView 라 scrollY 가드로 충분하지만
  // SearchSheet body 는 이질적 스크롤 컨테이너 다수 → 핸들 영역 한정이 가장 안전.)
  //
  // 임계 충돌 회피 (feedback_pan_gesture_offset_conflict): activeOffsetY 단일 하한(8)
  // 만 두고 failOffsetY 는 두지 않는다 — 범위가 겹치면 activate 전에 fail. downward
  // 8px+ 만 pan 진입, 수평 이동은 failOffsetX 로 차단(제목 등 미세 흔들림 무시).
  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      'worklet';
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      'worklet';
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
        accessibilityLabel="검색 시트"
      >
        <Animated.View style={[styles.dim, dimStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityLabel="검색 닫기"
            accessibilityRole="button"
          />
        </Animated.View>

          <Animated.View style={[styles.sheet, sheetStyle]}>
            {/* pan-down dismiss 는 상단 header(handle+search row) 에만 부착 —
                아래 body 의 스크롤 콘텐츠와 세로 드래그 충돌 방지. */}
            <GestureDetector gesture={pan}>
              <View>
            {/* handle */}
            <View style={styles.handleRow}>
              <View style={styles.handleBar} />
            </View>

            {/* search input + 취소 */}
            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <TextInput
                  ref={inputRef}
                  value={query}
                  onChangeText={handleInput}
                  placeholder="작품, 감독, 배우"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  autoCorrect={false}
                  // 2026-05-29 v2 — visible 가드 제거. <Modal visible=false> 는
                  // children 자체를 null 반환 (RN 내부) → 다른 탭의 input 은 애초에
                  // 마운트되지 않음. editable={visible} 가드는 무의미 + Profile 탭에서
                  // 일부 환경에서 input 비활성 잔재 회귀 가능성. 명시 focus 는 visible
                  // useEffect 에서 inputRef.current?.focus() 로 신뢰성 확보.
                  editable
                  returnKeyType="search"
                  onSubmitEditing={() => {
                    // 명시 의도 — return 키 (search). recent 기록.
                    void confirmRecent();
                    Keyboard.dismiss();
                  }}
                  accessibilityLabel="검색"
                />
                {query.length > 0 && (
                  <Pressable
                    onPress={() => {
                      // clear 후 input 에 즉시 focus — 사용자가 새 검색어 입력
                      // 흐름이 끊기지 않도록. clear → 키보드 닫힘 회귀 방지.
                      handleInput('');
                      inputRef.current?.focus();
                    }}
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
              </View>
            </GestureDetector>

            {/* body */}
            <View style={styles.body}>
              {uiState === 'idle' && (
                <IdleContent
                  recents={recents}
                  trending={trending}
                  onApplyQuery={handleInput}
                  onRemoveRecent={async (q) => {
                    await removeRecentSearch(q);
                    const latest = await getRecentSearches();
                    setRecents(latest);
                  }}
                />
              )}

              {uiState === 'loading' && (
                <View
                  style={styles.centered}
                  accessibilityLiveRegion="polite"
                  accessibilityLabel="검색 중"
                >
                  <ApertureBreathLoader size={56} />
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
                          onSelect={handleSelectWork}
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
                            onSelect={handleSelectWork}
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
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────
// WorksCarousel — 작품 카로셀 (FlatList horizontal, snap)
// ─────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────
// IdleContent — query 비어있을 때 (Recent / Trending) (PWA D10b 정합).
// ─────────────────────────────────────────────────────

function IdleContent({
  recents,
  trending,
  onApplyQuery,
  onRemoveRecent,
}: {
  recents: RecentSearch[];
  trending: TrendingItem[];
  onApplyQuery: (q: string) => void;
  onRemoveRecent: (q: string) => void;
}) {
  if (recents.length === 0 && trending.length === 0) {
    return (
      <View style={styles.idleWrap}>
        <Text style={styles.hint}>작품, 감독, 배우 이름으로 검색해보세요</Text>
      </View>
    );
  }
  return (
    <ScrollView
      style={styles.idleScroll}
      contentContainerStyle={styles.idleContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {recents.length > 0 && (
        <View accessibilityLabel="최근 검색어">
          <Text style={styles.sectionHead}>RECENT · 최근 검색</Text>
          <View style={styles.chipRow}>
            {recents.slice(0, 7).map((r) => (
              <RecentChip
                key={r.query}
                query={r.query}
                onApply={() => onApplyQuery(r.query)}
                onRemove={() => onRemoveRecent(r.query)}
              />
            ))}
          </View>
        </View>
      )}
      {trending.length > 0 && (
        <View accessibilityLabel="지금 검색해볼 만한 제안" style={styles.trendingSection}>
          {/* 2026-06-15 (build 27 fix iter2) — 사용자 결정 라벨: `SUGGESTED · 제안`.
              이전 fix iter1 의 `제안 · 지금 검색해볼 만한` + 신규 sectionHeadAlt 스타일
              (textSecondary / 500 / sentence-case) 은 RECENT (sectionHead, textPrimary /
              600 / ALL CAPS) 와 위계 불일치. RECENT 와 시각 위계 균등하게 sectionHead
              스타일 재사용 → SUGGESTED 도 영문 약어로 ALL CAPS 정당성 확보. */}
          <Text style={styles.sectionHead}>SUGGESTED · 제안</Text>
          <View style={styles.chipRow}>
            {trending.slice(0, 6).map((t) => (
              <TrendingChip
                key={t.id}
                label={t.title}
                onPress={() => {
                  onApplyQuery(t.title);
                  track('search_trending_clicked', { tmdb_id: t.id, title: t.title });
                }}
              />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function RecentChip({
  query,
  onApply,
  onRemove,
}: {
  query: string;
  onApply: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.recentChip}>
      <Pressable
        onPress={onApply}
        accessibilityRole="button"
        accessibilityLabel={`${query} 다시 검색`}
        style={({ pressed }) => [styles.recentChipBody, pressed && styles.chipPressed]}
      >
        <Text style={styles.recentChipMark}>↺ </Text>
        <Text style={styles.recentChipText}>{query}</Text>
      </Pressable>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`${query} 검색 기록에서 제거`}
        hitSlop={8}
        style={({ pressed }) => [styles.recentChipRemove, pressed && styles.chipPressed]}
      >
        <IconClose size={9} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

function TrendingChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} 검색`}
      style={({ pressed }) => [styles.trendingChip, pressed && styles.chipPressed]}
    >
      <Text style={styles.trendingChipText}>{label}</Text>
    </Pressable>
  );
}

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
  mode = 'carousel',
}: {
  item: SearchResult;
  onSelect?: (rec: Recommendation) => void;
  /** 2026-05-29 — PWA 정합. 인물 필모그래피는 3열 그리드 ('grid'), 검색 결과는 가로 ('carousel'). */
  mode?: 'carousel' | 'grid';
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
  const isGrid = mode === 'grid';
  return (
    <Pressable
      onPress={handlePress}
      disabled={loading || !onSelect}
      style={({ pressed }) => [
        isGrid ? styles.workCardGrid : styles.workCard,
        pressed && { opacity: 0.6 },
      ]}
      accessibilityLabel={item.title}
      accessibilityRole="button"
    >
      <View style={isGrid ? styles.workPosterFrameGrid : styles.workPosterFrame}>
        {item.posterUrl ? (
          <Image
            source={{ uri: item.posterUrl }}
            style={styles.workPoster}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            recyclingKey={item.posterUrl}
          />
        ) : (
          <View style={[styles.workPoster, styles.workPosterFallback]}>
            <Text style={styles.workPosterFallbackText} numberOfLines={1}>
              {item.title.slice(0, 8)}
            </Text>
          </View>
        )}
      </View>
      <Text style={isGrid ? styles.workTitleGrid : styles.workTitle} numberOfLines={2}>
        {item.title}
      </Text>
      {!isGrid && (
        <Text style={styles.workMeta} numberOfLines={1}>
          {item.mediaType === 'tv' ? '시리즈' : '영화'}
          {item.year ? ` · ${item.year}` : ''}
          {item.rating > 0 ? ` · ★ ${item.rating.toFixed(1)}` : ''}
        </Text>
      )}
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
            transition={150}
            cachePolicy="memory-disk"
            recyclingKey={person.profileUrl}
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
/**
 * 2026-05-29 v2 — 인물 필모그래피 3열 그리드.
 *
 * v1 회귀 (build 12): useWindowDimensions + 이론 padding 차감으로 cardWidth 계산 →
 * SafeArea/스크롤바 등 실제 부모 폭과 미세 차이로 wrap 발생, 한 줄에 2개만 표출 +
 * 좌측 정렬. onLayout 으로 worksGrid 의 실제 측정 폭에서 cardWidth 산출 → 픽셀 정확.
 */
const PERSON_GRID_GAP = 10; // spacing.sm + 2

function WorksGrid({
  items,
  onSelect,
}: {
  items: SearchResult[];
  onSelect?: (rec: Recommendation) => void;
}) {
  const [gridW, setGridW] = useState(0);
  const cardWidth =
    gridW > 0 ? Math.floor((gridW - 2 * PERSON_GRID_GAP) / 3) : 0;
  return (
    <View
      style={styles.worksGrid}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (Math.abs(w - gridW) > 0.5) setGridW(w);
      }}
    >
      {cardWidth > 0 &&
        items.map((w) => (
          <View key={`pw-${w.id}-${w.mediaType}`} style={{ width: cardWidth }}>
            <WorkCard item={w} onSelect={onSelect} mode="grid" />
          </View>
        ))}
    </View>
  );
}

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
      <View style={styles.personWorksWrap}>
        <View style={styles.personWorksLoading}>
          <ApertureBreathLoader size={48} />
        </View>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.personWorksWrap}>
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
      </View>
    );
  }
  if (works.length === 0) return null;
  return (
    <View style={styles.personWorksWrap}>
      <WorksGrid items={works} onSelect={onSelect} />
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
  // 2026-05-29 — IdleContent (Recent + Trending) 스타일. PWA D10b 정합.
  idleScroll: { flex: 1 },
  idleContent: { paddingBottom: spacing.md },
  sectionHead: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs + 2,
  },
  // 2026-06-15 (build 27 fix iter2) — sectionHeadAlt 제거.
  // 사유: SUGGESTED 라벨 채택으로 sectionHead 와 시각 위계 균등 유지 결정.
  // RECENT 와 동일 스타일 (textPrimary / 600 / ALL CAPS / 1.3 letterSpacing) 재사용.
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
  },
  trendingSection: { marginTop: spacing.xs },
  // Recent chip — 라벨 + × 버튼 분리된 split chip.
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
  },
  recentChipBody: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.sm + 4,
    paddingRight: 6,
    paddingVertical: 6,
  },
  recentChipMark: { color: colors.textMuted, fontSize: 12 },
  recentChipText: { color: colors.textPrimary, fontSize: 12, fontWeight: '500' },
  recentChipRemove: {
    paddingLeft: 4,
    paddingRight: spacing.sm + 2,
    paddingVertical: 6,
  },
  chipPressed: { opacity: 0.7 },
  // Trending chip — accent dim 배경 단일 버튼.
  trendingChip: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentDim,
  },
  trendingChipText: { color: colors.accent, fontSize: 12, fontWeight: '500' },

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
  // 2026-05-29 — person-works inline panel (PWA SelectedPersonPanel 정합).
  // `mx-6 mt-2 p-4 rounded-lg + surface 배경 + border + 상단 amber-border-light`
  // 정합. 선택 인물 카드 바로 아래 카드처럼 부착되어 시각적 연결.
  personWorksWrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs + 2,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.accentBorder,
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
  // 2026-05-29 — 3열 그리드 (PWA `grid grid-cols-3 gap-2.5` 정합).
  // gap 으로 행/열 균등. RN 0.71+ flexbox gap 지원.
  // 카드 width 는 WorksGrid 가 useWindowDimensions 으로 계산해 외부 View 에 적용.
  // 카드 width 는 WorksGrid 가 onLayout 으로 실제 측정 폭에서 계산.
  worksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10, // PERSON_GRID_GAP 동기 — 행 + 열 간격
  },
  workCardGrid: {
    width: '100%',
  },
  workPosterFrameGrid: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  workTitleGrid: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
    lineHeight: 14,
  },
});
