"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  addSaved,
  removeSaved,
  getSaved,
  addSeenTitles,
  addWatchReport,
  getWatchReports,
} from "@/lib/store";
import { vibrate } from "@/lib/haptics";
import { track } from "@/lib/analytics";
import { getPrimaryCountryName } from "@/lib/country-names";
import type { Recommendation, WatchReaction } from "@/lib/types";
import type { FilterYear } from "@/lib/discover-types";
import BottomNav from "@/components/BottomNav";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { useDetailSheet } from "@/hooks/useDetailSheet";
import { useRecommendations } from "@/hooks/useRecommendations";
import FilterChips from "@/components/discover/FilterChips";
import DetailSheet from "@/components/discover/DetailSheet";
import SwipeCard from "@/components/discover/SwipeCard";
import PrevCardOverlay from "@/components/discover/PrevCardOverlay";
import ActionBar from "@/components/discover/ActionBar";
import TutorialOverlay from "@/components/discover/TutorialOverlay";
import { LoadingScreen, ErrorScreen, EmptyScreen } from "@/components/discover/StatusScreens";
import SearchSheet from "@/components/discover/SearchSheet";
import { IconSearch } from "@/components/Icons";

const metaInfo = (r: Recommendation) => [
  getPrimaryCountryName(r.country),
  r.date ? r.date.slice(0, 4) : null,
  r.runtime ? `${r.runtime}분` : null,
  r.seasons ? `시즌 ${r.seasons}` : null,
].filter(Boolean).join(" · ");

