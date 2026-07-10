import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Dimensions,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Rect, Line, Polyline } from 'react-native-svg';
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
  getWatchStats,
  backfillSavedGenres,
} from '../lib/store';
import { fetchGenresForIds } from '../lib/api';
import type { Recommendation, SavedItem, WatchReaction } from '../lib/types';
import { colors, radius, spacing, fontsV2, shadowsNative } from '../lib/tokens';
import { useToast } from '../contexts/ToastContext';
import { track } from '../lib/analytics';
import { displayProviders } from '../lib/providers';
import { setPendingMixSeed } from '../lib/mix-bridge';
import DetailSheet from '../components/DetailSheet';
import SearchSheet from '../components/SearchSheet';
import { IconSearch, IconArchive, IconBang, IconCheckPop } from '../components/Icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  cancelAnimation,
  interpolate,
  Extrapolation,
  Easing,
} from 'react-native-reanimated';
import { easings } from '@neq/design';
import SavedFilterSheet from '../components/saved/SavedFilterSheet';
import SavedGenreChips, {
  genreLabelsByFrequency,
  itemHasGenre,
} from '../components/saved/SavedGenreChips';
import { REACTION_OPTIONS } from '../components/saved/ReactionOverlay';
import ReactionLabel from '../components/saved/ReactionLabel';
import {
  loadSavedSort,
  persistSavedSort,
  sortSavedItems,
  monthKeyOf,
  type SavedSort,
} from '../components/saved/SavedSortControl';
import SavedMonthScrubber from '../components/saved/SavedMonthScrubber';

// #2 — 3열 그리드. 간격은 gap(spacing.md) × (열수+1) 을 화면폭에서 빼고 균등 분할.
const COLS = 3;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_W = (SCREEN_WIDTH - spacing.md * (COLS + 1)) / COLS;
// 3열 카드는 폭이 좁아 240/200 고정 높이가 과도하게 세로로 길어짐. 포스터 2:3
// 비율(height = width × 3/2)로 높이를 폭에 연동 — 비대칭(tall)은 유지하되 비율 기반.
const CARD_H = Math.round(CARD_W * 1.5); // 2:3 포스터
const CARD_H_TALL = Math.round(CARD_W * 1.6); // 살짝 긴 변주 (Pinterest 식 비대칭 보존)

/**
 * Saved 뷰 모드.
 *  - "grid":    기본 2열 그리드
 *  - "list":    1열 가로 카드 (포스터 60×90 + 제목/메타)
 * Track B — "preview"(Coverflow/SavedHero) 폐기. 그리드/리스트만.
 * 키: 'neq_saved_view' — web localStorage 키와 동일.
 */
type SavedViewMode = 'grid' | 'list';
const SAVED_VIEW_KEY = 'neq_saved_view';

/**
 * W5 Task F — Saved 화면 view filter (web `SavedFilters.tsx` 와 정합).
 * 2026-06-06 (P2 history 제거) — '히스토리' 탭 표면 삭제. 4종 노출:
 *  - "all"       : 전체 (아카이브 hide)
 *  - "unwatched" : 안 본 작품 (시청 리포트 없음)
 *  - "watched"   : 시청 완료 (loved/good/meh/dropped 어떤 reaction 이라도 있음)
 *  - "archived"  : 아카이브 (사용자가 명시적으로 숨긴 작품)
 *
 * 데이터 레이어 보존 — `getRecHistory`/`addRecHistory` 는 P1 다양성 의존성
 * (`apps/native/app/index.tsx` excludeIds 합집합) 으로 그대로 유지. 본 변경은
 * Saved UI 표면만 정리.
 */
type ViewFilter = 'all' | 'unwatched' | 'watched' | 'archived';

