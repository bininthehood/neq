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
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedReaction,
  runOnJS,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { router, useFocusEffect, usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { subscribedOttToFilterOTTs } from '@neq/core';
import SwipeCard from '../components/SwipeCard';
import SkeletonCard from '../components/SkeletonCard';
import FilterChips, { OTT_OPTIONS } from '../components/FilterChips';
import DiscoverHeader from '../components/DiscoverHeader';
import DetailSheet from '../components/DetailSheet';
import ActionBar, { ACTION_BAR_HEIGHT } from '../components/ActionBar';
import { IconArchive, IconRefresh, IconMoreVertical } from '../components/Icons';
import TutorialFlow, {
  type TutorialStep,
} from '../components/TutorialFlow';
import SearchSheet from '../components/SearchSheet';
import ApertureBreathLoader from '../components/feedback/ApertureBreathLoader';
import { buildSeededMixItems, mergeGenreQueueItems, mixLabelOf } from '../lib/mix-utils';
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
  RelatedWork,
  RelatedWorksResponse,
} from '../lib/types';
import { colors, spacing, radius, shadowsNative } from '../lib/tokens';
import { easings, durations, fontsV2 } from '@neq/design';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Stage 4 D1 (swipe-stack.jsx) / G1-A (Handoff v2 Phase B+C):
// THRESH=70, TAP=8/300ms — 좌(next)/우(prev overlay)/아래(save). ↑ 진입 제거 → 탭 단일 진입.
//
// 사이클 2 단일화: 콜백 타이밍은 `@neq/design` durations.swipeSaveDismiss / swipePassDismiss.
// (feedback_swipe_ux.md 잠금: save 480ms / pass 360ms)
const SWIPE_THRESHOLD = 70;
const PREV_OVERLAY_TRIGGER = 0.3;
// ponytail: 8s first-card 타임아웃, cold-start 감안. 잦은 오폴백이면 상향.
// release/Hermes 빌드에서 reader.read() 가 에러 없이 stall 하면 스트림 await 가
// 영영 안 끝나 SkeletonCard 영원 → 첫 카드 미도착 시 스트림 중단 + 비스트리밍 폴백.
const FIRST_CARD_TIMEOUT_MS = 8000;
// 03_p0-2 fix (한손 thumb flick 인식). 거리 임계는 그대로 유지 — 두 손 사용자의
// 의도 swipe 보수성 보존. velocity 보조만 추가: 빠른 flick 이면 짧은 변위로도 trigger.
// 좌/우/아래 모두 동일 패턴 적용 (좌·우는 velocityX, 아래는 velocityY).
// PWA useSwipeGesture 의 velocity 보조 (안 B 권고) 정합.
// 메모리 [Pan gesture offset 임계 충돌] 회피 — activeOffset/failOffset 도입 X.
const VELOCITY_THRESHOLD = 800; // px/s
const VELOCITY_TRIGGER_DISTANCE = 30; // px (임계 미달 시 최소 변위)
const SAVE_ABSORB_MS = durations.swipeSaveDismiss; // 480

