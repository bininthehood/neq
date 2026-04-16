import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  ActivityIndicator,
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
          <GestureDetector gesture={pan}>
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
            </Animated.View>
          </GestureDetector>
        )}

        {exhausted && (
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>모두 봤어요</Text>
            <Pressable style={styles.resetBtn} onPress={() => load()}>
              <Text style={styles.resetText}>새 추천 받기</Text>
            </Pressable>
          </View>
        )}
      </View>

      {state === 'ready' && currentRec && (
        <View style={styles.actionBar}>
          <Pressable
            style={[styles.likeBtn, isLiked && styles.likeBtnActive]}
            onPress={toggleLike}
          >
            <Text style={[styles.likeText, isLiked && styles.likeTextActive]}>
              {isLiked ? '♥ 좋아요' : '♡ 좋아요'}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.hint}>
          {state === 'ready' ? '← 다음 · 이전 →' : ''}
        </Text>
      </View>
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
    fontSize: 22,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  actionBar: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  likeBtn: {
    minWidth: 200,
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 4,
    borderRadius: 999,
  },
  likeBtnActive: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accentBorder,
  },
  likeText: { color: colors.textSecondary, fontWeight: '600', fontSize: 15 },
  likeTextActive: { color: colors.accent },
  footer: { paddingVertical: spacing.sm, alignItems: 'center' },
  hint: { color: colors.textMuted, fontSize: 12 },
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