async function loadSavedView(): Promise<SavedViewMode> {
  try {
    const v = await AsyncStorage.getItem(SAVED_VIEW_KEY);
    // Track B — 'preview' 폐기. 과거 저장값이면 grid 로 fallback.
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
 * IconGrid/IconList (web Icons.tsx 와 시각 정합).
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
 * IconChevronDown — "필터" 트리거의 ▾ 표시. web SavedFilters 의 polyline 정합.
 */
function IconChevronDown({ size = 10, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline points="6 9 12 15 18 9" stroke={color} strokeWidth={2} strokeLinecap="square" fill="none" />
    </Svg>
  );
}
/**
 * IconCalendar — #6 연·월 모드 in-screen 토글. DESIGN.md Iconography 5원칙 정합:
 * uniform stroke 1.5 + round terminal + single-form. 프레임 + 상단 두 링(바인딩) +
 * 헤더 구분선. 색상은 props (currentColor 위임 패턴).
 */
function IconCalendar({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3.5" y="5" width="17" height="15" rx="2" stroke={color} strokeWidth={1.5} />
      <Line x1="3.5" y1="9.5" x2="20.5" y2="9.5" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="8" y1="3" x2="8" y2="6.5" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="16" y1="3" x2="16" y2="6.5" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

export default function SavedScreen() {
  const [items, setItems] = useState<SavedItem[]>([]);
  // 뷰 모드. 첫 mount 시 AsyncStorage 에서 복원.
  const [viewMode, setViewMode] = useState<SavedViewMode>('grid');
  // W5 Task E — Saved DetailSheet 진입 (web `openDetailFor` 정합).
  // 카드 onPress → DetailSheet open + `detail_opened` source: 'saved_tap'.
  const [detailRec, setDetailRec] = useState<Recommendation | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  // 헤더 search 버튼 → SearchSheet 자체 마운트 (web `saved/page.tsx` 정합).
  // DetailSheet Cast 클릭 시에도 진입 — searchInitialQuery 에 인물명 주입.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState('');
  // 2026-05-29 — Discover 정합. SearchSheet 결과 클릭으로 진입한 DetailSheet 추적.
  // DetailSheet 닫힐 때 true 면 SearchSheet 자동 복귀 + 검색 컨텍스트 보존.
  const [returnToSearchAfterDetail, setReturnToSearchAfterDetail] =
    useState(false);
  // W5 Task F — view filter + archive 상태.
  // web `apps/web/src/app/saved/page.tsx:69/72` 와 1:1 정합.
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [reports, setReports] = useState<Record<number, WatchReaction>>({});
  const [archivedIds, setArchivedIds] = useState<Set<number>>(new Set());
  // 배치 H — 시청 통계.
  // 2026-06-06 (P2 history 제거) — history state/resavingId 삭제. stats 유지.
  // web `apps/web/src/app/saved/page.tsx:68` 정합.
  const [stats, setStats] = useState({
    total: 0,
    loved: 0,
    good: 0,
    meh: 0,
    dropped: 0,
  });
  // P2 배치 A — 정렬 / OTT 필터 (web saved/page.tsx 정합).
  const [sortBy, setSortBy] = useState<SavedSort>('saved');
  const [ottFilter, setOttFilter] = useState<string | null>(null);
  // Track B — 장르 필터 (1차 필터). 한국어 라벨 단일 선택. null = 전체.
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  // #6 — 연·월 스크러버. 필터 sheet 토글에서 in-screen 토글 + 가로 스크러버로 재설계.
  //  - monthMode: 연·월 모드 on/off (헤더 캘린더 버튼). off 면 월 필터 미적용.
  //  - selectedMonth: 스크러버에서 탭한 단일 월 key(year*12+month) 또는 null(=전체 월).
  const [monthMode, setMonthMode] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  // P2 배치 A — 카드 내 reaction 입력 ('봤어요?'). web saved/page.tsx:66 reportingId 정합.
  const [reportingId, setReportingId] = useState<number | null>(null);

  // 배치 G — 카드 삭제 시 undo toast (데이터 손실 방지).
  const toast = useToast();
  // 2026-07-10 — long-press 바텀 시트 하단 safe-area 패딩용.
  const insets = useSafeAreaInsets();

  const refreshAll = useCallback(async () => {
    // 2026-06-06 (P2 history 제거) — getRecHistory 호출 삭제.
    // 데이터 레이어 (`getRecHistory`/`addRecHistory`) 는 `apps/native/app/index.tsx`
    // P1 다양성 의존성으로 보존 — Saved 화면이 더 이상 읽지 않을 뿐.
    const [savedList, reportsList, archived, statsData] = await Promise.all([
      getSaved(),
      getWatchReports(),
      getArchivedIds(),
      getWatchStats(),
    ]);
    setItems(savedList);
    const reportsMap: Record<number, WatchReaction> = {};
    for (const r of reportsList) {
      reportsMap[r.tmdbId] = r.reaction;
    }
    setReports(reportsMap);
    setArchivedIds(new Set(archived));
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

  // Track B — genres 백필. mount 시 1회, genres 미보유 저장분만 mirror(/api/tmdb/genres)로
  // 채워 persist. genres 이미 있으면 fetcher 호출 없이 no-op (backfillSavedGenres
  // 내부에서 missing 0건이면 조기 반환). 실패해도 조용히 기존 목록 유지 (장르 필터가 '전체'만).
  //
  // race 방지 — 직접 setItems 하지 않고 refreshAll() 재호출로 최신 AsyncStorage 동기화.
  // 백필은 persist 후 완료되므로 refreshAll 이 genres 포함본을 읽는다. 직접 setItems 시
  // useFocusEffect→refreshAll(genres 없는 옛 스냅샷) 이 나중 settle 하면 칩바가 사라지는
  // 경쟁이 발생 → refreshAll 로 단일화. refreshAll 은 useCallback([]) 로 stable 하므로
  // dep 에 넣어도 effect 는 mount 1회만 실행.
  useEffect(() => {
    void backfillSavedGenres(fetchGenresForIds)
      .then(() => refreshAll())
      .catch(() => {
        /* silent — 백필 실패 시 장르 칩바만 축소, 저장/필터 회귀 없음 */
      });
  }, [refreshAll]);

  // 2026-06-04 follow-up — fallback useEffect 제거.
  // 기존: archived 0 되면 'archived' 탭 hide → 'all' 로 자동 fallback (W5 Task F).
  // 현재: archived 탭이 항상 노출 (위 viewFilters useMemo L591 의 archivedCount 가드 제거).
  // → 사용자가 archived 탭에 있는 동안 마지막 unarchive 가 일어나면 강제 'all' 전환이
  //   "탭은 노출하지만 클릭하면 자동 이탈" 인 충돌 동작이 됨. fallback 제거 →
  //   빈 상태 UI ("보관한 작품이 없어요") 가 일관되게 보임.

  const handleViewModeChange = useCallback((mode: SavedViewMode) => {
    setViewMode(mode);
    void persistSavedView(mode);
    track('saved_view_changed', { mode });
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

  // 2026-07-10 — 완료(✓) 배지 탭 → 관리 시트 (리포트 취소 / 아카이브) 대상.
  const [doneSheetId, setDoneSheetId] = useState<number | null>(null);
  const doneSheetRec =
    doneSheetId != null
      ? items.find((s) => s.recommendation.tmdbId === doneSheetId)?.recommendation ?? null
      : null;

  // 2026-07-10 — 리포트 시트 타이틀용 현재 대상 (reportingId → Recommendation).
  const reportingRec =
    reportingId != null
      ? items.find((s) => s.recommendation.tmdbId === reportingId)?.recommendation ?? null
      : null;

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

  // 2026-06-06 (P2 history 제거) — historyGroups / savedIdSet / hydrateEntry /
  // handleResave / handleHistoryPress 전체 삭제. 데이터 레이어 `getRecHistory` 는
  // `apps/native/app/index.tsx` P1 다양성 의존성으로 보존.

  // W5 Task F → 2026-07-10 재작성: long-press → 자체 bottom sheet
  // [상세보기 / 아카이브(또는 해제) / 삭제 / 취소]. OS ActionSheetIOS/Alert 를
  // 앱 디자인 언어의 하단 시트로 교체 (사용자 피드백 — SavedFilterSheet 시각 계열).
  const [menuRec, setMenuRec] = useState<Recommendation | null>(null);
  const handleLongPress = useCallback((rec: Recommendation) => {
    setMenuRec(rec);
  }, []);
  /**
   * 시트 닫은 뒤 액션 실행 — 상세보기는 또 다른 Modal(DetailSheet) 을 열므로
   * 두 Modal 전환이 겹치면 iOS 가 뒤 Modal 을 드랍할 수 있어 350ms 지연.
   */
  const runMenuAction = useCallback((action: () => void) => {
    setMenuRec(null);
    setTimeout(action, 350);
  }, []);

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

  // Track B — 장르 칩 목록. tab ∩ OTT 필터 적용된 작품(ottFilteredItems)에서
  // 실제 존재하는 장르만 빈도 내림차순. 칩바가 소비 + genreFilter 유효성 가드에 사용.
  const genreLabels = useMemo(
    () => genreLabelsByFrequency(ottFilteredItems),
    [ottFilteredItems],
  );

  // 상위 필터(tab/OTT) 변경으로 현재 선택 장르가 목록에서 사라지면 '전체'로 자동 복귀.
  // (예: watched 탭엔 있던 '코미디' 저장분이 unwatched 탭엔 없을 때 stale 선택 방지.)
  useEffect(() => {
    if (genreFilter !== null && !genreLabels.includes(genreFilter)) {
      setGenreFilter(null);
    }
  }, [genreFilter, genreLabels]);

  // Track B — 장르 필터 적용 (1차 필터, tab ∩ OTT 다음). 선택 장르를 genres 에
  // 포함한 저장분만 (다중장르 friendly — 교집합 아님). genres 미보유(백필 미스)
  // 항목은 특정 장르 선택 시 자연히 제외 (itemHasGenre → false).
  const genreFilteredItems = useMemo(() => {
    if (!genreFilter) return ottFilteredItems;
    return ottFilteredItems.filter((s) => itemHasGenre(s, genreFilter));
  }, [ottFilteredItems, genreFilter]);

  // #6 — 연·월 필터 (파이프라인: tab ∩ OTT ∩ 장르 ∩ 연·월). monthMode off 이거나
  // selectedMonth 미선택(=전체 월)이면 미적용. 선택 시 그 달 저장분만 통과.
  const monthFilteredItems = useMemo(() => {
    if (!monthMode || selectedMonth === null) return genreFilteredItems;
    return genreFilteredItems.filter((s) => monthKeyOf(s) === selectedMonth);
  }, [genreFilteredItems, monthMode, selectedMonth]);

  // P2 배치 A — 정렬 적용 (필터 파이프라인: tab ∩ OTT ∩ 장르 ∩ 연·월 → 정렬).
  const sortedItems = useMemo(
    () => sortSavedItems(monthFilteredItems, sortBy),
    [monthFilteredItems, sortBy],
  );

  // P2 배치 A — 저장 작품에서 사용 가능한 OTT 목록 (작품 수 많은 순).
  // web saved/page.tsx:178-188 availableOTTs 정합. ottFilter 와 무관하게 filteredItems 기준.
  const availableOTTs = useMemo(() => {
    const ottCount = new Map<string, number>();
    for (const s of filteredItems) {
      // displayProviders — 구 저장 스냅샷의 비지원 provider (Crunchyroll 류) 가
      // 필터 옵션으로 새는 것 차단 (2026-07-10 실기기 보고).
      for (const p of displayProviders(s.recommendation.providers)) {
        ottCount.set(p.name, (ottCount.get(p.name) ?? 0) + 1);
      }
    }
    return Array.from(ottCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [filteredItems]);

  // #6 — 연·월 모드 off 전이 시 선택 월 리셋 (stale 선택 방지).
  useEffect(() => {
    if (!monthMode && selectedMonth !== null) setSelectedMonth(null);
  }, [monthMode, selectedMonth]);

  // #6 — 상위 필터(tab/OTT/장르) 변경으로 선택한 월이 더 이상 존재하지 않으면
  // '전체 월'로 자동 복귀. (장르 필터 stale 복귀 useEffect L… 와 동형 가드.)
  useEffect(() => {
    if (
      monthMode &&
      selectedMonth !== null &&
      !genreFilteredItems.some((s) => monthKeyOf(s) === selectedMonth)
    ) {
      setSelectedMonth(null);
    }
  }, [monthMode, selectedMonth, genreFilteredItems]);

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
      { key: 'unwatched', label: '안 본 작품', count: unwatchedCount },
      { key: 'watched', label: '시청 완료', count: watchedCount },
    ];
    // 2026-06-04 follow-up — archivedCount 0 이어도 탭 노출.
    // 변경 전: archivedCount > 0 일 때만 push (web 정본 동일).
    // 변경 후: 사용자 인지 가능성 우선, 빈 상태에도 노출. archived 탭 클릭 시 빈 상태 UI
    // ("보관한 작품이 없어요" + "시청한 작품을 보관 아이콘으로 정리할 수 있어요", L856-878)
    // 가 자연스럽게 보이며 기능 발견성 확보.
    base.push({ key: 'archived', label: '아카이브', count: archivedCount });
    // 2026-06-06 (P2 history 제거) — '히스토리' 탭 push 삭제.
    return base;
  }, [items, reports, archivedIds]);

  // P2 배치 A — "필터" 트리거 노출 조건. web saved/page.tsx:536-540 정합.
  // OTT 가 2종 이상일 때만 필터 의미 있음.
  const showFilterTrigger = items.length > 0 && availableOTTs.length > 1;
  // #6 — 연·월은 sheet 밖 in-screen 스크러버로 관리. "필터" dot 은 sheet(SavedFilterSheet)가
  // 다루는 필터(OTT/정렬/장르)만 셈. selectedMonth 는 스크러버 칩 자체가 활성 표시이고
  // sheet 는 월을 모르므로(초기화 불가) dot 에서 제외 — 안 그러면 sheet 열어도 해제 못하는 dead-end.
  const hasActiveFilter =
    ottFilter !== null ||
    sortBy !== 'saved' ||
    genreFilter !== null;

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
      {/* 헤더 — 좌:title (자연 폭) / 우:search (자연 폭) / 중앙:viewMode 토글 (absolute center).
          web saved/page.tsx 헤더 (좌 H1 / 중앙 grid·list·preview / 우 search) 정합.
          2026-05-29 — 사용자 피드백:
            (1) titleWrap 의 카운터 (n개) 제거 — 필터 행에서 이미 확인 가능.
            (2) viewMode segmented 를 header 정중앙 (absolute center). 3슬롯 flex:1
                패턴은 RN 픽셀 라운딩으로 미세 오프셋 발생 → 절대 위치로 확정.
                title/search 는 양 끝 (justify-content: space-between). */}
      <View style={styles.header}>
        <View style={styles.titleSlot}>
          <Text style={styles.title}>Saved</Text>
        </View>
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
        {/* viewMode segmented (grid/list/preview). items 비어있으면 숨김.
            absolute fill + alignItems/justifyContent center → header 정중앙.
            pointerEvents="box-none" 으로 wrap 빈 영역은 터치 통과 (좌·우 슬롯 누를 수 있게). */}
        {items.length > 0 ? (
          <View
            style={styles.segmentedAbsolute}
            pointerEvents="box-none"
          >
            <View
              style={styles.segmented}
              accessibilityRole="tablist"
              accessibilityLabel="뷰 모드 전환"
            >
              {renderViewModeBtn('grid', '그리드 보기', IconGrid)}
              {renderViewModeBtn('list', '리스트 보기', IconList)}
            </View>
          </View>
        ) : null}
      </View>

      {/* W5 Task F — ViewFilter 탭 행 (web `SavedFilters` underline 패턴 정합).
          P2 배치 A — 우측에 "필터 ▾" 트리거 추가 (web SavedFilters 정합). */}
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
          {/* #6 — 연·월 모드 in-screen 토글 (캘린더 아이콘). ON 이면 아래 가로 스크러버
              노출. 필터 sheet 밖으로 꺼내 직관적 접근. active = accent 색(단순 아이콘 색
              — 면/칩 amber 아님, 카운트 영향 최소). */}
          <Pressable
            onPress={() => setMonthMode((v) => !v)}
            accessibilityRole="switch"
            accessibilityLabel="연·월별 보기"
            accessibilityState={{ checked: monthMode }}
            style={styles.monthToggle}
            hitSlop={4}
          >
            <IconCalendar
              size={16}
              // monthMode ON 활성색은 non-amber(textPrimary) — Saved amber 예산(DESIGN.md L33 ≤4)
              // 보호. OTT dot + activeChip + loved bg 와 동시 노출 시 amber 초과 방지.
              color={monthMode ? colors.textPrimary : colors.textSecondary}
            />
          </Pressable>
          {/* "필터 ▾" 트리거 — OTT 선택 + 정렬을 sheet 안으로 격하 (연·월은 위 토글로 분리).
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

      {/* #6 — 연·월 룰러 스크러버. monthMode ON 일 때만. 첫 저장 월~현재 월 연속
          눈금 + 중앙 인디케이터 스냅 = 단일 월 필터, 우측 '전체' 존 = 해제.
          저장이 비어있을 때만 컴포넌트가 자체 null 렌더. */}
      {items.length > 0 && monthMode && (
        <SavedMonthScrubber
          items={genreFilteredItems}
          selected={selectedMonth}
          onSelect={setSelectedMonth}
        />
      )}

      {/* Track B — 장르 필터 칩바 (1차 필터). tab ∩ OTT 필터 적용된 작품에서
          실제 존재하는 장르만 빈도 내림차순 + 맨 앞 '전체'. 단일 선택.
          칩 목록이 '전체' 하나뿐(장르 정보 0)이면 컴포넌트가 자체 null 렌더. */}
      {items.length > 0 && (
        <SavedGenreChips
          items={ottFilteredItems}
          selected={genreFilter}
          onSelect={setGenreFilter}
        />
      )}

      {/* P2 배치 A — 활성 OTT 필터 chip (web SavedFilters 활성 chip 정합).
          OTT 적용 시에만 노출. 탭하면 즉시 제거.
          (장르 해제는 칩바 '전체', 연·월 해제는 스크러버 '전체' 존으로 처리 — 여기 중복 안 함.) */}
      {items.length > 0 && ottFilter !== null && (
        <View style={styles.activeChipsRow}>
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
                    <Text style={styles.statGood}>괜찮았어 {stats.good}</Text>
                  )}
                  {stats.meh > 0 && (
                    <Text style={styles.statMeh}>별로였어 {stats.meh}</Text>
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

      {items.length === 0 ? (
        // P3 — 빈 상태 카피 정본 일치 (web saved/page.tsx:673-678 책장 메타포, Round 3 v2 잠금).
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>책장이 비어 있어요</Text>
          <Text style={styles.emptyHint}>
            Discover에서 마음에 드는 걸{'\n'}하나씩 담아 보세요
          </Text>
        </View>
      ) : sortedItems.length === 0 ? (
        // view filter / OTT / 장르 / 연·월 필터 적용 후 결과 0.
        // web saved/page.tsx:679-705 의 빈 상태 분기 카피 정합 + #6 연·월 분기 추가.
        // (ottFilteredItems 대신 sortedItems 기준 — 월 필터로만 0 이 되는 경우도 포함.)
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {ottFilter || genreFilter || selectedMonth !== null
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
            {ottFilter || genreFilter || selectedMonth !== null
              ? '필터를 조금만 느슨해 보세요'
              : viewFilter === 'archived'
                ? '시청한 작품을 보관 아이콘으로 정리할 수 있어요'
                : viewFilter === 'unwatched'
                  ? 'Discover에서 새로운 작품을 찾아보세요'
                  : viewFilter === 'watched'
                    ? '저장 작품의 노란 느낌표(!)를 눌러 시청 여부를 알려주세요'
                    : 'Discover에서 아래로 스와이프하거나 하트 버튼으로 담아보세요'}
          </Text>
        </View>
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
              isArchived={archivedIds.has(item.recommendation.tmdbId)}
              onPress={handleOpenDetail}
              onLongPress={handleLongPress}
              onStartReport={setReportingId}
              onDoneBadgePress={setDoneSheetId}
              onArchiveToggle={handleArchiveToggle}
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
              isArchived={archivedIds.has(item.recommendation.tmdbId)}
              onPress={handleOpenDetail}
              onLongPress={handleLongPress}
              onStartReport={setReportingId}
              onDoneBadgePress={setDoneSheetId}
              onArchiveToggle={handleArchiveToggle}
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
        onClose={() => {
          setDetailOpen(false);
          // 2026-07-10 — 시트 안에서 저장 해제/리포트 변경이 일어날 수 있으므로
          // 닫을 때 목록 재동기화 (해제한 작품이 Saved 에서 자연스럽게 사라짐).
          // useFocusEffect 는 Modal 닫힘으로는 재발화하지 않아 명시 호출 필요.
          void refreshAll();
          // 2026-05-29 — Discover 정합. SearchSheet 결과 클릭으로 진입한
          // DetailSheet 라면 닫을 때 SearchSheet 자동 복귀 + 검색 컨텍스트 보존.
          if (returnToSearchAfterDetail) {
            setReturnToSearchAfterDetail(false);
            setSearchOpen(true);
          }
        }}
        onSearchPerson={(name) => {
          track('detail_to_search_person', { name, from: 'saved' });
          setDetailOpen(false);
          setSearchInitialQuery(name);
          setSearchOpen(true);
        }}
        // 3차 Phase E — Saved 경유 '큐 시작': 시트 닫고 (검색 복귀 플래그 클리어)
        // 브리지에 seed 적재 → Discover 로 이동. focus 시 consume 되어 덱 주입.
        onStartMix={(mixRec) => {
          setDetailOpen(false);
          setReturnToSearchAfterDetail(false);
          setPendingMixSeed(mixRec, 'native_detail_sheet');
          router.push('/');
        }}
      />

      {/* 2026-07-10 — long-press 액션 시트 (하단). OS ActionSheetIOS 대체.
          공용 셸 SavedActionSheet — backdrop fade 와 시트 슬라이드 분리
          (Modal slide 가 backdrop 까지 밀어올리는 어색함 제거, 사용자 피드백). */}
      <SavedActionSheet
        open={menuRec !== null}
        onClose={() => setMenuRec(null)}
        paddingBottom={insets.bottom + spacing.md}
      >
        <Text style={styles.menuTitle} numberOfLines={1}>
          {menuRec?.title}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
          onPress={() => {
            const r = menuRec;
            if (r) runMenuAction(() => handleOpenDetail(r));
          }}
          accessibilityRole="button"
          accessibilityLabel="상세보기"
          testID="saved-menu-detail"
        >
          <Text style={styles.menuRowText}>상세보기</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
          onPress={() => {
            const r = menuRec;
            if (r) runMenuAction(() => void handleArchiveToggle(r.tmdbId));
          }}
          accessibilityRole="button"
          accessibilityLabel={
            menuRec && archivedIds.has(menuRec.tmdbId) ? '아카이브 해제' : '아카이브'
          }
          testID="saved-menu-archive"
        >
          <Text style={styles.menuRowText}>
            {menuRec && archivedIds.has(menuRec.tmdbId) ? '아카이브 해제' : '아카이브'}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
          onPress={() => {
            const r = menuRec;
            if (r) runMenuAction(() => void handleRemove(r.tmdbId));
          }}
          accessibilityRole="button"
          accessibilityLabel="삭제"
          testID="saved-menu-remove"
        >
          <Text style={[styles.menuRowText, styles.menuRowDanger]}>삭제</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.menuRow,
            styles.menuCancel,
            pressed && styles.menuRowPressed,
          ]}
          onPress={() => setMenuRec(null)}
          accessibilityRole="button"
          accessibilityLabel="취소"
          testID="saved-menu-cancel"
        >
          <Text style={styles.menuCancelText}>취소</Text>
        </Pressable>
      </SavedActionSheet>

      {/* 2026-07-10 — 시청 리포트 입력 하단 시트 (구 카드 위 ReactionOverlay 대체). */}
      <SavedActionSheet
        open={reportingId !== null}
        onClose={() => setReportingId(null)}
        paddingBottom={insets.bottom + spacing.md}
      >
        <Text style={styles.menuTitle} numberOfLines={1}>
          {reportingRec?.title ?? ''}
        </Text>
        <Text style={styles.reportSheetHeadline}>어땠는지 알려주세요</Text>
        {REACTION_OPTIONS.map((o) => (
          <Pressable
            key={o.key}
            style={({ pressed }) => [
              styles.reportOption,
              { backgroundColor: o.bg, borderColor: o.border },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => {
              const id = reportingId;
              if (id != null) void handleReport(id, o.key);
            }}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            testID={`report-${o.key}`}
          >
            <Text style={[styles.reportOptionText, { color: o.color }]}>{o.label}</Text>
          </Pressable>
        ))}
        <Pressable
          style={({ pressed }) => [
            styles.menuRow,
            styles.menuCancel,
            pressed && styles.menuRowPressed,
          ]}
          onPress={() => setReportingId(null)}
          accessibilityRole="button"
          accessibilityLabel="취소"
        >
          <Text style={styles.menuCancelText}>취소</Text>
        </Pressable>
      </SavedActionSheet>

      {/* 2026-07-10 — 완료(✓) 배지 관리 시트: 리포트 취소 / 아카이브. */}
      <SavedActionSheet
        open={doneSheetId !== null}
        onClose={() => setDoneSheetId(null)}
        paddingBottom={insets.bottom + spacing.md}
      >
        <Text style={styles.menuTitle} numberOfLines={1}>
          {doneSheetRec?.title ?? ''}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
          onPress={() => {
            const id = doneSheetId;
            setDoneSheetId(null);
            if (id != null) void handleUndoReport(id);
          }}
          accessibilityRole="button"
          accessibilityLabel="리포트 취소"
          testID="done-sheet-undo"
        >
          <Text style={styles.menuRowText}>리포트 취소</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
          onPress={() => {
            const id = doneSheetId;
            setDoneSheetId(null);
            if (id != null) void handleArchiveToggle(id);
          }}
          accessibilityRole="button"
          accessibilityLabel={
            doneSheetId != null && archivedIds.has(doneSheetId)
              ? '아카이브 해제'
              : '아카이브에 보관'
          }
          testID="done-sheet-archive"
        >
          <Text style={styles.menuRowText}>
            {doneSheetId != null && archivedIds.has(doneSheetId)
              ? '아카이브 해제'
              : '아카이브에 보관'}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.menuRow,
            styles.menuCancel,
            pressed && styles.menuRowPressed,
          ]}
          onPress={() => setDoneSheetId(null)}
          accessibilityRole="button"
          accessibilityLabel="취소"
        >
          <Text style={styles.menuCancelText}>취소</Text>
        </Pressable>
      </SavedActionSheet>

      {/* SearchSheet — Saved 페이지 자체 마운트. 헤더 search 버튼 또는
          DetailSheet Cast 클릭으로 진입 (web saved/page.tsx 정합).
          2026-05-20 — 작품 탭 → 기존 saved 의 detailRec 영역에 표시 (handleOpenDetail).
          2026-05-29 — preserveStateOnClose + returnToSearchAfterDetail 추가
          (Discover 정합). DetailSheet 닫을 때 검색 컨텍스트 복원. */}
      <SearchSheet
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        initialQuery={searchInitialQuery}
        preserveStateOnClose={returnToSearchAfterDetail}
        onWorkSelected={(rec) => {
          setSearchOpen(false);
          handleOpenDetail(rec);
          setReturnToSearchAfterDetail(true);
        }}
      />

      {/* 필터 sheet. OTT 선택 + 정렬만 (#6 — 연·월은 in-screen 토글+스크러버로 이동).
          genreFilter 는 칩바 '전체' 로도 해제되지만, sheet 의 "초기화" 도 대칭적으로
          장르를 함께 리셋해야 하므로 setGenreFilter 를 전달 (Issue 4). */}
      <SavedFilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        ottFilter={ottFilter}
        setOttFilter={setOttFilter}
        availableOTTs={availableOTTs}
        sortBy={sortBy}
        setSortBy={handleSortChange}
        genreFilter={genreFilter}
        setGenreFilter={setGenreFilter}
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
/**
 * 2026-07-10 — Saved 하단 시트 공용 셸 (long-press 메뉴 / 시청 리포트).
 * Modal animationType="slide" 는 backdrop 까지 통째로 슬라이드해 "오버레이가 시트에
 * 붙어 올라오는" 인상 (사용자 피드백) → SavedFilterSheet 정본 패턴: Modal none +
 * 시트만 translateY 슬라이드, backdrop 은 translateY 연동 fade. grabber 포함.
 * Reanimated cleanup (cancelAnimation) — feedback_reanimated_fabric_crash 정합.
 */
const SHEET_SLIDE_RANGE = 480; // 오프스크린 기준 — 시트 실높이(<=420)보다 크게

function SavedActionSheet({
  open,
  onClose,
  paddingBottom,
  children,
}: {
  open: boolean;
  onClose: () => void;
  paddingBottom: number;
  children: React.ReactNode;
}) {
  const translateY = useSharedValue(SHEET_SLIDE_RANGE);
  useEffect(() => {
    return () => cancelAnimation(translateY);
  }, [translateY]);
  useEffect(() => {
    translateY.value = withTiming(open ? 0 : SHEET_SLIDE_RANGE, {
      duration: open ? 280 : 220,
      easing: Easing.bezier(...easings.enter),
    });
  }, [open, translateY]);
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const dimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, SHEET_SLIDE_RANGE], [1, 0], Extrapolation.CLAMP),
  }));
  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* backdrop — 시트와 분리된 fade. 탭 = 닫기 (accessible=false: wrap a11y 흡수 트랩). */}
      <Animated.View style={[styles.menuBackdrop, dimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
      </Animated.View>
      <Animated.View style={[styles.menuSheetWrap, sheetStyle]} pointerEvents="box-none">
        <View style={[styles.menuSheet, { paddingBottom }]}>
          <View style={styles.menuGrabber} />
          {children}
        </View>
      </Animated.View>
    </Modal>
  );
}

function PosterCard({
  item,
  index,
  report,
  isReporting,
  isArchived,
  onPress,
  onLongPress,
  onStartReport,
  onDoneBadgePress,
  onArchiveToggle,
}: {
  item: SavedItem;
  index: number;
  report: WatchReaction | undefined;
  isReporting: boolean;
  isArchived: boolean;
  onPress: (rec: Recommendation) => void;
  onLongPress: (rec: Recommendation) => void;
  onStartReport: (tmdbId: number) => void;
  onDoneBadgePress: (tmdbId: number) => void;
  onArchiveToggle: (tmdbId: number) => void;
}) {
  const rec = item.recommendation;
  const tall = index % 3 === 0;

  return (
    // a11y: 카드 root 는 accessible={false} — 카드 탭과 reaction 칩이 각각
    // 별개 a11y element 가 되도록 병합 해제 (iOS 가 자식 Pressable 을 부모로
    // 흡수하는 것 방지). 카드 탭 a11y 는 하단 label View 에 명시 부여.
    <Pressable
      // 2026-07-10 — hold(long-press) active 피드백: pressed 동안 살짝 눌린 시각
      // (ListCard 기존 pressed 패턴 정합). long-press 인식 순간까지 유지된다.
      style={({ pressed }) => [
        styles.card,
        { width: CARD_W, height: tall ? CARD_H_TALL : CARD_H },
        pressed && styles.cardPressed,
      ]}
      // W5 Task E — 카드 탭 = DetailSheet 진입.
      // W5 Task F — long-press = 하단 액션 시트 [상세/아카이브/삭제] 메뉴.
      onPress={() => onPress(rec)}
      onLongPress={() => onLongPress(rec)}
      accessible={false}
    >
      {rec.posterUrl ? (
        <Image
          source={{ uri: rec.posterUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          // 2026-07-10 팝인 완화 — 그리드 셀 fade + 리사이클 잔상 방지
          transition={150}
          cachePolicy="memory-disk"
          recyclingKey={rec.posterUrl}
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
            displayProviders(rec.providers).slice(0, 2).map((p) => {
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

      {/* 좌상단 reaction 입력 버튼 — 노란 느낌표(!) 배지 (2026-07-10, 구 '봤어요?'
          텍스트 칩 대체 — amber 글리프로 탭 유도). '시청'(해제)은 텍스트 유지. */}
      {!isReporting && !report && (
        <Pressable
          onPress={() => onStartReport(rec.tmdbId)}
          accessibilityRole="button"
          accessibilityLabel={`${rec.title} 시청 리포트 작성`}
          style={[styles.reportBang, styles.reportBangFloat]}
          hitSlop={8}
        >
          <View style={styles.reportBangTilt}><IconBang size={15} color={colors.accent} /></View>
        </Pressable>
      )}
      {/* 2026-07-10 — 완료 배지: '✓ 시청' 칩 → 느낌표 배지와 동형 원형 ✓.
          탭 = 관리 시트 (리포트 취소 / 아카이브). */}
      {!isReporting && report && (
        <Pressable
          onPress={() => onDoneBadgePress(rec.tmdbId)}
          accessibilityRole="button"
          accessibilityLabel={`${rec.title} 시청 리포트 관리`}
          accessibilityState={{ selected: true }}
          style={[styles.reportBang, styles.reportBangFloat]}
          hitSlop={8}
        >
          <View style={styles.reportBangTilt}>
            <IconCheckPop size={14} color={colors.accent} />
          </View>
        </Pressable>
      )}

      {/* 2026-05-20 — 우상단 아카이브 토글 (PWA SavedList 정합). report 있거나 이미
          archived 일 때만 노출. long-press ActionSheet 와 동시 제공 — 명시적 UI 진입로. */}
      {!isReporting && (report || isArchived) && (
        <Pressable
          onPress={() => onArchiveToggle(rec.tmdbId)}
          accessibilityRole="button"
          accessibilityLabel={
            isArchived ? `${rec.title} 아카이브 해제` : `${rec.title} 아카이브`
          }
          accessibilityState={{ selected: isArchived }}
          style={styles.archiveChip}
          hitSlop={4}
        >
          <IconArchive
            size={14}
            color={isArchived ? colors.accent : colors.textMuted}
          />
        </Pressable>
      )}

      {/* 2026-07-10 — reaction 입력은 하단 시트로 이동 (saved.tsx 리포트 시트). */}
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
  isArchived,
  onPress,
  onLongPress,
  onStartReport,
  onDoneBadgePress,
  onArchiveToggle,
}: {
  item: SavedItem;
  report: WatchReaction | undefined;
  isReporting: boolean;
  isArchived: boolean;
  onPress: (rec: Recommendation) => void;
  onLongPress: (rec: Recommendation) => void;
  onStartReport: (tmdbId: number) => void;
  onDoneBadgePress: (tmdbId: number) => void;
  onArchiveToggle: (tmdbId: number) => void;
}) {
  const rec = item.recommendation;
  const meta: string[] = [];
  if (rec.type === 'movie' && rec.runtime) meta.push(`${rec.runtime}분`);
  // 2026-05-20 — variety(예능) 도 시즌 단위 (TMDB TV 자료구조). series 와 동일 처리.
  if ((rec.type === 'series' || rec.type === 'variety') && rec.seasons) {
    meta.push(`시즌 ${rec.seasons}`);
  }

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
            cachePolicy="memory-disk"
            recyclingKey={rec.posterUrl}
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
          ) : displayProviders(rec.providers).length > 0 ? (
            <Text style={styles.listProviders} numberOfLines={1}>
              {displayProviders(rec.providers).slice(0, 3).map((p) => p.name).join(' · ')}
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
              style={styles.reportBang}
              hitSlop={8}
            >
              <View style={styles.reportBangTilt}><IconBang size={15} color={colors.accent} /></View>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => onDoneBadgePress(rec.tmdbId)}
              accessibilityRole="button"
              accessibilityLabel={`${rec.title} 시청 리포트 관리`}
              accessibilityState={{ selected: true }}
              style={styles.reportBang}
              hitSlop={8}
            >
              <View style={styles.reportBangTilt}>
                <IconCheckPop size={14} color={colors.accent} />
              </View>
            </Pressable>
          )}
        </View>
      )}

      {/* 2026-05-20 — ListCard 우상단 archive 토글 (PWA SavedList 정합). report 있거나
          이미 archived 일 때만 노출. long-press ActionSheet 와 동시 제공. */}
      {!isReporting && (report || isArchived) && (
        <Pressable
          onPress={() => onArchiveToggle(rec.tmdbId)}
          accessibilityRole="button"
          accessibilityLabel={
            isArchived ? `${rec.title} 아카이브 해제` : `${rec.title} 아카이브`
          }
          accessibilityState={{ selected: isArchived }}
          style={styles.listArchiveChip}
          hitSlop={4}
        >
          <IconArchive
            size={14}
            color={isArchived ? colors.accent : colors.textMuted}
          />
        </Pressable>
      )}

      {/* 2026-07-10 — reaction 입력은 하단 시트로 이동 (saved.tsx 리포트 시트). */}
    </Pressable>
  );
}

// 2026-06-06 (P2 history 제거) — HistoryCard 컴포넌트 삭제. 데이터 레이어 보존.

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
  // 2026-05-29 — title (좌) + searchBtn (우) 자연 흐름 + space-between.
  // segmented 는 absolute fill center 로 header 정중앙 고정.
  titleSlot: {
    flexDirection: 'row',
    alignItems: 'baseline',
    minWidth: 0,
  },
  segmentedAbsolute: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
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
  // 2026-07-10 — hold(long-press) active 피드백 (ListCard pressed 정합).
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  // 2026-07-10 — long-press 하단 액션 시트 (SavedFilterSheet 시각 계열).
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlayHeavy,
  },
  menuSheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  menuSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  menuGrabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  menuTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  menuRow: {
    minHeight: 52,
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
  },
  menuRowPressed: {
    backgroundColor: colors.overlayLight,
  },
  menuRowText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  menuRowDanger: {
    color: colors.danger,
  },
  menuCancel: {
    marginTop: spacing.xs,
    alignItems: 'center',
  },
  menuCancelText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  // 2026-07-10 — 시청 리포트 시트 (ReactionOverlay 옵션 팔레트 재사용).
  reportSheetHeadline: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  reportOption: {
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  reportOptionText: {
    fontSize: 15,
    fontWeight: '600',
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
  // 2026-07-10 — 시청 리포트 유도 배지: '봤어요?' 텍스트 칩 → 노란 느낌표(!).
  // overlay 원형 위 amber 글리프 — 포스터 위에서 시선을 끌되 카피 점유 없음.
  // Discover 케밥 정본 계열 (surfaceRaised 진한 원) + amber 글리프 8도 기울임 (pop).
  reportBang: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  reportBangFloat: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
  },
  reportBangTilt: {
    transform: [{ rotate: '8deg' }],
  },
  // 2026-05-20 — 우상단 archive 토글 칩 (PWA SavedList 정합).
  archiveChip: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: colors.overlay,
  },
  // ListCard 우측 archive 칩 — listReportChip 옆 정렬.
  listArchiveChip: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: colors.surface,
    marginRight: spacing.xs,
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
  listReportChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  // #6 — 연·월 모드 in-screen 토글 (캘린더 아이콘 버튼). filterTrigger 와 나란히.
  monthToggle: {
    width: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
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
  // 2026-06-06 (P2 history 제거) — historyScroll / historyGroup / historyGroupLabel
  // / historyRow / historyCard / historyPosterFrame / historyPosterFallback /
  // historySavedBadge / historyTitle / historyResaveBtn / historyResaveText 삭제.
});
