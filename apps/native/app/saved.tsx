import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Rect, Line } from 'react-native-svg';
import { getSaved, removeSaved } from '../lib/store';
import type { SavedItem } from '../lib/types';
import { colors, radius, spacing } from '../lib/tokens';
import { fonts } from '@neq/design';
import { track } from '../lib/analytics';

const COLS = 2;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_W = (SCREEN_WIDTH - spacing.md * (COLS + 1)) / COLS;

/**
 * 위임 O #2 — Saved 뷰 모드 (web 위임 L #6 동기화).
 *  - "grid": 기본 2열 그리드 (현재 동작)
 *  - "list": 1열 가로 카드 (포스터 60×90 + 제목/메타)
 * 키: 'neq_saved_view' — web localStorage 키와 동일.
 */
type SavedViewMode = 'grid' | 'list';
const SAVED_VIEW_KEY = 'neq_saved_view';

async function loadSavedView(): Promise<SavedViewMode> {
  try {
    const v = await AsyncStorage.getItem(SAVED_VIEW_KEY);
    if (v === 'list' || v === 'grid') return v;
  } catch {
    /* ignore */
  }
  return 'grid';
}

async function persistSavedView(mode: SavedViewMode): Promise<void> {
  try {
    await AsyncStorage.setItem(SAVED_VIEW_KEY, mode);
  } catch {
    /* ignore */
  }
}

/**
 * 위임 O #2 — IconGrid/IconList (web Icons.tsx 와 시각 정합).
 * 16×16 viewBox + stroke 1.4 + linecap square. 색상은 props.
 */
function IconGrid({ size = 14, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Rect x="2" y="2" width="5" height="5" stroke={color} strokeWidth={1.4} strokeLinecap="square" />
      <Rect x="9" y="2" width="5" height="5" stroke={color} strokeWidth={1.4} strokeLinecap="square" />
      <Rect x="2" y="9" width="5" height="5" stroke={color} strokeWidth={1.4} strokeLinecap="square" />
      <Rect x="9" y="9" width="5" height="5" stroke={color} strokeWidth={1.4} strokeLinecap="square" />
    </Svg>
  );
}
function IconList({ size = 14, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Line x1="2.5" y1="3.5" x2="13.5" y2="3.5" stroke={color} strokeWidth={1.4} strokeLinecap="square" />
      <Line x1="2.5" y1="8" x2="13.5" y2="8" stroke={color} strokeWidth={1.4} strokeLinecap="square" />
      <Line x1="2.5" y1="12.5" x2="13.5" y2="12.5" stroke={color} strokeWidth={1.4} strokeLinecap="square" />
    </Svg>
  );
}