// 2026-06-10 swipe anim 재설계 (`_workspace/07_redesign-spec-swipe-anim-2026-06-10.md`):
//   - PASS_DISMISS_MS / PASS_DISMISS_SLIDE_MS / PASS_DISMISS_BEZIER 폐기.
//   - dismissX SharedValue / dismissingTmdbId state / passAdvanceTimer ref 폐기.
//   - dismissThenNext / advancePassIndex 함수 폐기.
//   - handleSwipeLeft 단순화 — setTopIdx 즉시 + dragX withTiming(0).
//   - PWA `useSwipeGesture.ts:205-208` (dragX 비리셋 + nextCard) 1:1 포팅.
// 좌 swipe 시각/콜백 곡선은 SWIPE_LEFT_MS (300ms) + easings.spring 으로 통일.
const SWIPE_LEFT_MS = 300;
const SWIPE_LEFT_BEZIER = Easing.bezier(...easings.spring);
// ux-review WARN #3 — TutorialFlow snap-back 등 임계 미달 복귀는 durations.moderate(250) 미만
// 으로 더 빠른 200ms (인지 가벼움). easings.spring 곡선은 유지.
const SNAPBACK_MS = 200;

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
  // 2026-06-22 (게이트 0 first_card_p50 11.9s 대응) — 로딩 origin 분기.
  //   'refresh' = 사용자 새로고침 (handleRefresh) → ApertureBreathLoader 유지.
  //   'default' = 첫 진입 / 필터 변경 → SkeletonCard (빈 화면 대신 카드 윤곽).
  // PWA StatusScreens 의 origin 분기와 정합.
  const [loadOrigin, setLoadOrigin] = useState<'default' | 'refresh'>('default');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [topIdx, setTopIdx] = useState(0);
  // 2026-06-06 (P1 애니메이션 Fix B) — drag 추적 SharedValue 화.
  // 진단: `_workspace/02_p1_animation.md` §3 (root cause 2).
  //
  // 기존: useState. pan.onUpdate 가 매 frame `runOnJS(setDragX)` → React reconcile
  //   → SwipeCard re-render → worklet 재계산. 60Hz × 5~7 runOnJS/frame.
  // 변경: useSharedValue. worklet 안에서 `dragX.value = ...` 직접 update,
  //   SwipeCard 의 worklet 가 `dragX.value` 직접 read → UI thread 만으로 매 frame
  //   처리. runOnJS 호출은 commit 시점 (gesture end → action) 만 남는다.
  const dragX = useSharedValue(0);
  // Stage 4 D1: 위/아래 스와이프 변위
  const dragY = useSharedValue(0);
  // 2026-06-10 swipe anim 재설계 — zeroDragSV 폐기. 비탑 카드도 dragX 직접 전달
  // (PWA 정합: promote 시 SharedValue 연속성 보장).
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
  // 2026-06-10 swipe anim v3 — dismiss 모션 SharedValue 분리.
  // dragX 는 drag 추적 전용. 옛 top 의 slide-out (-300 → -SCREEN_W) 은 dismissX.
  // dismissCardIdSV 가 dismiss 진행 카드의 tmdbId 보유 (-1 = idle). worklet 안에서
  // tmdbId 매칭으로 옛 top 만 dismissX 적용 → 새 top / 비탑 영향 0.
  // SharedValue 라 React state isDismissing prop 의 commit 전이 race 없음.
  const dismissX = useSharedValue(0);
  const dismissCardIdSV = useSharedValue<number>(-1);
  // 배치 G — 첫 카드 힌트 worklet 측 1회 게이트 (0=미발사, 1=발사됨).
  const firstCardHintGate = useSharedValue(0);
  // 2026-07-10 — hold(long-press) 눌림 램프 + 가드 (게스처 정의는 아래 longPress).
  const holdSV = useSharedValue(0);
  const holdEnabledSV = useSharedValue(1);
  // TutorialFlow step whitelist worklet 가드용 — pan.onEnd 안에서 React state
  // 직접 참조 불가 (worklet 컨텍스트). state(`tutorialStep`) 와 useEffect 동기화.
  // 인코딩: 0=null(비활성), 1=swipe_left, 2=swipe_right, 3=swipe_down, 4=tap.
  // pan.onEnd 가 step 별 허용/차단 결정에 참조. onUpdate 는 변경 없음 (drag 시각 따라옴
  // 유지) — onEnd 시점에서만 dismiss/prev 진행을 가드하여 사용자 자연 인지 보존.
  const tutorialStepSV = useSharedValue(0);
  // 2026-06-10 swipe anim 재설계 v2 — PWA 정합 정정.
  // dismissX SharedValue / dismissingTmdbId state 는 폐기 유지 (race source).
  // passAdvanceTimer ref 복원 — PWA `discover/page.tsx:215-224` 의 nextCard 패턴
  // (setDragX(-600) 으로 옛 top 슬라이드 아웃 + setTimeout 360ms 안에 setTopIdx+setDragX(0))
  // 정합. dragX 단일 SharedValue 로 옛 top 의 slide-out 모션 표현.
  const passAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  // 언마운트 시 in-flight stream + 진행 중인 passAdvance 타이머 정리.
  useEffect(() => {
    return () => {
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
      mixFetchAbortRef.current?.abort();
      mixFetchAbortRef.current = null;
      if (passAdvanceTimer.current) {
        clearTimeout(passAdvanceTimer.current);
        passAdvanceTimer.current = null;
      }
    };
  }, []);

  // 2026-06-06 (P1 애니메이션 Fix B) — savePulling boolean throttle.
  // ActionBar 의 savePulling prop 은 `dragY > 30 && isDragging` 인데 dragY 가
  // SharedValue 화되며 React state 가 아니게 됨. UI 측에서 30 임계를 넘나드는
  // 순간에만 React state 를 토글하여 ActionBar re-render 빈도 = 0~2회/제스처.
  // runOnJS 호출 빈도 = 매 frame → 임계 traverse 시점만 으로 ~30배 감소.
  const [savePulling, setSavePulling] = useState(false);
  useAnimatedReaction(
    () => dragY.value > 30,
    (over, prev) => {
      if (over !== prev) runOnJS(setSavePulling)(over);
    },
  );

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

  // 2026-06-10 swipe anim v3 — dismissCardIdSV 안전 리셋.
  // topIdx 변경 시 (좌 swipe advance / prev / 기타 진입) React commit + paint 후
  // 본 effect 발화. 그 시점에 옛 top 은 이미 unmount → 옛 top 의 worklet 평가
  // 트리거 없음. 새 top 은 tmdbId 매칭 안 됨이라 dismissCardIdSV 변경 영향 0.
  // 옛 top 이 prev 로 cardsToShow 에 재진입한 경우에도 worklet 의 isDismissing
  // 가드가 false 가 되어 dismissX 무시 → 정상 위치 등장.
  useEffect(() => {
    if (dismissCardIdSV.value !== -1) {
      dismissCardIdSV.value = -1;
    }
    // 2026-07-10 — hold 램프 하드 리셋 (top 전환 시 잔존 방어 — onFinalize 이중 안전망).
    holdSV.value = 0;
    // 2026-07-08 Seeded Mix 2차 — mix 덱 advance (mixTopIdx) 도 동일 리셋 경로.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topIdx, mixTopIdx]);

  const [prevActive, setPrevActive] = useState(false);
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
        setPrevActive(false);
        dragX.value = 0;
        dragY.value = 0;
        prevOverlayX.value = -SCREEN_WIDTH;
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
    // prevOverlayX / dragX / dragY 는 SharedValue ref 이므로 stable. 의존성 0 유지.
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
    // W5 Task A — onboarding 가드 통과 전에는 추천 fetch 보류.
    // pending 상태에서 호출하면 anon 사용자에게 cold-start 추천이 먼저 캐싱돼서
    // onboarding 완료 후 첫 카드가 onboarding 결과를 반영하지 못한다.
    if (onboardCheck !== 'pass') return;
    load();
  }, [load, onboardCheck]);

  // 2026-06-11 (build 24 hotfix) — persona switch / create 후 자동 reload.
  // 사용자 보고: Profile 에서 새 취향 생성 후 Discover 진입 시 추천이 새 취향으로 재계산 X.
  // 원인: 위 mount useEffect 는 1회만 실행, useFocusEffect 는 saved 만 refresh.
  // → activePersonaId 변화 감지 useEffect 로 명시적 reload 트리거.
  // sentinel ref 첫 값 null = mount 초기화 (mount useEffect 가 처리), 그 후 변경만 감지.
  const prevActivePersonaIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (onboardCheck !== 'pass') return;
    if (prevActivePersonaIdRef.current === null) {
      prevActivePersonaIdRef.current = persona.activePersonaId;
      return;
    }
    if (persona.activePersonaId !== prevActivePersonaIdRef.current) {
      prevActivePersonaIdRef.current = persona.activePersonaId;
      load();
    }
  }, [persona.activePersonaId, load, onboardCheck]);

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
  const filteredRecs = filterRating === 'all'
    ? recs
    : recs.filter((r) => r.rating >= parseFloat(filterRating));
  // 2026-07-08 Seeded Mix 2차 — mix 모드 시 덱 스왑. currentRec/prevRec/cardsToShow
  // 가 전부 이 파생값을 따르므로 제스처/DetailSheet/save 등 기존 인터랙션이 mix 덱
  // 에서도 동일 동작. rating 클라이언트 필터는 일반 덱 전용 (mix 는 후보 12 이하).
  const activeDeck = inMix ? mixDeck : filteredRecs;
  const activeTopIdx = inMix ? mixTopIdx : topIdx;
  const currentRec = activeDeck[activeTopIdx];
  const prevRec = activeTopIdx > 0 ? activeDeck[activeTopIdx - 1] : null;

  /** mix 모드 인지 top advance — 일반/믹스 덱 각자의 topIdx 만 이동. */
  function advanceTop() {
    if (inMix) setMixTopIdx((i) => Math.min(i + 1, mixDeck.length));
    else setTopIdx((i) => Math.min(i + 1, recs.length));
  }

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
    advanceTop();
  }

  /**
   * 2026-06-10 swipe anim v3 — dismiss 모션 SharedValue 분리.
   *
   * v2 결함 (사용자 피드백 "넘긴 작품이 1회 깜빡임"):
   *   - v2: dragX 를 -SCREEN_W 로 보간 후 360ms 시점에 dragX=0 즉시 리셋.
   *   - 그 시점에 옛 top 이 아직 cardsToShow 에 있고 isTop=true → worklet 재평가
   *     → tx = dragX = 0 → 옛 top 이 화면 밖에서 *중앙으로 점프* (한 프레임).
   *   - React commit 후 unmount 이지만 그 한 프레임 깜빡임이 인지됨.
   *
   * v3: dragX 와 dismissX 분리.
   *   - dragX: drag 추적 전용. 좌 swipe trigger 즉시 0 으로 리셋 (옛 top 영향 0 —
   *     아래 isDismissing 가드로 dragX 사용 안 함).
   *   - dismissX: 옛 top 의 slide-out 전용. -300 (사용자 마지막) → -SCREEN_W 보간.
   *   - dismissCardIdSV: SharedValue. 옛 top tmdbId 보유. worklet 안에서 tmdbId
   *     매칭으로 dismissX 적용 카드 식별. React state 가 아닌 SharedValue 라
   *     commit 전이 race 0.
   *   - advance 시점에 dismissX 리셋 안 함 (다음 swipe 가 덮어쓰기) → 옛 top 의
   *     중앙 점프 없음. dismissCardIdSV 도 setTopIdx 와 같이 -1 로 리셋.
   *
   * 새 top / 비탑 카드는 dismissCardIdSV 매칭 안 됨 → dragX 만 사용 → 옛 top
   * slide-out 진행과 무관하게 위치 0 유지 → 깜빡임 0.
   */
  function handleSwipeLeftAnim() {
    if (!activeDeck[activeTopIdx]) return;
    const curId = activeDeck[activeTopIdx].tmdbId;
    // 빠른 연속 swipe: 직전 보간/타이머 정리.
    cancelAnimation(dragX);
    cancelAnimation(dragY);
    cancelAnimation(dismissX);
    if (passAdvanceTimer.current) {
      clearTimeout(passAdvanceTimer.current);
      passAdvanceTimer.current = null;
    }
    hapticLight();
    setIsDragging(false);

    // Phase 1 — dismiss 모션 설정.
    // 1. dismissCardIdSV 에 옛 top tmdbId 기록 → 옛 top 의 worklet 이 isDismissing=true
    //    → dismissX 사용 시작.
    // 2. dismissX 시작점 = dragX.value (사용자 마지막 위치, 예: -300). 자연 연장.
    // 3. dismissX withTiming(-SCREEN_W). 옛 top 카드 화면 밖으로 슬라이드.
    // 4. dragX = 0 즉시. 옛 top 은 isDismissing 가드라 영향 0. 새 top / 비탑도 영향 0.
    dismissCardIdSV.value = curId;
    dismissX.value = dragX.value;
    dismissX.value = withTiming(-SCREEN_WIDTH, {
      duration: SWIPE_LEFT_MS,
      easing: SWIPE_LEFT_BEZIER,
    });
    dragX.value = 0;
    dragY.value = withTiming(0, {
      duration: SWIPE_LEFT_MS,
      easing: SWIPE_LEFT_BEZIER,
    });

    // Phase 2: 360ms 후 advance — setTopIdx 만 호출.
    //   dismissCardIdSV = -1 리셋은 본 함수 안에서 *직접 호출 금지*.
    //   직접 호출 시 UI thread 가 React commit 보다 먼저 message 처리 → 옛 top 의
    //   worklet 재평가 → isDismissing=false → tx=dragX=0 → 옛 top 이 화면 밖 →
    //   중앙으로 한 프레임 점프 → 사용자 인지 1회 깜빡임.
    //   대신 아래 useEffect(topIdx) 가 React commit + paint 후 발화 → 옛 top
    //   이미 unmount → 평가 트리거 없음 → 깜빡임 0.
    passAdvanceTimer.current = setTimeout(() => {
      advanceTop();
      passAdvanceTimer.current = null;
    }, 360);
  }

  function toPrev() {
    // 사이클 2 통일 매핑: prev card 진입 = medium (web vibrate('medium')=14ms 와 정합)
    hapticMedium();
    if (inMix) setMixTopIdx((i) => Math.max(i - 1, 0));
    else setTopIdx((i) => Math.max(i - 1, 0));
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
      advanceTop();
      dragX.value = 0;
      dragY.value = 0;
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

  // 2026-07-10 — hold(long-press) = 케밥 메뉴 열기 (사용자 피드백: hold 액션 +
  // active 효과). holdSV 는 hold 진행 램프 (top 카드 scale 시각 피드백, SwipeCard
  // worklet 소비 — 선언은 상단 SharedValue 클러스터). 큐/튜토리얼 중엔 비활성.
  useEffect(() => {
    holdEnabledSV.value = !inMix && !(tutorialActive && tutorialStep !== null) ? 1 : 0;
  }, [inMix, tutorialActive, tutorialStep, holdEnabledSV]);

  function handleHoldMenuOpen() {
    if (inMix) return; // 중첩 큐 금지 — 큐 중 hold 메뉴 없음 (케밥 버튼과 동일 규칙)
    handleCardMenuPress();
  }

  const longPress = Gesture.LongPress()
    .minDuration(450)
    .maxDistance(12)
    .onBegin(() => {
      'worklet';
      if (holdEnabledSV.value === 0) return;
      // hold 대기 동안 서서히 눌림 — minDuration 과 동일 시간으로 램프.
      holdSV.value = withTiming(1, { duration: 450 });
    })
    .onStart(() => {
      'worklet';
      holdSV.value = withTiming(0, { duration: 200 });
      runOnJS(handleHoldMenuOpen)();
    })
    .onFinalize(() => {
      'worklet';
      // 성공/실패 무관 무조건 리셋 — 탭이 Modal(DetailSheet) 을 열면 finalize 가
      // 늦거나 삼켜져 램프가 1 에 잔존하는 케이스 방어 (2026-07-10 시뮬 보고:
      // 다음 카드가 눌린 채 등장). 아래 topIdx effect 의 하드 리셋과 이중 안전망.
      holdSV.value = withTiming(0, { duration: 150 });
    });

  // 2026-07-08 — Seeded Mix 2차: 케밥 메뉴 → 믹스 시작 (덱 주입).
  // 케밥/메뉴는 GestureDetector 바깥 absolute overlay (1차 검증 구조) — tap 제스처
  // 선점/DetailSheet 오픈과 원천 분리.
  function handleCardMenuPress() {
    // 튜토리얼 진행 중엔 silent ignore — handleCardTap 의 step 가드와 정합.
    if (tutorialActive && tutorialStep !== null) return;
    if (!currentRec) return;
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
    if (tutorialActive && tutorialStep !== null) return;
    if (saveAbsorbing) return;
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
    if (passAdvanceTimer.current) {
      clearTimeout(passAdvanceTimer.current);
      passAdvanceTimer.current = null;
    }
    cancelAnimation(dragX);
    cancelAnimation(dragY);
    dragX.value = 0;
    dragY.value = 0;
    prevOverlayX.value = -SCREEN_WIDTH;
    setPrevActive(false);
    setIsDragging(false);

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
    if (passAdvanceTimer.current) {
      clearTimeout(passAdvanceTimer.current);
      passAdvanceTimer.current = null;
    }
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
    prevOverlayX.value = -SCREEN_WIDTH;
    setPrevActive(false);
    setIsDragging(false);
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
    // 2026-06-11 사용자 피드백 #4 — 빠른 연속 swipe race fix.
    // 진단: 직전 swipe 의 passAdvanceTimer (360ms) 미처리 동안 새 swipe trigger
    // 시 topIdx 가 아직 advance 안 됨 → `recs[topIdx]` = 옛 작품 → dismissCardIdSV
    // 가 같은 tmdbId 로 재할당 → 같은 작품 반복 dismiss → 사용자 인지 "같은 작품
    // 계속 넘기는 현상".
    // 수정: PWA `useSwipeGesture.onTouchStart:106` 의 `if (swiping) return;` 정합.
    // passAdvanceTimer 살아있으면 새 swipe 무시 + drag 위치 snap-back. 360ms 마다
    // 1 swipe 처리 → 빠른 연속 swipe 시 일부 swipe 무시되지만 PWA 와 인지 동등.
    if (passAdvanceTimer.current) {
      dragX.value = withTiming(0, { duration: SNAPBACK_MS, easing: SWIPE_LEFT_BEZIER });
      dragY.value = withTiming(0, { duration: SNAPBACK_MS, easing: SWIPE_LEFT_BEZIER });
      return;
    }
    if (currentRec) {
      track('card_swiped', {
        direction: 'left',
        tmdb_id: currentRec.tmdbId,
        title: currentRec.title,
      });
    }
    // W5 Task B — TutorialFlow v3: 좌 스와이프 신호 emit.
    setLeftSwipeCount((c) => c + 1);
    handleSwipeLeftAnim();
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

      // 2026-06-06 (P1 애니메이션 Fix B) — dragX/dragY 를 worklet 안에서 직접
      // SharedValue 로 업데이트. 매 frame `runOnJS(setDragX)` JS thread 왕복 제거.
      // setPrevActive 만 React state 라 runOnJS 잔존 (state transition 1~2회/제스처).
      if (absX > absY) {
        // horizontal
        if (e.translationX > 0 && prevRec) {
          runOnJS(setPrevActive)(true);
          prevOverlayX.value = -SCREEN_WIDTH + e.translationX;
          dragX.value = 0;
          dragY.value = 0;
        } else {
          runOnJS(setPrevActive)(false);
          dragX.value = e.translationX;
          dragY.value = 0;
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
        dragX.value = 0;
        dragY.value = e.translationY > 0 ? Math.min(140, e.translationY) : 0;
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
          dragX.value = 0;
          dragY.value = 0;
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
              dragX.value = 0;
              dragY.value = 0;
              return;
            }
          } else {
            // 좌 swipe (next/dismiss) — swipe_left (1) 만 허용.
            if (tStep !== 1) {
              dragX.value = 0;
              dragY.value = 0;
              return;
            }
          }
        } else {
          // 아래 swipe (save) — swipe_down (3) 만 허용.
          if (tStep !== 3) {
            dragX.value = 0;
            dragY.value = 0;
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
            // 2026-06-10 swipe anim 재설계 — handleSwipeLeft 가 setTopIdx + dragX
            // withTiming(0) 을 직접 처리. dragX 리셋 X — 옛/새 top 보간 연속성 유지.
            runOnJS(handleSwipeLeft)();
            // dragY 도 handleSwipeLeftAnim 안에서 withTiming(0) 처리.
          } else {
            // 임계 미달 snap-back — withTiming 으로 부드러운 복귀 (ux-review WARN #3:
            // 200ms < durations.moderate=250). 즉시 0 점프 회피.
            dragX.value = withTiming(0, { duration: SNAPBACK_MS, easing: SWIPE_LEFT_BEZIER });
            dragY.value = withTiming(0, { duration: SNAPBACK_MS, easing: SWIPE_LEFT_BEZIER });
          }
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
          // triggerSaveAbsorption 내부에서 흡수 모션 종료 시 dragX/dragY 리셋.
          dragX.value = 0;
          dragY.value = 0;
        } else {
          // 임계 미달 snap-back — withTiming 으로 부드러운 복귀.
          dragX.value = withTiming(0, { duration: SNAPBACK_MS, easing: SWIPE_LEFT_BEZIER });
          dragY.value = withTiming(0, { duration: SNAPBACK_MS, easing: SWIPE_LEFT_BEZIER });
        }
      }
    });

  const cardsToShow = activeDeck.slice(activeTopIdx, activeTopIdx + 3);
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
        onSearchOpen={() => {
          // 위임 O #1.2 — 검색 버튼으로 진입 시 initialQuery 비움 (잔해 제거).
          // WARN-A (2026-05-19 재검증) — search_opened track 추가. Saved/Profile
          // 의 search 버튼은 이미 호출 중 — 3탭 search 진입 지표 정합.
          track('search_opened');
          setSearchInitialQuery('');
          setSearchOpen(true);
        }}
      />

      {/* 2026-07-08 Seeded Mix 2차 — 큐 중엔 FilterChips 대신 큐 바.
          필터는 일반 덱 전용 (큐 덱은 후보 12 이하 고정 셋이라 서버 필터 무의미).
          3차 업스케일 — seed 미니 포스터(작품 큐만) + display 위계 라벨 + 진행 카운트.
          테마 큐는 포스터 생략 + 테마 title (seed 작품 비노출 정책 — 2차 확정 유지). */}
      {inMix && mixSeed ? (
        <View style={styles.mixBar} testID="mix-bar">
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
          <Pressable
            style={styles.mixBarRelease}
            onPress={handleMixRelease}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="큐 종료"
            testID="mix-release"
          >
            <Text style={styles.mixBarReleaseText}>종료</Text>
          </Pressable>
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

      <View
        style={styles.stackWrap}
        onLayout={(e) => setStackRect(e.nativeEvent.layout)}
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
                <Pressable
                  style={styles.ghostBtn}
                  onPress={() => load(undefined, { excludeIds: recs.map((r) => r.tmdbId) })}
                >
                  <Text style={styles.ghostBtnText}>다시 시도</Text>
                </Pressable>
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

        {(state === 'ready' || inMix) && cardsToShow.length > 0 && (
          // 2026-07-10 — longPress 는 Simultaneous 병행: tap(≤300ms)/pan(이동)과
          // 시간·거리 조건이 자연 배타라 우선순위 대기 없이 공존.
          <GestureDetector gesture={Gesture.Simultaneous(Gesture.Exclusive(tap, pan), longPress)}>
            <Animated.View style={[styles.stack, inMix && styles.mixStackInset]}>
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
                      // 2026-06-10 swipe anim 재설계 — 비탑 카드도 dragX 전달.
                      // worklet 안 `tx = isTop ? dragX.value : 0` 이 isTop=false 분기에서
                      // 0 처리. 다만 좌 swipe trigger 시 새 top (이전 depth=1) 이 promote
                      // 되며 React key 보존 → 같은 SwipeCard 인스턴스의 isTop prop 이
                      // false→true 로 바뀜. 그 순간 dragX SharedValue 가 이미 -300 →
                      // 새 top worklet 이 -300 위치에서 0 으로 슬라이드 보간 (PWA 정합).
                      // 따라서 비탑도 dragX 를 받아야 promote 시 SharedValue 연속성 보장.
                      dragX={dragX}
                      dragY={dragY}
                      isDragging={isDragging}
                      immersive={isTop && immersive}
                      absorbing={isTop && saveAbsorbing}
                      saveTargetPoint={saveTargetPoint}
                      // 2026-05-20 prev overlay 통합
                      isPrev={isPrev}
                      prevOverlayX={isPrev ? prevOverlayX : undefined}
                      // 2026-06-10 swipe anim v3 — dismiss 모션 분리.
                      // 모든 카드에 dismissX + dismissCardIdSV 전달. worklet 안에서
                      // tmdbId 매칭으로 옛 top 만 dismissX 적용 → 새 top / 비탑 영향 0.
                      dismissX={dismissX}
                      dismissCardIdSV={dismissCardIdSV}
                      // 2026-07-10 — hold 눌림 램프 (top 카드만 worklet 에서 반영).
                      holdSV={holdSV}
                    />
                  );
                });
              })()}
            </Animated.View>
          </GestureDetector>
        )}

        {/* 2026-06-06 (Tier 3 단기 incident 해소) — EmptyState UI 페기.
            무한 스크롤 의도 (사용자 명시 "EmptyState 화면 자체가 없어야"). 빈 응답
            시점은 위 fallback loader 가 처리. Tier 3 Phase A~D 완료 후 본 영역
            재설계 가능 (`_workspace/07_refactor-master-plan-2026-06-06.md`). */}

        {/* 2026-07-08 Seeded Mix 2차 — 카드 케밥(⋮) 메뉴. GestureDetector 바깥 sibling
            absolute overlay (1차 검증 구조) — top 카드 우측상단(RatingChip 아래) 정렬.
            Pressable 이 터치를 소비하므로 tap 제스처(DetailSheet 진입)와 원천 분리.
            currentRec(=top 카드) 기준 단일 렌더라 뒤 카드/EmptyState 노출 자체가 없음.
            믹스 중엔 숨김 (중첩 믹스는 후속 과제). */}
        {state === 'ready' && cardsToShow.length > 0 && !inMix && (
          <Pressable
            style={styles.cardMenuBtn}
            onPress={handleCardMenuPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="카드 메뉴"
            testID="card-menu-button"
          >
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
            </View>
          </>
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
        {/* 2026-07-08 Seeded Mix 2차 — mix 덱에서도 ActionBar 동작 (save/share/detail).
            rewind 는 활성 덱 처음으로, refresh 는 믹스 해제 후 일반 새로고침. */}
        {(state === 'ready' || inMix) && currentRec && (
          <ActionBar
            ref={saveBtnRef}
            isSaved={isLiked}
            canRewind={activeTopIdx > 0}
            saveFlash={saveFlash}
            savePulling={savePulling && isDragging}
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
              // W5 Task B — TutorialFlow v3: Detail 진입 신호 emit (ActionBar 경로).
              setDetailOpenCount((c) => c + 1);
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
  // 3차 — 케밥(⋮) 버튼. DetailSheet topNavBtn 정본 계열 (44×44 원형, surfaceRaised).
  // top 14 = 카드 내부 상단 인셋 — SwipeCard topRow(minHeight 44 center) 필 2개와
  // 수직 중심 정렬. right 26 = 카드 인셋 12 + 내부 14.
  cardMenuBtn: {
    position: 'absolute',
    top: 14,
    right: 26,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
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
    top: 66,
    right: 26,
    minWidth: 180,
    maxWidth: 260,
    padding: spacing.sm + 4,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    ...shadowsNative.dropdown,
  },
  cardMenuItem: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  cardMenuItemPressed: {
    backgroundColor: colors.overlayLight,
  },
  cardMenuItemText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '400',
  },
  // 큐 바 — FilterChips 자리 대체. 4차: 인셋 8 (아웃라인 프레임과 동일) + 상단
  // radius 20 (카드 16 + 옵셋 4 정합). accentDim 솔리드 캡은 유지 — 아래 아웃라인과
  // 합쳐 "하이라이트 컨테이너" 로 읽힘 (amber 1건 예산 내).
  mixBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    marginHorizontal: 8,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.accentDim,
  },
  // 큐 하이라이트 플레이트 — 아웃라인 폐기 (4차-2 피드백: 선이 조악) → 솔리드
  // 컨테이너 복귀 + 카드가 4px 패딩으로 안에 앉는 구조. 플레이트 인셋 8 vs 카드
  // 인셋 12(좌우)/8(하단, 플레이트 bottom 4) + stack marginTop 4 = 사방 4px 패딩.
  // 하단은 bottom 4 에서 끝나 하트 버튼과 안 겹침. radius 20 = 카드 16 + 패딩 4.
  mixFrame: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 0,
    bottom: 4,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    backgroundColor: colors.accentDim,
  },
  // 큐 중 카드 스택 상단 4px 내림 — 큐 바와 카드 사이에도 패딩 밴드 노출.
  mixStackInset: {
    marginTop: 4,
  },
  // seed 미니 포스터 (작품 큐만) — 2:3 비율 28×42, 카드 radius 계열 sm.
  mixBarPoster: {
    width: 28,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  mixBarLabelGroup: {
    flex: 1,
    gap: 1,
  },
  // display 폰트 위계 업스케일 (구 15/700 body → 17 display).
  mixBarTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontFamily: fontsV2.display,
    fontWeight: '500',
    letterSpacing: -0.34,
  },
  // 진행 카운트 — 데이터 위계 (Geist Mono, textMuted).
  mixBarCount: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fontsV2.data,
    letterSpacing: 0.2,
  },
  // Ghost variant — 배경 투명 + 보더 (DESIGN.md §Buttons).
  mixBarRelease: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  mixBarReleaseText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '500',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  loadingText: { color: colors.textMuted, fontSize: 14, marginTop: spacing.sm },
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
    fontWeight: '500',
    textAlign: 'center',
  },
  emptyHint: {
    color: colors.textMuted,
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
  // Ghost variant — 배경 투명, 보더 only (DESIGN.md §Buttons Ghost 정합).
  ghostBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: 999,
  },
  ghostBtnText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '500',
  },
});
