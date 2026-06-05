import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Share,
  type LayoutRectangle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  runOnJS,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import SwipeCard from '../components/SwipeCard';
import FilterChips, { OTT_OPTIONS } from '../components/FilterChips';
import DiscoverHeader from '../components/DiscoverHeader';
import DetailSheet from '../components/DetailSheet';
import ActionBar, { ACTION_BAR_HEIGHT } from '../components/ActionBar';
import TutorialFlow, {
  type TutorialStep,
} from '../components/TutorialFlow';
import SearchSheet from '../components/SearchSheet';
import ApertureBreathLoader from '../components/feedback/ApertureBreathLoader';
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
  getRecHistory,
  getSaved,
  hasOnboarded,
  hasSeenTutorialV3,
  markTutorialV3Seen,
  toggleSaved,
} from '../lib/store';
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
} from '../lib/types';
import { colors, spacing } from '../lib/tokens';
import { easings, durations } from '@neq/design';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Stage 4 D1 (swipe-stack.jsx) / G1-A (Handoff v2 Phase B+C):
// THRESH=70, TAP=8/300ms — 좌(next)/우(prev overlay)/아래(save). ↑ 진입 제거 → 탭 단일 진입.
//
// 사이클 2 단일화: 콜백 타이밍은 `@neq/design` durations.swipeSaveDismiss / swipePassDismiss.
// (feedback_swipe_ux.md 잠금: save 480ms / pass 360ms)
const SWIPE_THRESHOLD = 70;
const PREV_OVERLAY_TRIGGER = 0.3;
// 03_p0-2 fix (한손 thumb flick 인식). 거리 임계는 그대로 유지 — 두 손 사용자의
// 의도 swipe 보수성 보존. velocity 보조만 추가: 빠른 flick 이면 짧은 변위로도 trigger.
// 좌/우/아래 모두 동일 패턴 적용 (좌·우는 velocityX, 아래는 velocityY).
// PWA useSwipeGesture 의 velocity 보조 (안 B 권고) 정합.
// 메모리 [Pan gesture offset 임계 충돌] 회피 — activeOffset/failOffset 도입 X.
const VELOCITY_THRESHOLD = 800; // px/s
const VELOCITY_TRIGGER_DISTANCE = 30; // px (임계 미달 시 최소 변위)
// pass dismiss 의 advance(topIdx++) 콜백 타이밍. feedback_swipe_ux.md 잠금 (pass 360ms).
const PASS_DISMISS_MS = durations.swipePassDismiss; // 360
const SAVE_ABSORB_MS = durations.swipeSaveDismiss; // 480
// M-2 (native↔PWA 정합): pass dismiss 의 *시각 슬라이드* duration.
// PWA pass 카드 = CSS `transition: transform 0.3s` → 300ms 동안 화면 밖으로 슬라이드.
// advance(PASS_DISMISS_MS=360) 와 분리 — 시각 transition(300) < 콜백 타이머(360) 구조를
// PWA 와 동일하게 맞춘다. durations 토큰에 300 값이 없어 명명 상수로 신설.
const PASS_DISMISS_SLIDE_MS = 300;

/**
 * 사이클 2 worklet화 + M-2 정합: pass dismiss 시각 곡선.
 *
 * 기존: `setDragX(-SCREEN_WIDTH)` JS 스레드 setState → RN bridge → 다음 frame 적용
 *       → 60fps 보장 어려움. qa-tester 평가에서 web CSS transition 보다 떨림 보고됨.
 *
 * 신규: `useSharedValue` + `withTiming(target, { easing })` 으로 UI 스레드 worklet 구동.
 *       - duration: 300ms (PASS_DISMISS_SLIDE_MS) — PWA `transform 0.3s` 정합
 *       - easing: Easing.bezier(...easings.spring) — 미세 오버슈트 30% (`[0.34, 1.3, 0.64, 1]`)
 *         PWA pass 카드의 `cubic-bezier(0.34, 1.3, 0.64, 1)` 와 동일 곡선.
 *       - advance(topIdx++) + sharedValue 리셋은 withTiming 콜백이 아니라
 *         별도 360ms 타이머(JS)에서 — 시각 슬라이드(300) 와 advance(360) 분리.
 */