export default function SavedScreen() {
  const [items, setItems] = useState<SavedItem[]>([]);
  // 위임 O #2 — 뷰 모드. 첫 mount 시 AsyncStorage 에서 복원.
  const [viewMode, setViewMode] = useState<SavedViewMode>('grid');

  useFocusEffect(
    useCallback(() => {
      getSaved().then(setItems);
    }, []),
  );

  // 첫 mount 시 1회 — 저장된 뷰 모드 복원.
  useEffect(() => {
    loadSavedView().then(setViewMode);
  }, []);

  const handleViewModeChange = useCallback((mode: SavedViewMode) => {
    setViewMode(mode);
    void persistSavedView(mode);
    track('saved_view_changed', { mode });
  }, []);

  async function handleRemove(tmdbId: number) {
    await removeSaved(tmdbId);
    setItems((prev) => prev.filter((s) => s.recommendation.tmdbId !== tmdbId));
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>저장한 작품</Text>
          <Text style={styles.counter}>{items.length}개</Text>
        </View>
        {/* 위임 O #2 — 뷰 모드 segmented (grid/list). items 비어있으면 숨김. */}
        {items.length > 0 && (
          <View
            style={styles.segmented}
            accessibilityRole="tablist"
            accessibilityLabel="뷰 모드 전환"
          >
            <Pressable
              onPress={() => handleViewModeChange('grid')}
              accessibilityRole="tab"
              accessibilityLabel="그리드 보기"
              accessibilityState={{ selected: viewMode === 'grid' }}
              style={[
                styles.segmentBtn,
                viewMode === 'grid' && styles.segmentBtnActive,
              ]}
              hitSlop={4}
            >
              <IconGrid
                size={14}
                color={viewMode === 'grid' ? colors.accent : colors.textMuted}
              />
            </Pressable>
            <Pressable
              onPress={() => handleViewModeChange('list')}
              accessibilityRole="tab"
              accessibilityLabel="리스트 보기"
              accessibilityState={{ selected: viewMode === 'list' }}
              style={[
                styles.segmentBtn,
                viewMode === 'list' && styles.segmentBtnActive,
              ]}
              hitSlop={4}
            >
              <IconList
                size={14}
                color={viewMode === 'list' ? colors.accent : colors.textMuted}
              />
            </Pressable>
          </View>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>아직 저장한 작품이 없어요</Text>
          <Text style={styles.emptyHint}>발견 탭에서 ♡ 좋아요를 눌러보세요</Text>
        </View>
      ) : viewMode === 'list' ? (
        // 위임 O #2 — List 뷰. 1열 가로 카드 (60×90 포스터).
        <FlatList
          data={items}
          keyExtractor={(s) => String(s.recommendation.tmdbId)}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <ListCard item={item} onRemove={handleRemove} />
          )}
        />
      ) : (
        // 기본 그리드 뷰
        <FlatList
          data={items}
          keyExtractor={(s) => String(s.recommendation.tmdbId)}
          numColumns={COLS}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
          columnWrapperStyle={{ gap: spacing.md }}
          renderItem={({ item, index }) => {
            const tall = index % 3 === 0;
            return (
              <Pressable
                style={[styles.card, { width: CARD_W, height: tall ? 240 : 200 }]}
                onLongPress={() => handleRemove(item.recommendation.tmdbId)}
              >
                {item.recommendation.posterUrl ? (
                  <Image
                    source={{ uri: item.recommendation.posterUrl }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <View style={[StyleSheet.absoluteFill, styles.fallback]}>
                    <Text style={styles.fallbackText}>N</Text>
                  </View>
                )}
                <View style={styles.label}>
                  <Text style={styles.labelText} numberOfLines={1}>
                    {item.recommendation.title}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

/**
 * ListCard — 위임 O #2 / web ListCard 동기화.
 * 가로 카드 = 포스터 60×90 + 제목/평점/타입+런타임/OTT 칩.
 * onLongPress 로 삭제 (Grid 와 동일 인터랙션).
 */
function ListCard({
  item,
  onRemove,
}: {
  item: SavedItem;
  onRemove: (tmdbId: number) => void;
}) {
  const rec = item.recommendation;
  const meta: string[] = [];
  if (rec.type === 'movie' && rec.runtime) meta.push(`${rec.runtime}분`);
  if (rec.type === 'series' && rec.seasons) meta.push(`시즌 ${rec.seasons}`);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.listCard,
        pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
      ]}
      onLongPress={() => onRemove(rec.tmdbId)}
      accessibilityRole="button"
      accessibilityLabel={`${rec.title} 상세보기`}
    >
      <View style={styles.listPosterFrame}>
        {rec.posterUrl ? (
          <Image
            source={{ uri: rec.posterUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.fallback]}>
            <Text style={styles.listPosterFallback}>N</Text>
          </View>
        )}
      </View>
      <View style={styles.listBody}>
        <Text style={styles.listTitle} numberOfLines={1}>
          {rec.title}
        </Text>
        <View style={styles.listMetaRow}>
          <Text style={styles.listRating}>★ {rec.rating.toFixed(1)}</Text>
          {meta.length > 0 && (
            <Text style={styles.listMeta}>· {meta.join(' · ')}</Text>
          )}
        </View>
        {rec.providers.length > 0 && (
          <Text style={styles.listProviders} numberOfLines={1}>
            {rec.providers.slice(0, 3).map((p) => p.name).join(' · ')}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    minWidth: 0,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontFamily: fonts.display,
  },
  counter: { color: colors.textMuted, fontSize: 13 },
  // 위임 O #2 — segmented 컨테이너 + 버튼.
  segmented: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    padding: 2,
  },
  segmentBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: colors.accentDim,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  emptyHint: { color: colors.textMuted, fontSize: 13 },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  fallback: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: colors.textMuted,
    fontSize: 40,
    fontWeight: '700',
  },
  label: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    backgroundColor: colors.overlayHeavy,
  },
  labelText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  // List 뷰 스타일.
  listContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  listPosterFrame: {
    width: 60,
    height: 90,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    flexShrink: 0,
  },
  listPosterFallback: {
    color: colors.textMuted,
    fontSize: 24,
    fontWeight: '700',
  },
  listBody: {
    flex: 1,
    minWidth: 0,
  },
  listTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  listMetaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 4,
  },
  listRating: {
    color: colors.accent,
    fontSize: 12,
    fontFamily: fonts.data,
  },
  listMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  listProviders: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
});
