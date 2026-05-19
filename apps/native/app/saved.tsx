import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Dimensions,
  ScrollView,
  ActionSheetIOS,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Rect, Line, Path } from 'react-native-svg';
import {
  getSaved,
  removeSaved,
  getWatchReports,
  getArchivedIds,
  archiveItem,
  unarchiveItem,
} from '../lib/store';
import type { Recommendation, SavedItem, WatchReaction } from '../lib/types';
import { colors, radius, spacing, fontsV2 } from '../lib/tokens';
import { track } from '../lib/analytics';
import DetailSheet from '../components/DetailSheet';
import SearchSheet from '../components/SearchSheet';
import SavedHero from '../components/SavedHero';
import { IconSearch } from '../components/Icons';

const COLS = 2;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_W = (SCREEN_WIDTH - spacing.md * (COLS + 1)) / COLS;

/**
 * Saved 뷰 모드 (web `SavedList.tsx` SavedViewMode 동기화).
 *  - "grid":    기본 2열 그리드
 *  - "list":    1열 가로 카드 (포스터 60×90 + 제목/메타)
 *  - "preview": Coverflow — 큰 hero 1개 + 하단 가로 carousel (SavedHero)
 * 키: 'neq_saved_view' — web localStorage 키와 동일.
 */
type SavedViewMode = 'grid' | 'list' | 'preview';
const SAVED_VIEW_KEY = 'neq_saved_view';

/**
 * W5 Task F — Saved 화면 view filter (web `SavedFilters.tsx` 와 정합).
 * web 의 'history' (rec 히스토리) 는 native 미구현 — 4종만 노출:
 *  - "all"       : 전체 (아카이브 hide)
 *  - "unwatched" : 안 봤어요 (시청 리포트 없음)
 *  - "watched"   : 시청 완료 (loved/good/meh/dropped 어떤 reaction 이라도 있음)
 *  - "archived"  : 아카이브 (사용자가 명시적으로 숨긴 작품)
 */
type ViewFilter = 'all' | 'unwatched' | 'watched' | 'archived';

