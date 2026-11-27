import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Share,
  Modal,
} from 'react-native';
import { Text } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  runOnJS,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { router, useFocusEffect, usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { subscribedOttToFilterOTTs } from '@neq/core';
import SwipeCard, { SaveSticker } from '../components/SwipeCard';
import SkeletonCard from '../components/SkeletonCard';
import FilterChips, { OTT_OPTIONS } from '../components/FilterChips';
import DiscoverHeader from '../components/DiscoverHeader';
import DetailSheet from '../components/DetailSheet';
import ActionBar, { ACTION_BAR_HEIGHT } from '../components/ActionBar';
import { Button } from '../components/Button';
import { GlassSurface } from '../components/GlassSurface';
import { TAB_BAR_SPACE } from '../lib/tab-bar';
import { IconArchive, IconRefresh, IconMoreVertical } from '../components/Icons';
import OnboardingStepOTT from '../components/onboarding/OnboardingStepOTT';
import { useReducedMotion } from '../hooks/useReducedMotion';
import GestureHint from '../components/GestureHint';
import SearchSheet from '../components/SearchSheet';
import ApertureBreathLoader from '../components/feedback/ApertureBreathLoader';
import { buildSeededMixItems, mergeGenreQueueItems, mixLabelOf } from '../lib/mix-utils';
import { prefetchRelated } from '../lib/data-prefetch';
import { prefetchPosters } from '../lib/image-prefetch';
import {
  consumePendingMixSeed,
  type MixStartSource,
  type MixThemeInfo,
} from '../lib/mix-bridge';
import { env } from '../lib/env';
import {
  fetchRecommendations,
  fetchRecommendationsStreaming,
  prefetchRecommendations,
  consumePrefetchedRecommendations,
  invalidatePrefetchCache,
} from '../lib/api';
import {
  addRecHistory,
  getAccountPrefs,
  getActivePersona,
  getRecHistory,
  getActiveExcludeIds,
  buildFeedbackInputs,
  clearRecHistory,
  getSaved,
  toggleSaved,
  getHiddenKeys,
  addHiddenKey,
  removeHiddenKey,
} from '../lib/store';
import { filterHidden, hiddenKeyOf } from '../lib/hidden-keys';
import {
  classifySwipe,
  lockAxis,
  resolveAxis,
  tabAfterSwipe,
  TAB_EVENT_NAME,
  DOUBLE_TAP_MAX_DELAY,
  TAP_MAX_DISTANCE,
  TAP_MAX_MS,
  type Axis,
} from '../lib/swipe-classify';
import {
  nextHint,
  getHintsDone,
  markHintDone,
  subscribeHintsDone,
  decideSavePrompt,
  getPromptFlags,
  markPromptDone,
  getOnboardingVariant,
  consumeOnce,
  sinceOpen,
  type HintStep,
} from '../lib/onboarding';
import { computeV2Inputs } from '../lib/v2-input-utils';
import { track } from '../lib/analytics';
import { usePersona } from '../contexts/PersonaContext';
import { useToast } from '../contexts/ToastContext';
import type {
  Recommendation,
  RecommendFilter,
  FilterType,
  FilterOrigin,
  FilterYear,
  FilterRating,
  RelatedWork,
  RelatedWorksResponse,
} from '../lib/types';
import { colors, spacing, radius, shadowsNative } from '../lib/tokens';
import { easings, fontsV2 } from '@neq/design';

// ponytail: 8s first-card 타임아웃, cold-start 감안. 잦은 오폴백이면 상향.
// release/Hermes 빌드에서 reader.read() 가 에러 없이 stall 하면 스트림 await 가
// 영영 안 끝나 SkeletonCard 영원 → 첫 카드 미도착 시 스트림 중단 + 비스트리밍 폴백.
const FIRST_CARD_TIMEOUT_MS = 8000;
// 1.1.0 숏폼식 세로 피드 — 판정은 lib/swipe-classify.ts. 넘김 = 위치 SharedValue(pageSV) 보간.
const PAGE_MS = 280;
const PAGE_EASING = Easing.bezier(...easings.enter);
const SNAPBACK_MS = 200;
// 관심 없음 퇴장 — 작아지며(0.6) 어둡게 가라앉기, 220ms ease-in (DESIGN.md Motion).
const HIDE_SINK_MS = 220;
// 마운트 창: 이전 1장 + 현재 + 다음 3장. 빠르게 연속으로 넘겨 React commit 이 2장 늦어도 빈 화면 없음.
const WINDOW_BEFORE = 1;
const WINDOW_AFTER = 3;

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

function toApiFilter(
  type: FilterType,
  origin: FilterOrigin,
  year: FilterYear,
  // rating 은 클라이언트 사이드 필터 (web `apps/web/src/app/discover/page.tsx:141` 정합).
  // 서버 RecommendFilter 미수신 — 받은 카드들을 클라이언트에서 자른다.
  _rating: FilterRating,
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
  // 1.1.0 온보딩 A안 (2026-11-27) — 첫 실행 강제 온보딩 진입 제거. 신규도 바로 이 화면(트렌딩 콜드 스타트).
  // 기존 10단계 화면은 프로필(취향 추가·OTT)과 저장 뒤 제안에서 재사용한다.
  const reducedMotion = useReducedMotion();

  // 페르소나 전환 — Discover 헤더 chip 에서 사용 (web `DiscoverHeader` 정합).
  const persona = usePersona();

  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [state, setState] = useState<LoadState>('idle');
  // 2026-06-22 (게이트 0 first_card_p50 11.9s 대응) — 로딩 origin 분기.
  //   'refresh' = 사용자 새로고침 (handleRefresh) → ApertureBreathLoader 유지.
  //   'default' = 첫 진입 / 필터 변경 → SkeletonCard (빈 화면 대신 카드 윤곽).
  // PWA StatusScreens 의 origin 분기와 정합.
  const [loadOrigin, setLoadOrigin] = useState<'default' | 'refresh'>('default');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [topIdx, setTopIdx] = useState(0);
  // 세로 피드 위치 — UI 스레드 값 (SwipeCard: translateY = (index − pageSV) × feedH + dragY).
  // pageTargetSV = 넘김이 향하는 페이지. 제스처 worklet 이 먼저 옮기고 React topIdx 는 마운트 창만 정한다.
  const pageSV = useSharedValue(0);
  const pageTargetSV = useSharedValue(0);
  const feedH = useSharedValue(0);
  const deckLenSV = useSharedValue(0);
  // 제스처가 요청한 마지막 topIdx — 이 값과 다른 topIdx commit(처음으로·되돌리기·새 로드·큐 전환)은 점프.
  const gestureTopRef = useRef(0);
  const inMixRef = useRef(false);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  // Night Pool 5단계 — "관심 없음" 숨김 키 (movie:1 / tv:1). 덱 파생 단계에서 거른다.
  const [hiddenKeys, setHiddenKeys] = useState<ReadonlySet<string>>(new Set());
  const [saveFlash, setSaveFlash] = useState(false);
  // 더블탭 저장 "찜!" 팝 (0→1→0)
  const stickerP = useSharedValue(0);

  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterOrigin, setFilterOrigin] = useState<FilterOrigin>('all');
  const [filterYear, setFilterYear] = useState<FilterYear>('all');
  const [filterRating, setFilterRating] = useState<FilterRating>('all');
  const [filterOTTs, setFilterOTTs] = useState<Set<string>>(new Set());

  // 2026-06-18 ("내 OTT 만 보기" 토글 — 1.0.3 train).
  // ON 시 prevFilterOTTsRef 에 이전 filterOTTs 보존 → filterOTTs = subscribedOtt 매핑 셋.
  // OFF 시 prevFilterOTTsRef 복원. 토글이 켜진 상태에서 사용자가 OTT dropdown 으로 OTT
  // 변경 시 자동 OFF (override 의 의미 강조 — 명세 §3-1).
  // 본 패턴은 자동 OFF 가드 ref 가 불필요 — handleMyOTTToggle 가 applyFilterChange 를
  // 우회하고 setFilterOTTs + load 를 직접 호출하므로, applyFilterChange 의 OTT 변경
  // 분기는 사용자 직접 변경에만 진입한다.
  // subscribedOtt 는 별도 effect (subscribedOttKey 의존성) 로 비동기 load → 외부에서
  // 바뀌면 토글 자동 OFF + filterOTTs 복원.
  const [myOTTToggle, setMyOTTToggle] = useState(false);
  const [subscribedOtt, setSubscribedOtt] = useState<number[]>([]);
  const prevFilterOTTsRef = useRef<Set<string> | null>(null);

  // 1.1.0 온보딩 A안 — 카드 위 조작 힌트 (한 번에 하나, 해 보면 사라짐). TutorialFlow v3 대체.
  const [hintsDone, setHintsDone] = useState<HintStep[] | null>(null);
  // 이번 세션에서 본 카드 수 (힌트 노출 시점·first_save cards_seen)
  const [cardsSeen, setCardsSeen] = useState(0);
  const [savePrompt, setSavePrompt] = useState<'ott' | 'taste' | null>(null);

  // 배치 G — 첫 카드 힌트 worklet 측 1회 게이트 (0=미발사, 1=발사됨).
  const firstCardHintGate = useSharedValue(0);
  // 2026-07-10 — hold(long-press) 활성화 펄스 (게스처 정의는 아래 longPress).
  const holdSV = useSharedValue(0);
  // 방향 잠금(첫 10px 축, 0=미정) + 관심 없음 가라앉기.
  // sinkCardIdSV: 가라앉는 카드 tmdbId, sinkIdxSV: 그 덱 인덱스(뒤 카드가 한 칸 당겨 깔림).
  const axisSV = useSharedValue<Axis>(0);
  const sinkCardIdSV = useSharedValue<number>(-1);
  const sinkIdxSV = useSharedValue<number>(-1);
  const sinkP = useSharedValue(0);
  // 2026-06-06 (P0 stack 겹침) — 직전 in-flight stream abort 용 controller.
  // load() 진입 시 이전 controller.abort() + 새 controller 발급 → 옛 stream 의
  // onCard 가 새 stack 에 끼어드는 race 차단. PWA `useRecommendations.ts:221, 461-462`
  // 정합. 자세한 메커니즘: `_workspace/02_p0_stack_overlap.md` §2.
  const loadAbortRef = useRef<AbortController | null>(null);

  // 2026-06-06 (P0 incident Fix B-1) — exhausted lock. PWA `useRecommendations.ts:140`
  // 정합. 사용자가 카드 다 swipe 했을 때가 아니라 *진짜 candidate pool 고갈*
  // (triggerPrefetch 의 unique=0 응답) 시점에만 EmptyState 노출.
  // 자세한 배경: `_workspace/06_research-infinite-scroll-2026-06-06.md` §4.1
  const [exhausted, setExhausted] = useState(false);
  const exhaustedRef = useRef(false);
  // 언마운트 시 in-flight stream 정리.
  useEffect(() => {
    return () => {
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
      mixFetchAbortRef.current?.abort();
      mixFetchAbortRef.current = null;
    };
  }, []);

  // 2026-07-08 — Seeded Mix 2차: 덱 주입.
  // 1차(후보 패널) 를 승격 — 믹스 시작 시 카드 덱이 seed 기반 후보로 교체된다.
  // 설계: 기존 recs/topIdx 는 손대지 않고 mixDeck/mixTopIdx 별도 상태로 분리 —
  //   load() abort 파이프라인·prefetch·필터와 격리, 해제 시 원 덱/위치 자동 복원.
  // hydrate 는 lazy — 후보(RelatedWork) 큐에서 top 앞 3장 유지분만 순차 hydrate
  //   (12건 선-hydrate 시 /api/tmdb/hydrate 12연발 + 대부분 미노출 낭비).
  const [mixSeed, setMixSeed] = useState<Recommendation | null>(null);
  // 3차 — 테마 큐 정보 (장르/감독/최근 저장작). null = 작품 큐 (케밥/DetailSheet 진입).
  // 큐 바 라벨 분기 (테마 title vs seed 작품명) + 장르 하이브리드 후보 조회에 사용.
  const [mixTheme, setMixTheme] = useState<MixThemeInfo | null>(null);
  const [mixDeck, setMixDeck] = useState<Recommendation[]>([]);
  const [mixTopIdx, setMixTopIdx] = useState(0);
  // 후보 fetch 완료 플래그 — 소진 판정이 "큐가 아직 안 채워진 초기" 를 소진으로
  // 오인하지 않게 가드.
  const [mixCandidatesLoaded, setMixCandidatesLoaded] = useState(false);
  // hydrate pump 재평가 트리거 — hydrate 1건 완료마다 +1 (ref 는 재렌더를 못 일으킴).
  const [mixPump, setMixPump] = useState(0);
  const mixQueueRef = useRef<RelatedWork[]>([]);
  const mixHydratingRef = useRef(false);
  const mixFetchAbortRef = useRef<AbortController | null>(null);
  // 4차 — 큐 재생성(refresh) 시 원래 진입 source 로 재추적하기 위한 보존.
  const mixSourceRef = useRef<MixStartSource>('native_card_menu');
  const inMix = mixSeed !== null;
  // 카드 케밥(⋮) 인라인 메뉴 — 1차 MIX 칩이 "별점 밑 chip 같다" 는 피드백으로 교체.
  const [cardMenuOpen, setCardMenuOpen] = useState(false);

  // top 전환 시 hold 램프 하드 리셋 (onFinalize 이중 안전망). 일반·큐 덱 공통.
  useEffect(() => {
    holdSV.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topIdx, mixTopIdx]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // 2026-06-11 사용자 피드백 #1 — shared 링크 진입 시 DetailSheet stacking race fix.
  // 진단: share/[id] 자체는 P0-#1 fix (DetailSheet.tsx:413) 로 Modal 우회 풀스크린
  // View. 그러나 Discover tab 의 DetailSheet (RN Modal) 이 tab 위에 떠 있는 채로
  // share tab 진입 → iOS UIKit modal 우선 표시 → 사용자가 기존 DetailSheet 닫아야
  // share 화면 노출 (사용자 인지 "기존 화면이 뜨고 진입 작품은 뒤").
  // 수정: usePathname 으로 share 경로 진입 감지 시 Discover 의 modal sheet 강제
  // close. share 진입 의도는 직접 보기 → 기존 sheet 자동 close 가 자연 UX.
  const pathname = usePathname();
  useEffect(() => {
    if (pathname.startsWith('/share/')) {
      setDetailOpen(false);
      setSearchOpen(false);
    }
  }, [pathname]);
  // 2026-05-20 — SearchSheet 작품 탭 → DetailSheet 진입 시 표시할 Recommendation.
  // currentRec (discover stack 의 현재 카드) 와 별개 상태 — 두 곳 모두에서 DetailSheet
  // 진입 가능. DetailSheet 의 rec 는 `searchSelectedRec ?? currentRec` 우선순위.
  // 닫을 때 searchSelectedRec=null 로 복원.
  const [searchSelectedRec, setSearchSelectedRec] = useState<Recommendation | null>(null);
  // 2026-05-20 (revised) — DetailSheet Cast 진입으로 SearchSheet 가 열린 상태 표시.
  // RN Modal 은 OS native API 라 두 개 동시 z-stack 안 됨 (iOS UIKit 제한). 그래서
  // DetailSheet 닫고 SearchSheet 만 열림 → SearchSheet 닫힐 때 이 flag 보고 DetailSheet
  // 자동 복귀. PWA 의 z-stacking 동작과 인지 동등하지만 native Modal 제약 우회.
  const [returnToDetailAfterSearch, setReturnToDetailAfterSearch] = useState(false);
  // 2026-05-20 — 역방향: SearchSheet 작품 탭 → DetailSheet 진입 흐름에서 DetailSheet
  // 닫을 때 SearchSheet 자동 복귀 + 검색어 유지 (사용자 보고).
  const [returnToSearchAfterDetail, setReturnToSearchAfterDetail] = useState(false);

  // 배치 G — 첫 카드 힌트. web `useSwipeGesture.ts:131-133` 정합:
  //   첫 카드(topIdx===0)에서 우로 일정 거리 드래그하면 "첫 번째 작품이에요" 안내.
  // web 은 별도 firstCardHint state + top 배너지만, native 는 toast 인프라로 통합.
  // 세션당 1회만 — ref 로 중복 발사 차단 (드래그 도중 onUpdate 가 다발 호출).
  const firstCardHintShownRef = useRef(false);
  const toast = useToast();
  // 위임 O #1.2 — DetailSheet Cast 클릭 시 SearchSheet 진입용 initialQuery.
  // 빈 문자열 = 일반 검색 진입 (잔해 제거). 인물 이름 = Cast 클릭 진입.
  const [searchInitialQuery, setSearchInitialQuery] = useState('');
  const [immersive, setImmersive] = useState(false);

  // 2026-11-27 — 헤더 검색 버튼 → 이 화면의 SearchSheet 열기 (프로필은 탭바로, 제임스 요청).
  // initialQuery 는 비워 잔해 제거.
  const openSearch = () => {
    track('search_opened');
    setSearchInitialQuery('');
    setSearchOpen(true);
  };

  const load = useCallback(
    async (
      filter: RecommendFilter = {},
      opts?: { excludeIds?: number[]; silent?: boolean; origin?: 'default' | 'refresh' },
    ) => {
      // 2026-06-06 (P0 stack 겹침) — 새 stream 시작 전 atomic reset.
      // (1) 직전 in-flight stream abort → 옛 onCard 가 새 stack 에 끼어드는 race 차단.
      // (2) recs / topIdx / drag SharedValue 모두 reset → 옛 카드 잔재 0.
      // (3) prefetch cache invalidate → 옛 filter 의 prefetch 결과가 새 stack 뒤에
      //     재유입되는 보조 경로 차단 (`_workspace/02_p0_stack_overlap.md` §3).
      // PWA `useRecommendations.ts:454-462` 정합 패턴.
      //
      // 2026-06-18 (P2 swipe loading fix 옵션 D — B 단 silent 방어 가드).
      // opts.silent=true 시 사용자 인지 단절 (setState('loading') / setRecs([]) / setTopIdx(0))
      // 모두 skip. 백그라운드에서 stack append 만 수행 → 향후 silent reload 시나리오
      // (persona switch, focus refresh 등) 재사용 가능. 현재 A 단 (silent_skip 분기) 자체가
      // load() 호출 안 하므로 본 가드는 방어용.
      loadAbortRef.current?.abort();
      const controller = new AbortController();
      loadAbortRef.current = controller;

      if (!opts?.silent) {
        setRecs([]);
        setTopIdx(0);
        dragX.value = 0;
        dragY.value = 0;
      }
      invalidatePrefetchCache();

      // 2026-06-06 (P0 incident Fix B-1) — 새 load = candidate pool 재시도 가능.
      // PWA `useRecommendations.ts:170` 정합.
      // silent 분기에서도 lock 은 풀어준다 (백그라운드 reload 의도 = pool 재시도).
      exhaustedRef.current = false;
      setExhausted(false);

      if (!opts?.silent) {
        // 2026-06-22 — 로딩 origin 기록. setState('loading') 직전에 갱신해
        // 로딩 분기 (SkeletonCard vs ApertureBreathLoader) 가 origin 을 읽음.
        setLoadOrigin(opts?.origin ?? 'default');
        setState('loading');
      }
      setErrorMsg(null);
      try {
        const [saved, activePersona] = await Promise.all([
          getSaved(),
          getActivePersona(),
        ]);
        // 2026-06-11 (build 24 hotfix) — persona sync miss 차단.
        // 기존: saved 글로벌 bucket 만 사용 → persona 변경이 추천 입력에 미반영.
        // 변경: 활성 persona favorites 우선, 빈 경우 saved 폴백 (default persona 패턴).
        // web `apps/web/src/hooks/useRecommendations.ts:329` (onboardingPicks = getFavorites() = getActivePersona().favorites) 정합.
        const personaFavorites = activePersona?.favorites ?? [];
        const favorites = (
          personaFavorites.length > 0
            ? personaFavorites
            : saved.map((s) => s.recommendation.title)
        ).slice(0, 20);
        // 2026-06-06 (P1 다양성 / P0 incident Fix B-4) — excludeIds 확장 + cooldown.
        // 기존: 호출자가 넘긴 현재 stack tmdbId (보통 10~50개) 만 dedup.
        // 변경: 호출자 excludeIds + recHistory **활성 항목만** (7일 cooldown) + saved 전체 합집합.
        // 효과: 앱 재시작 직후 신규 stack 에도 이전 노출 작품 자동 제외 +
        //       7일 지난 작품은 다시 추천 후보로 복귀 → candidate pool 영구 신선
        //       (TikTok/Instagram 표준 정합 — `_workspace/06_research-infinite-scroll-2026-06-06.md` §4.4).
        // PWA 의 `getSeenTitles + savedTitles` 200건 전송과 동등 효과.
        // route.ts:74 가 300개 캡 처리 — 합쳐도 안전.
        const historyActive = await getActiveExcludeIds({ cooldownDays: 7 });
        // Night Pool 5단계 — 영구 숨김. 서버 PR #55 배포 전엔 무시되고 앱 덱 필터가 거른다.
        const hidden = await getHiddenKeys();
        const baseExcludeIds = opts?.excludeIds ?? [];
        const excludeIds = Array.from(
          new Set<number>([
            ...baseExcludeIds,
            ...historyActive,
            ...saved.map((s) => s.recommendation.tmdbId),
          ]),
        );
        // P0-2 Cold Start V2 입력 — flag ON + 값 있을 때만 body 에 포함.
        const prefs = await getAccountPrefs();
        const v2 = computeV2Inputs({
          // 2026-05-22 — flag 분기 제거 (default ON). ONBOARDING_V2 와 동일 패턴.
          tasteGenresEnabled: true,
          ottWeakSignalEnabled: true,
          tasteGenres: prefs.tasteGenres,
          subscribedOtt: prefs.subscribedOtt,
        });

        // 리포트 반영 — feedback(loved/good/meh/dropped 제목) 은 서버 LLM 힌트,
        // negativeTmdbIds(dropped/meh) 는 취향벡터에서 제외.
        const { feedback, negativeTmdbIds } = await buildFeedbackInputs(saved);
        const negativeSet = new Set<number>(negativeTmdbIds);
        // 저장작 TMDB id — 취향벡터 합산용 (retrieval 만, 최근 50개). "저장할수록
        // 추천이 그쪽으로 이동". 단 dropped/meh 작품은 제외(싫어한 작품이 취향을
        // 끌어당기는 모순 방지). excludeIds(재추천 차단) 와 별개 신호.
        const savedTmdbIds = saved
          .map((s) => s.recommendation.tmdbId)
          .filter((id) => !negativeSet.has(id))
          .slice(0, 50);

        // 2026-05-18 — streaming 적용 (web 정합). 첫 카드 도착 시 'ready' 전환.
        // 미지원 환경 (Hermes fetch.body 미지원) 은 lib/api 가 자동 폴백 → 동일 onCard 시퀀스.
        const collected: Recommendation[] = [];
        let firstSeen = false;
        let streamError: Error | null = null;
        // 첫 카드 타임아웃 — 스트림 전용 controller 로 reader 만 중단.
        // 원 controller 는 상위 load-race 취소 토큰이므로 abort 하지 않는다
        // (abort 하면 아래 fallback fetch 가 controller.signal 로 bail 됨).
        const streamController = new AbortController();
        // controller(상위 load-race 취소) abort 시 스트림 reader 도 함께 중단 — 단방향.
        // (타임아웃은 streamController 만 abort → controller 는 살아 fallback 통과. 반대 방향 X.)
        if (controller.signal.aborted) streamController.abort();
        else controller.signal.addEventListener('abort', () => streamController.abort(), { once: true });
        let streamTimedOut = false;
        let firstCardTimer: ReturnType<typeof setTimeout> | undefined;

        await Promise.race([
          fetchRecommendationsStreaming(
          {
            filter,
            favorites,
            savedCount: saved.length,
            excludeIds,
            hiddenKeys: hidden,
            savedTmdbIds,
            feedback,
            ...v2.body,
          },
          {
            onCard: (rec) => {
              // 타임아웃 발동 후 늦게 도착한 좀비 onCard 는 폐기 (새 stack 오염 방지).
              if (streamTimedOut) return;
              // 2026-06-06 (P0 stack 겹침) — 직전 stream 의 onCard 가 abort 후에도
              // 한두 frame 늦게 도착할 수 있어 ref 일치 가드. controller 가
              // 본 호출의 ref 와 같지 않으면 옛 호출 → 새 stack 에 안 끼임.
              if (loadAbortRef.current !== controller) return;
              collected.push(rec);
              if (!firstSeen) {
                firstSeen = true;
                if (opts?.silent) {
                  // 2026-06-18 (P2 swipe loading fix 옵션 D — silent 분기).
                  // 기존 stack 보존 + 중복 tmdbId 제외 append. topIdx 유지 → 사용자가 보던 위치 유지.
                  setRecs((prev) => {
                    const ids = new Set(prev.map((r) => r.tmdbId));
                    return [...prev, ...collected.filter((r) => !ids.has(r.tmdbId))];
                  });
                } else {
                  setRecs([...collected]);
                  setTopIdx(0);
                  setState('ready');
                }
              } else {
                if (opts?.silent) {
                  // silent 분기: 누적 append (중복 제외).
                  setRecs((prev) => {
                    const ids = new Set(prev.map((r) => r.tmdbId));
                    return [...prev, ...collected.filter((r) => !ids.has(r.tmdbId))];
                  });
                } else {
                  setRecs([...collected]);
                }
              }
            },
            onError: (err) => {
              streamError = err;
            },
          },
          streamController.signal,
        ),
          // 첫 카드가 8s 내에 안 오면 이 브랜치가 먼저 resolve → 스트림 중단 후 폴백.
          // 첫 카드 도착(firstSeen) 시 스트림 promise 가 계속 진행하다 자연 종료하므로
          // 타임아웃 브랜치가 이겨도 아래 firstSeen 가드로 폴백 진입이 차단됨(해피패스 불변).
          new Promise<void>((resolve) => {
            firstCardTimer = setTimeout(() => {
              if (!firstSeen) {
                streamTimedOut = true;
                // reader.read() stall 은 signal 로 즉시 못 깨지만, best-effort 로
                // reader 를 cancel 해 이후 iteration 이 bail 하도록 abort.
                streamController.abort();
              }
              resolve();
            }, FIRST_CARD_TIMEOUT_MS);
          }),
        ]);
        // 타이머 정리 — 스트림이 8s 전에 끝나면(정상/에러) 그쪽이 race 승자가 되고
        // 이 타이머는 pending 이므로 반드시 clear 해 좀비 abort 방지.
        clearTimeout(firstCardTimer);

        // abort 후 도착한 응답은 silent return — 옛 호출이 새 호출 state 를 덮어쓰면 안 됨.
        if (controller.signal.aborted) return;

        if (!firstSeen) {
          // streaming 동안 카드 0건 — error 또는 빈 응답. error 우선, 아니면 non-streaming 폴백.
          if (streamError) throw streamError;
          // 관측 — 타임아웃 폴백 발동 빈도. release/Hermes reader stall 추적용.
          // 새 union 추가 대신 기존 recommendation_failed + reason 컨벤션 재사용(web parity).
          if (streamTimedOut) {
            track('recommendation_failed', {
              reason: 'stream_timeout',
              timeout_ms: FIRST_CARD_TIMEOUT_MS,
              silent: !!opts?.silent,
              origin: opts?.origin ?? 'default',
            });
          }
          // 폴백 fetch 는 원 controller.signal 로 실행 — streamController(abort됨) 와 분리돼 정상 진행.
          const data = await fetchRecommendations({
            filter,
            favorites,
            savedCount: saved.length,
            excludeIds,
            hiddenKeys: hidden,
            savedTmdbIds,
            feedback,
            ...v2.body,
          }, controller.signal);
          if (controller.signal.aborted) return;
          if (opts?.silent) {
            // 2026-06-18 (P2 swipe loading fix 옵션 D — silent 폴백 분기).
            // 기존 stack 보존 + 중복 tmdbId 제외 append. topIdx 유지.
            setRecs((prev) => {
              const ids = new Set(prev.map((r) => r.tmdbId));
              return [...prev, ...data.filter((r) => !ids.has(r.tmdbId))];
            });
          } else {
            setRecs(data);
            setTopIdx(0);
            setState('ready');
          }
          // 2026-06-06 (P0 incident Fix B-1) — 폴백도 빈 응답이면 진짜 풀 고갈 확정.
          // lock set → EmptyState (filter X 분기 = "추천 기록 초기화" CTA 노출).
          // silent 분기에서는 사용자 UX 영향 없이 lock 만 set (다음 사용자 swipe → cardsToShow=0 시점에 노출).
          if (data.length === 0) {
            exhaustedRef.current = true;
            setExhausted(true);
            track('recommendation_load_more', {
              exhausted: true,
              history_count: historyActive.length,
              saved_count: saved.length,
            });
          }
          // 배치 H — 추천 기록 누적 (web `useRecommendations.ts:413` 정합).
          // non-streaming 폴백 분기 — 배치 전체를 기록.
          void addRecHistory(
            data.map((r) => ({
              title: r.title,
              tmdbId: r.tmdbId,
              posterUrl: r.posterUrl,
              type: r.type,
            })),
          );
        } else {
          // 배치 H — 추천 기록 누적 (web `useRecommendations.ts:271/413` 정합).
          // streaming 분기 — 배치 전체(collected)가 완성된 직후 1회 기록.
          // web 도 streamed/non-streamed 모두 collected 완성 후 addRecHistory 호출.
          void addRecHistory(
            collected.map((r) => ({
              title: r.title,
              tmdbId: r.tmdbId,
              posterUrl: r.posterUrl,
              type: r.type,
            })),
          );
        }
      } catch (e) {
        // abort 시 silent — 직전 호출이 새 호출로 교체되었을 뿐, 에러 UI 노출 X.
        if (controller.signal.aborted) return;
        if (e instanceof Error && (e.name === 'AbortError' || /aborted/i.test(e.message))) {
          return;
        }
        setErrorMsg(e instanceof Error ? e.message : '알 수 없는 오류');
        setState('error');
      }
    },
    // dragX / dragY 는 SharedValue ref 이므로 stable. 의존성 0 유지.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /**
   * #17 추천 prefetch — 다음 배치를 백그라운드로 미리 받아 module-level 캐시에 저장.
   *
   * web `useRecommendations.prefetchNextBatch` 패턴을 단순 함수로 포팅:
   *   - 같은 filter+favorites+savedCount 조합이면 1회만 호출
   *   - 사용자 노출 0 — recommendation_loaded 가 아니라 recommendation_load_more 발사
   *   - 호출자는 await 안 해도 됨
   */
  const triggerPrefetch = useCallback(
    async (filter: RecommendFilter) => {
      try {
        const [saved, activePersona] = await Promise.all([
          getSaved(),
          getActivePersona(),
        ]);
        // 2026-06-11 (build 24 hotfix) — load() 와 동일한 persona-aware favorites 입력.
        const personaFavorites = activePersona?.favorites ?? [];
        const favorites = (
          personaFavorites.length > 0
            ? personaFavorites
            : saved.map((s) => s.recommendation.title)
        ).slice(0, 20);
        const prefs = await getAccountPrefs();
        const v2 = computeV2Inputs({
          tasteGenresEnabled: true,
          ottWeakSignalEnabled: true,
          tasteGenres: prefs.tasteGenres,
          subscribedOtt: prefs.subscribedOtt,
        });

        // 리포트 반영 (load() 와 동일, prefetch 정합).
        const { feedback, negativeTmdbIds } = await buildFeedbackInputs(saved);
        const negativeSet = new Set<number>(negativeTmdbIds);
        // 저장작 TMDB id — 취향벡터 합산용. dropped/meh 제외 (load() 와 동일).
        const savedTmdbIds = saved
          .map((s) => s.recommendation.tmdbId)
          .filter((id) => !negativeSet.has(id))
          .slice(0, 50);

        // 2026-06-06 (Tier 3 단기 incident 해소) — Progressive fallback.
        // 사용자 명시 "무한 스크롤" 의도 → cooldown 7→3→1→0 일 순으로 재시도.
        // 모든 tier 에서 unique=0 면 server LLM 다양성 자체 문제 → 자동 hard refresh
        // (clearRecHistory + load).
        // exhausted lock 페기 — EmptyState UI 자체 페기와 정합.
        // Tier 3 Phase A (server LLM 다양성) 완료 후 본 fallback 단순화 가능.
        const hidden = await getHiddenKeys();
        const cooldownTiers: number[] = [7, 3, 1, 0];
        let appendedAny = false;

        for (const cooldownDays of cooldownTiers) {
          const historyActive =
            cooldownDays > 0
              ? await getActiveExcludeIds({ cooldownDays })
              : [];
          const excludeIds = Array.from(
            new Set<number>([
              ...recs.map((r) => r.tmdbId),
              ...historyActive,
              ...saved.map((s) => s.recommendation.tmdbId),
            ]),
          );

          await prefetchRecommendations({
            filter,
            favorites,
            savedCount: saved.length,
            excludeIds,
            hiddenKeys: hidden,
            savedTmdbIds,
            feedback,
            ...v2.body,
          });
          const cached = consumePrefetchedRecommendations(
            filter,
            favorites,
            saved.length,
          );
          if (!cached || cached.length === 0) continue;

          const existingIds = new Set(recs.map((r) => r.tmdbId));
          const unique = cached.filter((r) => !existingIds.has(r.tmdbId));
          if (unique.length === 0) continue;

          setRecs((prev) => {
            const existing = new Set(prev.map((r) => r.tmdbId));
            const newUnique = cached.filter(
              (r) => !existing.has(r.tmdbId),
            );
            if (newUnique.length === 0) return prev;
            return [...prev, ...newUnique];
          });
          track('recommendation_load_more', {
            cooldown_used: cooldownDays,
            unique_count: unique.length,
          });
          appendedAny = true;
          break;
        }

        if (!appendedAny) {
          // 2026-06-18 (P2 swipe loading fix 옵션 D — `_workspace/12_p2-swipe-loading-deepdive-2026-06-18.md`)
          // 기존: clearRecHistory + load() → setState('loading') → 사용자에게 "수 초 후 loading 노출"
          //       PostHog deepdive 75/225 = 33.3% 비중 확인 (auto_hard_refresh)
          // 현재: silent return. cardsToShow=0 시점에 fallback loader (b231c4a) 가 자연 노출
          // Tier 3 Phase A~D (server LLM 다양성 본질 해결) 완료 후 본 분기 완전 폐기 가능
          track('recommendation_load_more', {
            cooldown_used: -1,
            unique_count: 0,
            silent_skip: true,
          });
        }
      } catch {
        // 백그라운드는 silent — 사용자 UX 영향 없음
      }
    },
    [recs, load],
  );

  useEffect(() => {
    load();
  }, [load]);

  // 2026-06-11 (build 24 hotfix) — persona switch / create 후 자동 reload.
  // 사용자 보고: Profile 에서 새 취향 생성 후 Discover 진입 시 추천이 새 취향으로 재계산 X.
  // 원인: 위 mount useEffect 는 1회만 실행, useFocusEffect 는 saved 만 refresh.
  // → activePersonaId 변화 감지 useEffect 로 명시적 reload 트리거.
  // sentinel ref 첫 값 null = mount 초기화 (mount useEffect 가 처리), 그 후 변경만 감지.
  const prevActivePersonaIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevActivePersonaIdRef.current === null) {
      prevActivePersonaIdRef.current = persona.activePersonaId;
      return;
    }
    if (persona.activePersonaId !== prevActivePersonaIdRef.current) {
      prevActivePersonaIdRef.current = persona.activePersonaId;
      load();
    }
  }, [persona.activePersonaId, load]);

  // 조작 힌트 완료 목록 + 온보딩 변형. 큐·저장 탭의 좌우 스와이프 완료도 구독으로 받는다.
  useEffect(() => {
    void getHintsDone().then(setHintsDone);
    return subscribeHintsDone(setHintsDone);
  }, []);

  // #17 prefetch 트리거 — 남은 카드 5장 이하 시 다음 배치 백그라운드 로드.
  // 2026-06-06 (Tier 3 단기 incident 해소) — exhausted lock 가드 페기.
  // triggerPrefetch 의 progressive fallback (cooldown 7→3→1→0) + 자동 hard refresh
  // 가 무한 스크롤 보장. 사용자 명시 "EmptyState 화면 자체가 없어야".
  useEffect(() => {
    if (state !== 'ready' || recs.length === 0) return;
    const remaining = recs.length - topIdx;
    if (remaining > 5) return;
    if (topIdx === 0) return; // 첫 로드 직후 즉시 prefetch 방지
    const filter = toApiFilter(filterType, filterOrigin, filterYear, filterRating, filterOTTs);
    void triggerPrefetch(filter);
  }, [
    topIdx,
    state,
    recs.length,
    filterType,
    filterOrigin,
    filterYear,
    filterRating,
    filterOTTs,
    triggerPrefetch,
  ]);

  function applyFilterChange(nextState: {
    type?: FilterType;
    origin?: FilterOrigin;
    year?: FilterYear;
    rating?: FilterRating;
    otts?: Set<string>;
  }) {
    const nextType = nextState.type ?? filterType;
    const nextOrigin = nextState.origin ?? filterOrigin;
    const nextYear = nextState.year ?? filterYear;
    const nextRating = nextState.rating ?? filterRating;
    const nextOtts = nextState.otts ?? filterOTTs;

    if (nextState.type !== undefined) setFilterType(nextType);
    if (nextState.origin !== undefined) setFilterOrigin(nextOrigin);
    if (nextState.year !== undefined) setFilterYear(nextYear);
    if (nextState.rating !== undefined) setFilterRating(nextRating);
    if (nextState.otts !== undefined) setFilterOTTs(nextOtts);

    // 2026-06-18 ("내 OTT 만 보기" 토글 — 1.0.3 train).
    // 사용자가 OTT dropdown 으로 OTT 변경 시 토글 자동 OFF (override 의미 강조 — 명세 §3-1).
    // handleMyOTTToggle 는 본 함수를 우회하므로 본 분기는 사용자 직접 변경에만 진입한다.
    if (nextState.otts !== undefined && myOTTToggle) {
      prevFilterOTTsRef.current = null;
      setMyOTTToggle(false);
    }

    load(toApiFilter(nextType, nextOrigin, nextYear, nextRating, nextOtts), {
      excludeIds: recs.map((r) => r.tmdbId),
    });
  }

  /**
   * 2026-06-18 ("내 OTT 만 보기" 토글 — 1.0.3 train).
   *
   * ON: prevFilterOTTsRef = filterOTTs (보존) → filterOTTs = subscribedOttToFilterOTTs(subscribedOtt)
   * OFF: filterOTTs = prevFilterOTTsRef ?? Set() (복원) → prevFilterOTTsRef = null
   *
   * 새 filterOTTs 로 즉시 서버 재조회 (filter 셋 변경 = candidate pool 변동).
   * applyFilterChange 우회 — applyFilterChange 의 자동 OFF 분기 (`if (myOTTToggle)`) 가
   * 본 호출을 사용자 직접 변경으로 오인해 즉시 OFF 처리하면 무한 토글 회귀.
   */
  const handleMyOTTToggle = useCallback(
    (next: boolean) => {
      let nextOtts: Set<string>;
      if (next) {
        prevFilterOTTsRef.current = filterOTTs;
        nextOtts = subscribedOttToFilterOTTs(subscribedOtt);
      } else {
        nextOtts = prevFilterOTTsRef.current ?? new Set<string>();
        prevFilterOTTsRef.current = null;
      }
      // applyFilterChange 우회 — applyFilterChange 의 자동 OFF 분기 (`if (myOTTToggle)`)
      // 가 본 호출을 사용자 직접 변경으로 오인해 즉시 OFF 처리하면 무한 토글 회귀.
      setFilterOTTs(nextOtts);
      setMyOTTToggle(next);
      load(
        toApiFilter(filterType, filterOrigin, filterYear, filterRating, nextOtts),
        { excludeIds: recs.map((r) => r.tmdbId) },
      );
      track('filter_changed', {
        kind: 'my_ott_toggle',
        value: next ? 'on' : 'off',
        subscribed_ott_count: subscribedOtt.length,
      });
    },
    [filterOTTs, subscribedOtt, filterType, filterOrigin, filterYear, filterRating, recs, load],
  );

  const handleMyOTTSetupNavigate = useCallback(() => {
    // disabled 상태에서 사용자가 chip tap → Alert 안의 "설정하기" 콜백.
    // Profile 의 SubscribedOttSection 으로 진입. Profile 내부에서 자동 scroll-to 는 별도 트랙.
    // 신규 PostHog 이벤트 없이 `filter_changed` 의 kind 분기로 통합 — web/native NekoEvent 동기화 비용 회피.
    track('filter_changed', { kind: 'my_ott_setup_cta', value: 'tap' });
    router.push('/profile');
  }, []);

  useFocusEffect(
    useCallback(() => {
      getSaved().then((items) => {
        setSavedIds(new Set(items.map((s) => s.recommendation.tmdbId)));
      });
      // 첫 진입 + 프로필 '모든 데이터 초기화' 후 복귀 시 숨김 목록 동기화.
      getHiddenKeys().then((keys) => setHiddenKeys(new Set(keys)));
      // 2026-06-18 ("내 OTT 만 보기" 토글 — 1.0.3 train).
      // Profile 에서 subscribedOtt 변경 후 Discover 복귀 시 재로드 → 토글 가용성 동기화.
      // 본 effect 안에서 직접 myOTTToggle 자동 OFF 까지 처리하지 않는다 — 별도 useEffect
      // (subscribedOtt deps) 에서 토글 ON 상태 + subscribedOtt 변경 감지 시 OFF + filterOTTs 복원.
      getAccountPrefs().then((prefs) => {
        setSubscribedOtt(prefs.subscribedOtt);
      });
    }, []),
  );

  // 2026-06-18 ("내 OTT 만 보기" 토글 — 1.0.3 train).
  // subscribedOtt 외부 변경 (Profile 에서 변경) 동기화. 토글 ON 상태에서 subscribedOtt 가
  // 바뀌면 자동 OFF + filterOTTs 복원 (명세 §3-1).
  // mount 초기 sentinel ref — 첫 평가 (prev null) 는 skip. 그 후 변경만 감지.
  const prevSubscribedOttKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = subscribedOtt.slice().sort().join(',');
    if (prevSubscribedOttKeyRef.current === null) {
      prevSubscribedOttKeyRef.current = key;
      return;
    }
    if (prevSubscribedOttKeyRef.current === key) return;
    prevSubscribedOttKeyRef.current = key;
    // 변경 감지 — 토글 ON 이면 자동 OFF + filterOTTs 복원.
    if (myOTTToggle) {
      const restored = prevFilterOTTsRef.current ?? new Set<string>();
      prevFilterOTTsRef.current = null;
      setFilterOTTs(restored);
      setMyOTTToggle(false);
      // 새 filterOTTs 로 재조회 (filter 셋 변동).
      load(toApiFilter(filterType, filterOrigin, filterYear, filterRating, restored), {
        excludeIds: recs.map((r) => r.tmdbId),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribedOtt]);

  // rating 클라이언트 사이드 필터 — web `apps/web/src/app/discover/page.tsx:141` 정합.
  // recs 자체는 그대로 두고 표시/swipe 단계에서만 자른다 (서버 재호출 X).
  // Night Pool 5단계 — 숨김 필터(X2)도 여기 한 곳. 서버(PR #55)를 거치지 않는 인기작 대체·
  // 이미 받아 둔 카드까지 거른다. 현재 카드를 숨기면 같은 topIdx 에 다음 카드가 와 자연히 넘어간다.
  const ratedRecs = filterRating === 'all'
    ? recs
    : recs.filter((r) => r.rating >= parseFloat(filterRating));
  const filteredRecs = filterHidden(ratedRecs, hiddenKeys);
  // 2026-07-08 Seeded Mix 2차 — mix 모드 시 덱 스왑. currentRec/prevRec/cardsToShow
  // 가 전부 이 파생값을 따르므로 제스처/DetailSheet/save 등 기존 인터랙션이 mix 덱
  // 에서도 동일 동작. rating 클라이언트 필터는 일반 덱 전용 (mix 는 후보 12 이하).
  const activeDeck = inMix ? filterHidden(mixDeck, hiddenKeys) : filteredRecs;
  const activeTopIdx = inMix ? mixTopIdx : topIdx;
  const currentRec = activeDeck[activeTopIdx];

  // 제스처 worklet 이 쓰는 덱 길이 (다음 작품 유무). 끝 +1 까지 넘기면 "더 가져오는 중" 로더.
  useEffect(() => {
    deckLenSV.value = activeDeck.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDeck.length]);

  // 제스처가 아닌 topIdx 변경(처음으로·되돌리기·새 로드·큐 시작/해제) → 위치를 바로 그 페이지로.
  // 제스처 넘김은 worklet 이 pageSV 를 먼저 옮겨 두므로 건드리지 않는다 (빠른 연속 넘김 중 commit 이 늦어도 안 튐).
  useLayoutEffect(() => {
    if (activeTopIdx === gestureTopRef.current && inMixRef.current === inMix) return;
    inMixRef.current = inMix;
    gestureTopRef.current = activeTopIdx;
    cancelAnimation(pageSV);
    pageSV.value = activeTopIdx;
    pageTargetSV.value = activeTopIdx;
    dragY.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopIdx, inMix]);

  /**
   * 사이클 2 통일 매핑 (web `vibrate(...)` 와 인지 강도 정합):
   *   - light  : 다음/이전 넘김, 탭 — web vibrate('light')=8ms
   *   - medium : 저장 취소 — web vibrate('medium')=14ms
   *   저장 확정은 success 1회 (DESIGN.md 햅틱).
   */
  function hapticLight() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
  function hapticMedium() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }

  /** 위·아래 넘김 commit (worklet 이 pageSV 를 이미 target 으로 보간 중). */
  function onFeedNav(target: number, action: 'next' | 'prev') {
    gestureTopRef.current = target;
    if (inMix) setMixTopIdx(target);
    else setTopIdx(target);
    hapticLight();
    const rec = activeDeck[activeTopIdx];
    if (rec) {
      // 협의체 정의: direction 물리 방향 그대로 — 'up'=다음, 'down'=이전 (1.0.x down=저장과 뜻이 다름, gesture_scheme 으로 구분)
      track('card_swiped', { direction: action === 'next' ? 'up' : 'down', tmdb_id: rec.tmdbId, title: rec.title });
    }
    if (action === 'next') completeHint('swipe_up_next');
  }

  /** 좌우 스와이프 = 탭 이동 (발견 ↔ 큐 ↔ 저장). 발견에서 오른쪽(이전 탭)은 없음. */
  function onTabSwipe(action: 'tab_next' | 'tab_prev') {
    const to = tabAfterSwipe('index', action);
    if (!to) return;
    hapticLight();
    track('tab_swiped', { from: TAB_EVENT_NAME.index, to: TAB_EVENT_NAME[to] });
    completeHint('swipe_tab');
    router.navigate(to === 'mix' ? '/mix' : '/saved');
  }

  // ── 조작 힌트 (온보딩 A안) ──
  const activeHint: HintStep | null =
    hintsDone && (state === 'ready' || inMix) && currentRec && !detailOpen && !searchOpen && !cardMenuOpen && !savePrompt
      ? nextHint(hintsDone, cardsSeen)
      : null;
  const shownHintRef = useRef<HintStep | null>(null);
  useEffect(() => {
    if (!activeHint || shownHintRef.current === activeHint) return;
    shownHintRef.current = activeHint;
    track('tutorial_step_shown', { step: activeHint, cards_seen: cardsSeen });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHint]);

  /** 해 봤으면 완료 — 보여 주던 힌트면 tutorial_completed, 미리 해 본 건 조용히 완료. */
  function completeHint(step: HintStep) {
    const wasShown = shownHintRef.current === step;
    void markHintDone(step).then((first) => {
      if (first && wasShown) track('tutorial_completed', { step, cards_seen: cardsSeenRef.current });
    });
  }
  function skipHint(step: HintStep) {
    void markHintDone(step).then((first) => {
      if (first) track('tutorial_skipped', { step, cards_seen: cardsSeenRef.current });
    });
  }
  const cardsSeenRef = useRef(0);
  cardsSeenRef.current = cardsSeen;

  /**
   * 저장 (더블탭·버튼 공통). 저장해도 카드는 제자리 — 넘어가지 않는다 (제임스 확정).
   * "찜!" 팝 + 저장 버튼 번쩍 + success 햅틱 1회. card_saved 는 저장 성공 뒤 (5단계 순서 유지).
   */
  async function saveCurrent(method: 'double_tap' | 'button') {
    const rec = currentRec;
    if (!rec || savedIds.has(rec.tmdbId)) return;
    let nowSaved: boolean;
    try {
      nowSaved = await toggleSaved(rec);
    } catch {
      // save_failed 는 toggleSaved 가 발사. 카드 제자리 + 알림.
      toast.show('error', { ctx: { message: '저장하지 못했어요' } });
      return;
    }
    if (!nowSaved) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // 이름·기존 속성 유지(주지표 연속성) + method 추가. source 값은 1.0.x swipe_down 대신 double_tap.
    track('card_saved', { tmdb_id: rec.tmdbId, title: rec.title, source: method, method });
    setSavedIds((prev) => new Set(prev).add(rec.tmdbId));
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 600);
    stickerP.value = reducedMotion
      ? withSequence(withTiming(1, { duration: 0 }), withTiming(1, { duration: 600 }), withTiming(0, { duration: 0 }))
      : withSequence(
          withTiming(1, { duration: 160, easing: Easing.bezier(...easings.enter) }),
          withTiming(1, { duration: 420 }),
          withTiming(0, { duration: 200 }),
        );
    if (method === 'double_tap') completeHint('double_tap_save');
    void afterSave(method);
  }

  /** 첫 저장 계측 + 저장 뒤 제안 (A안 신규만). */
  async function afterSave(method: 'double_tap' | 'button' | 'detail') {
    const variant = await getOnboardingVariant();
    if (variant !== 'A') return;
    if (await consumeOnce('first_save')) {
      track('first_save', { ms_since_open: sinceOpen().ms_since_open, cards_seen: cardsSeenRef.current, method });
    }
    const [saved, flags, prefs] = await Promise.all([getSaved(), getPromptFlags(), getAccountPrefs()]);
    const prompt = decideSavePrompt({
      isVariantA: true,
      savesCount: saved.length,
      ...flags,
      hasOtt: prefs.subscribedOtt.length > 0,
    });
    if (!prompt) return;
    // 저장 팝이 끝난 뒤에 띄운다
    setTimeout(() => {
      setSavePrompt(prompt);
      track(prompt === 'ott' ? 'ott_prompt_shown' : 'taste_prompt_shown', { saves_count: saved.length });
    }, 700);
  }

  function closeSavePrompt(kind: 'ott' | 'taste', outcome: 'completed' | 'dismissed' | 'accepted', extra?: { providers_count?: number }) {
    void markPromptDone(kind);
    setSavePrompt(null);
    void getSaved().then((saved) => {
      const event =
        kind === 'ott'
          ? outcome === 'completed' ? 'ott_prompt_completed' : 'ott_prompt_dismissed'
          : outcome === 'accepted' ? 'taste_prompt_accepted' : 'taste_prompt_dismissed';
      track(event, { saves_count: saved.length, ...extra });
    });
  }

  /** 저장 버튼 = 저장/저장 취소 토글 (기존). */
  async function toggleLike() {
    const rec = currentRec;
    if (!rec) return;
    if (!savedIds.has(rec.tmdbId)) {
      void saveCurrent('button');
      return;
    }
    hapticMedium();
    const nowSaved = await toggleSaved(rec);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (nowSaved) next.add(rec.tmdbId);
      else next.delete(rec.tmdbId);
      return next;
    });
    track('card_unsaved', { tmdb_id: rec.tmdbId });
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

  // 2026-06-06 (Tier 3 단기 incident 해소) — 새로고침 = 항상 hard refresh.
  // 사용자 명시: "새로고침 시 다른 목록" — soft 는 같은 cooldown 적용이라 비슷한
  // batch 표출 → soft 모드 제거, 새로고침 = recHistory clear + 새 candidate.
  // Tier 3 Phase A (server LLM 다양성) 완료 후 soft 재도입 가능.
  async function handleRefresh() {
    await clearRecHistory();
    const filter = toApiFilter(filterType, filterOrigin, filterYear, filterRating, filterOTTs);
    track('recommendation_refresh', { mode: 'hard' });
    // 2026-06-22 — 새로고침은 origin='refresh' → ApertureBreathLoader 유지.
    load(filter, { excludeIds: recs.map((r) => r.tmdbId), origin: 'refresh' });
  }

  // handleHardRefresh 별도 유지 — 향후 EmptyState 부활 시 또는 Profile CTA 진입점.
  // 현재는 handleRefresh 와 동일 동작이지만 추적 분기용 mode=hard_explicit.
  async function handleHardRefresh() {
    await clearRecHistory();
    const filter = toApiFilter(filterType, filterOrigin, filterYear, filterRating, filterOTTs);
    track('recommendation_refresh', { mode: 'hard_explicit' });
    // 2026-06-22 — 명시적 새로고침도 origin='refresh' → ApertureBreathLoader.
    load(filter, { excludeIds: recs.map((r) => r.tmdbId), origin: 'refresh' });
  }

  // Stage 4 D1 / G1-A (Handoff v2 Phase B+C): 탭 = DetailSheet 단일 진입.
  // 8px / 300ms 미만 = 탭 → DetailSheet. ↑ 스와이프 진입은 제거됨.
  // 탭 source 는 PostHog 매핑 일관 — "card_tap".
  function handleCardTap() {
    if (currentRec) {
      track('detail_opened', {
        tmdb_id: currentRec.tmdbId,
        title: currentRec.title,
        providers_count: currentRec.providers.length,
        source: 'card_tap',
      });
    }
    // 2026-07-10 — hold 램프 즉시 리셋. 탭 인식 시점에 램프가 진행 중이고 Modal
    // 오픈이 UI thread 의 in-flight withTiming(리셋) 을 중단시키는 케이스에서 축소
    // 잔존 (onFinalize 리셋만으로 불충분 — 시뮬 재보고). Modal 열기 전 하드 0.
    holdSV.value = 0;
    setDetailOpen(true);
  }

  // 한 번 탭 = 상세. 더블탭 실패를 기다리므로 최대 DOUBLE_TAP_MAX_DELAY 늦게 열린다 (영향 분석 §1 대가).
  const tap = Gesture.Tap()
    .maxDuration(TAP_MAX_MS)
    .maxDistance(TAP_MAX_DISTANCE)
    .onStart(() => {
      runOnJS(handleCardTap)();
    });

  /** 더블탭 = 저장만. 이미 저장이면 무시 (저장 취소는 버튼). */
  function handleDoubleTap() {
    holdSV.value = 0;
    void saveCurrent('double_tap');
  }
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(DOUBLE_TAP_MAX_DELAY)
    .maxDistance(TAP_MAX_DISTANCE)
    .onStart(() => {
      runOnJS(handleDoubleTap)();
    });

  // 2026-07-10 — hold(long-press) = 케밥 메뉴 열기. holdSV 는 활성화 순간 펄스
  // (SwipeCard worklet 소비 — 선언은 상단 SharedValue 클러스터).
  // 1.1.0 — 길게 누르기 메뉴 = "관심 없음" (+ 일반 덱이면 "큐 시작"). 큐 중에도 연다 (숨김은 큐 덱에도 걸림).
  function handleHoldMenuOpen() {
    handleCardMenuPress('long_press');
  }

  // 2026-07-10 v2 — active 효과 단순화 (사용자 결정). 사전 램프(onBegin 시작)는
  // 모든 터치에서 시작돼 tap→Modal / 슬로우 스와이프 등에서 in-flight 애니메이션
  // 중단 → 축소 잔존이 반복 재발. 활성화 순간의 단발 펄스(눌림→복귀, 자기 종결형)
  // 로 교체 — 지속 상태가 없어 잔존 자체가 구조적으로 불가.
  const longPress = Gesture.LongPress()
    .minDuration(450)
    .maxDistance(12)
    .onStart(() => {
      'worklet';
      holdSV.value = withSequence(
        withTiming(1, { duration: 110 }),
        withTiming(0, { duration: 190 }),
      );
      runOnJS(handleHoldMenuOpen)();
    });

  // 2026-07-08 — Seeded Mix 2차: 케밥 메뉴 → 믹스 시작 (덱 주입).
  // 케밥/메뉴는 GestureDetector 바깥 absolute overlay (1차 검증 구조) — tap 제스처
  // 선점/DetailSheet 오픈과 원천 분리.
  // 메뉴를 연 경로 — not_interested source (협의체 정의 'long_press', 케밥 버튼은 'kebab_menu')
  const menuViaRef = useRef<'long_press' | 'kebab_menu'>('kebab_menu');
  function handleCardMenuPress(via: 'long_press' | 'kebab_menu' = 'kebab_menu') {
    if (!currentRec) return;
    menuViaRef.current = via;
    hapticLight();
    setCardMenuOpen(true);
  }

  function handleMixStart(
    seed: Recommendation,
    source: MixStartSource,
    theme?: MixThemeInfo,
    // 4차 — refresh: 큐 진행 중 하단 refresh 버튼 = 같은 seed/테마로 큐 재생성.
    // recHistory 활성 + saved 제외를 related 경로에도 적용해 "이미 본 카드" 를 걷어냄.
    opts?: { refresh?: boolean },
  ) {
    setCardMenuOpen(false);
    // 3차 — 테마 큐 payload 확장 (theme_kind + 장르 큐의 genre_id).
    // 작품 큐 (케밥/DetailSheet) 는 기존 payload 그대로.
    track('mix_started', {
      tmdb_id: seed.tmdbId,
      title: seed.title,
      source,
      ...(theme && {
        theme_kind: theme.kind,
        ...(theme.genreId != null && { genre_id: theme.genreId }),
      }),
      ...(opts?.refresh && { refresh: true }),
    });
    mixSourceRef.current = source;
    hapticLight();
    mixFetchAbortRef.current?.abort();
    const controller = new AbortController();
    mixFetchAbortRef.current = controller;

    // mix 상태 초기화 + 진행 중 제스처/타이머 잔재 정리 (덱 스왑 시 시각 잔재 방지).
    // 원 덱 (recs/topIdx) 은 건드리지 않음 — 해제 시 자동 복원.
    setMixSeed(seed);
    setMixTheme(theme ?? null);
    setMixDeck([]);
    setMixTopIdx(0);
    setMixCandidatesLoaded(false);
    mixQueueRef.current = [];
    mixHydratingRef.current = false;
    cancelAnimation(dragX);
    cancelAnimation(dragY);
    dragX.value = 0;
    dragY.value = 0;

    // DetailSheet 의 related fetch 패턴 재사용 — variety 는 TMDB TV(series) 매핑.
    const type = seed.type === 'movie' ? 'movie' : 'series';
    const relatedPromise: Promise<RelatedWork[]> = fetch(
      `${env.API_BASE_URL}/api/tmdb/related?work_id=${seed.tmdbId}&type=${type}`,
      { signal: controller.signal },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data: RelatedWorksResponse | null) => (data ? buildSeededMixItems(seed, data) : []))
      .catch(() => []);

    // 3차 — 장르 큐 하이브리드: mirror 대표작(genre-top) + seed related 를
    // 2:1 교차 병합. mirror fetch 실패 시 mergeGenreQueueItems 가 자연히
    // related-only 로 동작 (Discover 흐름 무손상 fallback).
    const isGenreQueue = theme?.kind === 'genre' && theme.genreId != null;
    const finalize = (items: RelatedWork[]) => {
      if (controller.signal.aborted) return;
      mixQueueRef.current = items;
      setMixCandidatesLoaded(true);
      setMixPump((p) => p + 1);
    };
    // 제외 셋 — saved + recHistory 활성(7일) + seed 자신. 장르 큐(항상) 와
    // 큐 재생성(refresh) 경로에서 사용. recHistory 활성 id 는 mediaType 미보유 →
    // movie/tv 양쪽 키로 제외 (id 충돌 시 과잉 제외 가능하지만 희귀 — 재노출 방지 우선).
    const needExclude = isGenreQueue || !!opts?.refresh;
    const excludePromise: Promise<Set<string>> = needExclude
      ? Promise.all([getSaved(), getActiveExcludeIds({ cooldownDays: 7 })])
          .then(([saved, hist]) => {
            const ex = new Set<string>();
            for (const s of saved) {
              const mt = s.recommendation.type === 'movie' ? 'movie' : 'tv';
              ex.add(`${mt}:${s.recommendation.tmdbId}`);
            }
            for (const id of hist) {
              ex.add(`movie:${id}`);
              ex.add(`tv:${id}`);
            }
            ex.add(`${seed.type === 'movie' ? 'movie' : 'tv'}:${seed.tmdbId}`);
            return ex;
          })
          .catch(() => new Set<string>())
      : Promise.resolve(new Set<string>());
    if (isGenreQueue) {
      const mirrorPromise: Promise<RelatedWork[]> = fetch(
        `${env.API_BASE_URL}/api/tmdb/genre-top?genre=${theme.genreId}`,
        { signal: controller.signal },
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((data: RelatedWork[] | null) => (Array.isArray(data) ? data : []))
        .catch(() => []);
      Promise.all([mirrorPromise, relatedPromise, excludePromise]).then(
        ([mirror, rel, exclude]) => {
          const merged = mergeGenreQueueItems(mirror, rel, exclude);
          // 병합 결과가 전멸(전부 제외)이면 related 원본 fallback — 빈 큐 즉시 종료 방지.
          finalize(merged.length > 0 ? merged : rel);
        },
      );
    } else {
      Promise.all([relatedPromise, excludePromise]).then(([rel, exclude]) => {
        if (!opts?.refresh) {
          finalize(rel);
          return;
        }
        // 재생성 — 이미 본(recHistory)/저장 항목 제외. 전멸 시 원본으로 처음부터.
        const filtered = rel.filter((w) => !exclude.has(`${w.mediaType}:${w.id}`));
        finalize(filtered.length > 0 ? filtered : rel);
      });
    }
  }

  /** 믹스 해제 — 원 덱/topIdx 는 그대로라 자동 복원. */
  function handleMixRelease() {
    mixFetchAbortRef.current?.abort();
    mixFetchAbortRef.current = null;
    mixQueueRef.current = [];
    mixHydratingRef.current = false;
    setMixSeed(null);
    setMixTheme(null);
    setMixDeck([]);
    setMixTopIdx(0);
    setMixCandidatesLoaded(false);
    cancelAnimation(dragX);
    cancelAnimation(dragY);
    dragX.value = 0;
    dragY.value = 0;
  }

  // lazy hydrate pump — mix 덱을 top 앞 3장까지만 유지, 큐에서 1건씩 순차 hydrate.
  // 12건 선-hydrate 금지 (미노출 카드 낭비). 실패 항목은 skip 하고 다음으로.
  // mixPump 카운터가 완료마다 재평가 트리거 (ref 는 재렌더 불가).
  useEffect(() => {
    if (!mixSeed) return;
    if (mixDeck.length - mixTopIdx >= 3) return;
    if (mixHydratingRef.current) return;
    const work = mixQueueRef.current[0];
    if (!work) return;
    const controller = mixFetchAbortRef.current;
    if (!controller || controller.signal.aborted) return;
    mixHydratingRef.current = true;
    mixQueueRef.current.shift();
    const t = work.mediaType === 'tv' ? 'series' : 'movie';
    fetch(`${env.API_BASE_URL}/api/tmdb/hydrate?id=${work.id}&type=${t}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((next: Recommendation | null) => {
        if (controller.signal.aborted || !next) return;
        setMixDeck((prev) =>
          // tmdbId 는 React key/dismiss 식별자 — movie/tv id 충돌 항목은 뒤 항목 drop.
          prev.some((r) => r.tmdbId === next.tmdbId) ? prev : [...prev, next],
        );
        // 재노출 방지 — mix 노출 카드도 recHistory 기록 (일반 덱 배치 기록과 동일 의미).
        void addRecHistory([
          { title: next.title, tmdbId: next.tmdbId, posterUrl: next.posterUrl, type: next.type },
        ]);
      })
      .catch(() => {
        /* 실패 항목 skip — finally 의 pump 재트리거가 다음 항목 진행 */
      })
      .finally(() => {
        if (controller.signal.aborted) return; // 해제 후 좀비 재트리거 방지
        mixHydratingRef.current = false;
        setMixPump((p) => p + 1);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixSeed, mixDeck.length, mixTopIdx, mixPump]);

  // mix 소진/빈 후보 판정 — 안내 toast + 원 덱 자동 복귀 (EmptyState 재도입 금지).
  // mixCandidatesLoaded 가드: 후보 fetch 전 "큐가 빈 초기 상태" 를 소진으로 오인 방지.
  useEffect(() => {
    if (!mixSeed || !mixCandidatesLoaded) return;
    if (mixQueueRef.current.length > 0 || mixHydratingRef.current) return;
    if (mixDeck.length === 0) {
      toast.show('info', { ctx: { message: '이어볼 후보를 찾지 못했어요' }, duration: 1800 });
      handleMixRelease();
      return;
    }
    if (mixTopIdx >= mixDeck.length) {
      toast.show('info', { ctx: { message: '큐를 다 봤어요' }, duration: 1800 });
      handleMixRelease();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixSeed, mixCandidatesLoaded, mixDeck.length, mixTopIdx, mixPump]);

  // top 카드 변경(swipe/load/모드 전환) 시 케밥 메뉴 자동 닫기 — 메뉴가 옛 카드
  // 제목을 들고 있는 stale 상태 방지.
  useEffect(() => {
    setCardMenuOpen(false);
  }, [currentRec?.tmdbId]);

  // 2026-07-10 — Modal(DetailSheet/SearchSheet)·메뉴가 모두 닫힌 시점 hold 램프
  // 하드 리셋. Modal 뒤에서 중단된 in-flight 리셋 애니메이션 방어
  // (탭→시트→닫기 경로 축소 잔존 — onFinalize 안전망의 사각).
  useEffect(() => {
    if (!detailOpen && !searchOpen && !cardMenuOpen) {
      holdSV.value = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailOpen, searchOpen, cardMenuOpen]);

  // 2026-07-10 — top 카드 1.5s dwell 시 related 선-fetch (DetailSheet 관련작
  // 스켈레톤 0.7~1.8s 구간 제거). 빠른 스와이프는 타이머가 리셋돼 스킵 —
  // dwell 한 카드만 호출 (TMDB 호출 낭비 방지). 캐시는 lib/data-prefetch LRU.
  useEffect(() => {
    if (!currentRec || detailOpen) return;
    const rec = currentRec;
    const t = setTimeout(() => {
      prefetchRelated(rec.tmdbId, rec.type === 'movie' ? 'movie' : 'series');
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRec?.tmdbId, detailOpen]);

  // Mix 탭 → 믹스 시작 브리지. 탭에서 setPendingMixSeed 후 router.push('/') →
  // focus 시 1회 consume. ref 로 최신 handleMixStart 참조 (stale closure 방지).
  const handleMixStartRef = useRef(handleMixStart);
  handleMixStartRef.current = handleMixStart;
  useFocusEffect(
    useCallback(() => {
      const pending = consumePendingMixSeed();
      if (pending) handleMixStartRef.current(pending.seed, pending.source, pending.theme);
    }, []),
  );

  // ── Night Pool 5단계 — "관심 없음" (위 스와이프 · 상세 시트 버튼) ──
  // 되돌리기는 토스트가 3초 뒤 부를 수 있어 최신 덱을 ref 로 읽는다 (클로저 stale 방지).
  const liveDeckRef = useRef({ ratedRecs, mixDeck, inMix, hiddenKeys });
  liveDeckRef.current = { ratedRecs, mixDeck, inMix, hiddenKeys };

  // 숨긴 카드가 덱에서 빠진 commit 뒤에 가라앉기 상태 해제 — 해제를 먼저 하면 옛 카드가
  // 한 프레임 제자리로 튀어 보인다. commit 뒤엔 뒤 카드 인덱스가 이미 한 칸 당겨져 sinkIdx 해제도 무변화.
  useEffect(() => {
    sinkCardIdSV.value = -1;
    sinkIdxSV.value = -1;
    sinkP.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenKeys]);

  // 성능(5단계) — 다음에 쌓일 카드(top+3~+5) 포스터를 미리 메모리 캐시에 디코드해 둔다.
  // 카드 교체 때 새로 마운트되는 3번째 카드의 네트워크 로드·디코드가 교체 프레임에 겹치지 않게.
  const upcomingPosterKey = activeDeck
    .slice(activeTopIdx + WINDOW_AFTER + 1, activeTopIdx + WINDOW_AFTER + 4)
    .map((r) => r.posterUrl ?? '')
    .join('|');
  useEffect(() => {
    if (upcomingPosterKey) prefetchPosters(upcomingPosterKey.split('|'), 3);
  }, [upcomingPosterKey]);

  // card_viewed — 웹 discover/page.tsx 와 같은 이름·속성. (tmdbId, 위치) 가 바뀔 때 1회.
  // 2026-11-27 PostHog 확인: 네이티브는 전 기간 0건이었음 → 주지표(저장률) 분모.
  const lastViewedCardKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentRec || (state !== 'ready' && !inMix)) return;
    const viewedKey = `${currentRec.tmdbId}:${activeTopIdx}`;
    if (lastViewedCardKeyRef.current === viewedKey) return;
    lastViewedCardKeyRef.current = viewedKey;
    track('card_viewed', {
      tmdb_id: currentRec.tmdbId,
      title: currentRec.title,
      source: inMix ? 'mix_deck' : 'discover_stack',
      stack_index: activeTopIdx,
      total_loaded: activeDeck.length,
      providers_count: currentRec.providers.length,
      saved: savedIds.has(currentRec.tmdbId),
    });
    setCardsSeen((n) => n + 1);
    // 온보딩 A안 — 설치 후 첫 카드 순간 1회 (A안 신규만, 기존 사용자의 "첫 카드"는 이미 지났다)
    const rec = currentRec;
    const source = inMix ? 'mix_deck' : 'discover_stack';
    void getOnboardingVariant().then(async (v) => {
      if (v === 'A' && (await consumeOnce('first_card'))) {
        track('first_card_viewed', { ...sinceOpen(), tmdb_id: rec.tmdbId, source });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRec, activeTopIdx, state, inMix]);

  type HideSource = 'long_press' | 'kebab_menu' | 'detail_button';
  function commitHide(rec: Recommendation, source: HideSource) {
    const key = hiddenKeyOf(rec);
    // 현재 카드보다 앞의 카드를 숨기면(검색 상세 등) 덱이 당겨지므로 위치도 한 칸 당긴다.
    const idx = activeDeck.findIndex((r) => r.tmdbId === rec.tmdbId && r.type === rec.type);
    if (idx >= 0 && idx < activeTopIdx) {
      if (inMix) setMixTopIdx((i) => Math.max(0, i - 1));
      else setTopIdx((i) => Math.max(0, i - 1));
    }
    setHiddenKeys((prev) => new Set(prev).add(key));
    void addHiddenKey(key);
    track('not_interested', {
      tmdb_id: rec.tmdbId,
      media_type: rec.type === 'movie' ? 'movie' : 'tv',
      title: rec.title,
      source,
      action: 'hide',
    });
    toast.show('hide', { ctx: { title: rec.title }, onAction: () => undoHide(rec, source) });
  }

  function undoHide(rec: Recommendation, source: HideSource) {
    const key = hiddenKeyOf(rec);
    const live = liveDeckRef.current;
    const next = new Set(live.hiddenKeys);
    next.delete(key);
    setHiddenKeys((prev) => {
      const n = new Set(prev);
      n.delete(key);
      return n;
    });
    void removeHiddenKey(key);
    track('not_interested', {
      tmdb_id: rec.tmdbId,
      media_type: rec.type === 'movie' ? 'movie' : 'tv',
      title: rec.title,
      source,
      action: 'undo',
    });
    // 되돌린 카드를 다시 맨 위로 — 그 사이 넘겼어도 그 작품이 보이게.
    const deck = filterHidden(live.inMix ? live.mixDeck : live.ratedRecs, next);
    const idx = deck.findIndex((r) => r.tmdbId === rec.tmdbId && r.type === rec.type);
    if (idx >= 0) {
      if (live.inMix) setMixTopIdx(idx);
      else setTopIdx(idx);
    }
    toast.show('info', { ctx: { message: '되돌렸어요' } });
  }

  /** 길게 누르기·케밥 메뉴 "관심 없음" — 가라앉기(220ms) 뒤 commitHide. 뒤 카드가 제자리로 당겨 깔린다. */
  function hideFromMenu() {
    const rec = currentRec;
    setCardMenuOpen(false);
    if (!rec || sinkCardIdSV.value !== -1) return;
    const source = menuViaRef.current;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
    if (source === 'long_press') completeHint('long_press_hide');
    sinkIdxSV.value = activeTopIdx;
    sinkCardIdSV.value = rec.tmdbId;
    sinkP.value = 0;
    sinkP.value = withTiming(1, { duration: HIDE_SINK_MS, easing: Easing.in(Easing.ease) });
    setTimeout(() => commitHide(rec, source), HIDE_SINK_MS);
  }

  // 배치 G — 첫 카드 힌트. 첫 카드에서 아래로(이전) 끌면 1회 toast + 고무줄 복귀.
  function showFirstCardHint() {
    if (firstCardHintShownRef.current) return;
    firstCardHintShownRef.current = true;
    toast.show('info', { ctx: { message: '첫 번째 작품이에요' }, duration: 1800 });
  }

  /** 넘김 정착 — 끌던 거리를 위치에 접어 넣고 target 페이지로 보간 (UI 스레드). */
  function settlePage(target: number) {
    'worklet';
    const H = feedH.value > 0 ? feedH.value : 1;
    pageSV.value = pageSV.value - dragY.value / H;
    dragY.value = 0;
    pageTargetSV.value = target;
    pageSV.value = withTiming(target, { duration: PAGE_MS, easing: PAGE_EASING });
  }

  const pan = Gesture.Pan()
    .onBegin(() => {
      axisSV.value = 0;
    })
    .onStart(() => {
      // 넘김 보간 중에 다시 잡으면 그 자리에서 손가락이 이어받는다 (빠른 연속 넘김).
      cancelAnimation(pageSV);
    })
    .onUpdate((e) => {
      // 방향 잠금: 처음 10px 움직인 축으로 고정 (그 전엔 큰 쪽).
      axisSV.value = lockAxis(axisSV.value, e.translationX, e.translationY);
      if (resolveAxis(axisSV.value, e.translationX, e.translationY) === 1) {
        // 좌우 = 탭 이동 예고 — 카드는 조금만 따라온다.
        dragY.value = 0;
        dragX.value = Math.max(-36, Math.min(36, e.translationX * 0.2));
        return;
      }
      dragX.value = 0;
      const target = pageTargetSV.value;
      const atFirst = target <= 0;
      const atEnd = target >= deckLenSV.value;
      let dy = e.translationY;
      // 첫 카드에서 아래 / 끝에서 위 = 고무줄
      if ((dy > 0 && atFirst) || (dy < 0 && atEnd)) dy = dy * 0.3;
      dragY.value = dy;
      if (atFirst && e.translationY > 30 && firstCardHintGate.value === 0) {
        firstCardHintGate.value = 1;
        runOnJS(showFirstCardHint)();
      }
    })
    .onEnd((e) => {
      const target = pageTargetSV.value;
      const action = classifySwipe({
        axis: axisSV.value,
        dx: e.translationX,
        dy: e.translationY,
        vx: e.velocityX,
        vy: e.velocityY,
        hasPrev: target > 0,
        hasNext: target < deckLenSV.value,
      });
      dragX.value = withTiming(0, { duration: SNAPBACK_MS, easing: PAGE_EASING });
      if (action === 'next' || action === 'prev') {
        const t = target + (action === 'next' ? 1 : -1);
        settlePage(t);
        runOnJS(onFeedNav)(t, action);
        return;
      }
      // 제자리 복귀 (보간 중 잡았다 놓은 경우도 target 으로)
      settlePage(target);
      if (action === 'tab_next' || action === 'tab_prev') runOnJS(onTabSwipe)(action);
    })
    .onFinalize(() => {
      // 취소(시스템 제스처 등)로 끝나도 위치가 어중간하게 남지 않게
      if (dragY.value !== 0) settlePage(pageTargetSV.value);
    });

  const cardsToShow = activeDeck.slice(activeTopIdx, activeTopIdx + 3);
  // 세로 피드 마운트 창 (위치는 SwipeCard worklet 이 index·pageSV 로 계산)
  const windowStart = Math.max(0, activeTopIdx - WINDOW_BEFORE);
  const feedWindow = activeDeck.slice(windowStart, activeTopIdx + WINDOW_AFTER + 1);
  // 3차 — 큐 진행 카운트 총량. mixQueueRef 는 ref 지만 mixPump 가 hydrate 1건마다
  // 리렌더를 일으켜 렌더 시점 값이 최신 (pump effect 참조).
  const mixTotal = inMix ? mixDeck.length + mixQueueRef.current.length : 0;
  const isLiked = currentRec ? savedIds.has(currentRec.tmdbId) : false;
  // 2026-06-06 (Tier 3 단기 incident 해소) — EmptyState UI 자체 페기.
  // 무한 스크롤이 의도 → "오늘은 여기까지" 화면 자체가 없어야 함 (사용자 명시).
  // exhausted lock 은 prefetch progressive fallback (cooldown 7일→3일→1일→0)
  // 으로 항상 새 batch 확보 → EmptyState 도달 자체를 차단.
  // Tier 3 Phase A~D (`_workspace/07_refactor-master-plan-2026-06-06.md`) 완료 후
  // 본 fallback 제거 가능.
  const exhaustedDisplay = false;

  // 2026-06-10 (Phase C #6) — "결과 모집단에 노출된 OTT 집합". FilterChips 에
  // 전달되어 *disable 판정용* 으로 사용 (mount gate 아님 — 칩은 항상 OTT_OPTIONS
  // 7종 고정 노출). 사용자 멘탈 모델: "내가 선택한 OTT 는 항상 보인다",
  // DESIGN.md L230 시각 앵커 유지 + L266 동시 움직임 최대 3개 정합.
  const availableOTTs = OTT_OPTIONS.filter((ott) =>
    recs.some((r) => r.providers.some((p) => p.name === ott)),
  );

  const hasFilter =
    filterType !== 'all' ||
    filterOrigin !== 'all' ||
    filterYear !== 'all' ||
    filterRating !== 'all' ||
    filterOTTs.size > 0;

  // 2026-06-06 (P1 종료 화면 Fix A) — 카피 톤 조정.
  // 진단: `_workspace/02_p1_end_screen.md` §4.2.
  //
  // 기존 결함: "추천이 없어요" / "찾지 못했어요" 톤이 모집단 절대 0 처럼 들림.
  //   실제는 한 배치 (~10건) 소진. exhausted 락 부재로 false-positive 종료 빈번.
  // 조정: DESIGN.md §Empty State Quiet Ink 톤 정합 — 담백·차분.
  //   "오늘은 여기까지" / "내일 다시 와요" 로 "한 배치 끝" 시그널을 부드럽게.
  //
  // 본 트랙은 카피만 교체 (Fix A). exhausted 락 (Fix B) / loading_more skeleton
  // (Fix C) 은 PostHog 측정 후 별도 트랙. CTA 동작 변경 0.
  const { emptyTitle, emptyHint } = (() => {
    if (!hasFilter) {
      return {
        emptyTitle: '오늘은 여기까지',
        emptyHint: '내일 다시 와요. 새로 살펴볼게요',
      };
    }
    if (filterOrigin === 'kr') {
      return {
        emptyTitle: '국내 작품은 여기까지',
        emptyHint: '필터를 풀면 해외 작품도 함께 보여드릴게요',
      };
    }
    if (filterOTTs.size > 0) {
      return {
        emptyTitle: '선택한 OTT는 여기까지',
        emptyHint: 'OTT 필터를 풀면 더 많은 작품이 보여요',
      };
    }
    return {
      emptyTitle: '이 조건엔 더 없어요',
      emptyHint: '필터를 조금 풀어보면 다른 작품이 보여요',
    };
  })();

  function clearFilters() {
    setFilterType('all');
    setFilterOrigin('all');
    setFilterYear('all');
    setFilterOTTs(new Set());
    // 2026-06-18 ("내 OTT 만 보기" 토글 — 1.0.3 train) — 전체 초기화 시 토글도 OFF.
    prevFilterOTTsRef.current = null;
    setMyOTTToggle(false);
    load({});
  }

  /**
   * 페르소나 전환 — Discover 헤더 chip dropdown 에서 호출.
   *
   * web `apps/web/src/app/discover/page.tsx:615-625` (`onPersonaSwitch`) 정합:
   *   페르소나가 바뀌면 추천 입력 신호가 달라지므로 필터를 전부 초기화하고
   *   topIdx 를 0 으로 되돌린 뒤 추천을 새로 로드한다.
   *
   * native 매핑:
   *   - web `rec.abortLoading()` → native 는 명시적 abort 가 없다. switchPersona
   *     완료 후 `load({})` 를 다시 호출하면 새 fetch 가 시작되고 onCard 가 recs 를
   *     덮어쓴다 (이전 in-flight fetch 결과보다 나중에 도착). web 의 sessionStorage
   *     topIdx 제거는 native 에 해당 캐시가 없어 불필요.
   *   - `persona.switchPersona` 는 async (AsyncStorage) → await 후 load.
   */
  function handlePersonaSwitch(id: string) {
    if (id === persona.activePersonaId) return;
    void persona.switchPersona(id).then(() => {
      setFilterType('all');
      setFilterOrigin('all');
      setFilterYear('all');
      setFilterRating('all');
      setFilterOTTs(new Set());
      // 2026-06-18 ("내 OTT 만 보기" 토글 — 1.0.3 train) — 페르소나 전환 시 토글 OFF.
      prevFilterOTTsRef.current = null;
      setMyOTTToggle(false);
      setTopIdx(0);
      load({});
    });
    const target = persona.personas.find((p) => p.id === id);
    track('persona_switched', { persona_id: id, persona_name: target?.name });
  }

  // 2026-05-28 mount race fix (build 9 회귀):
  //   onboard guard 의 빈 SafeAreaView early-return 제거. DiscoverHeader (검색 버튼
  //   `~검색 열기`) 가 첫 frame 부터 a11y tree 에 노출되어야 E2E 의 5s `tapByLabel`
  //   폴 안에 잡힌다. 기존 `pending` 단계에서 빈 SafeAreaView 만 렌더 → 헤더 미마운트
  //   → mount race 실패 (build 9: 4 regression + hybrid + persona 6 케이스).
  //
  //   guard 자체는 유지 — `useEffect([load, onboardCheck])` 가 'pass' 일 때만 추천
  //   fetch (anon 사용자가 onboarding 결과 반영 못한 cold-start 추천을 받지 않게).
  //   redirect 분기는 useFocusEffect 안에서 router.replace('/onboarding') 호출 중 →
  //   화면이 즉시 onboarding 으로 전환되므로 헤더가 잠깐 보이더라도 사용자 인지
  //   거의 없음. (root `_layout.tsx` 의 redirect effect 도 병행.)
  //
  //   stack/ActionBar slot 도 항상 렌더 — state === 'loading' 분기로 처리 중이라
  //   onboardCheck 가 pending 인 동안엔 추천이 비어 있어 loading state 가 노출됨.

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <DiscoverHeader
        personas={persona.personas}
        activePersonaId={persona.activePersonaId}
        activePersona={persona.activePersona}
        onPersonaSwitch={handlePersonaSwitch}
        onAddPersona={() => router.push('/profile')}
        onSearchOpen={openSearch}
      />

      <View
        style={styles.stackWrap}
        onLayout={(e) => {
          feedH.value = e.nativeEvent.layout.height;
        }}
      >
        {/* 4차-2 — 큐 하이라이트: 솔리드 컨테이너 + 카드 4px 패딩 인셋.
            mixBar(캡)와 같은 인셋(8) 로 한 덩어리, 하단은 bottom 4 로 하트와 분리. */}
        {inMix && <View style={styles.mixFrame} pointerEvents="none" />}
        {/* 2026-06-22 (게이트 0 first_card_p50 11.9s 대응) — 로딩 origin 분기.
            refresh = 사용자 새로고침 → ApertureBreathLoader (중앙 호흡) 유지.
            default = 첫 진입 / 필터 변경 → SkeletonCard (카드 윤곽) 로 빈 화면 제거.
            PWA StatusScreens origin 분기 정합. */}
        {state === 'loading' && loadOrigin === 'refresh' && !inMix && (
          <View
            style={styles.centered}
            accessibilityLiveRegion="polite"
            accessibilityLabel="추천을 준비하고 있어요"
          >
            <ApertureBreathLoader size={72} message="추천을 준비하고 있어요" />
          </View>
        )}

        {state === 'loading' && loadOrigin !== 'refresh' && !inMix && (
          // dual a11y label 회피 (memory feedback_native_a11y_e2e_patterns §2):
          // 라벨/role 은 SkeletonCard root(progressbar + "추천을 준비하고 있어요")가
          // 단일 보유. wrapper 는 liveRegion 만 — 중복 라벨 제거. E2E 라벨 검출은
          // SkeletonCard root 라벨로 유지됨.
          <View style={styles.stack} accessibilityLiveRegion="polite">
            <SkeletonCard />
          </View>
        )}

        {state === 'error' && (
          // 2026-06-06 (B-1 §Error State 정합) — DESIGN.md line 244:
          //   "Empty 와 동일 구조, 아이콘 색상만 --danger".
          //   EmptyState (1322~1346) 와 동일 마크업 + IconRefresh(48px) color=danger.
          //   톤: Quiet Ink — 'X 실패' 강조 대신 조용한 안내. errorMsg 가 비면 fallback.
          <View style={styles.emptyContainer}>
            <View style={styles.emptyBlock}>
              <IconRefresh size={48} color={colors.danger} />
              <View style={styles.emptyTextGroup}>
                <Text style={styles.emptyTitle}>잠시 멈췄어요</Text>
                <Text style={styles.emptyHint}>
                  {errorMsg || '잠시 후 다시 시도해주세요'}
                </Text>
              </View>
              <View style={styles.emptyActions}>
                <Button
                  label="다시 시도"
                  onPress={() => load(undefined, { excludeIds: recs.map((r) => r.tmdbId) })}
                />
              </View>
            </View>
          </View>
        )}

        {/* 2026-07-08 Seeded Mix 2차 — 큐 덱 로딩 (후보 fetch + 첫 hydrate 대기). */}
        {inMix && cardsToShow.length === 0 && (
          <View
            style={styles.centered}
            accessibilityLiveRegion="polite"
            accessibilityLabel="큐를 채우고 있어요"
          >
            <ApertureBreathLoader size={72} message="큐를 채우고 있어요" />
          </View>
        )}

        {state === 'ready' && !inMix && cardsToShow.length === 0 && (
          // 2026-06-06 (Tier 3 단기 incident 해소) — 빈 응답 시점 fallback loader.
          // recs.length===0 또는 topIdx 가 끝 도달 → cardsToShow=0. EmptyState UI 페기
          // 했으므로 stack 영역도 안 보이는 빈 화면 회귀 방지. progressive fallback +
          // 자동 hard refresh 가 비동기로 동작하는 동안 loader 노출.
          <View
            style={styles.centered}
            accessibilityLiveRegion="polite"
            accessibilityLabel="추천을 더 가져오는 중"
          >
            <ApertureBreathLoader size={72} message="추천을 더 가져오는 중" />
          </View>
        )}

        {(state === 'ready' || inMix) && feedWindow.length > 0 && (
          // 1.1.0 — 더블탭(저장)·탭(상세)·팬(넘김·탭 이동) 은 배타, longPress(메뉴)는 시간 조건이 달라 병행.
          // 한 번 탭은 더블탭 실패를 기다린다 (DOUBLE_TAP_MAX_DELAY).
          <GestureDetector
            gesture={Gesture.Simultaneous(Gesture.Exclusive(doubleTap, tap, pan), longPress)}
          >
            <Animated.View
              style={[styles.stack, styles.feedClip, inMix && styles.mixStackInset]}
              testID="discover-feed"
            >
              {feedWindow.map((rec, i) => {
                const index = windowStart + i;
                const isTop = index === activeTopIdx;
                return (
                  <SwipeCard
                    key={rec.tmdbId}
                    rec={rec}
                    index={index}
                    isTop={isTop}
                    pageSV={pageSV}
                    feedH={feedH}
                    dragY={dragY}
                    dragX={dragX}
                    immersive={isTop && immersive}
                    holdSV={holdSV}
                    sinkCardIdSV={sinkCardIdSV}
                    sinkIdxSV={sinkIdxSV}
                    sinkP={sinkP}
                  />
                );
              })}
              <SaveSticker stickerP={stickerP} reduced={reducedMotion} />
            </Animated.View>
          </GestureDetector>
        )}

        {/* 온보딩 A안 — 카드 위 조작 힌트 (한 번에 하나). 글자는 터치를 막지 않고 닫기 버튼만 받는다. */}
        {activeHint && <GestureHint step={activeHint} onClose={() => skipHint(activeHint)} />}

        {/* 2026-06-06 (Tier 3 단기 incident 해소) — EmptyState UI 페기.
            무한 스크롤 의도 (사용자 명시 "EmptyState 화면 자체가 없어야"). 빈 응답
            시점은 위 fallback loader 가 처리. Tier 3 Phase A~D 완료 후 본 영역
            재설계 가능 (`_workspace/07_refactor-master-plan-2026-06-06.md`). */}

        {/* 2026-07-08 Seeded Mix 2차 — 카드 케밥(⋮) 메뉴. GestureDetector 바깥 sibling
            absolute overlay (1차 검증 구조) — top 카드 우측상단(RatingChip 아래) 정렬.
            Pressable 이 터치를 소비하므로 tap 제스처(DetailSheet 진입)와 원천 분리.
            currentRec(=top 카드) 기준 단일 렌더라 뒤 카드/EmptyState 노출 자체가 없음.
            믹스 중엔 숨김 (중첩 믹스는 후속 과제). */}
        {(state === 'ready' || inMix) && cardsToShow.length > 0 && (
          <Pressable
            style={styles.cardMenuBtn}
            onPress={() => handleCardMenuPress('kebab_menu')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="카드 메뉴"
            testID="card-menu-button"
          >
            <GlassSurface radius={22} />
            <IconMoreVertical size={18} color={colors.textPrimary} />
          </Pressable>
        )}

        {cardMenuOpen && currentRec && (
          <>
            {/* 투명 backdrop — 메뉴 밖 탭 시 닫기 (stack 영역 한정). */}
            <Pressable
              style={styles.cardMenuBackdrop}
              onPress={() => setCardMenuOpen(false)}
              accessibilityLabel="메뉴 닫기"
              testID="card-menu-backdrop"
            />
            <View style={styles.cardMenu} testID="card-menu">
              {/* 중첩 큐 금지 — 큐 중엔 "큐 시작" 없이 "관심 없음" 만 */}
              {!inMix && (
                <Pressable
                  style={({ pressed }) => [styles.cardMenuItem, pressed && styles.cardMenuItemPressed]}
                  onPress={() => handleMixStart(currentRec, 'native_card_menu')}
                  accessibilityRole="button"
                  testID="card-menu-mix"
                >
                  <Text style={styles.cardMenuItemText} numberOfLines={1}>
                    {currentRec.title} 큐 시작
                  </Text>
                </Pressable>
              )}
              {/* 치우는 동작이라 중성색 (라임·아쿠아 안 씀). 서버 hiddenKeys·5단계 숨김 저장소 그대로. */}
              <Pressable
                style={({ pressed }) => [styles.cardMenuItem, pressed && styles.cardMenuItemPressed]}
                onPress={hideFromMenu}
                accessibilityRole="button"
                accessibilityLabel="관심 없음"
                testID="card-menu-hide"
              >
                <Text style={styles.cardMenuItemText}>관심 없음</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* Night Pool — 칩(또는 큐 바)·액션바가 카드 위에 뜬다 (DESIGN.md Layout). */}
        <View style={styles.topOverlay} pointerEvents="box-none">
          {/* 2026-07-08 Seeded Mix 2차 — 큐 중엔 FilterChips 대신 큐 바.
              필터는 일반 덱 전용 (큐 덱은 후보 12 이하 고정 셋이라 서버 필터 무의미).
              3차 업스케일 — seed 미니 포스터(작품 큐만) + display 위계 라벨 + 진행 카운트.
              테마 큐는 포스터 생략 + 테마 title (seed 작품 비노출 정책 — 2차 확정 유지). */}
          {inMix && mixSeed ? (
            <View style={styles.mixBar} testID="mix-bar">
              <GlassSurface radius={radius.toast} />
              {!mixTheme && mixSeed.posterUrl ? (
                <Image
                  source={{ uri: mixSeed.posterUrl }}
                  style={styles.mixBarPoster}
                  contentFit="cover"
                  transition={0}
                />
              ) : null}
              <View style={styles.mixBarLabelGroup}>
                <Text style={styles.mixBarTitle} numberOfLines={1}>
                  {mixTheme ? mixTheme.title : mixLabelOf(mixSeed.title)}
                </Text>
                {mixCandidatesLoaded && mixTotal > 0 ? (
                  <Text style={styles.mixBarCount} testID="mix-count">
                    {Math.min(mixTopIdx + 1, mixTotal)} / {mixTotal}
                  </Text>
                ) : null}
              </View>
              <Button
                label="종료"
                size="sm"
                variant="ghost"
                onPress={handleMixRelease}
                accessibilityLabel="큐 종료"
                testID="mix-release"
              />
            </View>
          ) : (
            <FilterChips
              filterType={filterType}
              filterOrigin={filterOrigin}
              filterYear={filterYear}
              filterRating={filterRating}
              filterOTTs={filterOTTs}
              availableOTTs={availableOTTs}
              disabled={state === 'loading'}
              onFilterChange={(t, o) => applyFilterChange({ type: t, origin: o })}
              onYearChange={(y) => applyFilterChange({ year: y })}
              onRatingChange={(r) => applyFilterChange({ rating: r })}
              onOTTChange={(otts) => applyFilterChange({ otts })}
              // 2026-06-18 ("내 OTT 만 보기" 토글 — 1.0.3 train) — FilterChips leftmost 신규.
              myOTTToggle={myOTTToggle}
              myOTTAvailable={subscribedOtt.length > 0}
              onMyOTTToggle={handleMyOTTToggle}
              onMyOTTSetupNavigate={handleMyOTTSetupNavigate}
              // 4차 — 필터 dropdown 열림 시 케밥 인메뉴 닫기 (동시 오픈 방지).
              onDropdownOpen={() => setCardMenuOpen(false)}
            />
          )}

        </View>

        {/* 2026-05-19 native↔PWA 정합 (항목 1, 증상 B) — ActionBar 자리 항상 확보.
            기존: ActionBar 가 `state==='ready' && currentRec` 조건부 렌더 → loading→ready
            전환·탭 재진입 시 ActionBar 가 mount/unmount 되며 stackWrap(flex:1) 이
            ACTION_BAR_HEIGHT(64px) 만큼 재배분 → 카드(absolute top0/bottom8)가 한 프레임
            "늘어났다 줄어드는" jank.
            해결: 항상 높이 ACTION_BAR_HEIGHT 인 slot 을 두고, ready 가 아닐 땐 내부를
            비워둔다. slot 자체 높이가 불변 → stackWrap 이 어느 상태에서나 동일 공간.
            (web 은 loading/error/empty 를 전체화면 컴포넌트로 early-return 하므로 ready
            상태의 ActionBar 가 항상 렌더 — 구조상 jank 가 없다. native 는 같은
            SafeAreaView 안에서 분기하므로 slot 고정으로 동등 효과를 만든다.) */}
        <View style={styles.actionBarSlot} pointerEvents="box-none">
          {/* 2026-07-08 Seeded Mix 2차 — mix 덱에서도 ActionBar 동작 (save/share/detail).
              rewind 는 활성 덱 처음으로, refresh 는 믹스 해제 후 일반 새로고침. */}
          {(state === 'ready' || inMix) && currentRec && (
            <ActionBar
              isSaved={isLiked}
              canRewind={activeTopIdx > 0}
              saveFlash={saveFlash}
              onRewind={() => (inMix ? setMixTopIdx(0) : setTopIdx(0))}
              onShare={handleShare}
              onOpenDetail={() => {
                // W5 Task C 7.1 — ActionBar Detail 버튼은 web 정본 source='action_bar'.
                // (web `apps/web/src/app/discover/page.tsx:683` 정합.)
                track('detail_opened', {
                  tmdb_id: currentRec.tmdbId,
                  title: currentRec.title,
                  providers_count: currentRec.providers.length,
                  source: 'action_bar',
                });
                setDetailOpen(true);
              }}
              onRefresh={() => {
                // 4차 — 큐 중 새로고침 = 해제가 아니라 같은 seed/테마로 큐 재생성
                // (recHistory/saved 제외 적용 → 이미 본 카드 걷어낸 새 목록).
                if (inMix && mixSeed) {
                  handleMixStart(mixSeed, mixSourceRef.current, mixTheme ?? undefined, {
                    refresh: true,
                  });
                  return;
                }
                void handleRefresh();
              }}
              onToggleSave={toggleLike}
            />
          )}
        </View>

      </View>

      <DetailSheet
        // 2026-05-20 — 검색 결과 작품 탭 시 searchSelectedRec 우선, 아니면 stack 의 현재 카드.
        rec={searchSelectedRec ?? currentRec ?? null}
        visible={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          // 검색 진입 detail 닫을 때 selected rec cleanup (다음 진입 시 stack rec 복귀).
          setSearchSelectedRec(null);
          // Search → Work → Detail 흐름이면 SearchSheet 자동 복귀 + 검색어 유지.
          if (returnToSearchAfterDetail) {
            setReturnToSearchAfterDetail(false);
            setSearchOpen(true);
          }
        }}
        onSearchPerson={(name) => {
          // 2026-05-20 (revised) — RN Modal z-stack 제약 우회.
          //   PWA: detail.closeDetail() 호출하지 않고 SearchSheet 위에 띄움(z-stack).
          //   native: OS native Modal API 라 두 개 동시 visible=true 면 위 Modal 이
          //   안 올라오고 잔재 남음 → DetailSheet 닫고 SearchSheet 열되, SearchSheet
          //   닫을 때 returnToDetailAfterSearch flag 로 DetailSheet 자동 복귀.
          //   인지 결과는 PWA z-stacking 과 동등.
          track('detail_to_search_person', { name, from: 'discover' });
          setDetailOpen(false);
          setSearchInitialQuery(name);
          setSearchOpen(true);
          setReturnToDetailAfterSearch(true);
        }}
        // 3차 Phase E — DetailSheet '큐 시작'. 시트 닫고 (검색/복귀 플래그 클리어 —
        // 큐 시작 의도가 복귀 흐름보다 우선) 현재 표시 rec 을 seed 로 덱 주입.
        // Discover 는 이미 focus 상태라 브리지 불필요 — 직접 호출.
        onStartMix={(mixRec) => {
          setDetailOpen(false);
          setSearchSelectedRec(null);
          setReturnToSearchAfterDetail(false);
          setReturnToDetailAfterSearch(false);
          handleMixStart(mixRec, 'native_detail_sheet');
        }}
        // Night Pool 5단계 — 위 스와이프 대체 수단 (DESIGN.md Accessibility).
        onHide={(hideRec) => {
          setDetailOpen(false);
          setSearchSelectedRec(null);
          setReturnToSearchAfterDetail(false);
          setReturnToDetailAfterSearch(false);
          commitHide(hideRec, 'detail_button');
        }}
        onSaved={(savedRec) => {
          setSavedIds((prev) => new Set(prev).add(savedRec.tmdbId));
          void afterSave('detail');
        }}
      />

      <SearchSheet
        visible={searchOpen}
        onClose={() => {
          setSearchOpen(false);
          // Cast 진입으로 열린 SearchSheet 라면 DetailSheet 자동 복귀.
          if (returnToDetailAfterSearch) {
            setReturnToDetailAfterSearch(false);
            setDetailOpen(true);
          }
        }}
        initialQuery={searchInitialQuery}
        // 작품 탭 흐름에서 DetailSheet 진입 후 복귀 가능 → 검색 컨텍스트 보존.
        preserveStateOnClose={returnToSearchAfterDetail}
        onWorkSelected={(rec) => {
          // 2026-05-20 — 검색 결과 작품 탭 → SearchSheet 닫고 새 rec 으로 DetailSheet.
          // PWA 의 SearchSheet 내부 detail panel 패턴은 별도 트랙 — 우선 단순 흐름.
          track('detail_opened', {
            tmdb_id: rec.tmdbId,
            title: rec.title,
            providers_count: rec.providers.length,
            source: 'search_result',
          });
          setSearchSelectedRec(rec);
          setSearchOpen(false);
          // 작품 탭은 새 DetailSheet 진입이라 returnToDetail flag 클리어 (이전 DetailSheet
          // 의 rec 으로 복귀하면 안 되고, 새 rec 의 DetailSheet 가 떠야 함).
          setReturnToDetailAfterSearch(false);
          // 반면 returnToSearchAfterDetail=true 로 — DetailSheet 닫으면 SearchSheet 복귀.
          setReturnToSearchAfterDetail(true);
          setDetailOpen(true);
        }}
      />

      {/* 온보딩 A안 — 저장 뒤 제안. OTT 는 기존 온보딩 OTT 화면을 시트로, 취향은 기존 설문 라우트로. */}
      <Modal
        visible={savePrompt === 'ott'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => closeSavePrompt('ott', 'dismissed')}
      >
        <SafeAreaView style={styles.promptSheet} edges={['bottom']}>
          <View style={styles.promptClose}>
            <Button label="닫기" size="sm" variant="ghost" onPress={() => closeSavePrompt('ott', 'dismissed')} />
          </View>
          <OnboardingStepOTT
            initialProviders={subscribedOtt}
            submitLabel="저장하기"
            onNext={() => {
              void getAccountPrefs().then((prefs) => {
                setSubscribedOtt(prefs.subscribedOtt);
                const n = prefs.subscribedOtt.length;
                closeSavePrompt('ott', n > 0 ? 'completed' : 'dismissed', n > 0 ? { providers_count: n } : undefined);
              });
            }}
          />
        </SafeAreaView>
      </Modal>
      {savePrompt === 'taste' && (
        <View style={styles.tastePrompt} testID="taste-prompt">
          <GlassSurface radius={radius.toast} />
          <Text style={styles.tastePromptText}>취향을 더 알려 주면 추천이 더 잘 맞아요</Text>
          <View style={styles.tastePromptActions}>
            <Button label="나중에" size="sm" variant="ghost" onPress={() => closeSavePrompt('taste', 'dismissed')} />
            <Button
              label="취향 더 알려 주기"
              size="sm"
              onPress={() => {
                closeSavePrompt('taste', 'accepted');
                (router.push as (href: string) => void)('/onboarding/taste-survey?from=discover');
              }}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// 칩 줄(top 8 + 높이 44) 아래 케밥 버튼
const CARD_MENU_TOP = 60;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  // 헤더는 DiscoverHeader 컴포넌트로 분리 (워드마크 + 페르소나 chip + search).
  stackWrap: { flex: 1 },
  // 항목 1 (증상 B) — ActionBar 고정 높이 slot. ready 여부와 무관하게 항상
  // ACTION_BAR_HEIGHT(64px) 점유 → stackWrap flex 재배분으로 인한 카드 점프 차단.
  // ActionBar 컴포넌트 자체 높이(saveBtn 56 + pb 8)도 64 라 slot 을 정확히 채운다.
  // 카드 위에 뜨는 액션바 — 카드 하단(bottom 6) 안쪽.
  actionBarSlot: {
    position: 'absolute',
    left: 6,
    right: 6,
    // 카드는 떠 있는 탭바 뒤까지 내려가고, 액션바는 탭바 위에 뜬다
    bottom: TAB_BAR_SPACE + 6,
    height: ACTION_BAR_HEIGHT,
    justifyContent: 'flex-end',
    zIndex: 20,
  },
  // 카드 위에 뜨는 칩 줄 / 큐 바 — 카드 상단 안쪽.
  topOverlay: {
    position: 'absolute',
    top: 8,
    left: 6,
    right: 6,
    zIndex: 20,
  },
  stack: { flex: 1, position: 'relative' },
  // 3차 — 케밥(⋮) 버튼. DetailSheet topNavBtn 정본 계열 (44×44 원형, surfaceRaised).
  // top 14 = 카드 내부 상단 인셋 — SwipeCard topRow(minHeight 44 center) 필 2개와
  // 수직 중심 정렬. right 26 = 카드 인셋 12 + 내부 14.
  cardMenuBtn: {
    position: 'absolute',
    top: CARD_MENU_TOP,
    right: 18,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    // 배경은 GlassSurface (유리 묶음 1개 — 칩 줄·액션바·탭바와 합쳐 발견 화면 4묶음, D9)
    zIndex: 20,
  },
  // 인라인 메뉴 — 케밥 바로 아래 anchor. surface + border, Quiet Ink (그림자/amber 無).
  cardMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  // 4차 — 필터 dropdown 패널과 동일 UI (FilterChips styles.panel/option 정합):
  // surfaceRaised + radius.lg + shadow-dropdown + option 패딩/타이포.
  cardMenu: {
    position: 'absolute',
    top: CARD_MENU_TOP + 52,
    right: 18,
    minWidth: 180,
    maxWidth: 260,
    padding: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.toast,
    zIndex: 30,
    ...shadowsNative.dropdown,
  },
  cardMenuItem: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.toast,
  },
  cardMenuItemPressed: {
    backgroundColor: colors.overlayLight,
  },
  cardMenuItemText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: fontsV2.bodySemi,
  },
  // 큐 바 — FilterChips 자리 대체. 4차: 인셋 8 (아웃라인 프레임과 동일) + 상단
  // radius 20 (카드 16 + 옵셋 4 정합). accentDim 솔리드 캡은 유지 — 아래 아웃라인과
  // 합쳐 "하이라이트 컨테이너" 로 읽힘 (amber 1건 예산 내).
  // 큐 바 — 카드 위에 뜨는 바 (칩 줄 자리). 유리(대체 raised + border).
  mixBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    marginHorizontal: 6,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
    gap: spacing.sm + 4,
    // 배경은 GlassSurface (칩 줄 자리 — 같은 유리 묶음 수)
  },
  // 큐 하이라이트 플레이트 — 카드 둘레 4px 아쿠아 옅은 면 (카드 radius 24 + 4).
  mixFrame: {
    position: 'absolute',
    left: 2,
    right: 2,
    top: 0,
    bottom: 2,
    borderRadius: radius.card + 4,
    backgroundColor: colors.aquaDim,
  },
  mixStackInset: {
    marginTop: 4,
  },
  // 세로 피드 — 위아래 카드가 칩 줄 위·탭바 아래로 새어 보이지 않게
  feedClip: { overflow: 'hidden' },
  promptSheet: { flex: 1, backgroundColor: colors.bg },
  promptClose: { alignItems: 'flex-end', paddingHorizontal: spacing.sm, paddingTop: spacing.sm },
  // 취향 제안 — 액션바 위 유리 카드 (토스트 재질)
  tastePrompt: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: TAB_BAR_SPACE + ACTION_BAR_HEIGHT + 20,
    padding: spacing.md,
    gap: spacing.sm,
    zIndex: 40,
  },
  tastePromptText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: fontsV2.bodySemi,
    lineHeight: 21,
  },
  tastePromptActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  // seed 미니 포스터 (작품 큐만) — 2:3 비율 26×39, radius 6.
  mixBarPoster: {
    width: 26,
    height: 39,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  mixBarLabelGroup: {
    flex: 1,
    gap: 1,
  },
  mixBarTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: fontsV2.title,
    letterSpacing: -0.3,
  },
  mixBarCount: {
    // 유리 위 글자 = text 색·13 이상 (DESIGN.md Material)
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: fontsV2.data,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  loadingText: { color: colors.textMeta, fontSize: 14, marginTop: spacing.sm },
  // 2026-06-06 (P1 종료 화면 DESIGN.md 정합) — DESIGN.md §Empty State (230~241):
  //   center 정렬 / 아이콘 48px text-muted / 아이콘→제목 gap space-md(16) /
  //   제목 text-base(15) 500 text-primary / 설명 text-sm(13) 400 text-muted /
  //   CTA 설명 아래 space-lg(24) / Ghost variant / max-width 260px.
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyBlock: {
    alignItems: 'center',
    maxWidth: 260,
  },
  emptyTextGroup: {
    alignItems: 'center',
    marginTop: spacing.md, // 아이콘→제목 gap = space-md(16)
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 15,        // text-base
    fontFamily: fontsV2.bodySemi,
    textAlign: 'center',
  },
  emptyHint: {
    color: colors.textMeta,
    fontSize: 13,        // text-sm
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 19,
  },
  emptyActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg, // 설명→CTA gap = space-lg(24)
  },
});