export default function DiscoverPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [topIdx, setTopIdx] = useState(() => {
    if (typeof window === "undefined") return 0;
    const saved = sessionStorage.getItem("neq_top_idx");
    return saved ? Number(saved) : 0;
  });
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [showWatched, setShowWatched] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [rewinding, setRewinding] = useState(false);
  const [reentryNudge, setReentryNudge] = useState<string | null>(null);

  const rec = useRecommendations();
  const detail = useDetailSheet();
  const searchSheet = useDetailSheet();

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
    setShowWatched(false);
    const cur = filtered[topIdx];
    if (cur) {
      track("card_swiped", {
        direction: "left",
        tmdb_id: cur.tmdbId,
        title: cur.title,
      });
      addSeenTitles([cur.title, cur.titleEn].filter(Boolean));
    }
    // 마지막 카드 → 새 배치 (서버 refresh)
    if (topIdx >= filtered.length - 1) {
      if (!rec.loading && !rec.prefetching) {
        rec.refreshRecommendations();
        setTopIdx(0);
      }
      return;
    }
    // 남은 10개 이하 → 다음 배치 백그라운드 프리페치
    if (topIdx >= filtered.length - 10 && !rec.prefetching) {
      rec.prefetchNextBatch();
    }
    swipe.setSwiping(true);
    swipe.setDragX(-600);
    swipe.setDragY(0);
    const t = setTimeout(() => {
      swipe.timersRef.current.delete(t);
      setTopIdx((i) => i + 1);
      swipe.setDragX(0); swipe.setDragY(0); swipe.setSwiping(false);
      swipe.scrollRef.current?.scrollTo({ top: 0 });
    }, 280);
    swipe.timersRef.current.add(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topIdx, filtered.length, rec.prefetching]);

  const swipe = useSwipeGesture({ topIdx, filteredLength: filtered.length, nextCard, setTopIdx, onSwipeDown: () => setShowWatched(true) });

  const handleWatchedReaction = useCallback((reaction: WatchReaction) => {
    if (!current) return;
    track("watch_report_submitted", { reaction, tmdb_id: current.tmdbId });
    vibrate(10);
    addSaved(current); addWatchReport(current.tmdbId, reaction);
    addSeenTitles([current.title, current.titleEn].filter(Boolean));
    setSavedIds((s) => new Set(s).add(current.tmdbId));
    setShowWatched(false); nextCard();
  }, [current, nextCard]);

  const handleWatchedSkip = useCallback(() => {
    if (!current) return;
    addSeenTitles([current.title, current.titleEn].filter(Boolean));
    setShowWatched(false); nextCard();
  }, [current, nextCard]);

  const handleCardTap = useCallback(() => {
    if (swipe.swiping || showWatched) return;
    setImmersive((prev) => !prev);
  }, [swipe.swiping, showWatched]);

  const handleNotInterested = useCallback(() => {
    if (!current) return;
    track("card_not_interested", { tmdb_id: current.tmdbId });
    addSeenTitles([current.title, current.titleEn].filter(Boolean));
    setShowWatched(false);
    nextCard();
  }, [current, nextCard]);

  const handleShare = useCallback(async (r: Recommendation) => {
    const providers = r.providers.map((p) => p.name).join(", ");
    const body = [
      `\uD83C\uDFAC ${r.title}`,
      r.reason,
      "",
      providers ? `\uD83D\uDCFA ${providers}` : null,
      `\u2B50 ${r.rating.toFixed(1)}`,
      "",
      "neq, \u2014 \uC624\uB298 \uBF50 \uBCFC\uAE4C?",
    ].filter((line) => line !== null).join("\n");
    if (navigator.share) {
      try {
        await navigator.share({ title: r.title, text: body });
        track("card_shared", { tmdb_id: r.tmdbId, title: r.title });
      } catch {}
    } else {
      await navigator.clipboard.writeText(body);
      track("card_shared", { tmdb_id: r.tmdbId, title: r.title });
    }
  }, []);

  const toggleSave = () => {
    if (!current) return;
    vibrate(10);
    const id = current.tmdbId;
    if (savedIds.has(id)) {
      track("card_unsaved", { tmdb_id: current.tmdbId });
      removeSaved(id);
      setSavedIds((s) => { const n = new Set(s); n.delete(id); return n; });
    } else {
      track("card_saved", { tmdb_id: current.tmdbId, title: current.title });
      addSaved(current);
      setSavedIds((s) => new Set(s).add(id));
    }
  };

  // --- effects ---
  useEffect(() => {
    setMounted(true);
    rec.loadRecs("all", "all");
    setSavedIds(new Set(getSaved().map((s) => s.recommendation.tmdbId)));
    return () => { swipe.clearTimers(); rec.abortLoading(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") nextCard();
      else if (e.key === "ArrowRight") swipe.prevCard();
      else if (e.key === "ArrowUp") detail.openDetail();
      else if (e.key === "ArrowDown" || e.key === "Escape") detail.closeDetail();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [nextCard, swipe.prevCard, detail.openDetail, detail.closeDetail]);

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

  useEffect(() => {
    if (!mounted || rec.loading) return;
    if (!localStorage.getItem("neq_tutorial_seen") && filtered.length > 0) setShowTutorial(true);
  }, [mounted, rec.loading, filtered.length]);

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
  if (!mounted || rec.loading) {
    return <LoadingScreen filterLabel={filterLabel} {...chipsProps} />;
  }
  if (rec.loadError) return <ErrorScreen error={rec.loadError} onRetry={() => rec.loadRecs(rec.filterType, rec.filterOrigin)} {...chipsProps} />;
  if (filtered.length === 0) {
    const hasF = rec.filterType !== "all" || rec.filterOrigin !== "all" || rec.filterYear !== "all" || rec.filterOTTs.size > 0;
    return <EmptyScreen hasFilter={hasF} onResetFilter={() => { rec.handleFilterChange("all", "all"); rec.setFilterYear("all"); rec.handleOTTChange(new Set()); }} onRefresh={rec.refreshRecommendations} {...chipsProps} />;
  }

  const deckCards = filtered.slice(topIdx, topIdx + 3).reverse();

  return (
    <div className="h-dvh flex flex-col overflow-hidden relative">
      <div className="flex items-center justify-between px-5 py-3 shrink-0 transition-all duration-300"
        style={{ opacity: immersive ? 0 : 1, maxHeight: immersive ? 0 : 48, overflow: "hidden" }}>
        <span className="font-display text-lg text-accent">neq,</span>
        <button
          onClick={() => { track("search_opened"); searchSheet.openDetail(); }}
          className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform"
        >
          <IconSearch size={18} color="var(--text-muted)" />
        </button>
      </div>
      <div className="transition-all duration-300 relative z-20" style={{ opacity: immersive ? 0 : 1, maxHeight: immersive ? 0 : 60, overflow: immersive ? "hidden" : "visible", pointerEvents: immersive ? "none" : "auto" }}>
        <FilterChips {...chipsProps} />
      </div>

      <div ref={swipe.scrollRef} className="flex-1 min-h-0" style={{ overflowY: "hidden", overscrollBehavior: "none" }}>
        <div className="relative px-3 pb-2"
          style={{ height: "100%", touchAction: "none" }}
          onTouchStart={swipe.onTouchStart} onTouchMove={swipe.onTouchMove} onTouchEnd={swipe.onTouchEnd}>
          {/* 아래 스와이프 오버레이 — 위에서 내려오는 커튼 */}
          {swipe.dragY > 0 && (
            <div
              className="absolute inset-x-3 top-0 bottom-2 z-20 overflow-hidden rounded-xl"
              style={{
                pointerEvents: "none",
              }}
            >
              <div
                className="absolute inset-x-0 top-0 flex flex-col items-center justify-center gap-1.5 py-3"
                style={{
                  height: `${Math.min(18, swipe.dragY * 0.4)}%`,
                  background: "var(--bg-overlay-solid)",
                  transition: swipe.dragging.current ? "none" : "height 0.25s cubic-bezier(0.25, 1, 0.5, 1)",
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" /><path d="M14 11v6" />
                </svg>
                <span className="text-xs text-muted">놓으면 선택할 수 있어요</span>
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
          {deckCards.map((r, stackIdx) => (
            <SwipeCard key={r.tmdbId} rec={r} isTop={stackIdx === deckCards.length - 1} depth={deckCards.length - 1 - stackIdx}
              dragX={swipe.dragX} isDragging={swipe.dragging.current} swiping={swipe.swiping}
              immersive={stackIdx === deckCards.length - 1 && immersive}
              showWatched={stackIdx === deckCards.length - 1 && showWatched} onCardTap={handleCardTap}
              onWatchedReaction={handleWatchedReaction} onWatchedSkip={handleWatchedSkip}
              onNotInterested={handleNotInterested}
              onCloseWatched={() => setShowWatched(false)} onOpenDetail={detail.openDetail} metaInfo={metaInfo(r)} />
          ))}
          {swipe.prevOverlayX !== null && filtered.length > 1 && (() => {
            const prev = filtered[topIdx > 0 ? topIdx - 1 : filtered.length - 1];
            return prev ? <PrevCardOverlay prev={prev} prevOverlayX={swipe.prevOverlayX} isDragging={swipe.dragging.current} metaInfo={metaInfo(prev)} /> : null;
          })()}
        </div>
      </div>

      <div className="transition-all duration-300" style={{ opacity: immersive ? 0 : 1, maxHeight: immersive ? 0 : 200, overflow: "hidden" }}>
        <ActionBar isSaved={isSaved} canRewind={topIdx > 0}
          onShare={() => current && handleShare(current)} onOpenDetail={detail.openDetail} onToggleSave={toggleSave}
          onRewind={() => {
            if (topIdx === 0 || rewinding) return;
            vibrate(10);
            setRewinding(true);
            // 빠르게 한 장씩 넘기는 시각 효과 (최대 6단계)
            const steps = Math.min(topIdx, 6);
            const stepSize = Math.ceil(topIdx / steps);
            let step = 0;
            const interval = setInterval(() => {
              step++;
              setTopIdx((prev) => Math.max(0, prev - stepSize));
              if (step >= steps) {
                clearInterval(interval);
                setTopIdx(0);
                setRewinding(false);
              }
            }, 60);
            swipe.scrollRef.current?.scrollTo({ top: 0 });
          }}
          onRefresh={() => { vibrate(10); setTopIdx(0); rec.refreshRecommendations(); }} />
        <BottomNav active="discover" />
      </div>

      {/* 첫 카드 힌트 토스트 */}
      {swipe.firstCardHint && (
        <div className="fixed top-16 left-0 right-0 z-40 flex justify-center animate-fade-in">
          <div
            className="px-4 py-2.5 text-sm rounded-lg flex items-center gap-2"
            style={{
              background: "var(--surface-raised)",
              color: "var(--text-primary)",
              boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
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
              boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
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
      {showTutorial && <TutorialOverlay onDismiss={() => { setShowTutorial(false); localStorage.setItem("neq_tutorial_seen", "1"); }} />}
      {current && detail.showDetail && <DetailSheet rec={current} showDetail={detail.showDetail} detailY={detail.detailY}
        detailAnimating={detail.detailAnimating} detailBodyRef={detail.detailBodyRef} onClose={detail.closeDetail}
        onDetailTouchStart={detail.onDetailTouchStart} onDetailTouchMove={detail.onDetailTouchMove}
        onDetailTouchEnd={detail.onDetailTouchEnd} onShare={handleShare} />}
      <SearchSheet
        show={searchSheet.showDetail}
        sheetY={searchSheet.detailY}
        animating={searchSheet.detailAnimating}
        bodyRef={searchSheet.detailBodyRef}
        onClose={searchSheet.closeDetail}
        onTouchStart={searchSheet.onDetailTouchStart}
        onTouchMove={searchSheet.onDetailTouchMove}
        onTouchEnd={searchSheet.onDetailTouchEnd}
      />
    </div>
  );
}
