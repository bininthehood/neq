import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Dimensions,
  Linking,
  Share,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { prefetchPosters } from '../lib/image-prefetch';
import { getRelatedCached, putRelatedCache } from '../lib/data-prefetch';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  IconClose,
  IconShare,
  IconSave,
  IconChevronLeft,
  IconChevronRight,
  IconMoreVertical,
} from './Icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withTiming,
  cancelAnimation,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import type {
  CastMember,
  Recommendation,
  RelatedWork,
  RelatedWorksResponse,
  SearchResult,
} from '../lib/types';
import { getOTTOpenCandidates, getOTTIcon, getPrimaryCountryName, getGenreLabels } from '@neq/core';
import { displayProviders } from '../lib/providers';
import { fonts, fontsV2, easings, durations } from '@neq/design';
import { colors, radius, spacing, shadowsNative } from '../lib/tokens';
import { track } from '../lib/analytics';
import { env } from '../lib/env';
import { isSaved, toggleSaved } from '../lib/store';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
// PR2 (2026-06-01) — 풀스크린 Modal 전환. swipe-down dismiss 임계는 화면 높이의 30%.
const CLOSE_THRESHOLD = SCREEN_HEIGHT * 0.25;
// Hero 440px 캡 + 화면 52% 동적 캡 (C3 명세). iPhone SE (667px) 에서 75% 점유 회피 →
// 440 vs 667*0.52=347 중 작은 값. 큰 화면은 440 고정, 소형은 화면 52%.
const HERO_HEIGHT = Math.min(440, Math.round(SCREEN_HEIGHT * 0.52));

/**
 * DetailSheet morph 모션 — Handoff v2 D3 + Phase C 정합.
 * web (`useDetailSheet`: DETAIL_ENTER_MS=450, DETAIL_EXIT_MS=350,
 * cubic-bezier(0.32, 0.72, 0.24, 1)) 와 정확 일치.
 *
 * 채택 결정 (frontend-builder, Phase C-3):
 *   - 옵션 A) spring damping/stiffness 튜닝으로 ~450ms 만들기 → 미세 오버슈트가 남아
 *     web 의 단방향 감속(0.32, 0.72, 0.24, 1)과 다른 인지를 줌. 기각.
 *   - 옵션 B) **Easing.bezier(0.32, 0.72, 0.24, 1) + withTiming(450/350)** → 채택.
 *     이유: 단일 소스(packages/design durations.detailEnter/Exit, easings.detailMorph) +
 *     web 과 인지 100% 정합 + 100ms+ 인지 차이 즉시 해소.
 */
const DETAIL_BEZIER = Easing.bezier(...easings.detailMorph);
const DETAIL_ENTER_MS = durations.detailEnter; // 450
const DETAIL_EXIT_MS = durations.detailExit;   // 350

/**
 * PR2 (2026-06-01) — mode 분기.
 * - 'detail' (default): in-app 진입 (Discover/Saved 카드 탭). 좌상단 X + 우상단 공유.
 *   sticky bottom CTA = ghost 공유 1개 (저장은 외부 ActionBar 가 담당).
 * - 'share': Universal Link 진입 (`/share/[id]`). 좌상단 X 만. sticky bottom CTA =
 *   amber "저장하기" + ghost "추천 더 보기" 2개. Cast 진입(onSearchPerson) 자동 비활성.
 */
type DetailMode = 'detail' | 'share';

interface Props {
  rec: Recommendation | null;
  visible: boolean;
  onClose: () => void;
  /**
   * 위임 O #1.2 — Cast 셀 클릭 시 호출. 부모(`apps/native/app/index.tsx`)는
   * 이 콜백을 받아 SearchSheet 를 열고 인물 이름을 자동 검색.
   * (web `apps/web/src/components/discover/DetailSheet.tsx` onSearchPerson prop 동등.)
   * 콜백 미지정 시 Cast 셀은 비클릭 View — 회귀 0.
   */
  onSearchPerson?: (name: string) => void;
  /**
   * PR2 — 'detail' (default) | 'share'. Share UL 진입은 'share' 로 마운트.
   */
  mode?: DetailMode;
  /**
   * 3차 (2026-07-08) — sticky CTA '큐 시작'. 현재 표시 중인 작품(관련작 history
   * 탐색 포함)을 seed 로 호출. 미지정 또는 share mode 면 버튼 미노출 —
   * 호스트(Discover 직접 시작 / Saved 브리지+router)가 이행 책임.
   */
  onStartMix?: (rec: Recommendation) => void;
}

