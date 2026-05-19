import { useCallback, useEffect, useRef, useState } from 'react';
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
  Easing,
} from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import SwipeCard from '../components/SwipeCard';
import PrevCardOverlay from '../components/PrevCardOverlay';
import FilterChips, { OTT_OPTIONS } from '../components/FilterChips';
import DiscoverHeader from '../components/DiscoverHeader';
import DetailSheet from '../components/DetailSheet';
import ActionBar from '../components/ActionBar';
import TutorialFlow, {
  type TutorialStep,
} from '../components/TutorialFlow';
import SearchSheet from '../components/SearchSheet';
import {
  fetchRecommendations,
  fetchRecommendationsStreaming,
  prefetchRecommendations,
  consumePrefetchedRecommendations,
} from '../lib/api';
import {
  getAccountPrefs,
  getSaved,
  hasOnboarded,
  hasSeenTutorialV3,
  markTutorialV3Seen,
  toggleSaved,
} from '../lib/store';
import { isOttWeakSignalEnabled, isTasteGenresEnabled } from '../lib/env';
import { computeV2Inputs } from '../lib/v2-input-utils';
import { track } from '../lib/analytics';
import { usePersona } from '../contexts/PersonaContext';
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
  const [onboardCheck, setOnboardCheck] = useState<'pending' | 'pass' | 'redirect'>(
    'pending',
  );
  useEffect(() => {
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
  }, []);

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
  const [leftSwipeCount, setLeftSwipeCount] = useState(0);
  const [rightSwipeCount, setRightSwipeCount] = useState(0);
  const [saveActionCount, setSaveActionCount] = useState(0);
  const [detailOpenCount, setDetailOpenCount] = useState(0);

  const prevOverlayX = useSharedValue(-SCREEN_WIDTH);
  // 사이클 2: pass dismiss worklet 곡선용 sharedValue.
  // 0 = idle, 음수값 = 좌측 dismiss 진행. SwipeCard 가 dragX 대신 이 값을 사용.
  const dismissX = useSharedValue(0);
  // M-2: pass advance(topIdx++) 타이머 핸들. 시각 슬라이드(300ms)와 분리된
  // 360ms 콜백을 들고 있다가, 연속 스와이프 시 이전 타이머를 취소해 어긋남을 막는다.
  const passAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 언마운트 시 대기 중이던 advance 타이머 정리 (setState-after-unmount 방지).
  useEffect(() => {
    return () => {
      if (passAdvanceTimer.current) {
        clearTimeout(passAdvanceTimer.current);
        passAdvanceTimer.current = null;
      }
    };
  }, []);
  const [prevActive, setPrevActive] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // 위임 O #1.2 — DetailSheet Cast 클릭 시 SearchSheet 진입용 initialQuery.
  // 빈 문자열 = 일반 검색 진입 (잔해 제거). 인물 이름 = Cast 클릭 진입.
  const [searchInitialQuery, setSearchInitialQuery] = useState('');
  const [immersive, setImmersive] = useState(false);

  const load = useCallback(
    async (filter: RecommendFilter = {}) => {
      setState('loading');
      setErrorMsg(null);
      try {
        const saved = await getSaved();
        const favorites = saved.map((s) => s.recommendation.title).slice(0, 20);
        // P0-2 Cold Start V2 입력 — flag ON + 값 있을 때만 body 에 포함.
        const prefs = await getAccountPrefs();
        const v2 = computeV2Inputs({
          tasteGenresEnabled: isTasteGenresEnabled(),
          ottWeakSignalEnabled: isOttWeakSignalEnabled(),
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
            ...v2.body,
          },
          {
            onCard: (rec) => {
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
        );

        if (!firstSeen) {
          // streaming 동안 카드 0건 — error 또는 빈 응답. error 우선, 아니면 non-streaming 폴백.
          if (streamError) throw streamError;
          const data = await fetchRecommendations({
            filter,
            favorites,
            savedCount: saved.length,
            ...v2.body,
          });
          setRecs(data);
          setTopIdx(0);
          setState('ready');
        }
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : '알 수 없는 오류');
        setState('error');
      }
    },
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
        // 현재 보여준 작품 ID 는 exclude 에 추가해 중복 회피
        const excludeIds = recs.map((r) => r.tmdbId);
        // P0-2 V2 입력 — 동일 flag/prefs 기준으로 prefetch 도 일관 유지.
        const prefs = await getAccountPrefs();
        const v2 = computeV2Inputs({
          tasteGenresEnabled: isTasteGenresEnabled(),
          ottWeakSignalEnabled: isOttWeakSignalEnabled(),
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

    load(toApiFilter(nextType, nextOrigin, nextYear, nextRating, nextOtts));
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
   * 사이클 2 worklet화 + M-2 정합 — pass dismiss 시각 곡선 / advance 분리.
   *
   * 기존 (JS state setter):
   *   setDragX(-SCREEN_WIDTH) 1회 호출 → React re-render → SwipeCard 의 useAnimatedStyle
   *   re-evaluate. 변위가 한 step 으로 점프하기 때문에 RN 측 자체 transition 이 없어
   *   사용자 인지에 "스냅" 처럼 느껴짐. qa-tester P1.
   *
   * M-2 정합 (native↔PWA audit P1):
   *   PWA pass 카드 = CSS `transition: transform 0.3s cubic-bezier(0.34,1.3,0.64,1)` →
   *   ① 300ms 동안 spring(미세 오버슈트) 곡선으로 화면 밖 슬라이드
   *   ② 그 뒤 360ms 시점에 topIdx 증가 (advance).
   *
   *   따라서 시각 슬라이드와 advance 를 분리한다:
   *     - 시각 슬라이드: `withTiming(-SCREEN_WIDTH, { duration: 300, easing: spring })`
   *       — UI 스레드 보간, 콜백 없음. 카드는 300ms 에 화면 밖(-SCREEN_WIDTH) 도달.
   *     - advance: 별도 360ms JS 타이머에서 `advancePassIndex()` + `dismissX = 0` 리셋.
   *       300~360ms 구간 동안 dismissX 는 -SCREEN_WIDTH 에 머물러 카드가 화면 밖에
   *       유지된다 (300ms 에 리셋하면 카드가 화면 안으로 튀어 들어옴). 360ms 에
   *       topIdx 가 +1 되는 *그 순간* dismissX 를 0 으로 — 새 top 카드가 정상 위치.
   *
   * 정량: 시각 슬라이드 PASS_DISMISS_SLIDE_MS=300, advance PASS_DISMISS_MS=360,
   *       easings.spring (미세 오버슈트 30%, PWA cubic-bezier 와 동일 곡선).
   */
  function advancePassIndex() {
    setTopIdx((i) => Math.min(i + 1, recs.length));
    // topIdx 가 바뀌는 것과 동시에 리셋 — 새 top 카드 위에서 dismissX 가 0 이어야
    // 정상 위치. 360ms 타이머에서만 호출되므로 300~360ms 구간엔 -SCREEN_WIDTH 유지.
    dismissX.value = 0;
    passAdvanceTimer.current = null;
  }
  function dismissThenNext() {
    if (!recs[topIdx]) return;
    // 사이클 2 통일 매핑: pass = light
    hapticLight();
    setIsDragging(false);
    setDragX(0);
    setDragY(0);
    // 연속 스와이프 안전: 직전 pass 의 advance 타이머가 아직 살아 있으면 즉시 소진.
    // (대기 중이던 advance 를 누락 없이 먼저 처리 → 카드/인덱스 어긋남 방지)
    if (passAdvanceTimer.current) {
      clearTimeout(passAdvanceTimer.current);
      passAdvanceTimer.current = null;
      advancePassIndex();
    }
    // ① 시각 슬라이드 — 300ms spring 곡선. UI 스레드 보간, 완료 콜백 없음.
    dismissX.value = withTiming(-SCREEN_WIDTH, {
      duration: PASS_DISMISS_SLIDE_MS,
      easing: PASS_DISMISS_BEZIER,
    });
    // ② advance — 360ms JS 타이머. topIdx++ 와 dismissX 리셋을 동시에.
    passAdvanceTimer.current = setTimeout(() => {
      advancePassIndex();
    }, PASS_DISMISS_MS);
  }

  function toPrev() {
    // 사이클 2 통일 매핑: prev card 진입 = medium (web vibrate('medium')=14ms 와 정합)
    hapticMedium();
    setTopIdx((i) => Math.max(i - 1, 0));
    // W5 Task B — TutorialFlow v3: 우 스와이프(prev overlay) 신호 emit.
    // rewind 버튼은 setTopIdx(0) 으로 직접 호출하므로 본 카운터에 안 잡힘 (web 정본 정합).
    setRightSwipeCount((c) => c + 1);
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
    load(filter);
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

  const pan = Gesture.Pan()
    .onBegin(() => {
      runOnJS(setIsDragging)(true);
    })
    .onUpdate((e) => {
      // Stage 4 D1: dominant axis 락 (|dx|>|dy| 면 horizontal, 아니면 vertical)
      const absX = Math.abs(e.translationX);
      const absY = Math.abs(e.translationY);
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

      if (horizontal) {
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
          if (e.translationX < -SWIPE_THRESHOLD) {
            runOnJS(handleSwipeLeft)();
          }
          runOnJS(setDragX)(0);
          runOnJS(setDragY)(0);
        }
      } else {
        // vertical — G1-A (Handoff v2 Phase B+C): ↑ 진입 제거.
        // 아래 (save) 만 처리. 위 방향 변위는 무시 → snap-back.
        if (e.translationY > SWIPE_THRESHOLD) {
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

  // W5 Task A — onboarding 가드 결정 전 / redirect 결정 시 빈 화면.
  // 첫 frame 깜빡임 방지 (Discover 의 첫 추천 요청도 시작되지 않음).
  if (onboardCheck !== 'pass') {
    return <SafeAreaView style={styles.container} edges={['top', 'bottom']} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
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

      <View style={styles.stackWrap}>
        {state === 'loading' && (
          <View
            style={styles.centered}
            accessibilityLiveRegion="polite"
            accessibilityLabel="추천을 준비하고 있어요"
          >
            <ActivityIndicator
              color={colors.accent}
              accessibilityLabel="추천 로딩 중"
            />
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
                  const isTop = depth === 0;
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

      <DetailSheet
        rec={currentRec ?? null}
        visible={detailOpen}
        onClose={() => setDetailOpen(false)}
        onSearchPerson={(name) => {
          // 위임 O #1.2 — Cast 클릭 → DetailSheet 닫고 SearchSheet 자동 검색.
          // 동선: DetailSheet 닫음 → initialQuery 세팅 → SearchSheet 오픈.
          // SearchSheet 의 visible 전이 effect 가 initialQuery 를 query 로 주입하고 검색.
          track('detail_to_search_person', { name, from: 'discover' });
          setDetailOpen(false);
          setSearchInitialQuery(name);
          setSearchOpen(true);
        }}
      />

      <SearchSheet
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        initialQuery={searchInitialQuery}
      />

      {/* W5 Task B — TutorialFlow v3 (Discover 첫 진입 4단계 튜토리얼).
          마운트 조건: tutorialActive (state=ready + recs[0] 로드 후 1회) + recs[0] 존재.
          dim overlay 는 pointerEvents="box-none" — 사용자가 실제 카드를 만져야 진행. */}
      {tutorialActive && recs[0] && (
        <TutorialFlow
          recForDemo={recs[0]}
          userActionSignals={{
            leftSwipeCount,
            rightSwipeCount,
            saveActionCount,
            detailOpenCount,
          }}
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