async function loadSavedView(): Promise<SavedViewMode> {
  try {
    const v = await AsyncStorage.getItem(SAVED_VIEW_KEY);
    if (v === 'list' || v === 'grid' || v === 'preview') return v;
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
 * IconGrid/IconList/IconPreview (web Icons.tsx 와 시각 정합).
 * 16×16 viewBox + stroke 1.4 + linecap square. 색상은 props.
 * (native components/Icons.tsx 는 별도 트랙에서 관리 — 토글 전용 로컬 정의.)
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
/**
 * IconPreview — Coverflow(미리보기) 토글 아이콘. web `Icons.tsx` IconPreview 정합.
 * 가운데 큰 사각형 + 좌우 작은 사각형 = 단일 hero + carousel 메타포.
 */
function IconPreview({ size = 14, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Rect x="5" y="3" width="6" height="10" stroke={color} strokeWidth={1.4} strokeLinecap="square" />
      <Path d="M2.5 5 v6" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Path d="M13.5 5 v6" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

export default function SavedScreen() {
  const [items, setItems] = useState<SavedItem[]>([]);
  // 뷰 모드. 첫 mount 시 AsyncStorage 에서 복원.
  const [viewMode, setViewMode] = useState<SavedViewMode>('grid');
  // preview 모드 hero 작품 id. 카드 탭으로 변경. 첫 진입 시 첫 작품 자동 선택 (effect 처리).
  const [selectedPreviewId, setSelectedPreviewId] = useState<number | null>(null);
  // W5 Task E — Saved DetailSheet 진입 (web `openDetailFor` 정합).
  // 카드 onPress → DetailSheet open + `detail_opened` source: 'saved_tap'.
  const [detailRec, setDetailRec] = useState<Recommendation | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  // 헤더 search 버튼 → SearchSheet 자체 마운트 (web `saved/page.tsx` 정합).
  // DetailSheet Cast 클릭 시에도 진입 — searchInitialQuery 에 인물명 주입.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState('');
  // W5 Task F — view filter + archive 상태.
  // web `apps/web/src/app/saved/page.tsx:69/72` 와 1:1 정합.
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [reports, setReports] = useState<Record<number, WatchReaction>>({});
  const [archivedIds, setArchivedIds] = useState<Set<number>>(new Set());

  const refreshAll = useCallback(async () => {
    const [savedList, reportsList, archived] = await Promise.all([
      getSaved(),
      getWatchReports(),
      getArchivedIds(),
    ]);
    setItems(savedList);
    const reportsMap: Record<number, WatchReaction> = {};
    for (const r of reportsList) {
      reportsMap[r.tmdbId] = r.reaction;
    }
    setReports(reportsMap);
    setArchivedIds(new Set(archived));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshAll();
    }, [refreshAll]),
  );

  // 첫 mount 시 1회 — 저장된 뷰 모드 복원.
  useEffect(() => {
    loadSavedView().then(setViewMode);
  }, []);

  // W5 Task F — archived 0 되면 'archived' 탭 자체가 hide 되므로,
  // 사용자가 archived 탭에 있다가 마지막 아카이브를 해제하면 'all' 로 fallback.
  useEffect(() => {
    if (viewFilter === 'archived' && archivedIds.size === 0) {
      setViewFilter('all');
    }
  }, [viewFilter, archivedIds]);

  const handleViewModeChange = useCallback((mode: SavedViewMode) => {
    setViewMode(mode);
    void persistSavedView(mode);
    track('saved_view_changed', { mode });
  }, []);

  async function handleRemove(tmdbId: number) {
    await removeSaved(tmdbId);
    setItems((prev) => prev.filter((s) => s.recommendation.tmdbId !== tmdbId));
  }

  // W5 Task E — DetailSheet 진입. web `apps/web/src/app/saved/page.tsx:335-342`
  // 의 `openDetailFor` 와 1:1 정합. source 는 'saved_tap' 고정.
  const handleOpenDetail = useCallback((rec: Recommendation) => {
    track('detail_opened', {
      tmdb_id: rec.tmdbId,
      title: rec.title,
      providers_count: rec.providers.length,
      source: 'saved_tap',
    });
    setDetailRec(rec);
    setDetailOpen(true);
  }, []);

  // W5 Task F — archive 토글. web `handleArchiveToggle` (saved/page.tsx:326-334) 와 정합.
  const handleArchiveToggle = useCallback(
    async (tmdbId: number) => {
      const isArchived = archivedIds.has(tmdbId);
      if (isArchived) {
        await unarchiveItem(tmdbId);
      } else {
        await archiveItem(tmdbId);
      }
      // 즉시 반영 — refresh 보다 가벼움.
      setArchivedIds((prev) => {
        const next = new Set(prev);
        if (isArchived) next.delete(tmdbId);
        else next.add(tmdbId);
        return next;
      });
    },
    [archivedIds],
  );

  // W5 Task F — long-press → ActionSheet [상세보기 / 아카이브(또는 해제) / 삭제 / 취소].
  // long-press 단일 entry point 유지 + 메뉴 분기로 자연스러운 패턴.
  // iOS: native ActionSheetIOS. Android: Alert (3 버튼 + 취소).
  const handleLongPress = useCallback(
    (rec: Recommendation) => {
      const isArchived = archivedIds.has(rec.tmdbId);
      const archiveLabel = isArchived ? '아카이브 해제' : '아카이브';

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['취소', '상세보기', archiveLabel, '삭제'],
            cancelButtonIndex: 0,
            destructiveButtonIndex: 3,
            title: rec.title,
          },
          (idx) => {
            if (idx === 1) handleOpenDetail(rec);
            else if (idx === 2) void handleArchiveToggle(rec.tmdbId);
            else if (idx === 3) void handleRemove(rec.tmdbId);
          },
        );
      } else {
        // Android — Alert 3 버튼 fallback.
        Alert.alert(rec.title, undefined, [
          { text: '상세보기', onPress: () => handleOpenDetail(rec) },
          { text: archiveLabel, onPress: () => void handleArchiveToggle(rec.tmdbId) },
          { text: '삭제', style: 'destructive', onPress: () => void handleRemove(rec.tmdbId) },
          { text: '취소', style: 'cancel' },
        ]);
      }
    },
    [archivedIds, handleOpenDetail, handleArchiveToggle],
  );

  // W5 Task F — view filter 적용. web saved/page.tsx:123-138 의 filteredSaved 와 정합.
  // archived: 아카이브된 작품만 노출
  // all/unwatched/watched: 아카이브된 작품은 hide
  const filteredItems = useMemo(() => {
    if (viewFilter === 'archived') {
      return items.filter((s) => archivedIds.has(s.recommendation.tmdbId));
    }
    let result = items.filter((s) => !archivedIds.has(s.recommendation.tmdbId));
    if (viewFilter === 'unwatched') {
      result = result.filter((s) => !reports[s.recommendation.tmdbId]);
    } else if (viewFilter === 'watched') {
      result = result.filter((s) => !!reports[s.recommendation.tmdbId]);
    }
    return result;
  }, [items, archivedIds, reports, viewFilter]);

  // preview 모드 hero 자동 선택 — selectedPreviewId 가 filteredItems 안에 없으면
  // 첫 작품으로 보정. viewFilter 변경 등 목록 변경 시 자동 보정 (web 정본 정합).
  useEffect(() => {
    if (viewMode !== 'preview') return;
    if (filteredItems.length === 0) return;
    const exists =
      selectedPreviewId !== null &&
      filteredItems.some((s) => s.recommendation.tmdbId === selectedPreviewId);
    if (!exists) {
      setSelectedPreviewId(filteredItems[0].recommendation.tmdbId);
    }
  }, [viewMode, filteredItems, selectedPreviewId]);

  // ViewFilter 탭 정의. 카운트는 archived 제외한 활성 작품 기준 (web 정본 동일).
  const viewFilters = useMemo(() => {
    const activeItems = items.filter((s) => !archivedIds.has(s.recommendation.tmdbId));
    const unwatchedCount = activeItems.filter(
      (s) => !reports[s.recommendation.tmdbId],
    ).length;
    const watchedCount = activeItems.filter(
      (s) => !!reports[s.recommendation.tmdbId],
    ).length;
    const archivedCount = archivedIds.size;
    const base: { key: ViewFilter; label: string; count: number }[] = [
      { key: 'all', label: '전체', count: activeItems.length },
      { key: 'unwatched', label: '안 봤어요', count: unwatchedCount },
      { key: 'watched', label: '시청 완료', count: watchedCount },
    ];
    // 아카이브 0개일 때는 탭 숨김 (web 정본 동일 — saved/page.tsx:437).
    if (archivedCount > 0) {
      base.push({ key: 'archived', label: '아카이브', count: archivedCount });
    }
    return base;
  }, [items, reports, archivedIds]);

  // viewMode 토글 버튼 1개 — web saved/page.tsx 의 3-way segmented 정합.
  // active = surface-raised 면 + text-primary (2026-05-13 M1: amber 박탈).
  const renderViewModeBtn = (
    mode: SavedViewMode,
    label: string,
    Icon: typeof IconGrid,
  ) => {
    const active = viewMode === mode;
    return (
      <Pressable
        onPress={() => handleViewModeChange(mode)}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}
        style={[styles.segmentBtn, active && styles.segmentBtnActive]}
        hitSlop={4}
      >
        <Icon size={14} color={active ? colors.textPrimary : colors.textMuted} />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* 3-슬롯 헤더 — 좌:title / 중앙:viewMode 토글 / 우:search.
          web saved/page.tsx 헤더 (좌 H1 / 중앙 grid·list·preview / 우 search) 정합. */}
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>저장한 작품</Text>
          <Text style={styles.counter}>{filteredItems.length}개</Text>
        </View>
        {/* viewMode segmented (grid/list/preview). items 비어있으면 숨김. */}
        {items.length > 0 ? (
          <View
            style={styles.segmented}
            accessibilityRole="tablist"
            accessibilityLabel="뷰 모드 전환"
          >
            {renderViewModeBtn('grid', '그리드 보기', IconGrid)}
            {renderViewModeBtn('list', '리스트 보기', IconList)}
            {renderViewModeBtn('preview', '미리보기', IconPreview)}
          </View>
        ) : (
          // items 0 일 때도 중앙 슬롯 자리 확보 — title/search 양 끝 정렬 유지.
          <View />
        )}
        <Pressable
          style={styles.searchBtn}
          onPress={() => {
            // web saved/page.tsx:511 정합 — search_opened 이벤트 + initialQuery 비움.
            track('search_opened');
            setSearchInitialQuery('');
            setSearchOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="검색 열기"
          hitSlop={8}
        >
          <IconSearch size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* W5 Task F — ViewFilter 탭 행 (web `SavedFilters` underline 패턴 정합).
          items 0 일 때는 탭 의미 없음 → 숨김. */}
      {items.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // FAIL-B (2026-05-19 재검증) — horizontal ScrollView 는 부모 column flex
          // 컨텍스트에서 cross-axis(세로) 로 남는 공간을 흡수한다. preview 모드는
          // 형제가 SavedHero(flex:1) 라 ScrollView 가 297px 부풀어 hero 가 72px 로
          // 짜부라졌다. flexGrow:0 + flexShrink:0 으로 ScrollView 가 자기 콘텐츠
          // 높이(44px)만 차지하게 고정 — 어느 viewMode 에서나 filter 행은 고정 높이.
          style={styles.viewFilterScroll}
          contentContainerStyle={styles.viewFilterRow}
          accessibilityRole="tablist"
          accessibilityLabel="저장 필터"
        >
          {viewFilters.map((f) => {
            const active = viewFilter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setViewFilter(f.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={[styles.viewFilterTab, active && styles.viewFilterTabActive]}
                hitSlop={4}
              >
                <Text style={[styles.viewFilterLabel, active && styles.viewFilterLabelActive]}>
                  {f.label}
                </Text>
                {f.count > 0 && (
                  <Text style={[styles.viewFilterCount, active && styles.viewFilterCountActive]}>
                    {f.count}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>아직 저장한 작품이 없어요</Text>
          <Text style={styles.emptyHint}>발견 탭에서 좋아요를 눌러보세요</Text>
        </View>
      ) : filteredItems.length === 0 ? (
        // W5 Task F — view filter 적용 후 결과 0 (예: "안 봤어요" 인데 모두 시청).
        // items 자체는 0 이 아니므로 별도 메시지.
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {viewFilter === 'archived'
              ? '아카이브된 작품이 없어요'
              : viewFilter === 'unwatched'
                ? '안 본 작품이 없어요'
                : viewFilter === 'watched'
                  ? '시청한 작품이 없어요'
                  : '표시할 작품이 없어요'}
          </Text>
          <Text style={styles.emptyHint}>다른 필터를 선택해 보세요</Text>
        </View>
      ) : viewMode === 'preview' ? (
        // Preview(Coverflow) 뷰 — 큰 hero + 하단 가로 carousel.
        <SavedHero
          items={filteredItems}
          selectedPreviewId={selectedPreviewId}
          reports={reports}
          onSelectPreview={setSelectedPreviewId}
          onOpen={handleOpenDetail}
        />
      ) : viewMode === 'list' ? (
        // List 뷰 — 1열 가로 카드 (60×90 포스터).
        // key 로 grid FlatList 와 별개 인스턴스 강제 — numColumns on-the-fly 변경 invariant 회피.
        <FlatList
          key="saved-list"
          data={filteredItems}
          keyExtractor={(s) => String(s.recommendation.tmdbId)}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <ListCard
              item={item}
              onPress={handleOpenDetail}
              onLongPress={handleLongPress}
            />
          )}
        />
      ) : (
        // 기본 그리드 뷰
        // key 로 list FlatList 와 별개 인스턴스 강제 — numColumns on-the-fly 변경 invariant 회피.
        <FlatList
          key="saved-grid"
          data={filteredItems}
          keyExtractor={(s) => String(s.recommendation.tmdbId)}
          numColumns={COLS}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
          columnWrapperStyle={{ gap: spacing.md }}
          renderItem={({ item, index }) => {
            const tall = index % 3 === 0;
            return (
              <Pressable
                style={[styles.card, { width: CARD_W, height: tall ? 240 : 200 }]}
                // W5 Task E — 카드 탭 = DetailSheet 진입 (web `openDetailFor` 정합).
                // W5 Task F — long-press = ActionSheet [상세/아카이브/삭제] 메뉴 (단일 entry point).
                onPress={() => handleOpenDetail(item.recommendation)}
                onLongPress={() => handleLongPress(item.recommendation)}
                accessibilityRole="button"
                accessibilityLabel={`${item.recommendation.title} 상세보기`}
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

      {/* W5 Task E — Saved DetailSheet (web 정본 동일 패턴).
          rec=null 인 첫 mount 시점에는 Modal 자체가 안 뜨므로 렌더 비용 0.
          onSearchPerson — Cast 클릭 시 DetailSheet 닫고 SearchSheet 진입
          (web saved/page.tsx:763-769 정합). */}
      <DetailSheet
        rec={detailRec}
        visible={detailOpen}
        onClose={() => setDetailOpen(false)}
        onSearchPerson={(name) => {
          track('detail_to_search_person', { name, from: 'saved' });
          setDetailOpen(false);
          setSearchInitialQuery(name);
          setSearchOpen(true);
        }}
      />

      {/* SearchSheet — Saved 페이지 자체 마운트. 헤더 search 버튼 또는
          DetailSheet Cast 클릭으로 진입 (web saved/page.tsx 정합). */}
      <SearchSheet
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        initialQuery={searchInitialQuery}
      />
    </SafeAreaView>
  );
}

/**
 * ListCard — 위임 O #2 / web ListCard 동기화.
 * 가로 카드 = 포스터 60×90 + 제목/평점/타입+런타임/OTT 칩.
 * W5 Task F — onLongPress = ActionSheet 메뉴 (Grid 와 동일 인터랙션).
 */
function ListCard({
  item,
  onPress,
  onLongPress,
}: {
  item: SavedItem;
  onPress: (rec: Recommendation) => void;
  onLongPress: (rec: Recommendation) => void;
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
      // W5 Task E — 카드 탭 = DetailSheet 진입.
      // W5 Task F — long-press = ActionSheet 메뉴 (상세/아카이브/삭제).
      onPress={() => onPress(rec)}
      onLongPress={() => onLongPress(rec)}
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
    gap: spacing.sm,
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
    // 2026-04-29 fontsV2 전환 — display = Instrument Serif. web saved 제목 정합.
    fontFamily: fontsV2.display,
  },
  counter: { color: colors.textMuted, fontSize: 13 },
  // viewMode segmented 컨테이너 + 버튼 (3-way grid/list/preview).
  segmented: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 999,
    padding: 2,
  },
  segmentBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 2026-05-13 M1 — viewMode 토글 active = surface-raised 면 + text-primary
  // (amber 박탈). web saved/page.tsx 정합.
  segmentBtnActive: {
    backgroundColor: colors.surfaceRaised,
  },
  searchBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // W5 Task F — ViewFilter 탭 행 스타일 (web SavedFilters underline 패턴 정합).
  // chip 가 아닌 underline 타입 — web saved/page.tsx 의 borderBottom 2px 와 정합.
  // FAIL-B — ScrollView 자체가 세로 공간을 흡수하지 못하도록 flex 고정.
  viewFilterScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  viewFilterRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  viewFilterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm + 2,
    minHeight: 44,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  viewFilterTabActive: {
    borderBottomColor: colors.accent,
  },
  viewFilterLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  viewFilterLabelActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  viewFilterCount: {
    color: colors.textMuted,
    fontSize: 11,
    // 2026-04-29 fontsV2 — data = Geist Mono. web 카운터 tabular-nums 정합.
    fontFamily: fontsV2.data,
  },
  viewFilterCountActive: {
    color: colors.textSecondary,
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
    // 2026-04-29 fontsV2 — data = Geist Mono.
    fontFamily: fontsV2.data,
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
