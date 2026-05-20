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
  addSaved,
  removeSaved,
  getWatchReports,
  addWatchReport,
  removeWatchReport,
  getArchivedIds,
  archiveItem,
  unarchiveItem,
  getRecHistory,
  getWatchStats,
  type RecHistoryEntry,
} from '../lib/store';
import { env } from '../lib/env';
import type { Recommendation, SavedItem, WatchReaction } from '../lib/types';
import { colors, radius, spacing, fontsV2, shadowsNative } from '../lib/tokens';
import { useToast } from '../contexts/ToastContext';
import { track } from '../lib/analytics';
import DetailSheet from '../components/DetailSheet';
import SearchSheet from '../components/SearchSheet';
import SavedHero from '../components/SavedHero';
import { IconSearch, IconSave } from '../components/Icons';
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
 * W5 Task F / 배치 H — Saved 화면 view filter (web `SavedFilters.tsx` 와 정합).
 * 배치 H 에서 'history' 추가 → web 정본과 동일하게 5종 노출:
 *  - "all"       : 전체 (아카이브 hide)
 *  - "unwatched" : 안 봤어요 (시청 리포트 없음)
 *  - "watched"   : 시청 완료 (loved/good/meh/dropped 어떤 reaction 이라도 있음)
 *  - "archived"  : 아카이브 (사용자가 명시적으로 숨긴 작품) — 0개면 탭 숨김
 *  - "history"   : 히스토리 (Discover 에서 추천받은 작품 누적 기록 — 날짜별 그룹)
 */
