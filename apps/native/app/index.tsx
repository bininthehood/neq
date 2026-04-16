import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  runOnJS,
  withTiming,
} from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import SwipeCard from '../components/SwipeCard';
import PrevCardOverlay from '../components/PrevCardOverlay';
import FilterChips, { OTT_OPTIONS } from '../components/FilterChips';
import DetailSheet from '../components/DetailSheet';
import ActionBar from '../components/ActionBar';
import TutorialOverlay from '../components/TutorialOverlay';
import { fetchRecommendations } from '../lib/api';
import { getSaved, toggleSaved } from '../lib/store';
import type {
  Recommendation,
  RecommendFilter,
  FilterType,
  FilterOrigin,
  FilterYear,
} from '../lib/types';
import { colors, spacing } from '../lib/tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NEXT_THRESHOLD = -80;
const PREV_OVERLAY_TRIGGER = 0.3;

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

function toApiFilter(
  type: FilterType,
  origin: FilterOrigin,
  year: FilterYear,
  otts: Set<string>,
): RecommendFilter {
  const filter: RecommendFilter = {};
  if (type !== 'all') filter.type = type;
  if (origin !== 'all') filter.origin = origin;
  if (year !== 'all') filter.year = year;
  if (otts.size > 0) filter.ott = [...otts];
  return filter;
}

