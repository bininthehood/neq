import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  SectionList,
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
import Svg, { Rect, Line, Path, Polyline } from 'react-native-svg';
import { getOTTIcon } from '@neq/core';
import {
  getSaved,
  removeSaved,
  getWatchReports,
  addWatchReport,
  removeWatchReport,
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
import SavedFilterSheet from '../components/saved/SavedFilterSheet';
import ReactionOverlay from '../components/saved/ReactionOverlay';
import ReactionLabel from '../components/saved/ReactionLabel';
import {
  loadSavedSort,
  persistSavedSort,
  sortSavedItems,
  type SavedSort,
} from '../components/saved/SavedSortControl';

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
/**
 * IconChevronDown — "필터" 트리거의 ▾ 표시. web SavedFilters 의 polyline 정합.
 */
function IconChevronDown({ size = 10, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline points="6 9 12 15 18 9" stroke={color} strokeWidth={2} strokeLinecap="square" fill="none" />
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
  // P2 배치 A — 정렬 / OTT 필터 / OTT별 그룹화 (web saved/page.tsx 정합).
  const [sortBy, setSortBy] = useState<SavedSort>('saved');
  const [ottFilter, setOttFilter] = useState<string | null>(null);
  const [groupByOTT, setGroupByOTT] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  // P2 배치 A — 카드 내 reaction 입력 ('봤어요?'). web saved/page.tsx:66 reportingId 정합.
  const [reportingId, setReportingId] = useState<number | null>(null);

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

  // 첫 mount 시 1회 — 저장된 뷰 모드 + 정렬 복원.
  useEffect(() => {
    void loadSavedView().then(setViewMode);
    void loadSavedSort().then(setSortBy);
  }, []);

  // W5 Task F — archived 0 되면 'archived' 탭 자체가 hide 되므로,
  // 사용자가 archived 탭에 있다가 마지막 아카이브를 해제하면 'all' 로 fallback.
  useEffect(() => {
    if (viewFilter === 'archived' && archivedIds.size === 0) {
      setViewFilter('all');
    }
  }, [viewFilter, archivedIds]);

  // ottFilter 활성 시 OTT 그룹핑 자동 해제 (web saved/page.tsx:171-175 정합).
  useEffect(() => {
    if (ottFilter && groupByOTT) {
      setGroupByOTT(false);
    }
  }, [ottFilter, groupByOTT]);

  const handleViewModeChange = useCallback((mode: SavedViewMode) => {
    setViewMode(mode);
    void persistSavedView(mode);
    track('saved_view_changed', { mode });
    // preview 모드는 단일 hero 모델이라 OTT 그룹과 충돌 → 자동 OFF (web saved/page.tsx:116-118).
    if (mode === 'preview') {
      setGroupByOTT(false);
    }
  }, []);

  const handleSortChange = useCallback((s: SavedSort) => {
    setSortBy(s);
    void persistSavedSort(s);
  }, []);

  async function handleRemove(tmdbId: number) {
    await removeSaved(tmdbId);
    // 작품 삭제 시 시청 리포트도 함께 제거 (web saved/page.tsx:299-300 정합).
    await removeWatchReport(tmdbId);
    if (reportingId === tmdbId) setReportingId(null);
    setItems((prev) => prev.filter((s) => s.recommendation.tmdbId !== tmdbId));
    setReports((prev) => {
      const next = { ...prev };
      delete next[tmdbId];
      return next;
    });
  }

  // P2 배치 A — reaction 기록. web saved/page.tsx:315-319 handleReport 정합.
  const handleReport = useCallback(async (tmdbId: number, reaction: WatchReaction) => {
    await addWatchReport(tmdbId, reaction);
    setReportingId(null);
    setReports((prev) => ({ ...prev, [tmdbId]: reaction }));
  }, []);

  // P2 배치 A — reaction 해제. web saved/page.tsx:321-324 handleUndoReport 정합.
  const handleUndoReport = useCallback(async (tmdbId: number) => {
    await removeWatchReport(tmdbId);
    setReports((prev) => {
      const next = { ...prev };
      delete next[tmdbId];
      return next;
    });
  }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // P2 배치 A — OTT 필터 적용. web saved/page.tsx:141-146 ottFilteredSaved 정합.
  const ottFilteredItems = useMemo(() => {
    if (!ottFilter) return filteredItems;
    return filteredItems.filter((s) =>
      s.recommendation.providers.some((p) => p.name === ottFilter),
    );
  }, [filteredItems, ottFilter]);

  // P2 배치 A — 정렬 적용. web saved/page.tsx:148-151 sortedSaved 정합.
  const sortedItems = useMemo(
    () => sortSavedItems(ottFilteredItems, sortBy),
    [ottFilteredItems, sortBy],
  );

  // P2 배치 A — 저장 작품에서 사용 가능한 OTT 목록 (작품 수 많은 순).
  // web saved/page.tsx:178-188 availableOTTs 정합. ottFilter 와 무관하게 filteredItems 기준.
  const availableOTTs = useMemo(() => {
    const ottCount = new Map<string, number>();
    for (const s of filteredItems) {
      for (const p of s.recommendation.providers) {
        ottCount.set(p.name, (ottCount.get(p.name) ?? 0) + 1);
      }
    }
    return Array.from(ottCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [filteredItems]);

  // P2 배치 A — OTT별 그룹핑. web saved/page.tsx:194-218 ottGroups 정합.
  // 작품이 여러 OTT 제공 시 각 그룹에 중복 노출. providers 빈 작품은 "기타".
  // ottFilter 활성 시엔 그룹화 자동 해제되므로 여기선 ottFilter 분기 불필요.
  const ottGroups = useMemo<{ ott: string; items: SavedItem[] }[] | null>(() => {
    if (!groupByOTT) return null;
    const groups: Record<string, SavedItem[]> = {};
    for (const { name } of availableOTTs) {
      groups[name] = [];
    }
    for (const s of sortedItems) {
      const providers = s.recommendation.providers;
      if (!providers || providers.length === 0) {
        if (!groups['기타']) groups['기타'] = [];
        groups['기타'].push(s);
        continue;
      }
      for (const p of providers) {
        if (!groups[p.name]) groups[p.name] = [];
        groups[p.name].push(s);
      }
    }
    // 작품 수 많은 OTT 먼저.
    return Object.entries(groups)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([ott, list]) => ({ ott, items: list }));
  }, [sortedItems, groupByOTT, availableOTTs]);

  // preview 모드 hero 자동 선택 — selectedPreviewId 가 sortedItems 안에 없으면
  // 첫 작품으로 보정. viewFilter/ottFilter/sort 변경 등 목록 변경 시 자동 보정 (web 정본 정합).
  useEffect(() => {
    if (viewMode !== 'preview') return;
    if (sortedItems.length === 0) return;
    const exists =
      selectedPreviewId !== null &&
      sortedItems.some((s) => s.recommendation.tmdbId === selectedPreviewId);
    if (!exists) {
      setSelectedPreviewId(sortedItems[0].recommendation.tmdbId);
    }
  }, [viewMode, sortedItems, selectedPreviewId]);

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

  // P2 배치 A — "필터" 트리거 노출 조건. web saved/page.tsx:536-540 정합.
  // OTT 가 2종 이상일 때만 필터 의미 있음.
  const showFilterTrigger = items.length > 0 && availableOTTs.length > 1;
  const hasActiveFilter = ottFilter !== null || groupByOTT || sortBy !== 'saved';

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
          <Text style={styles.counter}>{ottFilteredItems.length}개</Text>
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
          P2 배치 A — 우측에 "필터 ▾" 트리거 추가 (web SavedFilters 정합).
          items 0 일 때는 탭 의미 없음 → 숨김. */}
      {items.length > 0 && (
        <View style={styles.filterBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            // FAIL-B (2026-05-19 재검증) — horizontal ScrollView 는 부모 column flex
            // 컨텍스트에서 cross-axis(세로) 로 남는 공간을 흡수한다. flexGrow:0 +
            // flexShrink:0 으로 자기 콘텐츠 높이(44px)만 차지하게 고정.
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
          {/* "필터 ▾" 트리거 — OTT 선택 + 정렬 + 그룹화 토글을 모두 sheet 안으로 격하.
              web SavedFilters 의 sheet 트리거 정합. 활성 시 accent dot 표시. */}
          {showFilterTrigger && (
            <Pressable
              onPress={() => setFilterSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="필터 열기"
              accessibilityState={{ expanded: filterSheetOpen }}
              style={styles.filterTrigger}
              hitSlop={4}
            >
              <Text style={styles.filterTriggerText}>필터</Text>
              <IconChevronDown size={10} color={colors.textSecondary} />
              {hasActiveFilter && <View style={styles.filterTriggerDot} />}
            </Pressable>
          )}
        </View>
      )}

      {/* P2 배치 A — 활성 필터 chip 행 (web SavedFilters 활성 chip 정합).
          OTT 또는 그룹화 적용 시에만 노출. 탭하면 즉시 제거. */}
      {items.length > 0 && (ottFilter !== null || groupByOTT) && (
        <View style={styles.activeChipsRow}>
          {ottFilter !== null && (
            <Pressable
              onPress={() => setOttFilter(null)}
              accessibilityRole="button"
              accessibilityLabel={`${ottFilter} 필터 제거`}
              style={styles.activeChip}
            >
              {(() => {
                const iconSrc = getOTTIcon(ottFilter);
                return iconSrc ? (
                  <Image
                    source={{ uri: iconSrc }}
                    style={styles.activeChipIcon}
                    contentFit="contain"
                    transition={0}
                  />
                ) : null;
              })()}
              <Text style={styles.activeChipText}>{ottFilter}</Text>
              <Text style={styles.activeChipX}>✕</Text>
            </Pressable>
          )}
          {groupByOTT && (
            <Pressable
              onPress={() => setGroupByOTT(false)}
              accessibilityRole="button"
              accessibilityLabel="OTT별 그룹화 해제"
              style={styles.activeChip}
            >
              <Text style={styles.activeChipText}>OTT별 그룹화</Text>
              <Text style={styles.activeChipX}>✕</Text>
            </Pressable>
          )}
        </View>
      )}

      {items.length === 0 ? (
        // P3 — 빈 상태 카피 정본 일치 (web saved/page.tsx:673-678 책장 메타포, Round 3 v2 잠금).
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>책장이 비어 있어요</Text>
          <Text style={styles.emptyHint}>
            Discover에서 마음에 드는 걸{'\n'}하나씩 담아 보세요
          </Text>
        </View>
      ) : ottFilteredItems.length === 0 ? (
        // view filter / OTT filter 적용 후 결과 0.
        // web saved/page.tsx:679-705 의 빈 상태 분기 카피 정합.
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {ottFilter
              ? '이 조건엔 아무것도'
              : viewFilter === 'archived'
                ? '보관한 작품이 없어요'
                : viewFilter === 'unwatched'
                  ? '모두 시청했어요!'
                  : viewFilter === 'watched'
                    ? '아직 시청 기록이 없어요'
                    : '표시할 작품이 없어요'}
          </Text>
          <Text style={styles.emptyHint}>
            {ottFilter
              ? '필터를 조금만 느슨해 보세요'
              : viewFilter === 'archived'
                ? '시청한 작품을 보관 아이콘으로 정리할 수 있어요'
                : viewFilter === 'unwatched'
                  ? 'Discover에서 새로운 작품을 찾아보세요'
                  : viewFilter === 'watched'
                    ? "Saved의 작품에서 '봤어요?' 버튼을 눌러보세요"
                    : 'Discover에서 아래로 스와이프하거나 하트 버튼으로 담아보세요'}
          </Text>
        </View>
      ) : viewMode === 'preview' ? (
        // Preview(Coverflow) 뷰 — 큰 hero + 하단 가로 carousel.
        <SavedHero
          items={sortedItems}
          selectedPreviewId={selectedPreviewId}
          reports={reports}
          onSelectPreview={setSelectedPreviewId}
          onOpen={handleOpenDetail}
        />
      ) : ottGroups ? (
        // P2 배치 A — OTT별 그룹핑. web SavedList 의 ottGroups 분기 정합.
        // SectionList 로 OTT 섹션 헤더 + 그룹 내 grid/list 분기.
        <SectionList
          key={`saved-grouped-${viewMode}`}
          sections={ottGroups.map((g) => ({ title: g.ott, count: g.items.length, data: [g.items] }))}
          keyExtractor={(_, index) => `group-${index}`}
          contentContainerStyle={styles.groupedContent}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => {
            const iconSrc = getOTTIcon(section.title);
            return (
              <View style={styles.ottSectionHeader}>
                {iconSrc ? (
                  <Image
                    source={{ uri: iconSrc }}
                    style={styles.ottSectionIcon}
                    contentFit="contain"
                    transition={0}
                  />
                ) : null}
                <Text style={styles.ottSectionTitle}>{section.title}</Text>
                <Text style={styles.ottSectionCount}>{section.count}</Text>
              </View>
            );
          }}
          renderItem={({ item: groupItems }) =>
            groupItems.length === 0 ? (
              <Text style={styles.ottSectionEmpty}>
                이 OTT에는 저장된 작품이 없어요
              </Text>
            ) : viewMode === 'list' ? (
              <View style={styles.groupListWrap}>
                {groupItems.map((s) => (
                  <ListCard
                    key={s.recommendation.tmdbId}
                    item={s}
                    report={reports[s.recommendation.tmdbId]}
                    isReporting={reportingId === s.recommendation.tmdbId}
                    onPress={handleOpenDetail}
                    onLongPress={handleLongPress}
                    onStartReport={setReportingId}
                    onReport={handleReport}
                    onUndoReport={handleUndoReport}
                    onCancelReport={() => setReportingId(null)}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.groupGridWrap}>
                {groupItems.map((s, i) => (
                  <PosterCard
                    key={s.recommendation.tmdbId}
                    item={s}
                    index={i}
                    report={reports[s.recommendation.tmdbId]}
                    isReporting={reportingId === s.recommendation.tmdbId}
                    onPress={handleOpenDetail}
                    onLongPress={handleLongPress}
                    onStartReport={setReportingId}
                    onReport={handleReport}
                    onUndoReport={handleUndoReport}
                    onCancelReport={() => setReportingId(null)}
                  />
                ))}
              </View>
            )
          }
        />
      ) : viewMode === 'list' ? (
        // List 뷰 — 1열 가로 카드 (60×90 포스터).
        // key 로 grid FlatList 와 별개 인스턴스 강제 — numColumns on-the-fly 변경 invariant 회피.
        <FlatList
          key="saved-list"
          data={sortedItems}
          keyExtractor={(s) => String(s.recommendation.tmdbId)}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <ListCard
              item={item}
              report={reports[item.recommendation.tmdbId]}
              isReporting={reportingId === item.recommendation.tmdbId}
              onPress={handleOpenDetail}
              onLongPress={handleLongPress}
              onStartReport={setReportingId}
              onReport={handleReport}
              onUndoReport={handleUndoReport}
              onCancelReport={() => setReportingId(null)}
            />
          )}
        />
      ) : (
        // 기본 그리드 뷰
        // key 로 list FlatList 와 별개 인스턴스 강제 — numColumns on-the-fly 변경 invariant 회피.
        <FlatList
          key="saved-grid"
          data={sortedItems}
          keyExtractor={(s) => String(s.recommendation.tmdbId)}
          numColumns={COLS}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
          columnWrapperStyle={{ gap: spacing.md }}
          renderItem={({ item, index }) => (
            <PosterCard
              item={item}
              index={index}
              report={reports[item.recommendation.tmdbId]}
              isReporting={reportingId === item.recommendation.tmdbId}
              onPress={handleOpenDetail}
              onLongPress={handleLongPress}
              onStartReport={setReportingId}
              onReport={handleReport}
              onUndoReport={handleUndoReport}
              onCancelReport={() => setReportingId(null)}
            />
          )}
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

      {/* P2 배치 A — 필터 sheet. OTT 선택 + 정렬 + OTT별 그룹화 토글 (web SavedFilterSheet 정합). */}
      <SavedFilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        ottFilter={ottFilter}
        setOttFilter={setOttFilter}
        groupByOTT={groupByOTT}
        setGroupByOTT={setGroupByOTT}
        availableOTTs={availableOTTs}
        sortBy={sortBy}
        setSortBy={handleSortChange}
      />
    </SafeAreaView>
  );
}

/**
 * PosterCard — Grid 뷰 카드.
 * web `apps/web/src/components/saved/SavedList.tsx` PosterCard 정합.
 * P2 배치 A — reaction 입력 경로: 좌상단 '봤어요?' / reaction 있으면 '시청' 토글 +
 * isReporting 시 ReactionOverlay.
 */
function PosterCard({
  item,
  index,
  report,
  isReporting,
  onPress,
  onLongPress,
  onStartReport,
  onReport,
  onUndoReport,
  onCancelReport,
}: {
  item: SavedItem;
  index: number;
  report: WatchReaction | undefined;
  isReporting: boolean;
  onPress: (rec: Recommendation) => void;
  onLongPress: (rec: Recommendation) => void;
  onStartReport: (tmdbId: number) => void;
  onReport: (tmdbId: number, reaction: WatchReaction) => void;
  onUndoReport: (tmdbId: number) => void;
  onCancelReport: () => void;
}) {
  const rec = item.recommendation;
  const tall = index % 3 === 0;

  return (
    // a11y: 카드 root 는 accessible={false} — 카드 탭과 reaction 칩이 각각
    // 별개 a11y element 가 되도록 병합 해제 (iOS 가 자식 Pressable 을 부모로
    // 흡수하는 것 방지). 카드 탭 a11y 는 하단 label View 에 명시 부여.
    <Pressable
      style={[styles.card, { width: CARD_W, height: tall ? 240 : 200 }]}
      // W5 Task E — 카드 탭 = DetailSheet 진입.
      // W5 Task F — long-press = ActionSheet [상세/아카이브/삭제] 메뉴.
      onPress={() => onPress(rec)}
      onLongPress={() => onLongPress(rec)}
      accessible={false}
    >
      {rec.posterUrl ? (
        <Image
          source={{ uri: rec.posterUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallback]}>
          <Text style={styles.fallbackText}>N</Text>
        </View>
      )}

      {/* reaction 있을 때 카드 살짝 어둡게 (web overlay-light 정합) */}
      {report && !isReporting && (
        <View style={[StyleSheet.absoluteFill, styles.cardDim]} pointerEvents="none" />
      )}

      {/* 하단 메타 — 제목 + 평점 / reaction badge 또는 OTT 아이콘.
          a11y: 카드 탭(상세보기) 의 단일 a11y element. pointerEvents 는 'none'
          유지 — 터치는 root Pressable 이 그대로 처리(시각/터치 동작 불변),
          VoiceOver 에는 이 View 가 "상세보기" 버튼으로 노출. */}
      <View
        style={styles.label}
        pointerEvents="none"
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${rec.title} 상세보기`}
      >
        <Text style={styles.labelText} numberOfLines={1}>
          {rec.title}
        </Text>
        <View style={styles.labelMetaRow}>
          <Text style={styles.labelRating}>★ {rec.rating.toFixed(1)}</Text>
          {report ? (
            <ReactionLabel reaction={report} />
          ) : (
            rec.providers.slice(0, 2).map((p) => {
              const iconUrl = getOTTIcon(p.name) ?? p.logoUrl;
              return iconUrl ? (
                <Image
                  key={p.name}
                  source={{ uri: iconUrl }}
                  style={styles.labelOttIcon}
                  contentFit="contain"
                  transition={0}
                />
              ) : null;
            })
          )}
        </View>
      </View>

      {/* 좌상단 reaction 입력 버튼 — '봤어요?' 또는 '시청'(해제). web PosterCard 정합. */}
      {!isReporting && !report && (
        <Pressable
          onPress={() => onStartReport(rec.tmdbId)}
          accessibilityRole="button"
          accessibilityLabel={`${rec.title} 시청 리포트 작성`}
          style={styles.reportChip}
          hitSlop={4}
        >
          <Text style={styles.reportChipText}>봤어요?</Text>
        </Pressable>
      )}
      {!isReporting && report && (
        <Pressable
          onPress={() => onUndoReport(rec.tmdbId)}
          accessibilityRole="button"
          accessibilityLabel={`${rec.title} 시청 리포트 취소`}
          accessibilityState={{ selected: true }}
          style={styles.reportChip}
          hitSlop={4}
        >
          <Text style={styles.reportChipDone}>✓ 시청</Text>
        </Pressable>
      )}

      {/* isReporting 시 reaction 선택 overlay — 카드 전체 덮음. */}
      {isReporting && (
        <ReactionOverlay
          tmdbId={rec.tmdbId}
          onReport={onReport}
          onCancel={onCancelReport}
        />
      )}
    </Pressable>
  );
}

/**
 * ListCard — 위임 O #2 / web ListCard 동기화.
 * 가로 카드 = 포스터 60×90 + 제목/평점/타입+런타임/OTT 칩.
 * W5 Task F — onLongPress = ActionSheet 메뉴 (Grid 와 동일 인터랙션).
 * P2 배치 A — reaction 입력: 우측 '봤어요?'/'시청' 토글 + isReporting 시 ReactionOverlay.
 */
function ListCard({
  item,
  report,
  isReporting,
  onPress,
  onLongPress,
  onStartReport,
  onReport,
  onUndoReport,
  onCancelReport,
}: {
  item: SavedItem;
  report: WatchReaction | undefined;
  isReporting: boolean;
  onPress: (rec: Recommendation) => void;
  onLongPress: (rec: Recommendation) => void;
  onStartReport: (tmdbId: number) => void;
  onReport: (tmdbId: number, reaction: WatchReaction) => void;
  onUndoReport: (tmdbId: number) => void;
  onCancelReport: () => void;
}) {
  const rec = item.recommendation;
  const meta: string[] = [];
  if (rec.type === 'movie' && rec.runtime) meta.push(`${rec.runtime}분`);
  if (rec.type === 'series' && rec.seasons) meta.push(`시즌 ${rec.seasons}`);

  return (
    // a11y: 카드 root 는 accessible={false} — 카드 탭과 트레일링 reaction 칩이
    // 각각 별개 a11y element 가 되도록 병합 해제 (iOS 의 자식 Pressable 흡수
    // 방지). 카드 탭 a11y 는 listBody View 에 명시 부여.
    <Pressable
      style={({ pressed }) => [
        styles.listCard,
        pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
      ]}
      // W5 Task E — 카드 탭 = DetailSheet 진입.
      // W5 Task F — long-press = ActionSheet 메뉴 (상세/아카이브/삭제).
      onPress={() => onPress(rec)}
      onLongPress={() => onLongPress(rec)}
      accessible={false}
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
      {/* a11y: 카드 탭(상세보기) 의 단일 a11y element. 터치는 root Pressable 이
          처리(동작 불변), VoiceOver 에는 이 View 가 "상세보기" 버튼으로 노출. */}
      <View
        style={styles.listBody}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${rec.title} 상세보기`}
      >
        <Text style={styles.listTitle} numberOfLines={1}>
          {rec.title}
        </Text>
        <View style={styles.listMetaRow}>
          <Text style={styles.listRating}>★ {rec.rating.toFixed(1)}</Text>
          {meta.length > 0 && (
            <Text style={styles.listMeta}>· {meta.join(' · ')}</Text>
          )}
        </View>
        <View style={styles.listSubRow}>
          {report ? (
            <ReactionLabel reaction={report} />
          ) : rec.providers.length > 0 ? (
            <Text style={styles.listProviders} numberOfLines={1}>
              {rec.providers.slice(0, 3).map((p) => p.name).join(' · ')}
            </Text>
          ) : null}
        </View>
      </View>

      {/* 트레일링 reaction 입력 버튼 — '봤어요?' 또는 '✓'(해제). web ListCard 정합. */}
      {!isReporting && (
        <View style={styles.listTrailing}>
          {!report ? (
            <Pressable
              onPress={() => onStartReport(rec.tmdbId)}
              accessibilityRole="button"
              accessibilityLabel={`${rec.title} 시청 리포트 작성`}
              style={styles.listReportChip}
              hitSlop={4}
            >
              <Text style={styles.listReportChipText}>봤어요?</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => onUndoReport(rec.tmdbId)}
              accessibilityRole="button"
              accessibilityLabel={`${rec.title} 시청 리포트 취소`}
              accessibilityState={{ selected: true }}
              style={styles.listReportChip}
              hitSlop={4}
            >
              <Text style={styles.listReportChipDone}>✓</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* isReporting 시 reaction 선택 overlay — 카드 전체 덮음 (compact 모드). */}
      {isReporting && (
        <ReactionOverlay
          tmdbId={rec.tmdbId}
          onReport={onReport}
          onCancel={onCancelReport}
          compact
        />
      )}
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
  // P2 배치 A — filter bar = viewFilter 탭 행 + "필터 ▾" 트리거 (web SavedFilters 정합).
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.lg,
    // FAIL-B — bar 전체가 세로 공간을 흡수하지 않도록 고정.
    flexGrow: 0,
    flexShrink: 0,
  },
  // W5 Task F — ViewFilter 탭 행 스타일 (web SavedFilters underline 패턴 정합).
  viewFilterScroll: {
    flexGrow: 1,
    flexShrink: 1,
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
  // "필터 ▾" 트리거 — web SavedFilters sheet 트리거 정합.
  filterTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  filterTriggerText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  filterTriggerDot: {
    position: 'absolute',
    top: 8,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  // 활성 필터 chip 행 — web SavedFilters 활성 chip 정합.
  activeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorderLight,
  },
  activeChipIcon: {
    width: 14,
    height: 14,
    borderRadius: radius.sm,
  },
  activeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  activeChipX: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontFamily: fontsV2.display,
  },
  emptyHint: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  cardDim: {
    backgroundColor: colors.overlay,
    opacity: 0.35,
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
  labelMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  labelRating: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fontsV2.data,
  },
  labelOttIcon: {
    width: 16,
    height: 16,
    borderRadius: radius.sm,
  },
  // 좌상단 reaction 입력 칩 — web PosterCard 의 '봤어요?' 버튼 정합.
  reportChip: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    minHeight: 32,
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: colors.overlay,
  },
  reportChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  reportChipDone: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accent,
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
    overflow: 'hidden',
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
  listSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    minHeight: 18,
  },
  listProviders: {
    color: colors.textMuted,
    fontSize: 11,
  },
  // 트레일링 reaction 칩 — web ListCard 의 '봤어요?'/'✓' 정합.
  listTrailing: {
    flexShrink: 0,
  },
  listReportChip: {
    minHeight: 36,
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: colors.surfaceRaised,
  },
  listReportChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  listReportChipDone: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  // OTT 그룹핑 (SectionList) 스타일 — web SavedList ottGroups 정합.
  groupedContent: {
    paddingBottom: spacing.lg,
  },
  ottSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  ottSectionIcon: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
  },
  ottSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  ottSectionCount: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fontsV2.data,
  },
  ottSectionEmpty: {
    fontSize: 12,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
  },
  groupListWrap: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  groupGridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
});