const PASS_DISMISS_BEZIER = Easing.bezier(...easings.spring);

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
  // W5 Task A — onboarding 진입 가드.
  //
  // root layout (`app/_layout.tsx`) 이 `Tabs` 만 export 하므로 Discover (`app/index.tsx`)
  // 가 사실상 첫 진입 화면이다. 첫 mount 시 `hasOnboarded()` 를 평가해
  // false 면 즉시 `/onboarding` 으로 replace. 깜빡임 방지를 위해 결정 전까지는
  // null 을 렌더 (Tabs 의 scene background = colors.bg 가 그대로 노출).
  //
  // 2026-05-27 fix — `useFocusEffect` 로 focus 시마다 재평가.
  // 기존: `useEffect([])` 한 번만 평가. Tabs `lazy:false` 로 startup pre-mount 된 Discover 는
  //       onboarding 진입 시 guard 가 redirect 로 잠긴 뒤, `/onboarding/complete` 가
  //       `router.replace('/')` 해도 Discover 는 이미 mounted 라 useEffect 재실행 X →
  //       `onboardCheck='redirect'` 잔존 → 빈 SafeAreaView 노출 ("Discover 안 넘어감").
  // 변경: `useFocusEffect` 의 effect 가 화면이 focus 될 때마다 재평가하므로 onboarding
  //       완료 후 `router.replace('/')` → Discover focus → `hasOnboarded()` 'true' →
  //       `onboardCheck='pass'` 로 전환되어 정상 렌더.
  const [onboardCheck, setOnboardCheck] = useState<'pending' | 'pass' | 'redirect'>(
    'pending',
  );
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const ok = await hasOnboarded();
        if (cancelled) return;
        if (ok) {
          setOnboardCheck('pass');
        } else {
          setOnboardCheck('redirect');
          router.replace('/onboarding');
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // 페르소나 전환 — Discover 헤더 chip 에서 사용 (web `DiscoverHeader` 정합).
  const persona = usePersona();

  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [state, setState] = useState<LoadState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [topIdx, setTopIdx] = useState(0);
  const [dragX, setDragX] = useState(0);
  // Stage 4 D1: 위/아래 스와이프 변위
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  // Stage 4 D1: save 흡수 모션 + flash
  const [saveAbsorbing, setSaveAbsorbing] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const saveBtnRef = useRef<View>(null);
  const [saveTargetPoint, setSaveTargetPoint] = useState<{ x: number; y: number } | null>(null);

  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterOrigin, setFilterOrigin] = useState<FilterOrigin>('all');
  const [filterYear, setFilterYear] = useState<FilterYear>('all');
  const [filterRating, setFilterRating] = useState<FilterRating>('all');
  const [filterOTTs, setFilterOTTs] = useState<Set<string>>(new Set());

  // W5 Task B — TutorialFlow v3 (Discover 첫 진입 4단계 튜토리얼).
  //
  // 동작 모델 (web `apps/web/src/app/discover/page.tsx` 정합):
  //   1. mount 직후 AsyncStorage `tutorialV3Shown` 점검 → tutorialEligible
  //   2. 첫 카드 로드 (recs.length > 0) 완료 시 tutorialActive = true
  //   3. TutorialFlow 마운트 후 사용자가 좌/우/하/탭 4 액션을 실습할 때마다 카운터 증가
  //   4. TutorialFlow 가 카운터 변동을 감지해 자동 다음 단계 진행
  //   5. 4단계 완료 또는 건너뛰기 → handleTutorialClose → markTutorialV3Seen() + tutorialActive=false
  //
  // 카운터는 각 액션 핸들러에서 emit (handleSwipeLeft / onPrevCard / triggerSaveAbsorption / handleCardTap).
  const [tutorialEligible, setTutorialEligible] = useState(false);
  const [tutorialActive, setTutorialActive] = useState(false);
  // 튜토리얼 현재 step — TutorialFlow 의 onStepChange 로 emit. step 별 action whitelist 가드.
  // null = 비활성. swipe_left/right/down 단계 중 탭은 silent ignore (DetailSheet open 차단).
  const [tutorialStep, setTutorialStep] = useState<TutorialStep | null>(null);
  const [leftSwipeCount, setLeftSwipeCount] = useState(0);
  const [rightSwipeCount, setRightSwipeCount] = useState(0);
  const [saveActionCount, setSaveActionCount] = useState(0);
  const [detailOpenCount, setDetailOpenCount] = useState(0);
  // TutorialFlow 풀사이즈 데모 카드 좌표 정합용 — stackWrap (실제 SwipeCard 부모) 의
  // onLayout 측정값. hardcoded HEADER/FILTER/ACTION 차감 대신 동적 측정.
  // 산업표준 패턴 (ref + onLayout) — FilterChips 등 sibling 추가/제거에 자동 정합.
  const [stackRect, setStackRect] = useState<LayoutRectangle | null>(null);

  const prevOverlayX = useSharedValue(-SCREEN_WIDTH);
  // 배치 G — 첫 카드 힌트 worklet 측 1회 게이트 (0=미발사, 1=발사됨).
  const firstCardHintGate = useSharedValue(0);
  // TutorialFlow step whitelist worklet 가드용 — pan.onEnd 안에서 React state
  // 직접 참조 불가 (worklet 컨텍스트). state(`tutorialStep`) 와 useEffect 동기화.
  // 인코딩: 0=null(비활성), 1=swipe_left, 2=swipe_right, 3=swipe_down, 4=tap.
  // pan.onEnd 가 step 별 허용/차단 결정에 참조. onUpdate 는 변경 없음 (drag 시각 따라옴
  // 유지) — onEnd 시점에서만 dismiss/prev 진행을 가드하여 사용자 자연 인지 보존.
  const tutorialStepSV = useSharedValue(0);
  // 사이클 2: pass dismiss worklet 곡선용 sharedValue.
  // 0 = idle, 음수값 = 좌측 dismiss 진행. SwipeCard 가 dragX 대신 이 값을 사용.
  const dismissX = useSharedValue(0);
  // 2026-05-20 snap-back fix — 현재 dismiss 진행 중인 카드의 tmdbId.
  // SwipeCard 에 `isDismissing` 으로 전달 → 해당 카드만 worklet 에서 dismissX 를 적용.
  // 새 top 카드는 isDismissing=false 라 dismissX 영향 0 → 옛/새 top 전이 시 한 프레임
  // 점프 (snap-back) 차단.
  const [dismissingTmdbId, setDismissingTmdbId] = useState<number | null>(null);
  // M-2: pass advance(topIdx++) 타이머 핸들. 시각 슬라이드(300ms)와 분리된
  // 360ms 콜백을 들고 있다가, 연속 스와이프 시 이전 타이머를 취소해 어긋남을 막는다.
  const passAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 2026-06-06 (P0 stack 겹침) — 직전 in-flight stream abort 용 controller.
  // load() 진입 시 이전 controller.abort() + 새 controller 발급 → 옛 stream 의
  // onCard 가 새 stack 에 끼어드는 race 차단. PWA `useRecommendations.ts:221, 461-462`
  // 정합. 자세한 메커니즘: `_workspace/02_p0_stack_overlap.md` §2.
  const loadAbortRef = useRef<AbortController | null>(null);
  // 언마운트 시 대기 중이던 advance 타이머 + in-flight stream 정리.
  useEffect(() => {
    return () => {
      if (passAdvanceTimer.current) {
        clearTimeout(passAdvanceTimer.current);
        passAdvanceTimer.current = null;
      }
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
    };
  }, []);

  // tutorialStep state → tutorialStepSV sharedValue 동기화 (worklet 가드용).
  // 인코딩: null=0, swipe_left=1, swipe_right=2, swipe_down=3, tap=4.
  useEffect(() => {
    if (tutorialStep === null) {
      tutorialStepSV.value = 0;
    } else if (tutorialStep === 'swipe_left') {
      tutorialStepSV.value = 1;
    } else if (tutorialStep === 'swipe_right') {
      tutorialStepSV.value = 2;
    } else if (tutorialStep === 'swipe_down') {
      tutorialStepSV.value = 3;
    } else if (tutorialStep === 'tap') {
      tutorialStepSV.value = 4;
    }
  }, [tutorialStep, tutorialStepSV]);
  const [prevActive, setPrevActive] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
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

  const load = useCallback(
    async (
      filter: RecommendFilter = {},
      opts?: { excludeIds?: number[] },
    ) => {
      // 2026-06-06 (P0 stack 겹침) — 새 stream 시작 전 atomic reset.
      // (1) 직전 in-flight stream abort → 옛 onCard 가 새 stack 에 끼어드는 race 차단.
      // (2) recs / topIdx / drag SharedValue 모두 reset → 옛 카드 잔재 0.
      // (3) prefetch cache invalidate → 옛 filter 의 prefetch 결과가 새 stack 뒤에
      //     재유입되는 보조 경로 차단 (`_workspace/02_p0_stack_overlap.md` §3).
      // PWA `useRecommendations.ts:454-462` 정합 패턴.
      loadAbortRef.current?.abort();
      const controller = new AbortController();
      loadAbortRef.current = controller;

      setRecs([]);
      setTopIdx(0);
      setPrevActive(false);
      setDismissingTmdbId(null);
      setDragX(0);
      setDragY(0);
      dismissX.value = 0;
      prevOverlayX.value = -SCREEN_WIDTH;
      invalidatePrefetchCache();

      setState('loading');
      setErrorMsg(null);
      try {
        const saved = await getSaved();
        const favorites = saved.map((s) => s.recommendation.title).slice(0, 20);
        // 2026-06-06 (P1 다양성) — excludeIds 확장.
        // 기존: 호출자가 넘긴 현재 stack tmdbId (보통 10~50개) 만 dedup.
        // 변경: 호출자 excludeIds + recHistory 100건 (FIFO) + saved 전체 합집합.
        // 효과: 앱 재시작 직후 신규 stack 에도 이전 노출 작품 자동 제외 →
        //       overlap 85~92% → 15~30% 예상 (`_workspace/02_p1_diversity.md` §4.1).
        // PWA 의 `getSeenTitles + savedTitles` 200건 전송과 동등 효과.
        // route.ts:74 가 300개 캡 처리 — 합쳐도 안전.
        const history = await getRecHistory();
        const baseExcludeIds = opts?.excludeIds ?? [];
        const excludeIds = Array.from(
          new Set<number>([
            ...baseExcludeIds,
            ...history.map((h) => h.tmdbId),
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

        // 2026-05-18 — streaming 적용 (web 정합). 첫 카드 도착 시 'ready' 전환.
        // 미지원 환경 (Hermes fetch.body 미지원) 은 lib/api 가 자동 폴백 → 동일 onCard 시퀀스.
        const collected: Recommendation[] = [];
        let firstSeen = false;
        let streamError: Error | null = null;

        await fetchRecommendationsStreaming(
          {
            filter,
            favorites,
            savedCount: saved.length,
            excludeIds,
            ...v2.body,
          },
          {
            onCard: (rec) => {
              // 2026-06-06 (P0 stack 겹침) — 직전 stream 의 onCard 가 abort 후에도
              // 한두 frame 늦게 도착할 수 있어 ref 일치 가드. controller 가
              // 본 호출의 ref 와 같지 않으면 옛 호출 → 새 stack 에 안 끼임.
              if (loadAbortRef.current !== controller) return;
              collected.push(rec);
              if (!firstSeen) {
                firstSeen = true;
                setRecs([...collected]);
                setTopIdx(0);
                setState('ready');
              } else {
                setRecs([...collected]);
              }
            },
            onError: (err) => {
              streamError = err;
            },
          },
          controller.signal,
        );

        // abort 후 도착한 응답은 silent return — 옛 호출이 새 호출 state 를 덮어쓰면 안 됨.
        if (controller.signal.aborted) return;

        if (!firstSeen) {
          // streaming 동안 카드 0건 — error 또는 빈 응답. error 우선, 아니면 non-streaming 폴백.
          if (streamError) throw streamError;
          const data = await fetchRecommendations({
            filter,
            favorites,
            savedCount: saved.length,
            excludeIds,
            ...v2.body,
          }, controller.signal);
          if (controller.signal.aborted) return;
          setRecs(data);
          setTopIdx(0);
          setState('ready');
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
    // dismissX / prevOverlayX 는 SharedValue ref 이므로 stable. 의존성 0 유지.
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
        const saved = await getSaved();
        const favorites = saved.map((s) => s.recommendation.title).slice(0, 20);
        // 2026-06-06 (P1 다양성) — excludeIds 확장 (load() 와 동일 합집합).
        // 현재 stack + recHistory 100 + saved 합쳐 prefetch 결과의 다양성도 보강.
        const history = await getRecHistory();
        const excludeIds = Array.from(
          new Set<number>([
            ...recs.map((r) => r.tmdbId),
            ...history.map((h) => h.tmdbId),
            ...saved.map((s) => s.recommendation.tmdbId),
          ]),
        );
        // P0-2 V2 입력 — 동일 flag/prefs 기준으로 prefetch 도 일관 유지.
        const prefs = await getAccountPrefs();
        const v2 = computeV2Inputs({
          // 2026-05-22 — flag 분기 제거 (default ON). ONBOARDING_V2 와 동일 패턴.
          tasteGenresEnabled: true,
          ottWeakSignalEnabled: true,
          tasteGenres: prefs.tasteGenres,
          subscribedOtt: prefs.subscribedOtt,
        });
        await prefetchRecommendations({
          filter,
          favorites,
          savedCount: saved.length,
          excludeIds,
          ...v2.body,
        });
        // prefetch 완료 후 캐시에서 소비해 stack 끝에 누적
        const cached = consumePrefetchedRecommendations(
          filter,
          favorites,
          saved.length,
        );
        if (cached && cached.length > 0) {
          setRecs((prev) => {
            const existing = new Set(prev.map((r) => r.tmdbId));
            const unique = cached.filter((r) => !existing.has(r.tmdbId));
            if (unique.length === 0) return prev;
            return [...prev, ...unique];
          });
        }
      } catch {
        // 백그라운드는 silent — 사용자 UX 영향 없음
      }
    },
    [recs],
  );

  useEffect(() => {
    // W5 Task A — onboarding 가드 통과 전에는 추천 fetch 보류.
    // pending 상태에서 호출하면 anon 사용자에게 cold-start 추천이 먼저 캐싱돼서
    // onboarding 완료 후 첫 카드가 onboarding 결과를 반영하지 못한다.
    if (onboardCheck !== 'pass') return;
    load();
  }, [load, onboardCheck]);

  // W5 Task B — TutorialFlow v3 노출 정책.
  // onboarding 가드 통과 후 1회만 AsyncStorage 점검. flag 가 없으면 eligible=true.
  useEffect(() => {
    if (onboardCheck !== 'pass') return;
    let cancelled = false;
    hasSeenTutorialV3().then((seen) => {
      if (cancelled) return;
      setTutorialEligible(!seen);
    });
    return () => {
      cancelled = true;
    };
  }, [onboardCheck]);

  // 첫 카드 로드 완료 → tutorialActive=true. eligible=false 면 무시.
  // tutorialActive 가 의존성에서 빠진 이유: 자기 자신 트리거 방지 (web 정본과 동일).
  useEffect(() => {
    if (!tutorialEligible) return;
    if (state !== 'ready') return;
    if (recs.length === 0) return;
    if (tutorialActive) return;
    setTutorialActive(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialEligible, state, recs.length]);

  const handleTutorialClose = useCallback(
    (_reason: 'completed' | 'skipped', _payload: { stepsCompleted: number; atStep: TutorialStep }) => {
      void markTutorialV3Seen();
      setTutorialActive(false);
      setTutorialEligible(false);
      setTutorialStep(null);
    },
    [],
  );

  // #17 prefetch 트리거 — 남은 카드 3장 이하로 떨어지면 다음 배치 백그라운드 로드
  // (web 의 page.tsx line 297 패턴: remaining <= 10 — native 는 stack depth 가 작으므로 3 으로 단축)
  useEffect(() => {
    if (state !== 'ready' || recs.length === 0) return;
    const remaining = recs.length - topIdx;
    if (remaining > 3) return;
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

    load(toApiFilter(nextType, nextOrigin, nextYear, nextRating, nextOtts), {
      excludeIds: recs.map((r) => r.tmdbId),
    });
  }

  useFocusEffect(
    useCallback(() => {
      getSaved().then((items) => {
        setSavedIds(new Set(items.map((s) => s.recommendation.tmdbId)));
      });
    }, []),
  );

  // rating 클라이언트 사이드 필터 — web `apps/web/src/app/discover/page.tsx:141` 정합.
  // recs 자체는 그대로 두고 표시/swipe 단계에서만 자른다 (서버 재호출 X).
  const filteredRecs = filterRating === 'all'
    ? recs
    : recs.filter((r) => r.rating >= parseFloat(filterRating));
  const currentRec = filteredRecs[topIdx];
  const prevRec = topIdx > 0 ? filteredRecs[topIdx - 1] : null;

  /**
   * 사이클 2 통일 매핑 (web `vibrate(...)` 와 인지 강도 정합):
   *   - light  : pass(left swipe), tap, rewind/refresh — web vibrate('light')=8ms
   *   - medium : save 흡수, prev card 진입             — web vibrate('medium')=14ms
   *   - heavy  : 오류 (현재 미사용)                    — web vibrate('heavy')=24ms
   */
  function hapticLight() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
  function hapticMedium() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }

  function toNext() {
    hapticLight();
    setTopIdx((i) => Math.min(i + 1, recs.length));
  }

  /**
   * 2026-05-20 snap-back fix — dismiss 시각 곡선 / advance / shared value 시작점 재설계.
   *
   * 기존 결함:
   *   advancePassIndex 가 `setTopIdx` 와 `dismissX.value = 0` 을 같은 JS task 에서
   *   호출했다. React commit 메시지와 dismissX 메시지가 UI 스레드 큐에 따로 도착하면서:
   *     - dismissX=0 이 먼저 도착하면 옛 top 카드가 한 프레임 중앙(0)으로 snap →
   *       "깜빡임" 으로 인지.
   *     - React commit 이 먼저 도착하면 새 top 카드가 한 프레임 -SCREEN_WIDTH 위치
   *       (=화면 밖) 로 렌더링 → 옆에서 들어오는 듯한 깜빡임.
   *
   * 새 구조:
   *   - `dismissingTmdbId` state 로 현재 dismiss 중인 카드 식별. SwipeCard 의
   *     `isDismissing` 게이트로 해당 카드만 worklet 에서 dismissX 사용. 새 top 은
   *     `isDismissing=false` 라 dismissX 영향 받지 않음 — UI 메시지 순서와 무관.
   *   - `dismissX.value` 시작점을 `사용자 마지막 dragX` 로 잡고, withTiming 보간 시작은
   *     `useEffect`(dismissingTmdbId 변경 감지) 에 위임. React commit 후 보간 시작이라
   *     옛 top 카드의 prop 갱신 후 시각 보간 시작 → 점프 0.
   *   - advancePassIndex 는 더 이상 dismissX 를 리셋하지 않는다. 새 top 은
   *     isDismissing=false 라 dismissX 값(예: -SCREEN_WIDTH)을 무시하므로 안전.
   *
   * 정량 유지: 시각 슬라이드 PASS_DISMISS_SLIDE_MS=300, advance PASS_DISMISS_MS=360,
   *           easings.spring (미세 오버슈트 30%, PWA cubic-bezier 와 동일 곡선).
   */
  function advancePassIndex() {
    setTopIdx((i) => Math.min(i + 1, recs.length));
    setDismissingTmdbId(null);
    passAdvanceTimer.current = null;
    // dismissX.value 리셋 안 함 — 새 top 은 isDismissing=false 라 영향 0.
  }
  function dismissThenNext() {
    if (!recs[topIdx]) return;
    // 2026-06-06 (P1 애니메이션 Fix C) — 빠른 연속 스와이프 시 직전 보간 1 frame 잔존 차단.
    // 진단: `_workspace/02_p1_animation.md` §4.4 (cancelAnimation 호출 0건).
    // withTiming 은 같은 SharedValue 재할당 시 자동 cancel 되지만 effect 의존성
    // race (`§4.2`) 가 있으면 한 frame 늦을 수 있음. 명시 cancel 로 frame 보장.
    // Reanimated 4 정식 패턴 — 무한 worklet cleanup 패턴과 충돌 없음.
    cancelAnimation(dismissX);
    cancelAnimation(prevOverlayX);
    // 사이클 2 통일 매핑: pass = light
    hapticLight();
    const lastDragX = dragX; // 사용자가 손가락 뗀 마지막 위치 — dismissX 시작점.
    setIsDragging(false);
    setDragX(0);
    setDragY(0);
    // 연속 스와이프 안전: 직전 pass 의 advance 타이머가 아직 살아 있으면 즉시 소진.
    // (대기 중이던 advance 를 누락 없이 먼저 처리 → 카드/인덱스 어긋남 방지)
    let activeIdx = topIdx;
    if (passAdvanceTimer.current) {
      clearTimeout(passAdvanceTimer.current);
      passAdvanceTimer.current = null;
      advancePassIndex();
      // closure 의 topIdx 는 옛값 — advance 후 실제 새 top index 는 +1.
      activeIdx = topIdx + 1;
    }
    const cur = recs[activeIdx];
    if (!cur) return;
    // dismissX 시작점을 사용자 마지막 위치로 둔다 — useEffect 가 commit 후
    // withTiming 보간을 시작하므로 옛 top 카드의 prop 이 isDismissing=true 로
    // 바뀐 직후 lastDragX → -SCREEN_WIDTH 보간이 자연스럽게 이어진다.
    dismissX.value = lastDragX;
    setDismissingTmdbId(cur.tmdbId);
  }

  /**
   * dismiss 보간 + advance 타이머 구동 effect.
   * dismissingTmdbId 가 non-null 로 바뀌면 카드 dismiss 시각 슬라이드(300ms)와
   * 360ms 후 advance 콜백을 시작. dependency 변경 시 cleanup 으로 타이머 취소 →
   * 연속 스와이프 안전.
   */
  useEffect(() => {
    if (dismissingTmdbId === null) return;
    dismissX.value = withTiming(-SCREEN_WIDTH, {
      duration: PASS_DISMISS_SLIDE_MS,
      easing: PASS_DISMISS_BEZIER,
    });
    passAdvanceTimer.current = setTimeout(() => {
      advancePassIndex();
    }, PASS_DISMISS_MS);
    return () => {
      if (passAdvanceTimer.current) {
        clearTimeout(passAdvanceTimer.current);
        passAdvanceTimer.current = null;
      }
    };
    // advancePassIndex 는 stable setter 만 호출 — dismissingTmdbId 변화에만 반응해야 함.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissingTmdbId]);

  function toPrev() {
    // 사이클 2 통일 매핑: prev card 진입 = medium (web vibrate('medium')=14ms 와 정합)
    hapticMedium();
    setTopIdx((i) => Math.max(i - 1, 0));
    // W5 Task B — TutorialFlow v3: 우 스와이프(prev overlay) 신호 emit.
    // rewind 버튼은 setTopIdx(0) 으로 직접 호출하므로 본 카운터에 안 잡힘 (web 정본 정합).
    setRightSwipeCount((c) => c + 1);
  }

  /**
   * 2026-05-20 prev overlay 도착 단일 commit fix.
   *
   * 기존 결함: worklet 콜백에서 `runOnJS(toPrev)` + `runOnJS(setPrevActive)` 를 두 번
   * 따로 호출. 각 runOnJS 는 별개 JS task → React 18 batched update 밖이라 두 번의
   * 별개 commit 발생.
   *   - commit 1: topIdx 변경 → 새 top SwipeCard mount + 옛 top depth=1 전환.
   *               PrevCardOverlay 는 여전히 mounted (zIndex 100 으로 위에 깔림).
   *   - commit 2: prevActive=false → PrevCardOverlay unmount → 새 top 노출.
   * 두 commit 사이 한 프레임 갭 + 옛 top 의 depth withTiming 첫 step 이 backstage 에서
   * 진행되어, PrevCardOverlay 사라지는 순간 옛 top 이 이미 작아져 있는 게 살짝 보임 →
   * "미세한 깜빡임" 인지.
   *
   * 새 구조: 두 setState 를 단일 JS 함수에서 호출 → React 18 auto-batched → 단일 commit.
   * PWA `useSwipeGesture.ts:189-199` 의 `setTimeout(setTopIdx + setPrevOverlayX(null), 300)`
   * 단일 task 패턴과 정합.
   */
  function handlePrevArrival() {
    toPrev();
    setPrevActive(false);
  }

  /**
   * Stage 4 D1: save 흡수 모션 트리거. (swipe-stack.jsx 패턴)
   *  - save 버튼 좌표 measure → 카드 흡수 목표점
   *  - flash 600ms / 흡수 480ms 동기화
   *  - 480ms 후 다음 카드로 advance
   *  - 이미 저장된 상태면 unsave 만 (흡수 모션 없음, flash 만)
   */
  async function triggerSaveAbsorption(reason: 'swipe_down' | 'button') {
    if (!currentRec || saveAbsorbing) return;
    const id = currentRec.tmdbId;
    const alreadySaved = savedIds.has(id);

    // save 버튼 좌표 measure (네이티브 절대 좌표)
    if (saveBtnRef.current) {
      saveBtnRef.current.measureInWindow((x, y, w, h) => {
        setSaveTargetPoint({ x: x + w / 2, y: y + h / 2 });
      });
    }

    // 사이클 2 통일 매핑: save 액션 = medium (web vibrate('medium')=14ms 와 정합)
    hapticMedium();

    if (alreadySaved) {
      // unsave: 흡수 모션 없음
      const nowSaved = await toggleSaved(currentRec);
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (nowSaved) next.add(id);
        else next.delete(id);
        return next;
      });
      track('card_unsaved', { tmdb_id: id });
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 600);
      return;
    }

    track('card_saved', { tmdb_id: id, title: currentRec.title, source: reason });
    // W5 Task B — TutorialFlow v3: save 신호 emit (swipe_down / button 둘 다).
    // unsave 는 카운트 X — web 정본 정합.
    setSaveActionCount((c) => c + 1);
    const nowSaved = await toggleSaved(currentRec);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (nowSaved) next.add(id);
      else next.delete(id);
      return next;
    });
    setSaveAbsorbing(true);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 600);
    setTimeout(() => {
      setSaveAbsorbing(false);
      setSaveTargetPoint(null);
      setTopIdx((i) => Math.min(i + 1, recs.length));
      setDragX(0);
      setDragY(0);
    }, SAVE_ABSORB_MS);
  }

  async function toggleLike() {
    triggerSaveAbsorption('button');
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
    const filter = toApiFilter(filterType, filterOrigin, filterYear, filterRating, filterOTTs);
    // 2026-05-28 — 새로고침 시 현재 stack tmdbId 들을 dedup 시드로 전달.
    // 사용자 보고: "새로고침 후 같은 작품이 또 나옴". excludeIds 미전송이
    // 결정적 원인 (`_workspace/22_refresh_dedup_analysis.md`).
    load(filter, { excludeIds: recs.map((r) => r.tmdbId) });
  }

  // Stage 4 D1 / G1-A (Handoff v2 Phase B+C): 탭 = DetailSheet 단일 진입.
  // 8px / 300ms 미만 = 탭 → DetailSheet. ↑ 스와이프 진입은 제거됨.
  // 탭 source 는 PostHog 매핑 일관 — "card_tap".
  function handleCardTap() {
    // TutorialFlow swipe 단계 (swipe_left/right/down) 중 탭은 silent ignore.
    // DetailSheet open 차단 + detailOpenCount 증가 차단 (step 'tap' 진행 트리거 방지).
    // 'tap' 단계에서만 탭 허용. 비활성 (tutorialStep===null) 이면 정상 동작.
    if (tutorialActive && tutorialStep !== null && tutorialStep !== 'tap') {
      return;
    }
    if (currentRec) {
      track('detail_opened', {
        tmdb_id: currentRec.tmdbId,
        title: currentRec.title,
        providers_count: currentRec.providers.length,
        source: 'card_tap',
      });
    }
    setDetailOpen(true);
    // W5 Task B — TutorialFlow v3: Detail 진입 신호 emit.
    setDetailOpenCount((c) => c + 1);
  }

  const tap = Gesture.Tap()
    .maxDuration(300)
    .maxDistance(8)
    .onStart(() => {
      runOnJS(handleCardTap)();
    });

  function handleSwipeDown() {
    if (currentRec) {
      track('card_swiped', {
        direction: 'down',
        tmdb_id: currentRec.tmdbId,
        title: currentRec.title,
      });
    }
    void triggerSaveAbsorption('swipe_down');
  }

  function handleSwipeLeft() {
    if (currentRec) {
      track('card_swiped', {
        direction: 'left',
        tmdb_id: currentRec.tmdbId,
        title: currentRec.title,
      });
    }
    // W5 Task B — TutorialFlow v3: 좌 스와이프 신호 emit.
    setLeftSwipeCount((c) => c + 1);
    dismissThenNext();
  }

  // 배치 G — 첫 카드 힌트. 첫 카드(topIdx===0)에서 우 드래그 시 1회 toast.
  // web `useSwipeGesture.ts:131-133` 의 setFirstCardHint(true) 정합.
  // 튜토리얼이 떠 있는 동안엔 발사하지 않음 (TutorialFlow 가 이미 안내 중 — 중복 회피).
  function showFirstCardHint() {
    if (firstCardHintShownRef.current) return;
    if (tutorialActive) return;
    firstCardHintShownRef.current = true;
    toast.show('info', { ctx: { message: '첫 번째 작품이에요' }, duration: 1800 });
  }

  const pan = Gesture.Pan()
    .onBegin(() => {
      runOnJS(setIsDragging)(true);
    })
    .onUpdate((e) => {
      // Stage 4 D1: dominant axis 락 (|dx|>|dy| 면 horizontal, 아니면 vertical)
      const absX = Math.abs(e.translationX);
      const absY = Math.abs(e.translationY);

      // TutorialFlow step whitelist — drag 자체 차단 (옵션 A 완전 잠금).
      // 인코딩: 0=비활성, 1=swipe_left, 2=swipe_right, 3=swipe_down, 4=tap.
      // 가이드된 방향 외 swipe 는 dragX/Y/prevOverlayX 변화 차단 → 카드 안 따라옴.
      const tStep = tutorialStepSV.value;
      if (tStep !== 0) {
        // tap (4) 단계: 모든 swipe 차단.
        if (tStep === 4) return;
        if (absX > absY) {
          // horizontal: 우 swipe(prev) → 2, 좌 swipe(next) → 1.
          if (e.translationX > 0 && prevRec) {
            if (tStep !== 2) return;
          } else {
            if (tStep !== 1) return;
          }
        } else {
          // vertical (down): 3.
          if (tStep !== 3) return;
        }
      }

      if (absX > absY) {
        // horizontal
        if (e.translationX > 0 && prevRec) {
          runOnJS(setPrevActive)(true);
          prevOverlayX.value = -SCREEN_WIDTH + e.translationX;
          runOnJS(setDragX)(0);
          runOnJS(setDragY)(0);
        } else {
          runOnJS(setPrevActive)(false);
          runOnJS(setDragX)(e.translationX);
          runOnJS(setDragY)(0);
          // 배치 G — 첫 카드(prevRec 없음 = topIdx 0) 우 드래그 30px+ → 힌트.
          // web `useSwipeGesture.ts:133` 의 `dx > 30` 임계 정합. firstCardHintGate
          // shared value 로 worklet 측 1회 게이트 — runOnJS 다발 호출 방지.
          // (showFirstCardHint 의 ref 가드가 JS 측 멱등성도 별도 보장.)
          if (
            !prevRec &&
            e.translationX > 30 &&
            firstCardHintGate.value === 0
          ) {
            firstCardHintGate.value = 1;
            runOnJS(showFirstCardHint)();
          }
        }
      } else {
        // vertical — G1-A: ↑ 추적 제거. 아래 방향 (save) 만 dragY 로 추적.
        runOnJS(setPrevActive)(false);
        runOnJS(setDragX)(0);
        runOnJS(setDragY)(e.translationY > 0 ? Math.min(140, e.translationY) : 0);
      }
    })
    .onEnd((e) => {
      runOnJS(setIsDragging)(false);
      const absX = Math.abs(e.translationX);
      const absY = Math.abs(e.translationY);
      const horizontal = absX > absY;

      // 03_p0-2 — velocity boost (한손 thumb flick 인식). 좌·우·아래 공통.
      // 좌: velocityX < -800 + translationX < -30 → trigger
      // 우: velocityX >  800 + translationX >  30 → trigger
      // 아래: velocityY > 800 + translationY > 30 → trigger
      // 거리 임계 (SWIPE_THRESHOLD / PREV_OVERLAY_TRIGGER) 도달 시는 종전대로.
      const fastFlickX = Math.abs(e.velocityX) > VELOCITY_THRESHOLD;
      const fastFlickY = Math.abs(e.velocityY) > VELOCITY_THRESHOLD;

      // TutorialFlow step whitelist 가드.
      // 인코딩: 0=비활성, 1=swipe_left, 2=swipe_right, 3=swipe_down, 4=tap.
      // 가이드된 방향 외 swipe 는 silent ignore — dismiss/prev 진행을 차단하고
      // dragX/dragY 리셋 (snap-back 시각 유지). onUpdate 의 drag 추적 자체는 정상 동작.
      const tStep = tutorialStepSV.value;
      if (tStep !== 0) {
        // 'tap' 단계 (4): 모든 swipe 차단. 탭은 별도 Gesture.Tap 으로 통과.
        if (tStep === 4) {
          // prev overlay 진행 중이면 snap-back (revert) — 시각 복귀.
          if (e.translationX > 0 && prevRec) {
            prevOverlayX.value = withTiming(
              -SCREEN_WIDTH,
              { duration: 300, easing: Easing.bezier(...easings.enter) },
              () => {
                runOnJS(setPrevActive)(false);
              },
            );
          }
          runOnJS(setDragX)(0);
          runOnJS(setDragY)(0);
          return;
        }
        if (horizontal) {
          // 우 swipe (prev overlay) — swipe_right (2) 만 허용.
          if (e.translationX > 0 && prevRec) {
            if (tStep !== 2) {
              // revert (snap-back). drag tracking 은 onUpdate 가 이미 추적했으므로
              // overlay 만 원위치로 시각 복귀.
              prevOverlayX.value = withTiming(
                -SCREEN_WIDTH,
                { duration: 300, easing: Easing.bezier(...easings.enter) },
                () => {
                  runOnJS(setPrevActive)(false);
                },
              );
              runOnJS(setDragX)(0);
              runOnJS(setDragY)(0);
              return;
            }
          } else {
            // 좌 swipe (next/dismiss) — swipe_left (1) 만 허용.
            if (tStep !== 1) {
              runOnJS(setDragX)(0);
              runOnJS(setDragY)(0);
              return;
            }
          }
        } else {
          // 아래 swipe (save) — swipe_down (3) 만 허용.
          if (tStep !== 3) {
            runOnJS(setDragX)(0);
            runOnJS(setDragY)(0);
            return;
          }
        }
      }

      if (horizontal) {
        if (e.translationX > 0 && prevRec) {
          const progress = 1 + prevOverlayX.value / SCREEN_WIDTH;
          const velocityTrigger =
            fastFlickX &&
            e.velocityX > 0 &&
            e.translationX > VELOCITY_TRIGGER_DISTANCE;
          if (progress > PREV_OVERLAY_TRIGGER || velocityTrigger) {
            // 2026-05-20 PWA 정합 — prev overlay 도착 시 깜빡임 fix.
            // 기존: withTiming(0, 220) → 콜백에서 `prevOverlayX = -SCREEN_WIDTH` 즉시
            // 점프 + setTopIdx + setPrevActive(false). UI 메시지 순서 때문에 overlay 가
            // 한 프레임 -SCREEN_WIDTH 로 튀고 그 사이 옛 top 카드가 노출 → 깜빡임.
            // PWA `useSwipeGesture.ts:189` 정합: `setPrevOverlayX(0)` (CSS transition
            // 으로 도착) + `setTimeout(setTopIdx + setPrevOverlayX(null), 300)` —
            // overlay 가 0 위치에서 그대로 unmount, 동시에 새 top SwipeCard 가 0
            // 위치에서 mount → 시각 100% 연속.
            // 곡선/duration 도 PWA `transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)`
            // (easings.enter) 으로 정합.
            prevOverlayX.value = withTiming(
              0,
              { duration: 300, easing: Easing.bezier(...easings.enter) },
              () => {
                // 단일 runOnJS → handlePrevArrival 안에서 setTopIdx + setPrevActive(false)
                // 동시 호출 → React 18 batched single commit. (두 runOnJS 분할 시 두 번의
                // commit 발생 → 한 프레임 갭 → 미세 깜빡임.)
                // -SCREEN_WIDTH 점프 제거 — overlay 는 0 위치에서 React unmount.
                // 다음 prev swipe 시작 시 onUpdate 가 -SCREEN_WIDTH+dx 로 갱신.
                runOnJS(handlePrevArrival)();
              },
            );
          } else {
            // revert — duration/곡선 PWA 정합.
            prevOverlayX.value = withTiming(
              -SCREEN_WIDTH,
              { duration: 300, easing: Easing.bezier(...easings.enter) },
              () => {
                runOnJS(setPrevActive)(false);
              },
            );
          }
        } else {
          // 좌 (next) — 거리 임계 OR velocity 보조.
          const leftVelocityTrigger =
            fastFlickX &&
            e.velocityX < 0 &&
            e.translationX < -VELOCITY_TRIGGER_DISTANCE;
          if (e.translationX < -SWIPE_THRESHOLD || leftVelocityTrigger) {
            runOnJS(handleSwipeLeft)();
          }
          runOnJS(setDragX)(0);
          runOnJS(setDragY)(0);
        }
      } else {
        // vertical — G1-A (Handoff v2 Phase B+C): ↑ 진입 제거.
        // 아래 (save) 만 처리. 위 방향 변위는 무시 → snap-back.
        // 아래 (save) — 거리 임계 OR velocity 보조.
        const downVelocityTrigger =
          fastFlickY &&
          e.velocityY > 0 &&
          e.translationY > VELOCITY_TRIGGER_DISTANCE;
        if (e.translationY > SWIPE_THRESHOLD || downVelocityTrigger) {
          runOnJS(handleSwipeDown)();
        }
        runOnJS(setDragX)(0);
        runOnJS(setDragY)(0);
      }
    });

  const cardsToShow = filteredRecs.slice(topIdx, topIdx + 3);
  const isLiked = currentRec ? savedIds.has(currentRec.tmdbId) : false;
  const exhausted = state === 'ready' && cardsToShow.length === 0;

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
        onSearchOpen={() => {
          // 위임 O #1.2 — 검색 버튼으로 진입 시 initialQuery 비움 (잔해 제거).
          // WARN-A (2026-05-19 재검증) — search_opened track 추가. Saved/Profile
          // 의 search 버튼은 이미 호출 중 — 3탭 search 진입 지표 정합.
          track('search_opened');
          setSearchInitialQuery('');
          setSearchOpen(true);
        }}
      />

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
      />

      <View
        style={styles.stackWrap}
        onLayout={(e) => setStackRect(e.nativeEvent.layout)}
      >
        {state === 'loading' && (
          <View
            style={styles.centered}
            accessibilityLiveRegion="polite"
            accessibilityLabel="추천을 준비하고 있어요"
          >
            <ApertureBreathLoader size={72} message="추천을 준비하고 있어요" />
          </View>
        )}

        {state === 'error' && (
          <View style={styles.centered}>
            <Text style={styles.errorTitle}>요청이 실패했어요</Text>
            <Text style={styles.errorDetail}>{errorMsg}</Text>
            <Pressable
              style={styles.resetBtn}
              onPress={() => load(undefined, { excludeIds: recs.map((r) => r.tmdbId) })}
            >
              <Text style={styles.resetText}>다시 시도</Text>
            </Pressable>
          </View>
        )}

        {state === 'ready' && !exhausted && (
          <GestureDetector gesture={Gesture.Exclusive(tap, pan)}>
            <Animated.View style={styles.stack}>
              {/* 2026-05-20 prev overlay 통합 — PrevCardOverlay 별도 컴포넌트 폐기.
                  prev card 를 stack render 의 마지막(=가장 위)에 prepend 해서
                  SwipeCard 의 isPrev 모드로 표시. 도착 시 setTopIdx(i-1) 로
                  cardsToShow 가 prev 카드를 흡수 → React key 기반 reconcile 로
                  *동일 인스턴스*가 isPrev=true → false 로 prop 만 변경.
                  native view 보존 → BlurView/shadow/image 안정화 유지 → 깜빡임 0. */}
              {(() => {
                const renderOrder = [
                  ...cardsToShow.slice().reverse(),
                  ...(prevActive && prevRec ? [prevRec] : []),
                ];
                return renderOrder.map((rec, i) => {
                  const isPrev =
                    !!(prevActive && prevRec) && i === renderOrder.length - 1;
                  const depth = isPrev ? 0 : cardsToShow.length - 1 - i;
                  const isTop = !isPrev && depth === 0;
                  return (
                    <SwipeCard
                      key={rec.tmdbId}
                      rec={rec}
                      isTop={isTop}
                      depth={depth}
                      dragX={isTop ? dragX : 0}
                      dragY={isTop ? dragY : 0}
                      isDragging={isDragging}
                      immersive={isTop && immersive}
                      absorbing={isTop && saveAbsorbing}
                      saveTargetPoint={saveTargetPoint}
                      // 사이클 2: top 카드만 worklet dismiss 곡선을 받음
                      dismissX={isTop ? dismissX : undefined}
                      // 2026-05-20 snap-back fix — dismiss 진행 중인 카드만 worklet
                      // 에서 dismissX 적용. 새 top 은 false → dismissX 영향 0.
                      isDismissing={rec.tmdbId === dismissingTmdbId}
                      // 2026-05-20 prev overlay 통합
                      isPrev={isPrev}
                      prevOverlayX={isPrev ? prevOverlayX : undefined}
                    />
                  );
                });
              })()}
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
      <View style={styles.actionBarSlot}>
        {state === 'ready' && currentRec && (
          <ActionBar
            ref={saveBtnRef}
            isSaved={isLiked}
            canRewind={topIdx > 0}
            saveFlash={saveFlash}
            savePulling={dragY > 30 && isDragging}
            onRewind={() => setTopIdx(0)}
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
              // W5 Task B — TutorialFlow v3: Detail 진입 신호 emit (ActionBar 경로).
              setDetailOpenCount((c) => c + 1);
            }}
            onRefresh={handleRefresh}
            onToggleSave={toggleLike}
          />
        )}
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

      {/* W5 Task B — TutorialFlow v3 (Discover 첫 진입 4단계 튜토리얼).
          마운트 조건: tutorialActive (state=ready + recs[0] 로드 후 1회) + recs[0] 존재.
          dim overlay 는 pointerEvents="box-none" — 사용자가 실제 카드를 만져야 진행. */}
      {tutorialActive && recs[0] && stackRect && (
        <TutorialFlow
          recForDemo={recs[0]}
          stackRect={stackRect}
          isDragging={isDragging}
          userActionSignals={{
            leftSwipeCount,
            rightSwipeCount,
            saveActionCount,
            detailOpenCount,
          }}
          onStepChange={setTutorialStep}
          onClose={handleTutorialClose}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  // 헤더는 DiscoverHeader 컴포넌트로 분리 (워드마크 + 페르소나 chip + search).
  stackWrap: { flex: 1 },
  // 항목 1 (증상 B) — ActionBar 고정 높이 slot. ready 여부와 무관하게 항상
  // ACTION_BAR_HEIGHT(64px) 점유 → stackWrap flex 재배분으로 인한 카드 점프 차단.
  // ActionBar 컴포넌트 자체 높이(saveBtn 56 + pb 8)도 64 라 slot 을 정확히 채운다.
  actionBarSlot: {
    height: ACTION_BAR_HEIGHT,
    justifyContent: 'flex-end',
  },
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