export default function DiscoverScreen() {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [state, setState] = useState<LoadState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [topIdx, setTopIdx] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterOrigin, setFilterOrigin] = useState<FilterOrigin>('all');
  const [filterYear, setFilterYear] = useState<FilterYear>('all');
  const [filterOTTs, setFilterOTTs] = useState<Set<string>>(new Set());

  const prevOverlayX = useSharedValue(-SCREEN_WIDTH);
  const [prevActive, setPrevActive] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(
    async (filter: RecommendFilter = {}) => {
      setState('loading');
      setErrorMsg(null);
      try {
        const data = await fetchRecommendations({ filter });
        setRecs(data);
        setTopIdx(0);
        setState('ready');
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : '알 수 없는 오류');
        setState('error');
      }
    },
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  function applyFilterChange(nextState: {
    type?: FilterType;
    origin?: FilterOrigin;
    year?: FilterYear;
    otts?: Set<string>;
  }) {
    const nextType = nextState.type ?? filterType;
    const nextOrigin = nextState.origin ?? filterOrigin;
    const nextYear = nextState.year ?? filterYear;
    const nextOtts = nextState.otts ?? filterOTTs;

    if (nextState.type !== undefined) setFilterType(nextType);
    if (nextState.origin !== undefined) setFilterOrigin(nextOrigin);
    if (nextState.year !== undefined) setFilterYear(nextYear);
    if (nextState.otts !== undefined) setFilterOTTs(nextOtts);

    load(toApiFilter(nextType, nextOrigin, nextYear, nextOtts));
  }

  useFocusEffect(
    useCallback(() => {
      getSaved().then((items) => {
        setSavedIds(new Set(items.map((s) => s.recommendation.tmdbId)));
      });
    }, []),
  );

  const currentRec = recs[topIdx];
  const prevRec = topIdx > 0 ? recs[topIdx - 1] : null;

  function hapticLight() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }

  function toNext() {
    hapticLight();
    setTopIdx((i) => Math.min(i + 1, recs.length));
  }

  function toPrev() {
    hapticLight();
    setTopIdx((i) => Math.max(i - 1, 0));
  }

  async function toggleLike() {
    if (!currentRec) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const nowSaved = await toggleSaved(currentRec);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (nowSaved) next.add(currentRec.tmdbId);
      else next.delete(currentRec.tmdbId);
      return next;
    });
  }

  async function handleShare() {
    if (!currentRec) return;
    try {
      await Share.share({
        message: `${currentRec.title} (${currentRec.titleEn}) — Neko 추천`,
      });
    } catch {
      /* user dismissed */
    }
  }

  function handleRefresh() {
    const filter = toApiFilter(filterType, filterOrigin, filterYear, filterOTTs);
    load(filter);
  }

  const tap = Gesture.Tap()
    .maxDuration(250)
    .maxDistance(10)
    .onStart(() => {
      if (currentRec) runOnJS(setDetailOpen)(true);
    });

  const pan = Gesture.Pan()
    .onBegin(() => {
      runOnJS(setIsDragging)(true);
    })
    .onUpdate((e) => {
      if (e.translationX > 0 && prevRec) {
        runOnJS(setPrevActive)(true);
        prevOverlayX.value = -SCREEN_WIDTH + e.translationX;
        runOnJS(setDragX)(0);
      } else {
        runOnJS(setPrevActive)(false);
        runOnJS(setDragX)(e.translationX);
      }
    })
    .onEnd((e) => {
      runOnJS(setIsDragging)(false);

      if (e.translationX > 0 && prevRec) {
        const progress = 1 + prevOverlayX.value / SCREEN_WIDTH;
        if (progress > PREV_OVERLAY_TRIGGER) {
          prevOverlayX.value = withTiming(0, { duration: 220 }, () => {
            runOnJS(toPrev)();
            prevOverlayX.value = -SCREEN_WIDTH;
            runOnJS(setPrevActive)(false);
          });
        } else {
          prevOverlayX.value = withTiming(-SCREEN_WIDTH, { duration: 220 }, () => {
            runOnJS(setPrevActive)(false);
          });
        }
      } else {
        if (e.translationX < NEXT_THRESHOLD) {
          runOnJS(toNext)();
        }
        runOnJS(setDragX)(0);
      }
    });

  const cardsToShow = recs.slice(topIdx, topIdx + 3);
  const isLiked = currentRec ? savedIds.has(currentRec.tmdbId) : false;
  const exhausted = state === 'ready' && cardsToShow.length === 0;

  const availableOTTs = OTT_OPTIONS.filter((ott) =>
    recs.some((r) => r.providers.some((p) => p.name === ott)),
  );

  const hasFilter =
    filterType !== 'all' ||
    filterOrigin !== 'all' ||
    filterYear !== 'all' ||
    filterOTTs.size > 0;

  const { emptyTitle, emptyHint } = (() => {
    if (!hasFilter) {
      return {
        emptyTitle: '모두 봤어요',
        emptyHint: '새 추천을 불러오면 다른 작품이 나타나요',
      };
    }
    if (filterOrigin === 'kr') {
      return {
        emptyTitle: '국내 작품을 찾지 못했어요',
        emptyHint: '필터를 완화하면 해외 작품도 함께 보여드릴게요',
      };
    }
    if (filterOTTs.size > 0) {
      return {
        emptyTitle: '선택한 OTT에서 찾지 못했어요',
        emptyHint: 'OTT 필터를 풀고 다시 시도해보세요',
      };
    }
    return {
      emptyTitle: '이 조건에선 추천이 없어요',
      emptyHint: '필터를 초기화하거나 다시 시도해보세요',
    };
  })();

  function clearFilters() {
    setFilterType('all');
    setFilterOrigin('all');
    setFilterYear('all');
    setFilterOTTs(new Set());
    load({});
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.logo}>Neko</Text>
        <Text style={styles.counter}>
          {state === 'ready' ? `${Math.min(topIdx + 1, recs.length)} / ${recs.length}` : ''}
        </Text>
      </View>

      <FilterChips
        filterType={filterType}
        filterOrigin={filterOrigin}
        filterYear={filterYear}
        filterOTTs={filterOTTs}
        availableOTTs={availableOTTs}
        disabled={state === 'loading'}
        onFilterChange={(t, o) => applyFilterChange({ type: t, origin: o })}
        onYearChange={(y) => applyFilterChange({ year: y })}
        onOTTChange={(otts) => applyFilterChange({ otts })}
      />

      <View style={styles.stackWrap}>
        {state === 'loading' && (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.loadingText}>추천을 준비하고 있어요…</Text>
          </View>
        )}

        {state === 'error' && (
          <View style={styles.centered}>
            <Text style={styles.errorTitle}>요청이 실패했어요</Text>
            <Text style={styles.errorDetail}>{errorMsg}</Text>
            <Pressable style={styles.resetBtn} onPress={() => load()}>
              <Text style={styles.resetText}>다시 시도</Text>
            </Pressable>
          </View>
        )}

        {state === 'ready' && !exhausted && (
          <GestureDetector gesture={Gesture.Exclusive(tap, pan)}>
            <Animated.View style={styles.stack}>
              {cardsToShow
                .slice()
                .reverse()
                .map((rec, i) => {
                  const depth = cardsToShow.length - 1 - i;
                  return (
                    <SwipeCard
                      key={rec.tmdbId}
                      rec={rec}
                      isTop={depth === 0}
                      depth={depth}
                      dragX={depth === 0 ? dragX : 0}
                      isDragging={isDragging}
                    />
                  );
                })}
              {prevActive && prevRec && (
                <PrevCardOverlay rec={prevRec} overlayX={prevOverlayX} />
              )}
              <TutorialOverlay visible={topIdx < 3 && !isDragging && !prevActive} />
            </Animated.View>
          </GestureDetector>
        )}

        {exhausted && (
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>{emptyTitle}</Text>
            <Text style={styles.emptyHint}>{emptyHint}</Text>
            <View style={styles.emptyActions}>
              {hasFilter && (
                <Pressable style={styles.resetBtnSecondary} onPress={clearFilters}>
                  <Text style={styles.resetTextSecondary}>필터 초기화</Text>
                </Pressable>
              )}
              <Pressable style={styles.resetBtn} onPress={handleRefresh}>
                <Text style={styles.resetText}>다시 시도</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {state === 'ready' && currentRec && (
        <ActionBar
          isSaved={isLiked}
          onShare={handleShare}
          onRefresh={handleRefresh}
          onToggleSave={toggleLike}
        />
      )}

      <DetailSheet
        rec={currentRec ?? null}
        visible={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  logo: { color: colors.accent, fontSize: 20, fontWeight: '700', letterSpacing: 1 },
  counter: { color: colors.textMuted, fontSize: 13 },
  stackWrap: { flex: 1 },
  stack: { flex: 1, position: 'relative' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  loadingText: { color: colors.textMuted, fontSize: 14, marginTop: spacing.sm },
  errorTitle: { color: colors.danger, fontSize: 16, fontWeight: '700' },
  errorDetail: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  emptyHint: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: spacing.md,
    lineHeight: 19,
  },
  emptyActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  resetBtnSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: 999,
  },
  resetTextSecondary: { color: colors.textSecondary, fontWeight: '600' },
  resetBtn: {
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: 999,
  },
  resetText: { color: colors.accent, fontWeight: '600' },
});
