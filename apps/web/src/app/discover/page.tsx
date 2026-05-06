"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addSaved,
  removeSaved,
  getSaved,
  addSeenTitles,
  getWatchReports,
  hasOnboarded,
} from "@/lib/store";
import { vibrate } from "@/lib/haptics";
import { track } from "@/lib/analytics";
import { getPrimaryCountryName } from "@/lib/country-names";
import type { Recommendation } from "@/lib/types";
import type { FilterYear } from "@/lib/discover-types";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { useDetailSheet } from "@/hooks/useDetailSheet";
import { useRecommendations } from "@/hooks/useRecommendations";
import FilterChips from "@/components/discover/FilterChips";
import DetailSheet from "@/components/discover/DetailSheet";
import SwipeCard from "@/components/discover/SwipeCard";
import PrevCardOverlay from "@/components/discover/PrevCardOverlay";
import ActionBar from "@/components/discover/ActionBar";
import CoachMark, { type CoachStep } from "@/components/discover/CoachMark";
import { LoadingScreen, ErrorScreen, EmptyScreen } from "@/components/discover/StatusScreens";
import FirstLoadingSkeleton from "@/components/discover/FirstLoadingSkeleton";
import SearchSheet from "@/components/discover/SearchSheet";
import RewindOverlay from "@/components/discover/RewindOverlay";
import { useSync } from "@/hooks/useSync";
import { usePersona } from "@/contexts/PersonaContext";
import { IconSearch } from "@/components/Icons";
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
  const [coachDone, setCoachDone] = useState<Record<CoachStep, boolean>>({
    swipe: false,
    save: false,
    persona: false,
  });
  const [coachV2Shown, setCoachV2Shown] = useState(true); // 기본 true — mount 후 localStorage 확인하고 조정
  const [coachSwipeAction, setCoachSwipeAction] = useState(false);
  const [coachSaveAction, setCoachSaveAction] = useState(false);
  // immersive: 카드 탭 시 상하단 UI 숨김 모드. 2026-05-02 부터 setter 미사용
  // (피드백 #2 — 탭은 DetailSheet 진입으로 단일화). state 자체는 다른 곳에서
  // 참조 중이라 false 고정 상수로 유지. 향후 다른 트리거(long-press 등) 도입 시 setter 부활.
  const [immersive] = useState(false);
  const [reentryNudge, setReentryNudge] = useState<string | null>(null);
  const [rewinding, setRewinding] = useState(false);

  const rec = useRecommendations();
  const detail = useDetailSheet();
  const searchSheet = useDetailSheet();
  const persona = usePersona();
  const [personaOpen, setPersonaOpen] = useState(false);
  const toast = useToast();

  // 위임 P #2 (2026-05-02) — 페르소나 드롭다운 회귀 수정.
  // Root cause: 헤더 wrapper 의 inline `overflow: hidden` + `maxHeight: 48` 가 dropdown 을
  // 잘라 화면에 안 보임 (dropdown 의 z-40 과 무관 — clipping 문제). 사용자: "목록이 보이지 않아요".
  // 해결: dropdown 을 createPortal 로 document.body 에 직접 마운트해서 헤더 clipping 회피.
  // 좌표는 chipRef.getBoundingClientRect() + window.scroll* 로 페이지 절댓값 계산.
  const personaChipRef = useRef<HTMLButtonElement>(null);
  const [personaDropdownPos, setPersonaDropdownPos] = useState<{
    left: number;
    top: number;
  } | null>(null);
  useEffect(() => {
    if (!personaOpen || !personaChipRef.current) {
      setPersonaDropdownPos(null);
      return;
    }
    const r = personaChipRef.current.getBoundingClientRect();
    // dropdown 가운데 정렬 + 6px 간격
    setPersonaDropdownPos({
      left: r.left + r.width / 2,
      top: r.bottom + 6,
    });
  }, [personaOpen]);

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
    // 남은 10개 이하 → 다음 배치 백그라운드 프리페치
    if (topIdx >= filtered.length - 10 && !rec.prefetching) {
      rec.prefetchNextBatch();
    }

    // 마지막 카드 → 스와이프 애니메이션 후 새 배치 로드
    // pass 콜백 타이밍 360ms — Handoff v2 Phase C 정량 (feedback_swipe_ux.md):
    // 사용자 잠금 결정 — save 480ms / pass 360ms.
    if (topIdx >= filtered.length - 1) {
      swipe.setSwiping(true);
      swipe.setDragX(-600);
      swipe.setDragY(0);
      const t = setTimeout(() => {
        swipe.timersRef.current.delete(t);
        swipe.setDragX(0); swipe.setDragY(0); swipe.setSwiping(false);
        // 새 배치 로드 — topIdx를 0으로 먼저 세팅하고 로딩 시작
        // (로딩 중엔 LoadingScreen이 표시됨)
        if (!rec.loading && !rec.prefetching) {
          rec.refreshRecommendations();
        }
        setTopIdx(0);
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
    setCoachSaveAction(true);
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

  // CoachMark v2 초기 상태 — mount 시 1회 localStorage 읽기
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    setCoachV2Shown(localStorage.getItem("neq_coach_v2_shown") === "1");
    setCoachDone({
      swipe: localStorage.getItem("neq_coach_swipe_done") === "1",
      save: localStorage.getItem("neq_coach_save_done") === "1",
      persona: localStorage.getItem("neq_coach_persona_done") === "1",
    });
  }, []);

  // 스와이프 액션 → coach dismiss 트리거 (topIdx가 0에서 한 번이라도 증가하면)
  useEffect(() => {
    if (topIdx > 0) setCoachSwipeAction(true);
  }, [topIdx]);
  // save coach의 action dismiss는 toggleSave 내부에서 직접 setCoachSaveAction 호출 (자동 시드/sync로 인한 savedIds 변화 오탐 방지)

  const handleCoachDismiss = useCallback((step: CoachStep) => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(`neq_coach_${step}_done`, "1");
    setCoachDone((prev) => {
      const next = { ...prev, [step]: true };
      if (next.swipe && next.save && next.persona) {
        localStorage.setItem("neq_coach_v2_shown", "1");
        setCoachV2Shown(true);
      }
      return next;
    });
  }, []);

  // 재진입 넛지: 어제 저장한 미시청 작품이 있으면 토스트 표시
  useEffect(() => {
    if (!mounted) return;
    if (typeof sessionStorage === "undefined") return;
    if (sessionStorage.getItem("neq_reentry_nudge_shown")) return;

    const savedItems = getSaved();
    const reportsList = getWatchReports();
    const reportedIds = new Set(reportsList.map((r) => r.tmdbId));
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    const candidate = savedItems.find(
      (s) =>
        !reportedIds.has(s.recommendation.tmdbId) &&
        now - s.savedAt > ONE_DAY
    );

    if (candidate) {
      setReentryNudge(candidate.recommendation.title);
      sessionStorage.setItem("neq_reentry_nudge_shown", "1");
      track("reentry_nudge_shown", { tmdb_id: candidate.recommendation.tmdbId });
      const t = setTimeout(() => setReentryNudge(null), 5000);
      return () => clearTimeout(t);
    }
  }, [mounted]);

  // --- shared props ---
  const chipsProps = {
    filterType: rec.filterType, filterOrigin: rec.filterOrigin, filterYear: rec.filterYear, filterOTTs: rec.filterOTTs,
    recs: rec.recs, loading: rec.loading, onFilterChange: rec.handleFilterChange,
    onYearChange: (y: FilterYear) => {
      rec.setFilterYear(y);
      sessionStorage.setItem("neq_filter_year", y);
      setTopIdx(0);
      // 년도 필터 변경 시 서버에서 해당 년도 작품을 가져오도록 새로 요청
      if (y !== "all") rec.loadRecs(rec.filterType, rec.filterOrigin, y);
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
    const hasF = rec.filterType !== "all" || rec.filterOrigin !== "all" || rec.filterYear !== "all" || rec.filterOTTs.size > 0;
    // 온보딩 완료했거나 saved 있으면 cold start 아님 → 필터 좁음 메시지 대신 일반 empty 메시지
    const isCold = !hasOnboarded() && getSaved().length === 0;
    return <EmptyScreen hasFilter={hasF} isColdStart={isCold} onResetFilter={() => { rec.handleFilterChange("all", "all"); rec.setFilterYear("all"); rec.handleOTTChange(new Set()); }} onRefresh={rec.refreshRecommendations} {...chipsProps} />;
  }

  const deckCards = filtered.slice(topIdx, topIdx + 3).reverse();

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
      <div className="flex items-center justify-between px-5 py-3 shrink-0 transition-all duration-300"
        style={{ opacity: immersive ? 0 : 1, maxHeight: immersive ? 0 : 48, overflow: "hidden" }}>
        <img src="/neq-logo.png" alt="neq," className="h-5 object-contain" />
        {persona.personas.length > 1 && (
          <div className="relative">
            {/* 위임 K #1 (2026-05-02) — 페르소나 전환 chip.
                이전: 텍스트 + 8px chevron (배경/border 없음) → 인터랙션 어포던스 부재.
                변경: chip 스타일 (bg + border) + dot indicator + chevron 키워.
                활성 페르소나 이름은 var(--accent) 로 강조하여 "현재 어떤 취향" 인지 명확히. */}
            <button
              ref={personaChipRef}
              onClick={() => setPersonaOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={personaOpen}
              aria-label={`취향 전환: 현재 ${persona.activePersona?.name ?? "기본"} (${persona.personas.length}개 중)`}
              className="flex items-center gap-1.5 h-9 px-3 active:scale-95 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2 rounded-full"
              style={{
                background: personaOpen ? "var(--accent-dim)" : "var(--surface)",
                border: `1px solid ${personaOpen ? "var(--accent-border)" : "var(--border-subtle)"}`,
              }}
            >
              <span
                aria-hidden="true"
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: "var(--accent)" }}
              />
              <span
                className="text-xs font-medium"
                style={{
                  color: personaOpen ? "var(--accent)" : "var(--text-primary)",
                  transition: "color 150ms var(--ease-enter)",
                }}
              >
                {persona.activePersona?.name ?? "기본"}
              </span>
              <svg
                width="9"
                height="9"
                viewBox="0 0 8 8"
                fill="none"
                aria-hidden="true"
                style={{
                  transform: personaOpen ? "rotate(180deg)" : "none",
                  transition: "transform 150ms var(--ease-enter)",
                  opacity: 0.6,
                }}
              >
                <path
                  d="M1 2.5L4 5.5L7 2.5"
                  stroke={personaOpen ? "var(--accent)" : "var(--text-muted)"}
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {/* 위임 P #2 — dropdown 을 createPortal 로 body 에 직접 마운트해
                헤더 wrapper 의 overflow:hidden clipping 회피. 좌표는 chip rect 기준 절댓값. */}
            {personaOpen && personaDropdownPos && typeof document !== "undefined" &&
              createPortal(
                <>
                  <div
                    className="fixed inset-0"
                    style={{ zIndex: 60 }}
                    onClick={() => setPersonaOpen(false)}
                    aria-hidden="true"
                  />
                  <div
                    role="listbox"
                    aria-label="취향 목록"
                    className="fixed min-w-[200px] py-1.5 rounded-xl"
                    style={{
                      // chip 가로 가운데 정렬 + 6px 간격. transform 으로 -50%.
                      left: personaDropdownPos.left,
                      top: personaDropdownPos.top,
                      transform: "translateX(-50%)",
                      zIndex: 61,
                      background: "var(--surface-raised)",
                      border: "1px solid var(--border)",
                      boxShadow: "var(--shadow-lg)",
                      animation: "fade-in 150ms var(--ease-enter)",
                    }}
                  >
                    <div
                      className="px-4 pt-1 pb-1.5 text-[10px] uppercase tracking-wider font-data"
                      style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}
                    >
                      취향 전환
                    </div>
                    {persona.personas.map((p) => (
                      <button
                        key={p.id}
                        role="option"
                        aria-selected={p.id === persona.activePersonaId}
                        onClick={() => {
                          if (p.id !== persona.activePersonaId) {
                            persona.switchPersona(p.id);
                            rec.abortLoading();
                            rec.setFilterYear("all");
                            setTopIdx(0);
                            sessionStorage.removeItem("neq_top_idx");
                            rec.loadRecs("all", "all");
                            track("persona_switched", { persona_id: p.id, persona_name: p.name });
                          }
                          setPersonaOpen(false);
                        }}
                        className="w-full flex items-center px-4 h-12 text-sm active:scale-[0.98] transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:-outline-offset-2"
                        style={{
                          color: p.id === persona.activePersonaId ? "var(--accent)" : "var(--text-primary)",
                          background: p.id === persona.activePersonaId ? "var(--accent-dim)" : "transparent",
                        }}
                      >
                        {p.name}
                        {p.id === persona.activePersonaId && (
                          <svg className="ml-auto" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    ))}
                    <div
                      className="my-1 mx-4 h-px"
                      style={{ background: "var(--border-subtle)" }}
                      aria-hidden="true"
                    />
                    {persona.personas.length < 3 ? (
                      <button
                        onClick={() => {
                          setPersonaOpen(false);
                          router.push("/profile");
                        }}
                        className="w-full flex items-center px-4 h-11 text-xs active:scale-[0.98] transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:-outline-offset-2"
                        style={{ color: "var(--text-muted)" }}
                      >
                        + 새 취향 추가
                      </button>
                    ) : (
                      <div className="px-4 py-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                        최대 3개까지 만들 수 있어요
                      </div>
                    )}
                  </div>
                </>,
                document.body,
              )}
          </div>
        )}
        <button
          onClick={() => {
            track("search_opened");
            // 위임 J #3 — 검색 버튼으로 진입 시 initialQuery 비움 (이전 인물 검색 잔해 제거).
            setSearchInitialQuery("");
            searchSheet.openDetail();
          }}
          aria-label="검색 열기"
          className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
        >
          <IconSearch size={18} color="var(--text-muted)" />
        </button>
      </div>
      <div className="transition-all duration-300 relative z-20" style={{ opacity: immersive ? 0 : 1, maxHeight: immersive ? 0 : 60, overflow: immersive ? "hidden" : "visible", pointerEvents: immersive ? "none" : "auto" }}>
        <FilterChips {...chipsProps} />
      </div>

      <div ref={swipe.scrollRef} className="flex-1 min-h-0" style={{ overflowY: "hidden", overscrollBehavior: "none" }}>
        <div ref={cardContainerRef} className="relative px-3 pb-2"
          style={{ height: "100%", touchAction: "none" }}
          onTouchStart={swipe.onTouchStart} onTouchMove={swipe.onTouchMove} onTouchEnd={swipe.onTouchEnd}>
          {/* 아래 스와이프 힌트 — Stage 4 D1: save 액션 진입 신호.
              dragY > 30 이상이면 카드가 살짝 작아지고 (SwipeCard 내부) save 버튼이 부풀음 (savePulling) */}
          {swipe.dragY > 30 && !saveAbsorbing && (
            <div
              className="absolute inset-x-0 bottom-20 z-20 flex justify-center"
              style={{
                pointerEvents: "none",
                opacity: Math.min(1, (swipe.dragY - 30) / 40),
                transition: swipe.dragging.current ? "none" : "opacity 0.25s ease-out",
              }}
            >
              <div
                className="px-3.5 py-1.5 text-xs flex items-center gap-1.5 rounded-full"
                style={{
                  background: "var(--bg-overlay-heavy)",
                  color: "var(--accent)",
                  border: "1px solid var(--accent-border-light)",
                  fontFamily: "var(--font-data)",
                  letterSpacing: "0.04em",
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 21s-7-4.5-9.5-9C0.7 8.5 2.5 4 6 4c2 0 3.5 1 4 2 0.5-1 2-2 4-2 3.5 0 5.3 4.5 3.5 8C19 16.5 12 21 12 21z"/>
                </svg>
                저장
              </div>
            </div>
          )}
          {/* 덱 뒤 스켈레톤 — 프리페치 또는 로딩 중 표시 */}
          {(rec.prefetching || rec.loading) && (
            <div
              className="absolute overflow-hidden rounded-xl animate-pulse"
              style={{ top: 0, bottom: "8px", left: "12px", right: "12px", zIndex: 1, background: "var(--surface)" }}
            >
              <div className="absolute bottom-0 left-0 right-0 p-5 space-y-2.5">
                <div className="h-6 w-3/5 bg-surface-raised rounded-md" />
                <div className="h-3 w-2/5 bg-surface-raised rounded-sm" />
                <div className="h-4 w-4/5 bg-surface-raised rounded-sm" />
              </div>
            </div>
          )}
          {false && (
            <div />
          )}
          {deckCards.map((r, stackIdx) => {
            const isTop = stackIdx === deckCards.length - 1;
            return (
              <SwipeCard
                key={r.tmdbId}
                rec={r}
                isTop={isTop}
                depth={deckCards.length - 1 - stackIdx}
                dragX={swipe.dragX}
                dragY={swipe.dragY}
                isDragging={swipe.dragging.current}
                swiping={swipe.swiping}
                absorbing={isTop && saveAbsorbing}
                absorbDelta={saveAbsorbDelta}
                immersive={isTop && immersive}
                onCardTap={handleCardTap}
                metaInfo={metaInfo(r)}
              />
            );
          })}
          {/* 되감기 오버레이 — VHS 테이프 되감기 */}
          {rewinding && (
            <RewindOverlay
              cards={filtered.slice(0, topIdx).reverse()}
              onComplete={() => {
                setTopIdx(0);
                setRewinding(false);
                swipe.setDragX(0);
                swipe.setDragY(0);
                swipe.setSwiping(false);
                swipe.scrollRef.current?.scrollTo({ top: 0 });
              }}
            />
          )}
          {swipe.prevOverlayX !== null && filtered.length > 1 && (() => {
            const prev = filtered[topIdx > 0 ? topIdx - 1 : filtered.length - 1];
            return prev ? <PrevCardOverlay prev={prev} prevOverlayX={swipe.prevOverlayX} isDragging={swipe.dragging.current} metaInfo={metaInfo(prev)} /> : null;
          })()}
        </div>
      </div>

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
      {/* 재진입 넛지 토스트 */}
      {reentryNudge && (
        <div className="fixed top-16 left-0 right-0 z-40 flex justify-center animate-fade-in">
          <div
            className="px-4 py-2.5 text-sm rounded-lg flex items-center gap-2 cursor-pointer active:scale-[0.98] transition-transform"
            style={{
              background: "var(--surface-raised)",
              color: "var(--text-primary)",
              boxShadow: "var(--shadow-toast)",
            }}
            onClick={() => {
              router.push("/saved");
              setReentryNudge(null);
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: "var(--accent)" }}
            />
            {reentryNudge} 봤어요?
          </div>
        </div>
      )}
      {/* CoachMark v2 — 카드 1/3/5 진입 시점별 힌트 */}
      {!coachV2Shown && mounted && filtered.length > 0 && (
        <>
          <CoachMark
            step="swipe"
            active={!coachDone.swipe && topIdx === 0}
            completedByAction={coachSwipeAction}
            onDismiss={handleCoachDismiss}
          />
          <CoachMark
            step="save"
            active={!coachDone.save && topIdx === 2}
            completedByAction={coachSaveAction}
            onDismiss={handleCoachDismiss}
          />
          <CoachMark
            step="persona"
            active={!coachDone.persona && topIdx === 4}
            onDismiss={handleCoachDismiss}
          />
        </>
      )}
      {current && detail.showDetail && <DetailSheet rec={current} showDetail={detail.showDetail} detailY={detail.detailY}
        detailAnimating={detail.detailAnimating} detailBodyRef={detail.detailBodyRef} onClose={detail.closeDetail}
        onDetailTouchStart={detail.onDetailTouchStart} onDetailTouchMove={detail.onDetailTouchMove}
        onDetailTouchEnd={detail.onDetailTouchEnd} onShare={handleShare}
        isSaved={savedIds.has(current.tmdbId)} onToggleSave={handleDetailSaveToggle}
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
