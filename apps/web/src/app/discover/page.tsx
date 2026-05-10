"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addSaved,
  removeSaved,
  getSaved,
  addSeenTitles,
  hasOnboarded,
} from "@/lib/store";
import { vibrate } from "@/lib/haptics";
import { track } from "@/lib/analytics";
import { getPrimaryCountryName } from "@/lib/country-names";
import type { Recommendation } from "@/lib/types";
import type { FilterYear, FilterRating } from "@/lib/discover-types";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { useDetailSheet } from "@/hooks/useDetailSheet";
import { useRecommendations } from "@/hooks/useRecommendations";
import FilterChips from "@/components/discover/FilterChips";
import DetailSheet from "@/components/discover/DetailSheet";
import ActionBar from "@/components/discover/ActionBar";
import TutorialFlow, { type TutorialStep } from "@/components/discover/tutorial/TutorialFlow";
import { LoadingScreen, ErrorScreen, EmptyScreen } from "@/components/discover/StatusScreens";
import FirstLoadingSkeleton from "@/components/discover/FirstLoadingSkeleton";
import SearchSheet from "@/components/discover/SearchSheet";
import DiscoverHeader from "@/components/discover/DiscoverHeader";
import DiscoverDeck from "@/components/discover/DiscoverDeck";
import { useSync } from "@/hooks/useSync";
import { usePersona } from "@/contexts/PersonaContext";
import { useToast } from "@neq/design";

const metaInfo = (r: Recommendation) => [
  getPrimaryCountryName(r.country),
  r.date ? r.date.slice(0, 4) : null,
  r.runtime ? `${r.runtime}분` : null,
  r.seasons ? `시즌 ${r.seasons}` : null,
].filter(Boolean).join(" · ");