function metaInfo(r: Recommendation): string {
  // PR2 — 국가 포함 (Share 패턴 흡수). getPrimaryCountryName 이 null 이면 join 에서 자동 제외.
  return [
    getPrimaryCountryName(r.country),
    r.date ? r.date.slice(0, 4) : null,
    r.runtime ? `${r.runtime}분` : null,
    r.seasons ? `시즌 ${r.seasons}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export default function DetailSheet({
  rec: initialRec,
  visible,
  onClose,
  onSearchPerson,
  mode = 'detail',
  onStartMix,
}: Props) {
  const insets = useSafeAreaInsets();
  // PR2 — translateY 는 swipe-down dismiss 변위. 평소 0, drag 중 양수.
  // Modal animationType="slide" 가 진입 자체 슬라이드 처리 → 시트 진입 변위는 OS 가 담당.
  const translateY = useSharedValue(0);
  const scrollRef = useRef<ScrollView>(null);
  // 2026-05-29 — 사용자 요청: detail sheet 스크롤 상단일 때만 swipe-down dismiss.
  // 스크롤 중간일 때는 일반 스크롤 유지. scrollY 추적 + pan gesture 조건 분기.
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  // 2026-06-15 (build 27) — DetailSheet history navigation.
  //
  // 기존: relatedRec 1개 슬롯 — 관련 작품 클릭 시 setRelatedRec(next) 로 교체.
  // 사용자가 여러 단계 깊이 들어가도 돌아갈 길 없었음 → 좌상단 ← / → 도입.
  //
  // history: 진입한 작품 순서대로 push. 항상 1개 이상 (외부 entry = [initialRec]).
  // currentIndex: 현재 표시 중인 history index. 0 ≤ idx < history.length.
  //
  // 동작:
  //   - 관련 작품 클릭 → history.slice(0, currentIndex+1) 로 forward 가지 잘라낸 후
  //     newRec push, currentIndex++ (브라우저 패턴).
  //   - ← / → → currentIndex ± 1, rec = history[next].
  //   - 외부 rec prop 변경 (initialRec 새 값) → history = [newRec], currentIndex = 0.
  //   - X 닫기 → useEffect 가 visible=false 받아 history reset.
  //
  // 표시되는 rec = history[currentIndex] ?? initialRec (history 빈 케이스 안전망).
  const [history, setHistory] = useState<Recommendation[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // 2026-07-12 — 닫힘 모션 2회 재생 근본 수정. swipe-down 은 pan 이 translateY 로
  // 퇴장 슬라이드를 이미 재생하므로, 이어지는 Modal slide 퇴장까지 겹치면 닫힘이
  // 두 번 보인다 (X 닫기는 translateY=0 이라 Modal slide 1회 = 정상). swipe 경로만
  // animationType 을 'none' 으로 내려 닫고, visible=false 처리 후 원복.
  const [instantExit, setInstantExit] = useState(false);
  const [hydratingRelated, setHydratingRelated] = useState(false);
  const rec = history[currentIndex] ?? initialRec;
  const canGoBack = currentIndex > 0;
  const canGoForward = currentIndex < history.length - 1;
  // 2026-06-15 (build 27 fix iteration) — QA MED 1: closure stale race 차단.
  // handleRelatedClick 가 hydrate await 동안 currentIndex 를 closure capture 함.
  // 사용자가 빠르게 2회 탭 시 (hydratingRelated 가드를 우회하는 이론적 race) 두 번째
  // 호출의 stale closure 가 잘못된 idx 로 truncate 할 위험 → ref 로 latest snapshot 유지.
  // setHistory 의 functional updater 안에서 currentIndexRef.current 를 참조하면
  // 첫 번째 setCurrentIndex 가 적용되지 않은 상태에서도 latest 값 보장.
  const currentIndexRef = useRef(0);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // 위임 O #1.3 (위임 P #3 동기화) — Cast 사진 lazy fetch.
  // mirror cache 경로 rec 은 castMembers 가 빈 배열 → 사진 안 보임.
  // sheet 가 visible 이고 rec 의 cast/director 정보가 있는데 *Member 는 비어있으면
  // /api/tmdb/credits 1회 호출해 사진 채움. 이미 *Member 가 있는 hydrate 경로는 fetch X.
  const [lazyDirectorMember, setLazyDirectorMember] = useState<CastMember | null>(null);
  const [lazyCastMembers, setLazyCastMembers] = useState<CastMember[]>([]);

  const [related, setRelated] = useState<RelatedWorksResponse | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);

  // GH-3 #7 — Synopsis 더보기/접기 (web 동기화).
  // 200자 이상이면 numberOfLines=5 로 클램프 + "더보기" 버튼.
  // rec 변경 시 자동 접힘.
  const SYNOPSIS_THRESHOLD = 200;
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  useEffect(() => {
    setSynopsisExpanded(false);
  }, [rec?.tmdbId]);

  // 4차 — 상단 케밥(⋮) 인메뉴 ('큐 시작'). 표시 작품 변경/시트 재오픈 시 잔재 제거.
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
  useEffect(() => {
    setDetailMenuOpen(false);
  }, [rec?.tmdbId, visible]);

  // 2026-06-10 (Phase C #4) — sticky CTA 저장 상태. mode 무관 (detail/share 양쪽 사용).
  // detail mode 에서 Saved 진입 후 unsave 도 같은 토글 경로로 동작 — sheet 내부에서
  // 저장/저장 해제 발견성 확보. PWA DetailSheet L222~277 정합.
  const [savedStatus, setSavedStatus] = useState(false);
  useEffect(() => {
    if (!visible || !rec?.tmdbId) {
      setSavedStatus(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const s = await isSaved(rec.tmdbId);
      if (!cancelled) setSavedStatus(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, rec?.tmdbId]);

  useEffect(() => {
    if (visible) {
      // PR2 — 풀스크린 Modal animationType="slide" 가 진입 슬라이드 처리. translateY 는 0 고정 (swipe-down dismiss 변위만).
      translateY.value = 0;
      // W5 Task C 7.1 — `detail_opened` 발사는 호출처가 담당.
    } else {
      // 2026-07-10 — 닫힘 시 translateY 리셋 금지 (닫힘 모션 2회 재생 회귀).
      // swipe-down 으로 SCREEN_HEIGHT 까지 보낸 직후 여기서 0 으로 되돌리면 Modal
      // 의 slide 퇴장 애니메이션이 아직 재생 중이라 시트가 복귀한 채 한 번 더
      // 내려가는 게 보인다. 리셋은 다음 open (visible=true 분기) 이 담당.
      // 2026-06-15 (build 27) — history 도 초기화. 다음 진입 시 clean state.
      setHistory([]);
      setCurrentIndex(0);
      setSubScreen(null);
      setRelated(null);
      // 2026-07-12 — swipe 닫힘의 animationType='none' 원복. 이 effect 는 dismiss
      // commit 이후에 돌므로 (native dismiss 는 이미 none 으로 발화) 다음 open 의
      // 진입 slide 는 온전히 유지된다. visible=true 분기에서 원복하면 present
      // commit 시점에 아직 'none' 이라 진입 슬라이드가 사라짐 — 여기가 유일한 지점.
      setInstantExit(false);
    }
    // Reanimated 4 Fabric crash 메모리 정합 — unmount 시 worklet cleanup.
    return () => {
      cancelAnimation(translateY);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, translateY]);

  // 2026-06-15 (build 27) — 외부 rec prop (initialRec) 변경 시 history reset.
  // 새 detail 진입 = clean state. visible 일 때만 실행 (닫힌 상태에서 prop 만
  // 바뀐 경우는 위 useEffect 가 이미 reset 처리).
  useEffect(() => {
    if (!visible || !initialRec) return;
    setHistory([initialRec]);
    setCurrentIndex(0);
    setSubScreen(null);
    // initialRec 의 tmdbId 가 바뀌면 새 entry 로 간주.
    // (같은 작품 재선택은 setHistory 이전과 같은 값이라 별 영향 없음.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialRec?.tmdbId]);

  // 위임 O #1.3 — Cast 사진 lazy fetch.
  // sheet 가 visible 이고 rec.castMembers 가 비어있으면 /api/tmdb/credits 1회 호출.
  // hydrate 경로 (관련작/검색) 는 이미 *Member 보유 → 호출 X (무거운 fetch 회피).
  useEffect(() => {
    if (!visible || !rec?.tmdbId) {
      setLazyDirectorMember(null);
      setLazyCastMembers([]);
      return;
    }
    const hasCastMembers = (rec.castMembers?.length ?? 0) > 0;
    const hasDirectorMember = rec.directorMember != null;
    const hasCastNames = rec.cast.length > 0;
    const hasDirectorName = rec.director != null;

    // 이미 *Member 다 있거나, 이름조차 없으면 fetch 불필요.
    if (hasCastMembers && hasDirectorMember) return;
    if (!hasCastNames && !hasDirectorName) return;

    let cancelled = false;
    const controller = new AbortController();
    // 2026-05-20 — variety 는 TMDB 에서 TV(series). movie 외 모두 series 로 매핑.
    const type = rec.type === 'movie' ? 'movie' : 'series';
    fetch(
      `${env.API_BASE_URL}/api/tmdb/credits?id=${rec.tmdbId}&type=${type}`,
      { signal: controller.signal },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (data: { directorMember: CastMember | null; castMembers: CastMember[] } | null) => {
          if (cancelled || !data) return;
          setLazyDirectorMember(data.directorMember);
          setLazyCastMembers(data.castMembers ?? []);
        },
      )
      .catch(() => {
        // abort or network error — 이름 fallback 유지
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [visible, rec?.tmdbId, rec?.type, rec?.castMembers, rec?.directorMember, rec?.director, rec?.cast]);

  // 관련 작품 fetch — 화면 rec 변경 시 마다.
  // 2026-06-04 (P0 fix) — mode='share' 분기는 fetch 자체 skip.
  // 사유: share 진입은 UL 단일 작품 표면. RelatedRow 탭 → setRelatedRec 으로 작품 교체 →
  // 앱 background → 같은 UL 재진입 시 원본 SHARE_TMDB_ID 무시 + 마지막 탭한 작품 노출 회귀.
  // sections 자체를 share mode 에서 숨기므로 (render 분기 참조) fetch 도 함께 차단 — 불필요한
  // 네트워크 호출 + relatedRec state 누설 방지.
  useEffect(() => {
    if (!visible || !rec?.tmdbId || mode === 'share') {
      setRelated(null);
      return;
    }
    let cancelled = false;
    // 2026-05-20 — variety 는 TMDB 에서 TV(series). movie 외 모두 series 로 매핑.
    const type = rec.type === 'movie' ? 'movie' : 'series';
    // 2026-07-10 — 선행 fetch 캐시 히트 시 즉시 렌더 (Discover dwell 선-fetch /
    // 재오픈 / history 복귀). related 실측 0.7~1.8s 스켈레톤 구간 제거.
    const cached = getRelatedCached(rec.tmdbId, type);
    if (cached) {
      setRelated(cached);
      setRelatedLoading(false);
      return;
    }
    setRelatedLoading(true);
    setRelated(null);
    fetch(`${env.API_BASE_URL}/api/tmdb/related?work_id=${rec.tmdbId}&type=${type}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: RelatedWorksResponse | null) => {
        if (cancelled) return;
        // 렌더 전에 포스터 캐시 적재 — 관련작 행 노출 시 팝인 방지 (2026-07-10)
        if (data) {
          putRelatedCache(rec.tmdbId, type, data);
          prefetchPosters(
            [
              ...(data.collection?.works ?? []),
              ...(data.recommendations ?? []),
              ...(data.directorWorks ?? []),
            ].map((w) => w.posterUrl),
            36,
          );
        }
        setRelated(
          data ?? { collection: null, recommendations: [], directorWorks: [], directorName: null },
        );
      })
      .catch(() => {
        if (cancelled) return;
        setRelated({ collection: null, recommendations: [], directorWorks: [], directorName: null });
      })
      .finally(() => {
        if (!cancelled) setRelatedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, rec?.tmdbId, rec?.type, mode]);

  const handleRelatedClick = useCallback(
    async (
      work: RelatedWork,
      source: 'collection' | 'director' | 'recommendations' | 'person-works',
    ) => {
      if (!rec) return;
      track('detail_related_clicked', {
        tmdb_id: rec.tmdbId,
        related_id: work.id,
        source,
        title: work.title,
      });
      setHydratingRelated(true);
      try {
        const t = work.mediaType === 'tv' ? 'series' : 'movie';
        const res = await fetch(
          `${env.API_BASE_URL}/api/tmdb/hydrate?id=${work.id}&type=${t}`,
        );
        if (res.ok) {
          const next: Recommendation = await res.json();
          // 2026-06-15 (build 27) — history stack push.
          // forward 가지 잘라낸 후 push, currentIndex++ (브라우저 패턴).
          // 이미 history 에 있는 작품 재진입도 새 entry — 사용자가 의식적으로
          // 다시 들어간 것이므로 동일 작품의 history 중복 push 허용.
          //
          // 2026-06-15 (build 27 fix iteration) — QA MED 1: closure stale race 차단.
          // currentIndex 대신 currentIndexRef.current 사용 (latest snapshot).
          // setCurrentIndex 도 ref 기반 next 값으로 명시 — 빠른 연속 탭 시 stale 방지.
          const latestIdx = currentIndexRef.current;
          setHistory((prev) => {
            const truncated = prev.slice(0, latestIdx + 1);
            return [...truncated, next];
          });
          const nextIdx = latestIdx + 1;
          currentIndexRef.current = nextIdx;
          setCurrentIndex(nextIdx);
          // 새 작품으로 교체했으니 본문 스크롤 위로
          scrollRef.current?.scrollTo({ y: 0, animated: false });
        }
      } catch {
        // hydrate 실패 — 무시
      } finally {
        setHydratingRelated(false);
      }
    },
    // 2026-06-15 (build 27 fix iteration) — QA MED 1: currentIndex 의존성 제거.
    // currentIndexRef 로 latest snapshot 보장 → useCallback 재생성 빈도도 낮춤.
    [rec],
  );

  // 2026-06-15 (build 27) — history ← / →.
  // 캐시된 Recommendation 객체 그대로 사용 (재fetch X). scroll 만 위로.
  const handleHistoryBack = useCallback(() => {
    if (!canGoBack) return;
    const fromIdx = currentIndex;
    const toIdx = currentIndex - 1;
    setCurrentIndex(toIdx);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    track('detail_history_back', {
      from_tmdb_id: history[fromIdx]?.tmdbId ?? null,
      to_tmdb_id: history[toIdx]?.tmdbId ?? null,
      stack_depth: history.length,
    });
  }, [canGoBack, currentIndex, history]);

  const handleHistoryForward = useCallback(() => {
    if (!canGoForward) return;
    const fromIdx = currentIndex;
    const toIdx = currentIndex + 1;
    setCurrentIndex(toIdx);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    track('detail_history_forward', {
      from_tmdb_id: history[fromIdx]?.tmdbId ?? null,
      to_tmdb_id: history[toIdx]?.tmdbId ?? null,
      stack_depth: history.length,
    });
  }, [canGoForward, currentIndex, history]);

  // 2026-06-15 (build 27) — Task C: 더보기 풀스크린 sub-screen.
  // RelatedRow 의 "더보기" 누름 → DetailSheet 위에 absolute fill list.
  // 작품 탭 시 dismiss → handleRelatedClick 로 history push 후 detail 표시.
  // ← 누름 → subScreen=null (DetailSheet 복귀).
  //
  // 2026-06-15 (build 27 iter3) — person-works variant 추가. cast (감독/배우) 탭 시
  // SearchSheet 전환 대신 DetailSheet 내부 sub-screen 으로 표시. Modal 전환 0회.
  // person-works variant 는 fetch 비동기 → loading/error state 보관.
  type SubScreen =
    | {
        type: 'collection' | 'director' | 'recommendations';
        works: RelatedWork[];
        title: string;
      }
    | {
        type: 'person-works';
        personId: number;
        personName: string;
        role: '감독' | '출연';
        works: RelatedWork[];
        loading: boolean;
        error: boolean;
        title: string;
      };
  const [subScreen, setSubScreen] = useState<SubScreen | null>(null);

  const openSubScreen = useCallback(
    (next: SubScreen) => {
      if (!rec) return;
      track('detail_related_more_opened', {
        tmdb_id: rec.tmdbId,
        source: next.type,
        count: next.works.length,
      });
      setSubScreen(next);
    },
    [rec],
  );

  // 2026-06-15 (build 27 iter3) — cast → person-works sub-screen 진입.
  // /api/tmdb/person-works?id=X&dept=Directing|Acting 호출. 응답 SearchResult[] → RelatedWork 매핑.
  // (SearchResult 는 RelatedWork 의 superset — rating 만 drop. 안전 변환.)
  const openPersonWorks = useCallback(
    async (person: { tmdbId: number; name: string; role: '감독' | '출연' }) => {
      if (!rec) return;
      const title =
        person.role === '감독'
          ? `${person.name} 감독의 작품`
          : `${person.name} 출연작`;
      track('detail_cast_works_opened', {
        tmdb_id: rec.tmdbId,
        person_id: person.tmdbId,
        role: person.role,
      });
      setSubScreen({
        type: 'person-works',
        personId: person.tmdbId,
        personName: person.name,
        role: person.role,
        works: [],
        loading: true,
        error: false,
        title,
      });
      try {
        const dept = person.role === '감독' ? 'Directing' : 'Acting';
        const res = await fetch(
          `${env.API_BASE_URL}/api/tmdb/person-works?id=${person.tmdbId}&dept=${dept}`,
        );
        if (!res.ok) throw new Error(`person-works ${res.status}`);
        const works = (await res.json()) as SearchResult[];
        const mapped: RelatedWork[] = (Array.isArray(works) ? works : []).map(
          (s) => ({
            id: s.id,
            title: s.title,
            posterUrl: s.posterUrl,
            year: s.year,
            mediaType: s.mediaType,
          }),
        );
        // 필모 풀스크린 렌더 전 포스터 캐시 적재 — 팝인 방지 (2026-07-10)
        prefetchPosters(mapped.map((w) => w.posterUrl), 36);
        setSubScreen((prev) =>
          prev && prev.type === 'person-works' && prev.personId === person.tmdbId
            ? { ...prev, works: mapped, loading: false, error: false }
            : prev,
        );
      } catch {
        setSubScreen((prev) =>
          prev && prev.type === 'person-works' && prev.personId === person.tmdbId
            ? { ...prev, loading: false, error: true }
            : prev,
        );
      }
    },
    [rec],
  );

  const closeSubScreen = useCallback(() => {
    setSubScreen(null);
  }, []);

  const handleSubScreenItemPress = useCallback(
    async (work: RelatedWork) => {
      // 1) 풀스크린 dismiss 후 history push — UX 순서: 시각 전환 → 데이터 hydrate.
      const source = subScreen?.type ?? 'recommendations';
      setSubScreen(null);
      await handleRelatedClick(work, source);
    },
    [handleRelatedClick, subScreen],
  );

  // 2026-07-12 — swipe-down 닫힘 전용 경로. instantExit 는 onClose 와 같은 배치로
  // commit 되어 Modal 이 animationType='none' 상태로 dismiss 된다 (모션 2회 방지).
  function closeFromSwipe() {
    setInstantExit(true);
    onClose();
  }

  // 2026-07-10 — 내부 스크롤을 RNGH 에 편입 (pan 과의 simultaneous 관계용).
  const nativeScroll = Gesture.Native();

  const pan = Gesture.Pan()
    // 2026-05-29 v2 — v1 회귀 fix (build 12):
    //   v1: activeOffsetY([8, 9999]) + failOffsetY([-1, 7]) 의 임계가 충돌 —
    //   translation 이 7px 도달 시점에 failOffsetYEnd=7 이 먼저 발동 → pan 이
    //   activate(8px) 도달 전에 fail. 결과: 핸들 드래그 + scroll-top swipe-down
    //   모두 불응답.
    //   v2: activeOffsetY(8) 단일 (downward 8px+ 만 active, upward 는 pan 진입
    //   안 함 → ScrollView 가 자연스럽게 스크롤 처리). failOffsetX 로 수평 carousel
    //   간섭만 차단.
    //   onUpdate / onEnd 안 scrollY > 0 가드 유지 — 스크롤 중간 swipe 차단.
    .activeOffsetY(8)
    .failOffsetX([-20, 20])
    // 2026-07-10 재수정 v2 — swipe-down dismiss 불응답 (사용자 실기기 + 시뮬 재현).
    //   build 42 의 blocksExternalGesture(scrollRef) 는 무효였다: RN Animated.ScrollView
    //   는 RNGH 미등록 컴포넌트라 관계 설정이 조용히 no-op → 네이티브 스크롤
    //   recognizer 가 하향 드래그를 선점해 pan 이 activate 못함 (bounces=false 만으로도
    //   불충분 — 시뮬 실측). 정석 구조로 재편:
    //   1) ScrollView 를 GestureDetector(Gesture.Native()) 로 감싸 RNGH 시스템에 편입
    //   2) pan.simultaneousWithExternalGesture(nativeScroll) — 둘이 병행 인식
    //   3) bounces=false → 최상단에서 하향 드래그 시 scroll offset 이 0 에 고정되고
    //      pan 의 scrollY<=0 가드가 통과 → 시트가 드래그를 따라옴
    //   스크롤 중간에선 scrollY>0 가드로 시트 불변 (스크롤만 동작).
    .simultaneousWithExternalGesture(nativeScroll)
    .onUpdate((e) => {
      'worklet';
      if (scrollY.value > 0) return;
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      'worklet';
      if (scrollY.value > 0) return;
      if (e.translationY > CLOSE_THRESHOLD || e.velocityY > 1000) {
        // PR2 — 풀스크린 dismiss: 화면 끝까지 슬라이드 후 onClose 호출.
        // 2026-07-12 — 퇴장 슬라이드는 이 translateY 애니메이션 1회가 전부.
        // Modal slide 퇴장이 겹치면 닫힘 모션 2회 → closeFromSwipe 가 'none' 전환.
        translateY.value = withTiming(
          SCREEN_HEIGHT,
          { duration: DETAIL_EXIT_MS, easing: DETAIL_BEZIER },
          () => {
            runOnJS(closeFromSwipe)();
          },
        );
      } else {
        // 스냅백 — 변위가 작아 시간 차이 인지가 작음. 일관 유지 위해 enter 정량 사용.
        translateY.value = withTiming(0, {
          duration: DETAIL_ENTER_MS,
          easing: DETAIL_BEZIER,
        });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  async function handleShare() {
    if (!rec) return;
    try {
      await Share.share({
        message: `${rec.title} (${rec.titleEn}) — Neko 추천`,
      });
    } catch {
      /* user dismissed */
    }
  }

  // 2026-06-10 (Phase C #4) — sticky CTA 저장 토글. mode 무관.
  // - share mode: 최초 저장 시 `share_saved` 이벤트 기존 호환 유지 (savedStatus false→true 전이).
  //   unsave 도 가능 (share 진입자도 저장 후 마음 변경 시 해제). source=native_share.
  // - detail mode: Saved 진입 후 unsave 진입로 (이전엔 ActionBar 만이었지만 Saved 화면엔
  //   ActionBar 가 없어 sheet 내부가 유일한 unsave 진입로). source=native_detail.
  const handleToggleSave = useCallback(async () => {
    if (!rec) return;
    const next = await toggleSaved(rec);
    setSavedStatus(next);
    if (next) {
      track('share_saved', {
        tmdb_id: rec.tmdbId,
        title: rec.title,
        source: mode === 'share' ? 'native_share' : 'native_detail',
      });
    }
  }, [rec, mode]);

  async function openProvider(providerName: string, watchLink: string | null) {
    if (!rec) return;
    const googleFallback = `https://www.google.com/search?q=${encodeURIComponent(providerName + ' ' + rec.title)}`;
    // 우선순위: (1) 앱 scheme(설치 시) → (2) 웹 appLink → (3) watchLink → (4) google 검색.
    // scheme 이 없거나 canOpenURL false 면 자동으로 웹으로 떨어짐 (회귀 0).
    const candidates = [
      ...getOTTOpenCandidates(providerName, rec.title),
      ...(watchLink ? [{ url: watchLink, via: 'web' as const }] : []),
      { url: googleFallback, via: 'web' as const },
    ];

    let opened: { url: string; via: 'app' | 'web' } | null = null;
    for (const c of candidates) {
      try {
        if (await Linking.canOpenURL(c.url)) {
          opened = c;
          break;
        }
      } catch {
        // canOpenURL 거부(scheme 미등록 등) — 다음 후보로
      }
    }
    // 모두 canOpenURL 실패해도 google 검색은 항상 https → 마지막 후보 강제 채택
    if (!opened) opened = candidates[candidates.length - 1];

    // 클릭 이벤트는 open 직전 발사. opened_via 로 앱/웹 경로 구분 (PR — scheme 효과 측정).
    track('ott_link_clicked', {
      tmdb_id: rec.tmdbId,
      title: rec.title,
      provider: providerName,
      url: opened.url,
      opened_via: opened.via,
      providers_count: rec.providers.length,
      source: mode === 'share' ? 'native_share' : 'native_detail_sheet',
    });

    try {
      await Linking.openURL(opened.url);
    } catch {
      // openURL 실패 — 무시 (사용자가 명시적으로 닫았거나 OS 거부)
    }
  }

  if (!rec) return null;

  const heroSrc = rec.backdrop || rec.posterUrl;
  // titleEn === title 회피 (Share line 190 조건 흡수 — 영문 작품 중복 노출 방지).
  const showTitleEn = !!rec.titleEn && rec.titleEn !== rec.title;
  const typeBadge =
    rec.type === 'series' ? '시리즈' : rec.type === 'variety' ? '예능' : '영화';
  // 표시용 provider — allowlist + subscription (구 저장 스냅샷의 Crunchyroll 류 치유).
  const watchProviders = displayProviders(rec.providers);
  // sticky CTA 높이 추정 — mode 무관 2버튼 row (amber save/unsave + ghost share/추천 더 보기).
  // 2026-06-10 (Phase C #4) — detail/share 분기 통합 후 56+inset+24 단일 식.
  const stickyCtaHeight = 56 + insets.bottom + 24;

  // 2026-06-04 (P0-#1 fix) — mode='share' 는 Modal 을 우회하고 풀스크린 View 로 직접 렌더.
  //
  // 배경: share/[id] (apps/native/app/share/[id].tsx) 는 이미 expo-router 의 풀스크린
  // 라우트 (`<Tabs.Screen name="share/[id]" options={{ href: null }} />`). 그 위에 추가로
  // Modal 을 올리면 → 사용자가 닫기/추천 더 보기 탭 시 `router.replace('/')` 만 호출되고
  // Modal 자체는 별도 OS-level view 라서 닫히지 않음 → "닫기 동작 안 함" 회귀.
  //
  // share mode 는 라우트 자체가 진입 단위이므로 Modal 불필요. visible prop 도 share 경로에선
  // 항상 true (`<DetailSheet rec={rec} visible onClose={...} mode="share" />`) — 가시성 게이트
  // 는 라우트 mount 가 담당.
  //
  // detail mode (in-app 진입) 는 Modal 유지 — Discover/Saved 카드 탭 후 시트가 떠야 하므로
  // overlay 패턴 필요.
  const ContainerView = (
    <View
      style={styles.root}
      accessibilityViewIsModal
      accessibilityLabel={`${rec.title} 상세 정보`}
    >
      <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, sheetStyle]}>
            {/* 2026-07-10 — Gesture.Native 래핑: 스크롤 recognizer 를 RNGH 에 편입해
                pan(simultaneousWithExternalGesture) 과 병행 인식 (pan 정의 주석 참조). */}
            <GestureDetector gesture={nativeScroll}>
            <Animated.ScrollView
              ref={scrollRef as React.RefObject<Animated.ScrollView>}
              style={styles.body}
              contentContainerStyle={[
                styles.bodyContent,
                { paddingBottom: stickyCtaHeight },
              ]}
              showsVerticalScrollIndicator={false}
              // 2026-05-29 — scrollY 추적 → pan gesture 가 scrollY > 0 이면 swipe-down 차단.
              onScroll={scrollHandler}
              scrollEventThrottle={16}
              // 2026-07-10 — swipe-down dismiss 활성화 핵심: top bounce 가 하향
              // 드래그를 선점하면 pan 이 activate 못함 (pan 정의 주석 참조).
              bounces={false}
            >
              {/* PR2 Hero 440px — 풀폭 + 3-stop gradient + title overlay */}
              <View style={styles.hero}>
                {heroSrc ? (
                  <Image
                    source={{ uri: heroSrc }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    // 2026-07-10 팝인 완화 — 시트 오픈 전환 중 짧은 fade 로 하드컷 은폐.
                    // (스와이프 카드는 transition 0 유지 — SwipeCard.tsx 주석 참조)
                    transition={150}
                    cachePolicy="memory-disk"
                  />
                ) : null}
                <LinearGradient
                  colors={['transparent', 'rgba(18,17,14,0.4)', colors.bg]}
                  locations={[0, 0.5, 1]}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <View style={styles.heroBody}>
                  <View style={styles.heroBadges}>
                    <View style={styles.ratingPill}>
                      <Text style={styles.ratingPillText}>★ {rec.rating.toFixed(1)}</Text>
                    </View>
                    <View style={styles.typePill}>
                      <Text style={styles.typePillText}>{typeBadge}</Text>
                    </View>
                    {/* 4차-4 (2026-07-10) — 장르 필 상위 2개 (SwipeCard badgeRow 정합).
                        genres 미보유 데이터는 자연 생략. */}
                    {getGenreLabels(rec.genres).slice(0, 2).map((g) => (
                      <View key={g} style={styles.typePill}>
                        <Text style={styles.typePillText}>{g}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
                    {rec.title}
                  </Text>
                  {showTitleEn ? (
                    <Text style={styles.titleEn} numberOfLines={1}>
                      {rec.titleEn}
                    </Text>
                  ) : null}
                  {!!metaInfo(rec) && <Text style={styles.meta}>{metaInfo(rec)}</Text>}
                </View>
              </View>

              {/* Reason 박스 — borderLeft 2px amber, 면 금지 */}
              {rec.reason ? (
                <View style={styles.reasonBox}>
                  <Text style={styles.reasonText}>{rec.reason}</Text>
                </View>
              ) : null}

              {/* Synopsis — 첫 ChapterMark (amber 단독, anti-slop 1개 규칙) */}
              {rec.overview ? (() => {
                const isLong = rec.overview.length >= SYNOPSIS_THRESHOLD;
                const collapsed = isLong && !synopsisExpanded;
                const toggle = () => setSynopsisExpanded((v) => !v);
                return (
                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, styles.sectionTitleAmber]}>
                      Synopsis · 시놉시스
                    </Text>
                    {isLong ? (
                      <Pressable
                        onPress={toggle}
                        accessibilityRole="button"
                        accessibilityLabel={
                          synopsisExpanded ? '줄거리 접기' : '줄거리 더보기'
                        }
                        accessibilityState={{ expanded: synopsisExpanded }}
                      >
                        <Text
                          style={styles.overview}
                          numberOfLines={collapsed ? 5 : undefined}
                        >
                          {rec.overview}
                        </Text>
                        <View style={styles.synopsisToggle}>
                          <Text style={styles.synopsisToggleText}>
                            {synopsisExpanded ? '접기' : '더보기'}
                          </Text>
                        </View>
                      </Pressable>
                    ) : (
                      <Text style={styles.overview}>{rec.overview}</Text>
                    )}
                  </View>
                );
              })() : null}

              {/* Cast — ChapterMark + 가로 스크롤. share mode 에서는 진입 비활성.
                  2026-06-15 (build 27 iter3) — tmdbId 있으면 DetailSheet 내부
                  person-works sub-screen (Modal 전환 0). 없으면 SearchSheet fallback. */}
              {(rec.director || rec.cast.length > 0) && (
                <>
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Cast · 캐스트</Text>
                  </View>
                  <CastRow
                    director={rec.director}
                    cast={rec.cast}
                    directorMember={rec.directorMember ?? lazyDirectorMember ?? null}
                    castMembers={
                      rec.castMembers && rec.castMembers.length > 0
                        ? rec.castMembers
                        : lazyCastMembers
                    }
                    onPressPerson={mode === 'detail' ? openPersonWorks : undefined}
                    onSearchPerson={mode === 'detail' ? onSearchPerson : undefined}
                  />
                </>
              )}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Where to watch · 시청 가능</Text>
                {watchProviders.length === 0 ? (
                  <Text style={styles.noProviders}>
                    현재 한국 OTT에서 제공 정보를 찾지 못했어요
                  </Text>
                ) : (
                  // 2026-06-04 — detail/share mode 통합 칩(pill) 형태.
                  // 이전: share = 칩, detail = 큰 list (px 16 / py 12 / 32×32 icon + 화살표).
                  // 사용자 의도 = native 내부 시각 일관성. mode 분기 제거.
                  // web (apps/web/src/app/share/[id]/ShareClient.tsx line 129) 정합 유지:
                  // flex-wrap gap-2 + 각 OTT 가 inline pill (icon + 이름, paddingHorizontal 12 + paddingVertical 10,
                  // surfaceRaised 면, radius.md). 모바일 터치 타겟 minHeight 44 보장.
                  // 정합 격차: PWA detail (DetailBody.tsx line 312~) 은 여전히 큰 list — 별도 트랙.
                  <View style={styles.providerChips}>
                    {watchProviders.map((p) => {
                      const iconUrl = getOTTIcon(p.name) ?? p.logoUrl;
                      return (
                        <Pressable
                          key={p.name}
                          style={({ pressed }) => [
                            styles.providerChip,
                            pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
                          ]}
                          onPress={() => openProvider(p.name, rec.watchLink)}
                          accessibilityRole="button"
                          accessibilityLabel={`${p.name}에서 보기`}
                        >
                          <View style={styles.providerChipIcon}>
                            {iconUrl ? (
                              <Image
                                source={{ uri: iconUrl }}
                                style={StyleSheet.absoluteFill}
                                contentFit="contain"
                              />
                            ) : null}
                          </View>
                          <Text style={styles.providerChipName}>{p.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* 관련 작품 — F3 spec.
                  2026-06-04 (P0 fix) — mode='share' 분기에서는 전체 숨김.
                  사유: shared 화면(UL 진입)에서 RelatedRow 탭 시 setRelatedRec 으로 작품 교체 →
                  background → 같은 UL 재진입 시 원본 SHARE_TMDB_ID 무시 + 마지막 탭한 작품 노출 회귀.
                  버그 source 차단 — share 진입은 단일 작품 표면만 노출. fetch 도 effect 에서 skip. */}
              {mode !== 'share' && (
                <>
                  {related === null && relatedLoading && (
                    <View style={styles.relatedSkeletonRow}>
                      {[0, 1, 2, 3].map((i) => (
                        <View key={i} style={styles.relatedSkeletonCard} />
                      ))}
                    </View>
                  )}

                  {related?.collection && related.collection.works.length > 0 && (
                    <RelatedRow
                      label={related.collection.name}
                      works={related.collection.works}
                      source="collection"
                      disabled={hydratingRelated}
                      onPressItem={handleRelatedClick}
                      onShowMore={() =>
                        openSubScreen({
                          type: 'collection',
                          works: related.collection!.works,
                          title: related.collection!.name,
                        })
                      }
                    />
                  )}

                  {related?.recommendations && related.recommendations.length > 0 && (
                    <RelatedRow
                      label="비슷한 작품"
                      works={related.recommendations}
                      source="recommendations"
                      disabled={hydratingRelated}
                      onPressItem={handleRelatedClick}
                      onShowMore={() =>
                        openSubScreen({
                          type: 'recommendations',
                          works: related.recommendations,
                          title: '비슷한 작품',
                        })
                      }
                    />
                  )}

                  {related?.directorWorks && related.directorWorks.length > 0 && (
                    <RelatedRow
                      label={
                        related.directorName
                          ? `${related.directorName} 감독의 다른 작품`
                          : '감독의 다른 작품'
                      }
                      works={related.directorWorks}
                      source="director"
                      disabled={hydratingRelated}
                      onPressItem={handleRelatedClick}
                      onShowMore={() =>
                        openSubScreen({
                          type: 'director',
                          works: related.directorWorks,
                          title: related.directorName
                            ? `${related.directorName} 감독의 다른 작품`
                            : '감독의 다른 작품',
                        })
                      }
                    />
                  )}
                </>
              )}
            </Animated.ScrollView>
            </GestureDetector>

            {/* TopNav — 좌측 ← / → (build 27 history), 우측 X (build 22 닫기).
                hero 위 absolute, 모든 버튼 44×44 터치 타겟.
                2026-06-15 (build 27) — 좌상단 history navigation 추가 (사용자 결정).
                  - ← (canGoBack) / → (canGoForward) 모두 항상 노출. disabled 색으로 비활성 표시.
                  - hidden 아닌 disabled (사용자 결정: "비활성=회색").
                  - 가시성: history.length > 1 일 때만 nav row 자체 노출 — 첫 진입 (단일 entry)
                    에서는 시각 잡음 회피. 두 번째 작품 이상 들어가야 의미 있음.
                2026-06-11 (build 22) — X 위치 좌→우 이동 (그대로 유지).
                  공유 버튼 제거 후 우측 단일. iOS 표준 right-close 와 정합. */}
            <View
              pointerEvents="box-none"
              style={[
                styles.topNav,
                { paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.md },
              ]}
            >
              {/* 좌측 history nav — history 가 2개 이상일 때만 row 노출 */}
              {history.length > 1 ? (
                <View style={styles.topNavLeftGroup}>
                  <Pressable
                    style={[
                      styles.topNavBtn,
                      !canGoBack && styles.topNavBtnDisabled,
                    ]}
                    onPress={handleHistoryBack}
                    disabled={!canGoBack}
                    hitSlop={12}
                    accessibilityLabel="이전 작품"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canGoBack }}
                  >
                    <IconChevronLeft
                      size={18}
                      color={canGoBack ? colors.textPrimary : colors.textMuted}
                    />
                  </Pressable>
                  <Pressable
                    style={[
                      styles.topNavBtn,
                      !canGoForward && styles.topNavBtnDisabled,
                    ]}
                    onPress={handleHistoryForward}
                    disabled={!canGoForward}
                    hitSlop={12}
                    accessibilityLabel="다음 작품"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canGoForward }}
                  >
                    <IconChevronRight
                      size={18}
                      color={canGoForward ? colors.textPrimary : colors.textMuted}
                    />
                  </Pressable>
                </View>
              ) : (
                <View />
              )}
              {/* 4차 — 우측 그룹: 케밥(⋮, 인메뉴 '큐 시작') + X. Discover 카드
                  케밥과 동일 진입 패턴 — 하단 sticky CTA 의 '큐 시작' 버튼 대체. */}
              <View style={styles.topNavRightGroup}>
                {mode !== 'share' && onStartMix ? (
                  <Pressable
                    style={styles.topNavBtn}
                    onPress={() => setDetailMenuOpen((v) => !v)}
                    hitSlop={12}
                    accessibilityLabel="상세 메뉴"
                    accessibilityRole="button"
                    testID="detail-menu-button"
                  >
                    <IconMoreVertical size={18} color={colors.textPrimary} />
                  </Pressable>
                ) : null}
                <Pressable
                  style={styles.topNavBtn}
                  onPress={onClose}
                  hitSlop={12}
                  accessibilityLabel="닫기"
                  accessibilityRole="button"
                >
                  <IconClose size={20} color={colors.textPrimary} />
                </Pressable>
              </View>
            </View>

            {/* 4차 — 케밥 인메뉴. 필터 dropdown 패널과 동일 UI (FilterChips panel/option
                정합 — Discover cardMenu 와 공유 규격). Modal 중첩 회피 위해 시트 내부
                inline overlay + 투명 backdrop. */}
            {detailMenuOpen && (
              <>
                <Pressable
                  style={styles.detailMenuBackdrop}
                  onPress={() => setDetailMenuOpen(false)}
                  accessibilityLabel="메뉴 닫기"
                  testID="detail-menu-backdrop"
                />
                <View
                  style={[
                    styles.detailMenu,
                    { top: insets.top + spacing.sm + 44 + 8 },
                  ]}
                  testID="detail-menu"
                >
                  <Pressable
                    style={({ pressed }) => [
                      styles.detailMenuItem,
                      pressed && styles.detailMenuItemPressed,
                    ]}
                    onPress={() => {
                      setDetailMenuOpen(false);
                      onStartMix?.(rec);
                    }}
                    accessibilityRole="button"
                    testID="detail-menu-mix"
                  >
                    <Text style={styles.detailMenuItemText} numberOfLines={1}>
                      {rec.title} 큐 시작
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {/* Sticky bottom CTA — 2026-06-10 (Phase C #4) mode 통합 → 2026-06-11 (build 21) 위계 강화.
                detail mode (위계 명확): amber save/unsave (flex 1, primary) + ghost share (square 44, icon-only).
                share mode (UL 진입): amber save/unsave (flex 1) + ghost "추천 더 보기" (flex 1, 라벨).
                PWA DetailSheet L222~277 정합 (PWA 도 detail mode 에서 공유 버튼은 px-4 square + sr-only 라벨).
                anti-slop #13: Save 는 amber 카운트 제외 (DESIGN.md L37). */}
            <View
              pointerEvents="box-none"
              style={[
                styles.stickyCta,
                { paddingBottom: insets.bottom + spacing.md },
              ]}
            >
              <View style={styles.shareCtaRow}>
                <Pressable
                  style={[
                    styles.ctaPrimary,
                    savedStatus && styles.ctaPrimarySaved,
                  ]}
                  onPress={handleToggleSave}
                  accessibilityRole="button"
                  accessibilityState={{ selected: savedStatus }}
                  accessibilityLabel={
                    savedStatus
                      ? `${rec.title} 저장 해제`
                      : `${rec.title} 저장`
                  }
                >
                  <IconSave
                    size={16}
                    color={savedStatus ? colors.accent : colors.textInverse}
                    filled={savedStatus}
                  />
                  <Text
                    style={[
                      styles.ctaPrimaryText,
                      savedStatus && styles.ctaPrimarySavedText,
                    ]}
                  >
                    {savedStatus ? '저장됨' : '저장하기'}
                  </Text>
                </Pressable>
                {mode === 'share' ? (
                  <Pressable
                    style={styles.ctaGhost}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel="추천 더 보기"
                  >
                    <Text style={styles.ctaGhostText}>추천 더 보기</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={styles.ctaGhostSquare}
                    onPress={handleShare}
                    accessibilityRole="button"
                    accessibilityLabel={`${rec.title} 공유하기`}
                  >
                    <IconShare size={16} color={colors.textSecondary} />
                  </Pressable>
                )}
              </View>
            </View>
          </Animated.View>
        </GestureDetector>
        {/* 2026-06-15 (build 27) — RelatedListScreen overlay (Task C).
            DetailSheet 위에 absolute fill. expo-router 새 route 아님 — 같은 Modal 내부에서
            sub-screen 형태로 push. subScreen=null 이면 렌더 X. open 시 우선 X 닫기 버튼이
            가려지므로 RelatedListScreen 자체에 ← 헤더 (DetailSheet 닫기는 ← 뒤로 후 X 로 가능).

            2026-06-15 (build 27 fix iteration) — QA MED 2: share mode 명시 가드.
            share mode 에서는 RelatedRow 자체가 차단되어 (L713 가드) subScreen=null 고정 →
            현재는 도달 불가 (dead path) 이지만, refactor 안전망으로 명시 가드 추가. */}
        {mode !== 'share' && subScreen ? (
          <RelatedListScreen
            title={subScreen.title}
            works={subScreen.works}
            onBack={closeSubScreen}
            onItemPress={handleSubScreenItemPress}
            disabled={hydratingRelated}
            loading={subScreen.type === 'person-works' && subScreen.loading}
            error={subScreen.type === 'person-works' && subScreen.error}
            onRetry={
              subScreen.type === 'person-works'
                ? () =>
                    openPersonWorks({
                      tmdbId: subScreen.personId,
                      name: subScreen.personName,
                      role: subScreen.role,
                    })
                : undefined
            }
          />
        ) : null}
      </View>
  );

  // 2026-06-04 (P0-#1 fix) — mode 분기 렌더.
  // share: 풀스크린 라우트 자체가 진입 단위 — Modal 우회. router.replace('/') 가 즉시 발효.
  // detail: 기존 Modal overlay 유지 — in-app 카드 탭 진입 시 시트 슬라이드 패턴 필요.
  if (mode === 'share') {
    if (!visible) return null;
    return ContainerView;
  }

  return (
    <Modal
      visible={visible}
      animationType={instantExit ? 'none' : 'slide'}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {ContainerView}
    </Modal>
  );
}

/**
 * CastRow — director + cast 가로 스크롤 행. (web `CastRow` 동기화)
 *
 * 위임 O #1.1 #1.2 — native 동등:
 *  - directorMember/castMembers (TMDB profile_path) 있으면 expo-image 64×64 원형.
 *    구버전 rec(이름만) 또는 profileUrl null 인 경우 이니셜 fallback 유지.
 *  - onSearchPerson 콜백 주어지면 Pressable 로 래핑 → 클릭 시 검색 진입.
 *    콜백 미지정 시 비클릭 View 폴백 (회귀 0).
 *  - 길이/순서: director(1) → cast(최대 4) → 항상 5개 이하.
 */
function CastRow({
  director,
  cast,
  directorMember,
  castMembers,
  onPressPerson,
  onSearchPerson,
}: {
  director: string | null;
  cast: string[];
  directorMember: CastMember | null;
  castMembers: CastMember[];
  onPressPerson?: (person: {
    tmdbId: number;
    name: string;
    role: '감독' | '출연';
  }) => void;
  onSearchPerson?: (name: string) => void;
}) {
  type Item = {
    tmdbId: number | null;
    name: string;
    role: '감독' | '출연';
    profileUrl: string | null;
    keyId: string;
  };
  const items: Item[] = [];

  if (directorMember) {
    items.push({
      tmdbId: directorMember.tmdbId,
      name: directorMember.name,
      role: '감독',
      profileUrl: directorMember.profileUrl,
      keyId: `d-${directorMember.tmdbId}`,
    });
  } else if (director) {
    items.push({
      tmdbId: null,
      name: director,
      role: '감독',
      profileUrl: null,
      keyId: `d-${director}`,
    });
  }

  if (castMembers && castMembers.length > 0) {
    for (const m of castMembers) {
      items.push({
        tmdbId: m.tmdbId,
        name: m.name,
        role: '출연',
        profileUrl: m.profileUrl,
        keyId: `c-${m.tmdbId}`,
      });
    }
  } else {
    for (let i = 0; i < cast.length; i++) {
      items.push({
        tmdbId: null,
        name: cast[i],
        role: '출연',
        profileUrl: null,
        keyId: `c-${cast[i]}-${i}`,
      });
    }
  }

  if (items.length === 0) return null;

  return (
    <View style={styles.castSection}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.castRowContent}
      >
        {items.map((p) => (
          <CastItem
            key={p.keyId}
            tmdbId={p.tmdbId}
            name={p.name}
            role={p.role}
            profileUrl={p.profileUrl}
            onPressPerson={onPressPerson}
            onSearchPerson={onSearchPerson}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function CastItem({
  tmdbId,
  name,
  role,
  profileUrl,
  onPressPerson,
  onSearchPerson,
}: {
  tmdbId: number | null;
  name: string;
  role: '감독' | '출연';
  profileUrl: string | null;
  // 2026-06-15 (build 27 iter3) — tmdbId 있으면 DetailSheet 내부 sub-screen.
  // 없으면 (legacy rec, name 만) onSearchPerson 으로 SearchSheet 진입 fallback.
  onPressPerson?: (person: {
    tmdbId: number;
    name: string;
    role: '감독' | '출연';
  }) => void;
  onSearchPerson?: (name: string) => void;
}) {
  const Avatar = (
    <View style={styles.castAvatar}>
      {profileUrl ? (
        <Image
          source={{ uri: profileUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
        />
      ) : (
        <Text style={styles.castAvatarFallback}>{name.charAt(0)}</Text>
      )}
    </View>
  );
  const Label = (
    <>
      <Text style={styles.castName} numberOfLines={2}>
        {name}
      </Text>
      <Text style={styles.castRole}>{role}</Text>
    </>
  );

  // 2026-06-15 (build 27 iter3) — onPress 우선순위:
  //   1) tmdbId 있고 onPressPerson 있으면 → DetailSheet 내부 sub-screen (Modal 전환 0)
  //   2) onSearchPerson 만 있으면 → 기존 SearchSheet 진입 fallback (legacy rec)
  //   3) 콜백 모두 없으면 비클릭 View (회귀 0)
  const canOpenSubScreen = tmdbId != null && onPressPerson;
  const canFallbackSearch = onSearchPerson != null;
  if (canOpenSubScreen || canFallbackSearch) {
    return (
      <Pressable
        onPress={() => {
          track('detail_cast_clicked', { name, role });
          if (canOpenSubScreen) {
            onPressPerson({ tmdbId: tmdbId!, name, role });
          } else if (onSearchPerson) {
            onSearchPerson(name);
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={
          canOpenSubScreen ? `${name} ${role} 작품 보기` : `${name} ${role} 검색`
        }
        style={({ pressed }) => [
          styles.castCell,
          pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
        ]}
      >
        {Avatar}
        {Label}
      </Pressable>
    );
  }
  return (
    <View style={styles.castCell}>
      {Avatar}
      {Label}
    </View>
  );
}

/**
 * 작품 제목을 이중 줄로 분할 — web `PosterFallback.splitTitle` 정확 포팅.
 * 4자 이하면 단행, 공백 있으면 어절 절반 분할, 없으면 글자 중간 분할.
 */
function splitTitle(title: string): { line1: string; line2?: string } {
  const trimmed = title.trim();
  if (trimmed.length <= 4) return { line1: trimmed };
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const mid = Math.ceil(parts.length / 2);
    return {
      line1: parts.slice(0, mid).join(' '),
      line2: parts.slice(mid).join(' '),
    };
  }
  const mid = Math.ceil(trimmed.length / 2);
  return { line1: trimmed.slice(0, mid), line2: trimmed.slice(mid) };
}

/**
 * RelatedRow 포스터 폴백 — web `<PosterFallback size="xs" />` 정본 포팅.
 * D-1 (2026-05-19 정합 audit): 단일 `N` 글자 → 작품 제목 typographic fallback.
 * dashed border + surface-sunken 면 + Instrument Serif italic 제목(이중행)
 * + Geist Mono uppercase eyebrow "poster · n/a".
 * web `PosterFallback.tsx` SIZE_MAP.xs: titleSize text-base(16), eyebrow 9px,
 * padding 6, gap 4.
 */
function RelatedPosterFallback({ title }: { title: string }) {
  const { line1, line2 } = splitTitle(title);
  return (
    <View style={styles.relatedPosterFallback}>
      <Text style={styles.relatedFallbackTitle}>
        {line1}
        {line2 ? '\n' + line2 : ''}
      </Text>
      <Text style={styles.relatedFallbackEyebrow}>POSTER · N/A</Text>
    </View>
  );
}

/**
 * 관련 작품 가로 스크롤 — neko-detail-sheet.jsx SimilarStrip 매핑.
 * 카드 90×132, 간격 10. label 은 amber accent + uppercase tracking.
 */
// 2026-06-15 (build 27) — 가로 스크롤 끝 "더보기" 카드 가시 임계.
// works.length 가 이 값 이하면 더보기 숨김 (있는 데이터 다 보이는 경우 = 자연 종료).
// 90×132 카드 + gap 10 → iPhone (390w) 기준 약 3~4장 1차 가시. 4 초과 시 더보기 노출.
const RELATED_SHOW_MORE_THRESHOLD = 4;

function RelatedRow({
  label,
  works,
  source,
  disabled,
  onPressItem,
  onShowMore,
}: {
  label: string;
  works: RelatedWork[];
  source: 'collection' | 'director' | 'recommendations';
  disabled?: boolean;
  onPressItem: (
    work: RelatedWork,
    source: 'collection' | 'director' | 'recommendations',
  ) => void;
  /**
   * 2026-06-15 (build 27) — 가로 스크롤 끝 "더보기 →" 누름. works.length 가
   * RELATED_SHOW_MORE_THRESHOLD 초과 시에만 버튼 노출. 미지정 시 더보기 숨김.
   */
  onShowMore?: () => void;
}) {
  const showMore = !!onShowMore && works.length > RELATED_SHOW_MORE_THRESHOLD;
  return (
    <View style={styles.relatedSection}>
      {/* 2026-06-15 (build 27 fix iter2) — 더보기 버튼 위치 이동.
          이전: 가로 스크롤 끝의 dashed 카드 (works.length>4 시) → 스크롤 끝까지 가야 접근.
          현재: 라벨 헤더 우측의 텍스트 버튼 (iOS 표준 "See All" 패턴).
          노출 임계 유지 (works.length > 4), accessibilityLabel 동일. */}
      <View style={styles.relatedHeader}>
        <Text style={styles.relatedSectionTitle}>{label}</Text>
        {showMore ? (
          <Pressable
            disabled={disabled}
            onPress={onShowMore}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${label} 전체 보기`}
            style={({ pressed }) => [
              styles.relatedHeaderMore,
              pressed && { opacity: 0.6 },
              disabled && { opacity: 0.5 },
            ]}
          >
            <Text style={styles.relatedHeaderMoreText}>더보기 →</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.relatedRowContent}
      >
        {works.map((w) => (
          <Pressable
            key={w.id}
            disabled={disabled}
            style={({ pressed }) => [
              styles.relatedCard,
              pressed && { opacity: 0.7 },
              disabled && { opacity: 0.5 },
            ]}
            onPress={() => onPressItem(w, source)}
          >
            <View style={styles.relatedPosterWrap}>
              {w.posterUrl ? (
                <Image
                  source={{ uri: w.posterUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={150}
                  cachePolicy="memory-disk"
                  recyclingKey={w.posterUrl}
                />
              ) : (
                <RelatedPosterFallback title={w.title} />
              )}
            </View>
            <Text style={styles.relatedTitle} numberOfLines={2}>
              {w.title}
            </Text>
            {w.year ? <Text style={styles.relatedYear}>{w.year}</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// 2026-06-15 (build 27) — RelatedListScreen: 더보기 풀스크린 sub-screen.
// DetailSheet 의 ContainerView 안에서 absolute fill overlay. expo-router 새 route 아님.
// 상단 헤더: ← (뒤로) + 타이틀
// 본문: 2-column grid (포스터 카드 + 제목/연도). 기존 RelatedRow 카드와 시각 일관성.
// 항목 탭 → onItemPress → DetailSheet history push.
//
// 그리드 카드 사이즈: 화면 너비 - paddingHorizontal*2 - gap 을 2 로 나눔.
// 포스터 비율 2:3 유지. 작은 화면 (320) 까지 안전.
function RelatedListScreen({
  title,
  works,
  onBack,
  onItemPress,
  disabled,
  loading,
  error,
  onRetry,
}: {
  title: string;
  works: RelatedWork[];
  onBack: () => void;
  onItemPress: (work: RelatedWork) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const insets = useSafeAreaInsets();
  // 2026-06-15 (build 27 fix iter2) — 3-col grid 전환 (사용자 결정).
  // 이전: 2-col (cardWidth ≈ 169, posterHeight ≈ 254, 카드 큼)
  // 현재: 3-col (cardWidth ≈ 105, posterHeight ≈ 158)
  // 산식: (screen - paddingHorizontal*2 - columnGap*2) / 3
  //       = (390 - 20*2 - 12*2) / 3 = 108.66 → floor 108
  // 좌우 paddingHorizontal 20 (DESIGN.md L156), column gap 12, row gap 12 통합.
  // 카드 비율 2:3 포스터 유지.
  const cardWidth = Math.floor((Dimensions.get('window').width - 20 * 2 - 12 * 2) / 3);
  const posterHeight = Math.round(cardWidth * 1.5); // 2:3

  return (
    <View
      style={styles.subScreen}
      accessibilityViewIsModal
      accessibilityLabel={`${title} 전체 목록`}
    >
      {/* 헤더 — 좌측 ← + 타이틀. X 는 DetailSheet 의 닫기 버튼이 상위에 있으므로 생략. */}
      <View
        style={[
          styles.subScreenHeader,
          { paddingTop: insets.top + spacing.sm },
        ]}
      >
        <Pressable
          style={styles.topNavBtn}
          onPress={onBack}
          hitSlop={12}
          accessibilityLabel="뒤로"
          accessibilityRole="button"
        >
          <IconChevronLeft size={18} color={colors.textPrimary} />
        </Pressable>
        <Text
          style={styles.subScreenTitle}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {title}
        </Text>
      </View>

      {loading ? (
        <View style={styles.subScreenStatus}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      ) : error ? (
        <View style={styles.subScreenStatus}>
          <Text style={styles.subScreenStatusText}>작품을 불러오지 못했어요</Text>
          {onRetry ? (
            <Pressable
              onPress={onRetry}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="다시 시도"
              style={({ pressed }) => [
                styles.subScreenRetryBtn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.subScreenRetryText}>다시 시도</Text>
            </Pressable>
          ) : null}
        </View>
      ) : works.length === 0 ? (
        <View style={styles.subScreenStatus}>
          <Text style={styles.subScreenStatusText}>표시할 작품이 없어요</Text>
        </View>
      ) : (
      <ScrollView
        contentContainerStyle={[
          styles.subScreenGrid,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {works.map((w) => (
          <Pressable
            key={w.id}
            disabled={disabled}
            onPress={() => onItemPress(w)}
            accessibilityRole="button"
            accessibilityLabel={`${w.title} 상세 보기`}
            style={({ pressed }) => [
              styles.subScreenCard,
              { width: cardWidth },
              pressed && { opacity: 0.75 },
              disabled && { opacity: 0.5 },
            ]}
          >
            <View
              style={[
                styles.subScreenPosterWrap,
                { width: cardWidth, height: posterHeight },
              ]}
            >
              {w.posterUrl ? (
                <Image
                  source={{ uri: w.posterUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={150}
                  cachePolicy="memory-disk"
                  recyclingKey={w.posterUrl}
                />
              ) : (
                <RelatedPosterFallback title={w.title} />
              )}
            </View>
            <Text style={styles.subScreenItemTitle} numberOfLines={2}>
              {w.title}
            </Text>
            {w.year ? (
              <Text style={styles.subScreenItemYear} numberOfLines={1}>
                {w.year}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // PR2 — 풀스크린 Modal root. 시트/dim 폐기, Modal animationType="slide" 가 진입 처리.
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  // hero 위 absolute, scroll 무관.
  // 2026-06-15 (build 27) — 좌측 history nav (← →) + 우측 X 닫기. space-between.
  // history.length <= 1 일 때는 좌측 placeholder View 가 자리만 잡고 X 는 우측 유지.
  topNav: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    zIndex: 10,
  },
  // 2026-06-15 (build 27) — 좌측 ← / → 버튼 그룹. 두 버튼 사이 작은 gap.
  topNavLeftGroup: {
    flexDirection: 'row',
    gap: spacing.xs + 2, // 6 — 두 chevron 사이 시각 분리. 44+6+44 = 94px (좌측 영역).
  },
  // 4차 — 우측 그룹 (케밥 + X). 좌측 그룹과 동일 gap.
  topNavRightGroup: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
  },
  // 4차 — 케밥 인메뉴. FilterChips panel/option 규격 (Discover cardMenu 공유).
  detailMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 11,
  },
  detailMenu: {
    position: 'absolute',
    right: spacing.md,
    minWidth: 180,
    maxWidth: 260,
    padding: spacing.sm + 4,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    ...shadowsNative.dropdown,
    zIndex: 12,
  },
  detailMenuItem: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  detailMenuItemPressed: {
    backgroundColor: colors.overlayLight,
  },
  detailMenuItemText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '400',
  },
  topNavBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 2026-06-15 (build 27) — disabled 상태 (회색, 사용자 결정). hidden 아님.
  // surfaceRaised 그대로 두고 opacity 만 낮춰 면적 인지는 유지, 색채 위계만 강등.
  // 아이콘 색은 button 자체가 아닌 IconChevron color prop 으로 textMuted 전달.
  topNavBtnDisabled: {
    opacity: 0.55,
  },
  body: { flex: 1 },
  bodyContent: {
    // hero 는 풀폭 — paddingHorizontal 은 hero 안에서 직접 처리.
    paddingHorizontal: 0,
  },
  // PR2 Hero 440px — backdrop 풀폭 + 3-stop gradient + title overlay.
  hero: {
    width: '100%',
    height: HERO_HEIGHT,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    position: 'relative',
  },
  heroBody: {
    position: 'absolute',
    left: spacing.lg - 2,  // 22
    right: spacing.lg - 2, // 22
    bottom: spacing.lg,
  },
  heroBadges: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    marginBottom: spacing.sm,
  },
  // C3 — rating pill hero bottom badges row inline.
  ratingPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  ratingPillText: {
    color: colors.accent,
    fontSize: 11,
    fontFamily: fontsV2.data,
    letterSpacing: 0.2,
  },
  typePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  typePillText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontFamily: fontsV2.data,
    letterSpacing: 0.2,
  },
  // C3 — title Instrument Serif 28/32 overlay
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontFamily: fontsV2.display,
    lineHeight: 32,
    letterSpacing: -0.56, // -0.02em on 28
  },
  // C3 — titleEn Fraunces italic 15 별행
  titleEn: {
    color: colors.textMuted,
    fontSize: 15,
    fontFamily: fontsV2.displayItalic,
    fontStyle: 'italic',
    letterSpacing: -0.15,
    marginTop: 4,
  },
  // C3 — meta GeistMono 11 + 국가 포함
  meta: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fontsV2.data,
    letterSpacing: 0.2,
    marginTop: 8,
  },
  // anti-slop #6 예외 2 — reason 박스는 면 금지, 선(borderLeft 2px accent) 만.
  // PR2 — hero 가 풀폭이므로 marginHorizontal 22 로 직접 위치.
  reasonBox: {
    marginTop: spacing.lg,
    marginHorizontal: 22,
    paddingLeft: 12,
    paddingVertical: 4,
    borderLeftWidth: 2,
    borderLeftColor: colors.accentBorder,
  },
  // PR2 — reason text: Fraunces italic 13 (anti-slop #6 예외 2 정합), 13 × 1.45 ≈ 19.
  reasonText: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fontsV2.displayItalic,
    fontStyle: 'italic',
  },
  // 위임 O #1.1 — Cast row 가로 스크롤. PR2 hero 풀폭이라 left 22 으로 직접 indent.
  castSection: {
    marginTop: spacing.md,
    marginLeft: 22,
    marginRight: 0,
  },
  castRowContent: {
    gap: spacing.sm + 2,
    paddingRight: 22,
  },
  castCell: {
    width: 64,
    minHeight: 44,
    alignItems: 'center',
  },
  castAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  castAvatarFallback: {
    color: colors.textSecondary,
    fontSize: 22,
    // Italic 변형 (web 정본 OS-mediated italic 과 일치)
    fontFamily: fontsV2.displayItalic,
    lineHeight: 22,
  },
  castName: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
    textAlign: 'center',
    width: '100%',
  },
  castRole: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
    fontFamily: fonts.data,
  },
  section: {
    marginTop: spacing.md + 4,
    marginHorizontal: 22,
  },
  // PR2 — ChapterMark: GeistMono 10px uppercase letterSpacing 0.12em (정본 정합).
  // 기본 = textSecondary. Synopsis 한 곳만 amber (sectionTitleAmber merge).
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 10,
    fontFamily: fontsV2.data,
    fontWeight: '500',
    letterSpacing: 1.2, // ≈ 0.12em on 10
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  sectionTitleAmber: {
    color: colors.accent,
  },
  overview: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  synopsisToggle: {
    marginTop: spacing.xs,
    minHeight: 44,
    paddingVertical: spacing.sm,
    alignSelf: 'flex-start',
  },
  synopsisToggleText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  noProviders: {
    color: colors.textMuted,
    fontSize: 14,
    paddingVertical: spacing.sm,
  },
  // 2026-06-04 — detail/share 통합 OTT 칩(pill). 이전 큰 list 스타일
  // (providerList/providerRow/providerIcon/providerName/providerOpen) 은 mode 분기 제거 (옵션 A)
  // 와 함께 dead code 제거. web ShareClient line 129 정합 + native 내부 detail/share 일관.
  providerChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  providerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2, // 8
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44, // 모바일 터치 타겟
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  providerChipIcon: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    flexShrink: 0,
  },
  providerChipName: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '500',
  },
  // PR2 — sticky bottom CTA 컨테이너. mode='detail' = ghost 공유 1개, mode='share' = amber + ghost 2개.
  stickyCta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 22,
    paddingTop: spacing.sm,
    backgroundColor: colors.bg,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderSubtle,
  },
  // 2026-06-10 (Phase C #4) — sticky CTA row. amber save/unsave + ghost share/추천 더 보기 풀폭 2버튼.
  // PWA DetailSheet L222~277 정합. share/detail mode 통합.
  shareCtaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ctaPrimary: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs + 2, // 8 — IconSave + label
    paddingVertical: 14,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
    minHeight: 48,
  },
  // 저장됨 상태 — #5: 배경 투명 + accent text/icon 유지 → "떠 있는" 느낌.
  // solid pill(surface-raised) 제거, accent-border 로만 윤곽. subtle shadow 로 부양감.
  // amber 카운트 제외 (Save = 브랜드 닻, DESIGN.md L37).
  ctaPrimarySaved: {
    backgroundColor: 'transparent',
    borderColor: colors.accentBorder,
    ...shadowsNative.sm,
  },
  ctaPrimaryText: {
    color: colors.textInverse,
    fontWeight: '700',
    fontSize: 14,
  },
  ctaPrimarySavedText: {
    color: colors.accent,
  },
  ctaGhost: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs + 2,
    paddingVertical: 14,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 48,
  },
  // 2026-06-11 (build 21) — detail mode 의 공유 버튼. 라벨 제거, 아이콘만 + 44×44 square.
  // PWA DetailSheet L262~276 정합 (px-4 square, sr-only 라벨).
  // 모바일 터치 타겟 minHeight/Width 48 보장.
  ctaGhostSquare: {
    width: 48,
    minHeight: 48,
    paddingVertical: 14,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ctaGhostText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  // 관련 작품 (F3) — neko-detail-sheet.jsx SimilarStrip
  relatedSkeletonRow: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
    marginTop: spacing.md + 4,
    marginHorizontal: 22,
  },
  relatedSkeletonCard: {
    width: 90,
    height: 132,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    opacity: 0.5,
  },
  relatedSection: {
    marginTop: spacing.md + 4,
    marginLeft: 22,
  },
  // 2026-06-15 (build 27 fix iter2) — 라벨 + 우측 더보기 헤더 row.
  // iOS 표준 "See All" 패턴. 좌측 라벨, 우측 텍스트 버튼. align baseline.
  // marginRight 22 — 우측 가장자리 여백 (relatedSection 의 marginLeft 22 와 대칭).
  relatedHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginRight: 22,
    marginBottom: spacing.sm,
  },
  relatedHeaderMore: {
    paddingVertical: 2,
  },
  // 더보기 텍스트 — Quiet Ink 톤. textSecondary 12px, 라벨과 위계 균등.
  relatedHeaderMoreText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  // PR2 — ChapterMark amber 1개 규칙 정합. 관련작 label 은 textSecondary 강등.
  relatedSectionTitle: {
    color: colors.textSecondary,
    fontSize: 10,
    fontFamily: fontsV2.data,
    fontWeight: '500',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    // 2026-06-15 (build 27 fix iter2) — relatedHeader row 안으로 이동하면서
    // marginBottom 제거 (헤더 row 가 통합 spacing 담당).
  },
  relatedRowContent: {
    gap: spacing.sm + 2,
    paddingRight: 22, // 마지막 카드 우측 여백
  },
  relatedCard: {
    width: 90,
  },
  relatedPosterWrap: {
    width: 90,
    height: 132,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 6,
  },
  // D-1 (2026-05-19 정합 audit) — web `<PosterFallback size="xs" />` 정본 포팅.
  // dashed border + surface-sunken 면 + 작품 제목 typographic fallback.
  // web PosterFallback.tsx SIZE_MAP.xs: padding 6(p-1.5), gap 4(gap-1).
  relatedPosterFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 6,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  // 제목 — Instrument Serif italic, text-base(16), weight 500,
  // letterSpacing -0.02em(≈-0.32), lineHeight 1.05(≈17). web PosterFallback 정합.
  relatedFallbackTitle: {
    fontFamily: fontsV2.displayItalic,
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.32,
    lineHeight: 17,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  // eyebrow — Geist Mono uppercase "POSTER · N/A", 9px, tracking 0.15em(≈1.35).
  // web PosterFallback xs eyebrowSize text-[9px] 정본 그대로 (aria-hidden 장식).
  relatedFallbackEyebrow: {
    fontFamily: fontsV2.data,
    fontSize: 9,
    letterSpacing: 1.35,
    color: colors.textMuted,
    textAlign: 'center',
  },
  relatedTitle: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
  },
  relatedYear: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
    fontFamily: fonts.data,
  },
  // 2026-06-15 (build 27 fix iter2) — RelatedRow 더보기 카드 (dashed) 폐기.
  // 사유: 사용자 결정 — 스크롤 끝까지 가야 접근하는 UX 회피, iOS 표준 "See All"
  // 패턴 (라벨 헤더 우측 텍스트 버튼) 으로 이동 (위 relatedHeaderMore* 참조).
  // 이전 스타일 5종 (relatedShowMoreCard/Inner/Label/Arrow/Count) 제거.
  // 2026-06-15 (build 27) — RelatedListScreen overlay. DetailSheet 위 absolute fill.
  // Modal 도 아니고 새 route 도 아닌 같은 Container 내부 sub-screen.
  subScreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    zIndex: 20,
  },
  subScreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md - 4,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderSubtle,
  },
  // Quiet Ink 헤더 — display 폰트 절제. 22px Instrument Serif 와 잘 어울리는
  // 한글 메인은 본문 Pretendard. 여기는 body 14 + 500 weight 로 무난한 명료함.
  subScreenTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  subScreenGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // 2026-06-15 (build 27 fix iteration) — UX FIX 2: 22 → 20.
    // DESIGN.md L154 (4px 배수, 20 = 5×) + L156 (콘텐츠 좌우 20px) 정합.
    // cardWidth 산식도 같이 정정 (위 L1264).
    paddingHorizontal: 20,
    paddingTop: spacing.lg,
    gap: 12, // row/column 통합 gap. RN 0.71+ 지원.
  },
  subScreenCard: {
    // width 는 inline (cardWidth) 으로 주입. grid item.
  },
  subScreenPosterWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  // 2026-06-15 (build 27 fix iter2) — 3-col grid 전환에 따른 폰트 한 단계 축소.
  // 카드 폭 ≈ 169 → 108 (36% 축소) → 13px 두 줄 시 컷오프 위험. 12 / 500 으로 정합.
  // anti-slop #8 (한글 10px 미만 금지) 위반 없음 — 12px 안전선.
  subScreenItemTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  // year 는 11px 유지 (anti-slop #8 마지노선). Geist Mono / textMuted 약 위계.
  subScreenItemYear: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.data,
    marginTop: 2,
  },
  // 2026-06-15 (build 27 iter3) — person-works sub-screen 의 loading/error/empty 상태.
  // 전체 본문 영역을 차지하고 중앙 정렬. spinner 또는 안내 텍스트 1줄.
  subScreenStatus: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  subScreenStatusText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  subScreenRetryBtn: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  subScreenRetryText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '500',
  },
});