type ViewFilter = 'all' | 'unwatched' | 'watched' | 'archived' | 'history';

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
  // 배치 H — 추천 기록 + 시청 통계.
  // web `apps/web/src/app/saved/page.tsx:68/73` 와 1:1 정합.
  const [history, setHistory] = useState<RecHistoryEntry[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    loved: 0,
    good: 0,
    meh: 0,
    dropped: 0,
  });
  // 배치 H — resave 진행 중인 항목 id (중복 탭 방지 + 진행 표시).
  const [resavingId, setResavingId] = useState<number | null>(null);
  // P2 배치 A — 정렬 / OTT 필터 / OTT별 그룹화 (web saved/page.tsx 정합).
  const [sortBy, setSortBy] = useState<SavedSort>('saved');
  const [ottFilter, setOttFilter] = useState<string | null>(null);
  const [groupByOTT, setGroupByOTT] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  // P2 배치 A — 카드 내 reaction 입력 ('봤어요?'). web saved/page.tsx:66 reportingId 정합.
  const [reportingId, setReportingId] = useState<number | null>(null);

  // 배치 G — 카드 삭제 시 undo toast (데이터 손실 방지).
  const toast = useToast();

  const refreshAll = useCallback(async () => {
    // 배치 H — history / stats 도 함께 로드 (web `refreshData` saved/page.tsx:83-95 정합).
    const [savedList, reportsList, archived, historyList, statsData] =
      await Promise.all([
        getSaved(),
        getWatchReports(),
        getArchivedIds(),
        getRecHistory(),
        getWatchStats(),
      ]);
    setItems(savedList);
    const reportsMap: Record<number, WatchReaction> = {};
    for (const r of reportsList) {
      reportsMap[r.tmdbId] = r.reaction;
    }
    setReports(reportsMap);
    setArchivedIds(new Set(archived));
    setHistory(historyList);
    setStats(statsData);
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
    // 배치 G — 삭제 전에 rec + 시청 리포트 보존 → undo toast 시 복원.
    // web `saved/page.tsx:295-313` handleRemove 정합.
    const target = items.find((s) => s.recommendation.tmdbId === tmdbId);
    const prevReport = reports[tmdbId];

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

    // undo toast — "책장에서 뺐어요 · 실행 취소". 누르면 삭제 복원.
    if (target) {
      toast.show('remove', {
        ctx: { title: target.recommendation.title },
        onAction: () => {
          // 복원은 비동기 store 쓰기 + 로컬 state 즉시 반영.
          void (async () => {
            await addSaved(target.recommendation);
            if (prevReport) await addWatchReport(tmdbId, prevReport);
            // store 가 savedAt 을 새로 찍으므로 정렬 정합 위해 refreshAll 로 재로드.
            await refreshAll();
          })();
        },
      });
    }
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

  // 배치 H — 추천 기록 날짜별 그룹핑. web `historyGroups` (saved/page.tsx:221-236) 정합.
  // 오늘 / 어제 / 이전 3구간. 빈 그룹은 제외. viewFilter 가 history 일 때만 계산.
  const historyGroups = useMemo(() => {
    if (viewFilter !== 'history') return [];
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .slice(0, 10);
    const groups: { label: string; items: RecHistoryEntry[] }[] = [
      { label: '오늘', items: [] },
      { label: '어제', items: [] },
      { label: '이전', items: [] },
    ];
    for (const entry of history) {
      if (entry.date === today) groups[0].items.push(entry);
      else if (entry.date === yesterday) groups[1].items.push(entry);
      else groups[2].items.push(entry);
    }
    return groups.filter((g) => g.items.length > 0);
  }, [history, viewFilter]);

  // 배치 H — saved 에 있는 tmdbId Set. history 카드의 "저장됨" 배지 / resave 버튼 분기용.
  // web `savedIdSet` (saved/page.tsx:239) 정합.
  const savedIdSet = useMemo(
    () => new Set(items.map((s) => s.recommendation.tmdbId)),
    [items],
  );

  /**
   * 배치 H — history 항목 → TMDB 상세 조회로 full Recommendation 복원.
   * web `hydrateEntry` (saved/page.tsx:242-252) 정합.
   * native 는 web 의 상대경로 `/api/tmdb/hydrate` 대신 `env.API_BASE_URL` prefix 사용
   * (DetailSheet.tsx:226 / OnboardingStepFavorites.tsx:145 와 동일한 native 패턴).
   */
  const hydrateEntry = useCallback(
    async (entry: RecHistoryEntry): Promise<Recommendation | null> => {
      try {
        const params = new URLSearchParams({ id: String(entry.tmdbId) });
        if (entry.type) params.set('type', entry.type);
        const res = await fetch(
          `${env.API_BASE_URL}/api/tmdb/hydrate?${params.toString()}`,
        );
        if (!res.ok) return null;
        return (await res.json()) as Recommendation;
      } catch {
        return null;
      }
    },
    [],
  );

  /**
   * 배치 H — history 항목을 책장에 다시 담기.
   * web `handleResave` (saved/page.tsx:254-281) 정합:
   *   hydrate 성공 → full Recommendation 으로 addSaved.
   *   hydrate 실패 → 최소 정보(평점/OTT 등 없음) 폴백 객체로 addSaved.
   */
  const handleResave = useCallback(
    async (entry: RecHistoryEntry) => {
      if (resavingId !== null) return;
      setResavingId(entry.tmdbId);
      try {
        const full = await hydrateEntry(entry);
        if (full) {
          await addSaved(full);
        } else {
          // hydrate 실패 — web 정본과 동일한 최소 폴백 객체.
          await addSaved({
            title: entry.title,
            tmdbId: entry.tmdbId,
            posterUrl: entry.posterUrl,
            reason: '',
            rating: 0,
            providers: [],
            type: entry.type ?? 'movie',
            titleEn: '',
            overview: '',
            backdrop: null,
            date: entry.date,
            runtime: null,
            seasons: null,
            country: [],
            director: null,
            cast: [],
            watchLink: null,
          });
        }
        // web `handleResave` (saved/page.tsx:254-281) 는 refreshData 만 — toast 없음.
        // native 도 정본 정합 위해 toast 미발사. resave 결과는 카드의 저장 배지로 확인.
        await refreshAll();
      } finally {
        setResavingId(null);
      }
    },
    [resavingId, hydrateEntry, refreshAll],
  );

  /**
   * 배치 H — history 항목 탭 → DetailSheet 진입.
   * web `handleHistoryClick` (saved/page.tsx:284-293) 정합:
   *   이미 saved 면 그 recommendation 으로, 아니면 hydrate 후 열기. 실패 시 무시.
   */
  const handleHistoryPress = useCallback(
    async (entry: RecHistoryEntry) => {
      const existing = items.find(
        (s) => s.recommendation.tmdbId === entry.tmdbId,
      );
      if (existing) {
        handleOpenDetail(existing.recommendation);
        return;
      }
      const full = await hydrateEntry(entry);
      if (!full) return;
      handleOpenDetail(full);
    },
    [items, hydrateEntry, handleOpenDetail],
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
    // 배치 H — '히스토리' 탭은 항상 노출 (web saved/page.tsx:438 정본 동일).
    base.push({ key: 'history', label: '히스토리', count: history.length });
    return base;
  }, [items, reports, archivedIds, history.length]);

  // P2 배치 A — "필터" 트리거 노출 조건. web saved/page.tsx:536-540 정합.
  // OTT 가 2종 이상일 때만 필터 의미 있음.
  // 배치 H — history 뷰에서는 OTT 필터/정렬 의미 없음 → 트리거 숨김 (web 정본 동일).
  const showFilterTrigger =
    items.length > 0 && availableOTTs.length > 1 && viewFilter !== 'history';
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

  // 2026-05-20 — SafeAreaView edges 에서 'bottom' 제거. BottomTabs 자체 bottom inset
  // 처리와 중복되어 FlatList 마지막 row 가 잘리는 회귀 (사용자 보고). ['top'] 만 처리.
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 3-슬롯 헤더 — 좌:title / 중앙:viewMode 토글 / 우:search.
          web saved/page.tsx 헤더 (좌 H1 / 중앙 grid·list·preview / 우 search) 정합. */}
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>Saved</Text>
          {/* 배치 H — history 뷰에서는 추천 기록 갯수를 카운터로 표시
              (native 고유 카운터 — saved 갯수를 보여주면 history 맥락과 어긋남). */}
          <Text style={styles.counter}>
            {viewFilter === 'history'
              ? `${history.length}개`
              : `${ottFilteredItems.length}개`}
          </Text>
        </View>
        {/* viewMode segmented (grid/list/preview). items 비어있으면 숨김.
            배치 H — history 뷰에서는 grid/list/preview 무의미 → 숨김
            (web saved/page.tsx:461 `saved.length > 0 && viewFilter !== "history"` 정합). */}
        {items.length > 0 && viewFilter !== 'history' ? (
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
          배치 H — items 0 이어도 history 가 있으면 탭 행 노출 (web saved/page.tsx:531
          `saved.length > 0 || history.length > 0` 정합 — '히스토리' 탭 접근 보장). */}
      {(items.length > 0 || history.length > 0) && (
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
          OTT 또는 그룹화 적용 시에만 노출. 탭하면 즉시 제거.
          배치 H — history 뷰에서는 OTT chip 무의미 → 숨김 (web `showActiveChips` 정합). */}
      {items.length > 0 && viewFilter !== 'history' && (ottFilter !== null || groupByOTT) && (
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

      {/* 배치 H — Watch Stats 카드. web saved/page.tsx:552-591 정합.
          watched / archived 탭에서 시청 리포트가 1건 이상일 때 노출.
          loved/good/meh/dropped 중 0 인 항목은 숨김 (web 정본 동일). */}
      {stats.total > 0 &&
        (viewFilter === 'watched' || viewFilter === 'archived') && (
          <View style={styles.statsWrap}>
            <View style={styles.statsCard}>
              <View style={styles.statsTextCol}>
                <Text style={styles.statsLabel}>시청 리포트</Text>
                <View style={styles.statsRow}>
                  {stats.loved > 0 && (
                    <Text style={styles.statLoved}>인생작 {stats.loved}</Text>
                  )}
                  {stats.good > 0 && (
                    <Text style={styles.statGood}>재밌었어 {stats.good}</Text>
                  )}
                  {stats.meh > 0 && (
                    <Text style={styles.statMeh}>그저 그래 {stats.meh}</Text>
                  )}
                  {stats.dropped > 0 && (
                    <Text style={styles.statDropped}>
                      안 맞았어 {stats.dropped}
                    </Text>
                  )}
                </View>
              </View>
              <Text style={styles.statsTotal}>{stats.total}</Text>
            </View>
          </View>
        )}

      {viewFilter === 'history' ? (
        // 배치 H — 히스토리 뷰. web saved/page.tsx:595-671 정합.
        // 추천 기록을 날짜별 그룹(오늘/어제/이전)으로 가로 스크롤 표시.
        history.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>아직 추천 기록이 없어요</Text>
            <Text style={styles.emptyHint}>Discover에서 카드를 넘겨 보세요</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.historyScroll}>
            {historyGroups.map((group) => (
              <View key={group.label} style={styles.historyGroup}>
                <Text style={styles.historyGroupLabel}>{group.label}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.historyRow}
                >
                  {group.items.map((entry) => (
                    <HistoryCard
                      key={entry.tmdbId}
                      entry={entry}
                      isSaved={savedIdSet.has(entry.tmdbId)}
                      isResaving={resavingId === entry.tmdbId}
                      onPress={handleHistoryPress}
                      onResave={handleResave}
                    />
                  ))}
                </ScrollView>
              </View>
            ))}
          </ScrollView>
        )
      ) : items.length === 0 ? (
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
          transition={0}
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
            transition={0}
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

/**
 * HistoryCard — 배치 H. 히스토리 뷰의 가로 스크롤 카드.
 * web `apps/web/src/app/saved/page.tsx:614-665` 의 history 항목 카드 정합.
 *  - 포스터 64×96 + 우상단 저장 배지(하트, isSaved 일 때).
 *  - 제목 1줄.
 *  - 미저장 항목은 하단 '저장' 버튼 → resave (hydrate 후 책장에 담기).
 *  - 카드 탭 = DetailSheet 진입 (저장됐으면 그 rec, 아니면 hydrate).
 */
function HistoryCard({
  entry,
  isSaved,
  isResaving,
  onPress,
  onResave,
}: {
  entry: RecHistoryEntry;
  isSaved: boolean;
  isResaving: boolean;
  onPress: (entry: RecHistoryEntry) => void;
  onResave: (entry: RecHistoryEntry) => void;
}) {
  return (
    <View style={styles.historyCard}>
      <Pressable
        onPress={() => onPress(entry)}
        accessibilityRole="button"
        accessibilityLabel={`${entry.title}${isSaved ? ' (저장됨)' : ''} 상세보기`}
        style={({ pressed }) => [pressed && { opacity: 0.85 }]}
      >
        <View style={styles.historyPosterFrame}>
          {entry.posterUrl ? (
            <Image
              source={{ uri: entry.posterUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={0}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.fallback]}>
              <Text style={styles.historyPosterFallback}>N</Text>
            </View>
          )}
          {isSaved && (
            <View style={styles.historySavedBadge}>
              <IconSave size={8} color={colors.accent} filled />
            </View>
          )}
        </View>
        <Text style={styles.historyTitle} numberOfLines={1}>
          {entry.title}
        </Text>
      </Pressable>
      {/* 미저장 항목 — '저장' 버튼. web saved/page.tsx:648-663 정합.
          이미 저장됐으면 버튼 미노출 (배지로 충분). */}
      {!isSaved && (
        <Pressable
          onPress={() => onResave(entry)}
          disabled={isResaving}
          accessibilityRole="button"
          accessibilityLabel={`${entry.title} 저장`}
          accessibilityState={{ disabled: isResaving }}
          style={[styles.historyResaveBtn, isResaving && { opacity: 0.5 }]}
          hitSlop={4}
        >
          <Text style={styles.historyResaveText}>
            {isResaving ? '저장 중' : '저장'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    // 2026-05-19 native↔PWA 정합 — web saved/page.tsx 헤더 `h-12`(48px 고정) 정본.
    // 기존 paddingVertical: spacing.md(16) → 헤더 ~60px. Discover 헤더 정합과 동일하게
    // PWA 실효 높이로 수렴. 가장 큰 자식(searchBtn 44)이 alignItems:center 로 48 안에
    // 들어가 클리핑 없음 (segmented 42 / title lineHeight 28 도 여유).
    height: 48,
    gap: spacing.sm,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    minWidth: 0,
  },
  // 2026-05-19 native↔PWA 정합 (항목 3) — web saved/page.tsx h1 정본:
  //   text 'Saved' (영문) / font-display(Instrument Serif) / fontSize 28 /
  //   fontWeight 500 / letterSpacing -0.025em (28×-0.025=-0.7).
  // 2026-05-20 — lineHeight 28(=fontSize) 은 Instrument Serif 의 ascender 영역을
  // 잘라 상단 클리핑 발생 (사용자 보고). web 은 line-height 1 도 anonymous box 가
  // 자체 padding 으로 ascender 보전. native 는 명시적 여유 필요 → 36 (≈1.3×) 으로 상향.
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '500',
    letterSpacing: -0.7,
    lineHeight: 36,
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
  // 배치 H — Watch Stats 카드. web saved/page.tsx:554-590 정합.
  // mx-5 mt-2 mb-3 + p-3 + surface 배경 + 미세 그림자.
  statsWrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.sm + 4,
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.sm + 4,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadowsNative.sm,
  },
  statsTextCol: {
    flex: 1,
  },
  statsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm + 4,
    marginTop: 6,
  },
  // 4종 reaction 색상 — web text-accent / text-secondary / text-muted / text-danger 정합.
  statLoved: {
    fontSize: 12,
    color: colors.accent,
  },
  statGood: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  statMeh: {
    fontSize: 12,
    color: colors.textMuted,
  },
  statDropped: {
    fontSize: 12,
    color: colors.danger,
  },
  // web "font-data text-2xl font-bold" — Geist Mono 24px bold.
  statsTotal: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: fontsV2.data,
  },
  // 배치 H — 히스토리 뷰. web saved/page.tsx:597-671 정합.
  historyScroll: {
    paddingBottom: spacing.lg,
  },
  historyGroup: {
    marginBottom: spacing.lg + 4,
  },
  // web "px-5 mb-2" + "text-xs font-medium text-muted".
  historyGroupLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  // web "flex gap-3 px-5 overflow-x-auto".
  historyRow: {
    flexDirection: 'row',
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
  },
  // web "flex-shrink-0 w-16" — 카드 폭 64.
  historyCard: {
    width: 64,
  },
  // web "relative w-16 h-24 rounded-md" — 포스터 64×96.
  historyPosterFrame: {
    width: 64,
    height: 96,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  historyPosterFallback: {
    color: colors.textMuted,
    fontSize: 24,
    fontWeight: '700',
  },
  // web "absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-accent-dim".
  historySavedBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentDim,
  },
  // web "text-xs mt-1 truncate".
  historyTitle: {
    fontSize: 12,
    color: colors.textPrimary,
    marginTop: 4,
  },
  // web "mt-1 w-full py-1 text-xs surface border".
  historyResaveBtn: {
    marginTop: 4,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyResaveText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
});