export default function DiscoverPage() {
  const router = useRouter();
  // 위임 J #3 — Saved 등 외부 진입 시 ?q= 로 검색어 자동 입력 동선 지원.
  // (Saved → DetailSheet → Cast 클릭 → router.push('/discover?q=name')).
  const searchParams = useSearchParams();
  useSync(); // Supabase 배치 동기화
  const [mounted, setMounted] = useState(false);
  const [topIdx, setTopIdx] = useState(() => {
    if (typeof window === "undefined") return 0;
    const saved = sessionStorage.getItem("neq_top_idx");
    return saved ? Number(saved) : 0;
  });
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  // Save 흡수 모션 (Stage 4 D1, swipe-stack.jsx) — 아래 스와이프 또는 save 클릭 트리거
  const [saveAbsorbing, setSaveAbsorbing] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  /**
   * 카드 중심 → save 버튼까지 변위 (transform translate 단위).
   * 카드 컨테이너 ref + save 버튼 ref measure 해 차분 계산.
   * SwipeCard 내부에서 ref-during-render 회피 위해 부모(page) 가 계산.
   */
  const [saveAbsorbDelta, setSaveAbsorbDelta] = useState<{ tx: number; ty: number } | null>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const cardContainerRef = useRef<HTMLDivElement>(null);
  // TutorialFlow v3 — 첫 진입 4단계 튜토리얼.
  // mount 후 localStorage 1회 점검 → 둘 다 false 면 첫 카드 로드 시점에 노출.
  // tutorialActive 가 true 인 동안 TutorialFlow 가 마운트되며,
  // 사용자 액션 신호(아래 카운터들)로 단계 진행을 인식.
  const [tutorialActive, setTutorialActive] = useState(false);
  // 사용자 액션 카운터 — TutorialFlow 가 baseline 비교로 단계 진행 트리거.
  const [leftSwipeCount, setLeftSwipeCount] = useState(0);
  const [rightSwipeCount, setRightSwipeCount] = useState(0);
  const [saveActionCount, setSaveActionCount] = useState(0);
  const [detailOpenCount, setDetailOpenCount] = useState(0);
  // immersive: 카드 탭 시 상하단 UI 숨김 모드. 2026-05-02 부터 setter 미사용
  // (피드백 #2 — 탭은 DetailSheet 진입으로 단일화). state 자체는 다른 곳에서
  // 참조 중이라 false 고정 상수로 유지. 향후 다른 트리거(long-press 등) 도입 시 setter 부활.
  const [immersive] = useState(false);
  const [rewinding, setRewinding] = useState(false);

  const rec = useRecommendations();
  const detail = useDetailSheet();
  const searchSheet = useDetailSheet();
  const persona = usePersona();
  const [personaOpen, setPersonaOpen] = useState(false);
  const toast = useToast();

  // 위임 J #3 — DetailSheet Cast 클릭 → SearchSheet 그 이름으로 자동 검색.
  // searchInitialQuery 가 SearchSheet 에 prop 으로 전달되며 sheet 가 열릴 때 자동 트리거.
  // 평소(검색 버튼 클릭)에는 빈 문자열 → SearchSheet 가 idle 상태 유지.
  const [searchInitialQuery, setSearchInitialQuery] = useState<string>("");
  // detail.closeDetail() 호출하지 않음 — DetailSheet 유지하면서 SearchSheet 을 위에 띄움.
  // SearchSheet cancel 시 자연스럽게 DetailSheet 이 다시 노출됨 (z-stacking).
  const handleSearchPersonFromDetail = (name: string) => {
    track("detail_to_search_person", { name });
    setSearchInitialQuery(name);
    searchSheet.openDetail();
  };

  // 위임 J #3 — URL ?q= 진입 (Saved 페이지에서 router.push 로 넘어오는 경로).
  // 1회만 발동 (이후 brower back/forward 로 q 가 다시 등장해도 사용자 의도가 아닐 수 있음).
  // q 처리 후 router.replace 로 query 제거 → SearchSheet 닫혔다 다시 열 때 깨끗.
  // setState 는 microtask 로 미뤄 react-hooks/set-state-in-effect 규칙 준수.
  const initialQTriggeredRef = useRef(false);
  useEffect(() => {
    if (initialQTriggeredRef.current) return;
    const q = searchParams.get("q");
    if (!q || q.trim().length === 0) return;
    initialQTriggeredRef.current = true;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setSearchInitialQuery(q);
      searchSheet.openDetail();
      router.replace("/discover");
      track("discover_open_with_q", { q });
    });
    return () => {
      cancelled = true;
    };
    // searchSheet/router 는 안정적 ref. 의존성에 넣어도 무방.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  let filtered = rec.filterOTTs.size === 0
    ? rec.recs
    : rec.recs.filter((r) => r.providers.some((p) => rec.filterOTTs.has(p.name)));

  // 년도 클라이언트 필터
  if (rec.filterYear !== "all") {
    filtered = filtered.filter((r) => {
      const year = parseInt((r.date ?? "").slice(0, 4));
      if (isNaN(year)) return false;
      if (rec.filterYear === "recent") return year >= 2020;
      if (rec.filterYear === "2010s") return year >= 2010 && year <= 2019;
      if (rec.filterYear === "classic") return year <= 2009;
      return true;
    });
  }

  // 별점 클라이언트 필터 — TMDB vote_average 기준 (rec.rating). 7+/8+/9+ 구간.
  if (rec.filterRating !== "all") {
    const min = parseFloat(rec.filterRating);
    filtered = filtered.filter((r) => (r.rating ?? 0) >= min);
  }

  // 별점 필터 활성 + 0 결과 시 자동 추가 로드 (서버는 별점 무관 응답이라 retry 한도 필요).
  // 변경 감지로 attempts 리셋, filtered>0 되면 다음 0 진입 시 다시 시도하도록 0 으로.
  const RATING_AUTO_FETCH_MAX = 3;
  const ratingAutoFetchRef = useRef(0);
  useEffect(() => {
    ratingAutoFetchRef.current = 0;
  }, [rec.filterRating]);
  useEffect(() => {
    if (filtered.length > 0) ratingAutoFetchRef.current = 0;
  }, [filtered.length]);
  useEffect(() => {
    if (rec.filterRating === "all") return;
    if (filtered.length > 0) return;
    if (rec.loading || rec.prefetching) return;
    if (ratingAutoFetchRef.current >= RATING_AUTO_FETCH_MAX) return;
    ratingAutoFetchRef.current += 1;
    rec.prefetchNextBatch();
    // rec 객체 자체는 useRecommendations 가 매 render 새로 만들어 deps 매번 변동 → effect 폭주.
    // 실제 변동을 감지해야 할 primitive 만 의존성으로 둔다 (prefetchNextBatch 도 새 ref 라 제외).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.filterRating, filtered.length, rec.loading, rec.prefetching]);

  const current = filtered[topIdx];
  const isSaved = !!(current && savedIds.has(current.tmdbId));

  // --- nextCard ---
  const nextCard = useCallback(() => {
    if (swipe.swipingRef.current) return;
    const cur = filtered[topIdx];
    if (cur) {
      track("card_swiped", {
        direction: "left",
        tmdb_id: cur.tmdbId,
        title: cur.title,
      });
      addSeenTitles([cur.title, cur.titleEn].filter(Boolean));
    }
    // TutorialFlow v3 — 좌 스와이프 신호 emit
    setLeftSwipeCount((c) => c + 1);
    // 남은 10개 이하 → 다음 배치 백그라운드 프리페치
    if (topIdx >= filtered.length - 10 && !rec.prefetching) {
      rec.prefetchNextBatch();
    }

    // 마지막 카드 → 자동 추가 로드 (무한 append, 발굴 컨셉).
    // 이전: refreshRecommendations + setTopIdx(0) → 새 배치가 들어왔어도 prev recs 와
    // 합쳐지면서 첫 카드로 회귀하는 회귀 버그 (B3). prefetchNextBatch 는 dedupe 후
    // append 하므로 topIdx 가 이어지면 자연스럽게 새 카드 노출.
    // pass 콜백 타이밍 360ms — Handoff v2 Phase C 정량 (feedback_swipe_ux.md).
    if (topIdx >= filtered.length - 1) {
      swipe.setSwiping(true);
      swipe.setDragX(-600);
      swipe.setDragY(0);
      const t = setTimeout(() => {
        swipe.timersRef.current.delete(t);
        swipe.setDragX(0); swipe.setDragY(0); swipe.setSwiping(false);
        if (!rec.loading && !rec.prefetching) {
          rec.prefetchNextBatch();
        }
        setTopIdx((i) => i + 1);
      }, 360);
      swipe.timersRef.current.add(t);
      return;
    }

    swipe.setSwiping(true);
    swipe.setDragX(-600);
    swipe.setDragY(0);
    const t = setTimeout(() => {
      swipe.timersRef.current.delete(t);
      setTopIdx((i) => i + 1);
      swipe.setDragX(0); swipe.setDragY(0); swipe.setSwiping(false);
      swipe.scrollRef.current?.scrollTo({ top: 0 });
    }, 360);
    swipe.timersRef.current.add(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topIdx, filtered.length, rec.prefetching]);

  // detail_opened 래퍼 — source/providers_count 계측 추가.
  // /saved 페이지와 구분해서 discover 내 각 진입 경로(탭/액션바/스와이프/키보드) 비교용
  // 사용자 직접 테스트 #6: 카드 컨테이너 rect 측정 → hero morph origin 으로 전달.
  const openDetailTracked = useCallback((source: string) => {
    const cur = filtered[topIdx];
    if (cur) {
      track("detail_opened", {
        tmdb_id: cur.tmdbId,
        title: cur.title,
        providers_count: cur.providers.length,
        source,
      });
    }
    // SwipeCard 자체 rect 사용 — variant A/B/C 무관, top 카드만 origin.
    // [data-swipe-card-top] 마커로 querySelector 접근. 카드 transform/scale 영향 받은
    // 최종 viewport 좌표가 그대로 morph 시작점이 되어야 자연스러움.
    let originRect: { left: number; top: number; width: number; height: number } | null = null;
    if (typeof document !== "undefined") {
      const cardEl = document.querySelector("[data-swipe-card-top]") as HTMLElement | null;
      if (cardEl) {
        const r = cardEl.getBoundingClientRect();
        originRect = { left: r.left, top: r.top, width: r.width, height: r.height };
      }
    }
    detail.openDetail(originRect);
    // TutorialFlow v3 — Detail 진입 신호 emit (탭/액션바/키보드 등 모든 source 포함)
    setDetailOpenCount((c) => c + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topIdx, filtered.length, detail.openDetail]);

  /**
   * Save 흡수 모션 — Stage 4 D1, swipe-stack.jsx 패턴.
   *  1) save 버튼 좌표 계산 → 카드의 흡수 목표점 설정
   *  2) absorbing=true → SwipeCard 가 scale 0.12 + 좌표 이동 + 페이드아웃
   *  3) flash=true → save 버튼 강조 (600ms)
   *  4) ~480ms 후 카드 advance + state 리셋
   */
  const triggerSaveAbsorption = useCallback((reason: "swipe_down" | "button") => {
    if (!current) return;
    if (saveAbsorbing) return;
    const id = current.tmdbId;
    const alreadySaved = savedIds.has(id);

    // 좌표 계산 — save 버튼 중심 vs 카드 컨테이너 중심 차분
    if (
      saveBtnRef.current &&
      cardContainerRef.current &&
      typeof window !== "undefined"
    ) {
      const btnRect = saveBtnRef.current.getBoundingClientRect();
      const containerRect = cardContainerRef.current.getBoundingClientRect();
      const cardCenterX = containerRect.left + containerRect.width / 2;
      const cardCenterY = containerRect.top + containerRect.height / 2;
      const targetX = btnRect.left + btnRect.width / 2;
      const targetY = btnRect.top + btnRect.height / 2;
      setSaveAbsorbDelta({ tx: targetX - cardCenterX, ty: targetY - cardCenterY });
    }

    // 사이클 2 통일 매핑: save 액션 = medium (native: ImpactFeedbackStyle.Medium)
    vibrate("medium");
    if (alreadySaved) {
      // 이미 저장됨 → unsave (toggle)
      track("card_unsaved", { tmdb_id: id });
      removeSaved(id);
      setSavedIds((s) => { const n = new Set(s); n.delete(id); return n; });
      // 흡수 모션은 unsave 시에는 발사하지 않음 (저장 의미 없음). flash 만.
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 600);
      return;
    }
    track("card_saved", { tmdb_id: id, title: current.title, source: reason });
    addSaved(current);
    setSavedIds((s) => new Set(s).add(id));
    // TutorialFlow v3 — save 신호 emit (swipe-down 또는 button 둘 다 카운트)
    setSaveActionCount((c) => c + 1);
    setSaveAbsorbing(true);
    setSaveFlash(true);
    swipe.setSwiping(true);
    // flash 600ms / 흡수 480ms 동기화 (swipe-stack.jsx)
    setTimeout(() => setSaveFlash(false), 600);
    setTimeout(() => {
      setSaveAbsorbing(false);
      setSaveAbsorbDelta(null);
      setTopIdx((i) => i + 1);
      swipe.setDragX(0);
      swipe.setDragY(0);
      swipe.setSwiping(false);
      swipe.scrollRef.current?.scrollTo({ top: 0 });
    }, 480);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, saveAbsorbing, savedIds]);

  const swipe = useSwipeGesture({
    topIdx,
    filteredLength: filtered.length,
    nextCard,
    setTopIdx,
    onSwipeDown: () => {
      if (!current) return;
      track("card_swiped", {
        direction: "down",
        tmdb_id: current.tmdbId,
        title: current.title,
      });
      triggerSaveAbsorption("swipe_down");
    },
    onSwipeUp: () => {
      // G1-A (Handoff v2 Phase B): ↑ 스와이프 제거 → 탭 단일 진입.
      // useSwipeGesture 의 onSwipeUp 콜백은 이제 tap 분기에서만 호출됨.
      // PostHog source 는 "card_tap" 으로 일관 — direction:"up" 이벤트는 더 이상 발사 X.
      openDetailTracked("card_tap");
    },
    onPrevCard: () => {
      const cur = filtered[topIdx];
      if (cur) {
        track("card_swiped", {
          direction: "right",
          tmdb_id: cur.tmdbId,
          title: cur.title,
        });
      }
      // TutorialFlow v3 — 우 스와이프(prev) 신호 emit
      setRightSwipeCount((c) => c + 1);
    },
  });

  // 사용자 직접 테스트 (2026-05-02) 피드백 #2: 카드 탭 단일화 (포스터 하이라이트 제거).
  // 이전: 탭 → setImmersive 토글 (+ useSwipeGesture 의 onSwipeUp 도 동시 발사 → 이중 동작).
  // 변경: 탭 → DetailSheet 진입만. ArrowUp / ActionBar 진입 경로는 그대로 보존.
  // immersive state 자체는 보존 — 다른 트리거가 없으므로 사실상 false 고정.
  const handleCardTap = useCallback(() => {
    if (swipe.swiping) return;
    openDetailTracked("card_tap");
  }, [swipe.swiping, openDetailTracked]);

  /**
   * 사용자 직접 테스트 #7 — DetailSheet 안에서 직접 save toggle.
   * 카드 액션바의 toggleSave 와는 다른 경로 (absorbing 모션 미동반):
   *   - DetailSheet 컨텍스트라 흡수 모션이 의미 없음 (카드 -> 버튼 변위 X)
   *   - 명시적 toast 로 사용자 피드백 (Round 3 v2 잠금 카피).
   * tracking source 로 "detail_save_button" 분기.
   */
  const handleDetailSaveToggle = useCallback(
    (r: Recommendation) => {
      const id = r.tmdbId;
      const alreadySaved = savedIds.has(id);
      vibrate("light");
      if (alreadySaved) {
        track("card_unsaved", { tmdb_id: id, source: "detail_save_button" });
        removeSaved(id);
        setSavedIds((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
        toast.show("remove", {
          ctx: { title: r.title },
          onAction: () => {
            // 실행 취소 — 다시 저장
            addSaved(r);
            setSavedIds((prev) => new Set(prev).add(id));
          },
        });
        return;
      }
      track("card_saved", {
        tmdb_id: id,
        title: r.title,
        source: "detail_save_button",
      });
      addSaved(r);
      setSavedIds((s) => new Set(s).add(id));
      toast.show("save", {
        ctx: { title: r.title },
        onAction: () => {
          // 실행 취소 — 저장 해제
          removeSaved(id);
          setSavedIds((prev) => {
            const n = new Set(prev);
            n.delete(id);
            return n;
          });
        },
      });
    },
    [savedIds, toast],
  );

  const handleShare = useCallback(async (r: Recommendation) => {
    const providers = r.providers.map((p) => p.name).join(", ");
    const shareUrl = `${window.location.origin}/share/${r.tmdbId}?type=${r.type}`;
    const body = [
      `\uD83C\uDFAC ${r.title}`,
      r.reason,
      "",
      providers ? `\uD83D\uDCFA ${providers}` : null,
      `\u2B50 ${r.rating.toFixed(1)}`,
      "",
      shareUrl,
    ].filter((line) => line !== null).join("\n");
    if (navigator.share) {
      try {
        await navigator.share({ title: r.title, text: body, url: shareUrl });
        track("card_shared", { tmdb_id: r.tmdbId, title: r.title });
      } catch {}
    } else {
      await navigator.clipboard.writeText(body);
      track("card_shared", { tmdb_id: r.tmdbId, title: r.title });
    }
  }, []);

  const toggleSave = () => {
    triggerSaveAbsorption("button");
  };

  // --- effects ---
  useEffect(() => {
    const saved = getSaved();
    if (!hasOnboarded() && saved.length === 0) {
      router.replace("/onboarding");
      return;
    }
    setMounted(true);
    rec.loadRecs("all", "all");
    setSavedIds(new Set(saved.map((s) => s.recommendation.tmdbId)));
    return () => { swipe.clearTimers(); rec.abortLoading(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") nextCard();
      else if (e.key === "ArrowRight") swipe.prevCard();
      else if (e.key === "ArrowUp") openDetailTracked("keyboard");
      else if (e.key === "Escape") {
        // 위임 K — personaOpen 이 열려 있으면 그것부터 닫음 (ESC 우선순위).
        if (personaOpen) setPersonaOpen(false);
        else detail.closeDetail();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [nextCard, swipe.prevCard, detail.openDetail, detail.closeDetail, personaOpen]);

  // 현재 topIdx 기준 다음 4장만 프리로드 (LCP/메인 스레드 보호)
  useEffect(() => {
    const preloadRange = filtered.slice(topIdx, topIdx + 4);
    preloadRange.forEach((r) => {
      if (r.posterUrl) {
        const img = new window.Image();
        img.src = r.posterUrl;
      }
    });
  }, [filtered, topIdx]);

  // topIdx를 sessionStorage에 저장 (Saved 페이지 왕복 시 복원용)
  useEffect(() => {
    if (mounted) sessionStorage.setItem("neq_top_idx", String(topIdx));
  }, [topIdx, mounted]);

  // filtered가 줄어들었을 때 topIdx 클램프 (OTT 필터 변경 등)
  useEffect(() => {
    if (filtered.length > 0 && topIdx >= filtered.length) {
      setTopIdx(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, topIdx]);

  // 프리페치: 남은 카드 10장 이하 + 스와이프 시작한 이후에만
  useEffect(() => {
    if (topIdx === 0) return; // 첫 로드 직후 프리페치 방지
    const remaining = filtered.length - topIdx;
    if (remaining <= 10 && !rec.loading && !rec.prefetching && filtered.length > 0) {
      rec.prefetchNextBatch();
    }
  }, [topIdx, filtered.length, rec.loading, rec.prefetching]);

  // TutorialFlow v3 노출 정책:
  //   - localStorage 키 `tutorialV3Shown` 또는 (기존) `neq_coach_v2_shown` 둘 중 하나라도 1 이면 미노출
  //   - 둘 다 false 이고 첫 카드 로드 완료된 시점에 활성화
  // mount 직후 1회만 점검. 첫 카드 로드 감지는 별도 effect 에서 filtered.length 의존성으로.
  const [tutorialEligible, setTutorialEligible] = useState(false);
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    const v3Done = localStorage.getItem("tutorialV3Shown") === "1";
    const v2Done = localStorage.getItem("neq_coach_v2_shown") === "1";
    setTutorialEligible(!v3Done && !v2Done);
  }, []);
  // 첫 카드 로드되면 tutorial 활성화. (eligible=false 면 무시)
  useEffect(() => {
    if (!tutorialEligible) return;
    if (!mounted) return;
    if (filtered.length === 0) return;
    if (tutorialActive) return;
    setTutorialActive(true);
    // tutorialActive 는 의존성에서 제외 — 자기 자신을 트리거하지 않게 함.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialEligible, mounted, filtered.length]);

  const handleTutorialClose = useCallback(
    (_reason: "completed" | "skipped", _payload: { stepsCompleted: number; atStep: TutorialStep }) => {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("tutorialV3Shown", "1");
      }
      setTutorialActive(false);
      setTutorialEligible(false);
    },
    [],
  );

  // --- shared props ---
  const chipsProps = {
    filterType: rec.filterType, filterOrigin: rec.filterOrigin, filterYear: rec.filterYear, filterRating: rec.filterRating, filterOTTs: rec.filterOTTs,
    recs: rec.recs, loading: rec.loading, onFilterChange: rec.handleFilterChange,
    onYearChange: (y: FilterYear) => {
      rec.setFilterYear(y);
      sessionStorage.setItem("neq_filter_year", y);
      setTopIdx(0);
      // 년도 필터 변경 시 서버에서 해당 년도 작품을 가져오도록 새로 요청
      if (y !== "all") rec.loadRecs(rec.filterType, rec.filterOrigin, y);
    },
    onRatingChange: (r: FilterRating) => {
      rec.setFilterRating(r);
      sessionStorage.setItem("neq_filter_rating", r);
      setTopIdx(0);
      // 별점은 클라이언트 필터 — 서버 재요청 불필요. recs 그대로 두고 filtered 만 변동.
    },
    onOTTChange: (otts: Set<string>) => {
      rec.handleOTTChange(otts);
      setTopIdx(0);
    }, onResetTopIdx: () => setTopIdx(0),
  };
  const filterLabel = [
    rec.filterOrigin === "kr" ? "국내" : rec.filterOrigin === "foreign" ? "해외" : "",
    rec.filterType === "movie" ? "영화" : rec.filterType === "series" ? "시리즈" : rec.filterType === "variety" ? "예능" : "",
  ].filter(Boolean).join(" ");

  // --- status screens ---
  if (!mounted) {
    // mounted 전: 온보딩 체크 중이거나 리다이렉트 중 → 빈 배경만 표시
    return <div className="h-dvh" style={{ background: "var(--background)" }} />;
  }
  if (rec.loading) {
    const isFirstLoad =
      rec.recs.length === 0 && hasOnboarded() && getSaved().length === 0;
    if (isFirstLoad) return <FirstLoadingSkeleton />;
    return <LoadingScreen filterLabel={filterLabel} {...chipsProps} />;
  }
  if (rec.loadError) return <ErrorScreen error={rec.loadError} onRetry={() => rec.loadRecs(rec.filterType, rec.filterOrigin)} {...chipsProps} />;
  if (filtered.length === 0) {
    // 별점 필터 활성 + retry 여유 있을 때 자동 로드 중 — LoadingScreen.
    if (
      rec.filterRating !== "all"
      && (rec.prefetching || ratingAutoFetchRef.current < RATING_AUTO_FETCH_MAX)
    ) {
      return <LoadingScreen filterLabel={`별점 ${rec.filterRating}+`} {...chipsProps} />;
    }
    const hasF = rec.filterType !== "all" || rec.filterOrigin !== "all" || rec.filterYear !== "all" || rec.filterRating !== "all" || rec.filterOTTs.size > 0;
    // 온보딩 완료했거나 saved 있으면 cold start 아님 → 필터 좁음 메시지 대신 일반 empty 메시지
    const isCold = !hasOnboarded() && getSaved().length === 0;
    return <EmptyScreen hasFilter={hasF} isColdStart={isCold} onResetFilter={() => { rec.handleFilterChange("all", "all"); rec.setFilterYear("all"); rec.setFilterRating("all"); rec.handleOTTChange(new Set()); }} onRefresh={rec.refreshRecommendations} {...chipsProps} />;
  }
  // topIdx 가 stack 끝을 넘긴 상태 (B3 fix 후 무한 추가 로드 흐름).
  // prefetch 진행 중이면 LoadingScreen, 아니면 EmptyScreen.
  if (topIdx >= filtered.length) {
    if (rec.prefetching) {
      return <LoadingScreen filterLabel={filterLabel} {...chipsProps} />;
    }
    const hasF = rec.filterType !== "all" || rec.filterOrigin !== "all" || rec.filterYear !== "all" || rec.filterRating !== "all" || rec.filterOTTs.size > 0;
    return <EmptyScreen hasFilter={hasF} isColdStart={false} onResetFilter={() => { rec.handleFilterChange("all", "all"); rec.setFilterYear("all"); rec.setFilterRating("all"); rec.handleOTTChange(new Set()); }} onRefresh={() => { setTopIdx(0); rec.refreshRecommendations(); }} {...chipsProps} />;
  }

  const deckCards = filtered.slice(topIdx, topIdx + 3).reverse();

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
      <div
        className="transition-all duration-300"
        style={{ opacity: immersive ? 0 : 1, maxHeight: immersive ? 0 : 48, overflow: "hidden" }}
      >
        <DiscoverHeader
          persona={persona}
          personaOpen={personaOpen}
          onPersonaToggle={setPersonaOpen}
          onAddPersona={() => router.push("/profile")}
          onPersonaSwitch={(id) => {
            persona.switchPersona(id);
            rec.abortLoading();
            rec.setFilterYear("all");
            rec.setFilterRating("all");
            setTopIdx(0);
            sessionStorage.removeItem("neq_top_idx");
            rec.loadRecs("all", "all");
            const target = persona.personas.find((p) => p.id === id);
            track("persona_switched", { persona_id: id, persona_name: target?.name });
          }}
          onSearchOpen={() => {
            track("search_opened");
            // 위임 J #3 — 검색 버튼으로 진입 시 initialQuery 비움 (이전 인물 검색 잔해 제거).
            setSearchInitialQuery("");
            searchSheet.openDetail();
          }}
        />
      </div>
      <div className="transition-all duration-300 relative z-20" style={{ opacity: immersive ? 0 : 1, maxHeight: immersive ? 0 : 60, overflow: immersive ? "hidden" : "visible", pointerEvents: immersive ? "none" : "auto" }}>
        <FilterChips {...chipsProps} />
      </div>

      <DiscoverDeck
        scrollRef={swipe.scrollRef}
        cardContainerRef={cardContainerRef}
        swipe={swipe}
        deckCards={deckCards}
        prevCard={filtered.length > 1 ? filtered[topIdx > 0 ? topIdx - 1 : filtered.length - 1] : null}
        loading={rec.loading}
        prefetching={rec.prefetching}
        saveAbsorbing={saveAbsorbing}
        saveAbsorbDelta={saveAbsorbDelta}
        immersive={immersive}
        rewinding={rewinding}
        rewindCards={filtered.slice(0, topIdx).reverse()}
        onCardTap={handleCardTap}
        onRewindComplete={() => {
          setTopIdx(0);
          setRewinding(false);
          swipe.setDragX(0);
          swipe.setDragY(0);
          swipe.setSwiping(false);
          swipe.scrollRef.current?.scrollTo({ top: 0 });
        }}
        metaInfo={metaInfo}
      />

      {/* 2026-05-02 사용자 직접 테스트 D-2 #7:
          ActionBar wrap 의 overflow: "hidden" 이 save 버튼 flash 시
          glow shadow (32px) 와 scale(1.15) 의 상단 부분을 잘라내고 있었음.
          immersive 모드에서만 maxHeight 0 에 맞춰 overflow hidden 이 필요하므로
          해당 분기에만 적용. 평소엔 visible 로 두어 카드 영역 위로 glow 자연 전파. */}
      <div
        className="transition-all duration-300"
        style={{
          opacity: immersive ? 0 : 1,
          maxHeight: immersive ? 0 : 200,
          overflow: immersive ? "hidden" : "visible",
        }}
      >
        <ActionBar
          ref={saveBtnRef}
          isSaved={isSaved}
          canRewind={topIdx > 0}
          saveFlash={saveFlash}
          savePulling={swipe.dragY > 30 && swipe.dragging.current}
          onShare={() => current && handleShare(current)}
          onOpenDetail={() => openDetailTracked("action_bar")}
          onToggleSave={toggleSave}
          onRewind={() => {
            if (topIdx === 0 || swipe.swipingRef.current || rewinding) return;
            // 사이클 2 통일 매핑: rewind = light (가벼운 토글)
            vibrate("light");
            // 되감기 오버레이 활성화 — rAF 기반 VHS 되감기 애니메이션
            swipe.setSwiping(true);
            setRewinding(true);
          }}
          onRefresh={() => { vibrate("light"); setTopIdx(0); rec.refreshRecommendations(); }} />
      </div>

      {/* 첫 카드 힌트 토스트 */}
      {swipe.firstCardHint && (
        <div className="fixed top-16 left-0 right-0 z-40 flex justify-center animate-fade-in">
          <div
            className="px-4 py-2.5 text-sm rounded-lg flex items-center gap-2"
            style={{
              background: "var(--surface-raised)",
              color: "var(--text-primary)",
              boxShadow: "var(--shadow-toast)",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--accent)" }} />
            첫 번째 작품이에요
          </div>
        </div>
      )}
      {/* TutorialFlow v3 — 첫 진입 4단계 튜토리얼 (좌/우/하 스와이프 + 탭).
          기존 CoachMark v2 + TutorialOverlay 통합 후 대체. ↑ 스와이프 미포함. */}
      {tutorialActive && filtered[0] && (
        <TutorialFlow
          recForDemo={filtered[0]}
          userActionSignals={{
            leftSwipeCount,
            rightSwipeCount,
            saveActionCount,
            detailOpenCount,
          }}
          onClose={handleTutorialClose}
        />
      )}
      {current && detail.showDetail && <DetailSheet rec={current} showDetail={detail.showDetail} detailY={detail.detailY}
        detailAnimating={detail.detailAnimating} detailBodyRef={detail.detailBodyRef} onClose={detail.closeDetail}
        onDetailTouchStart={detail.onDetailTouchStart} onDetailTouchMove={detail.onDetailTouchMove}
        onDetailTouchEnd={detail.onDetailTouchEnd} onShare={handleShare}
        savedIds={savedIds} onToggleSave={handleDetailSaveToggle}
        morphRect={detail.morphRect} morphPhase={detail.morphPhase}
        onSearchPerson={handleSearchPersonFromDetail} />}
      <SearchSheet
        show={searchSheet.showDetail}
        sheetY={searchSheet.detailY}
        animating={searchSheet.detailAnimating}
        bodyRef={searchSheet.detailBodyRef}
        onClose={searchSheet.closeDetail}
        onTouchStart={searchSheet.onDetailTouchStart}
        onTouchMove={searchSheet.onDetailTouchMove}
        onTouchEnd={searchSheet.onDetailTouchEnd}
        initialQuery={searchInitialQuery}
      />
    </div>
  );
}
