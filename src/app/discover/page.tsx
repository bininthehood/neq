"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getFavorites,
  getRecommendations,
  setRecommendations,
  clearAllRecommendations,
  addSaved,
  removeSaved,
  hasOnboarded,
  getWatchReports,
  getSaved,
  getSeenTitles,
  addSeenTitles,
  addWatchReport,
} from "@/lib/store";
import type { Recommendation, WatchReaction } from "@/lib/types";
import BottomNav from "@/components/BottomNav";
import { IconSave, IconClose, IconRefresh, IconStar, IconFilm, IconDetail, IconShare, NekoSpinner } from "@/components/Icons";
import { getOTTLink, getOTTIcon } from "@/lib/ott-links";

type FilterType = "all" | "movie" | "series";
type FilterOrigin = "all" | "kr" | "foreign";
const OTT_OPTIONS = ["Netflix", "Disney Plus", "Watcha", "wavve", "Coupang Play", "TVING", "Apple TV Plus"];

export default function DiscoverPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [topIdx, setTopIdx] = useState(0); // 덱 맨 위 카드 인덱스
  const [loading, setLoading] = useState(true);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterOrigin, setFilterOrigin] = useState<FilterOrigin>("all");
  const [filterOTTs, setFilterOTTs] = useState<Set<string>>(new Set());

  // 부채꼴 덱 — 맨 앞 카드의 드래그 오프셋
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [swiping, setSwiping] = useState(false);
  // 이전 카드 오버레이: 왼쪽에서 덮어씌우기
  const [prevOverlayX, setPrevOverlayX] = useState<number | null>(null); // null=비활성, -screenW~0
  const [showWatched, setShowWatched] = useState(false); // "봤어요?" 피커
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [scrollLocked, setScrollLocked] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const dirLock = useRef<"h" | "v" | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailY, setDetailY] = useState(100); // 0=열림, 100=닫힘
  const [detailAnimating, setDetailAnimating] = useState(false);
  const detailStartY = useRef(0);
  const detailDragging = useRef(false);
  const detailBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    if (!hasOnboarded()) { router.replace("/onboarding"); return; }
    loadRecs("all", "all");
    setSavedIds(new Set(getSaved().map((s) => s.recommendation.tmdbId)));
  }, [router]);

  const loadRecs = async (ft: FilterType, fo: FilterOrigin) => {
    const cached = getRecommendations(ft, fo);
    if (cached.length > 0) { setRecs(cached); setTopIdx(0); setLoading(false); return; }
    setLoading(true);
    const favorites = getFavorites();
    const filter: any = {};
    if (ft !== "all") filter.type = ft;
    if (fo !== "all") filter.origin = fo;
    const reports = getWatchReports();
    const savedItems = getSaved();
    const feedback: { loved: string[]; good: string[]; meh: string[]; dropped: string[] } = { loved: [], good: [], meh: [], dropped: [] };
    for (const r of reports) {
      const item = savedItems.find((s) => s.recommendation.tmdbId === r.tmdbId);
      if (!item) continue;
      const t = item.recommendation.title;
      if (r.reaction === "loved") feedback.loved.push(t);
      else if (r.reaction === "good") feedback.good.push(t);
      else if (r.reaction === "meh") feedback.meh.push(t);
      else if (r.reaction === "dropped") feedback.dropped.push(t);
    }
    const hasFeedback = feedback.loved.length + feedback.good.length + feedback.meh.length + feedback.dropped.length > 0;
    const seenTitles = getSeenTitles();
    const savedTitles = savedItems.map((s) => s.recommendation.title);
    const exclude = [...new Set([...seenTitles, ...savedTitles])].slice(0, 50);
    const res = await fetch("/api/recommend", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorites, filter, ...(hasFeedback ? { feedback } : {}), ...(exclude.length > 0 ? { exclude } : {}) }),
    });
    const data = await res.json();
    setRecommendations(data.recommendations ?? [], ft, fo);
    setRecs(data.recommendations ?? []); setTopIdx(0); setLoading(false);
  };

  const handleFilterChange = (t: FilterType, o: FilterOrigin) => {
    setFilterType(t); setFilterOrigin(o); setFilterOTTs(new Set());
    loadRecs(t, o);
  };

  const refreshRecommendations = async () => {
    setRecommendations([], filterType, filterOrigin);
    await loadRecs(filterType, filterOrigin);
  };

  const filtered = filterOTTs.size === 0 ? recs : recs.filter((r) => r.providers.some((p) => filterOTTs.has(p.name)));
  const current = filtered[topIdx];

  // 다음 카드 (왼쪽으로 스와이프)
  const nextCard = useCallback(() => {
    if (swiping) return;
    setShowWatched(false);
    const cur = filtered[topIdx];
    if (cur) addSeenTitles([cur.title, cur.titleEn].filter(Boolean));
    if (topIdx >= filtered.length - 1) {
      // 마지막 카드 → 처음으로 순환
      setSwiping(true);
      setDragX(-500); setDragY(-80);
      setTimeout(() => {
        setTopIdx(0);
        setDragX(0); setDragY(0); setSwiping(false);
        scrollRef.current?.scrollTo({ top: 0 });
      }, 280);
      return;
    }
    setSwiping(true);
    setDragX(-500); setDragY(-80);
    setTimeout(() => {
      setTopIdx((i) => i + 1);
      setDragX(0); setDragY(0); setSwiping(false);
      scrollRef.current?.scrollTo({ top: 0 });
    }, 280);
  }, [swiping, topIdx, filtered.length]);

  // 이전 카드 (키보드 ArrowRight) — 오버레이 애니메이션으로 처리
  const prevCard = useCallback(() => {
    if (swiping || prevOverlayX !== null || filtered.length === 0) return;
    // 첫 카드에서 이전 → 마지막 카드로 순환
    if (topIdx <= 0) { setTopIdx(filtered.length - 1); return; }
    setSwiping(true);
    const w = typeof window !== "undefined" ? window.innerWidth : 400;
    setPrevOverlayX(-w);
    // 다음 프레임에서 0으로 애니메이션
    requestAnimationFrame(() => {
      setPrevOverlayX(0);
      setTimeout(() => {
        setTopIdx((i) => i - 1);
        setPrevOverlayX(null);
        setSwiping(false);
        scrollRef.current?.scrollTo({ top: 0 });
      }, 350);
    });
  }, [swiping, topIdx, prevOverlayX, filtered.length]);

  // "봤어요?" — 이미 본 작품 피드백 기록 + 저장 + 다음 카드
  const handleWatchedReaction = useCallback((reaction: WatchReaction) => {
    if (!current) return;
    addSaved(current);
    addWatchReport(current.tmdbId, reaction);
    addSeenTitles([current.title, current.titleEn].filter(Boolean));
    setSavedIds((s) => new Set(s).add(current.tmdbId));
    setShowWatched(false);
    nextCard();
  }, [current, nextCard]);

  // "봤어요?" — 저장 없이 건너뛰기
  const handleWatchedSkip = useCallback(() => {
    if (!current) return;
    addSeenTitles([current.title, current.titleEn].filter(Boolean));
    setShowWatched(false);
    nextCard();
  }, [current, nextCard]);

  const handleCardTap = useCallback(() => {
    if (swiping || showWatched) return;
    setShowWatched(true);
  }, [swiping, showWatched]);

  const handleShare = useCallback(async (rec: Recommendation) => {
    const text = `${rec.title} — ${rec.reason}`;
    const providers = rec.providers.map((p) => p.name).join(", ");
    const body = `${text}\n${providers}에서 볼 수 있어요\n\nNeko에서 발견`;
    if (navigator.share) {
      try { await navigator.share({ title: rec.title, text: body }); } catch {}
    } else {
      await navigator.clipboard.writeText(body);
    }
  }, []);

  // 터치
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (swiping) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    dragging.current = true;
    dirLock.current = null;
  }, [swiping]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (!dirLock.current) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) dirLock.current = "h";
      else if (Math.abs(dy) > 10) dirLock.current = "v";
      else return;
    }
    if (dirLock.current === "h") {
      e.preventDefault();
      if (!scrollLocked) setScrollLocked(true);

      if (dx > 0 && filtered.length > 1) {
        // 오른쪽 드래그 → 이전 카드 오버레이를 왼쪽에서 끌어옴
        const screenW = window.innerWidth;
        setPrevOverlayX(Math.min(0, -screenW + dx));
      } else if (dx <= 0) {
        // 왼쪽 드래그 → 현재 카드 밀기 (다음 카드)
        setPrevOverlayX(null);
        setDragX(dx);
        setDragY(Math.abs(dx) * -0.15);
      }
    } else if (dirLock.current === "v" && dy > 0 && !refreshing) {
      e.preventDefault();
      setPullY(Math.min(80, dy * 0.5));
    }
  }, [refreshing, scrollLocked, filtered.length]);

  const onTouchEnd = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    const dir = dirLock.current;
    dirLock.current = null;
    if (dir === "h") {
      setScrollLocked(false);
      if (prevOverlayX !== null && prevOverlayX > -Infinity) {
        // 이전 카드 오버레이 판정
        const screenW = window.innerWidth;
        const progress = 1 + prevOverlayX / screenW; // 0=시작, 1=도착
        if (progress > 0.3) {
          // 30% 이상 → 착지: 0으로 애니메이션 후 topIdx 전환
          setPrevOverlayX(0);
          setTimeout(() => {
            setTopIdx((i) => i > 0 ? i - 1 : filtered.length - 1);
            setPrevOverlayX(null);
            scrollRef.current?.scrollTo({ top: 0 });
          }, 300);
        } else {
          // 덜 끌어옴 → 원복: -screenW로 애니메이션 후 제거
          setPrevOverlayX(-screenW);
          setTimeout(() => setPrevOverlayX(null), 300);
        }
      } else if (dragX < -80) {
        nextCard();
      } else {
        setDragX(0); setDragY(0);
      }
    } else if (dir === "v") {
      if (pullY > 50) {
        setRefreshing(true); setPullY(40);
        refreshRecommendations().then(() => {
          setRefreshing(false); setPullY(0); setTopIdx(0);
        });
      } else {
        setPullY(0);
      }
    }
  }, [dragX, pullY, nextCard, prevCard]);

  const openDetail = useCallback(() => {
    setShowDetail(true);
    setDetailY(100);
    requestAnimationFrame(() => {
      setDetailAnimating(true);
      setDetailY(0);
    });
  }, []);

  const closeDetail = useCallback(() => {
    setDetailAnimating(true);
    setDetailY(100);
    setTimeout(() => { setShowDetail(false); setDetailAnimating(false); }, 300);
  }, []);

  const onDetailTouchStart = useCallback((e: React.TouchEvent) => {
    detailStartY.current = e.touches[0].clientY;
    detailDragging.current = false;
  }, []);

  const onDetailTouchMove = useCallback((e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - detailStartY.current;
    const atTop = !detailBodyRef.current || detailBodyRef.current.scrollTop <= 0;
    if (dy > 0 && atTop) {
      // 최상단에서 아래로 드래그 → 시트 닫기 드래그
      detailDragging.current = true;
      e.preventDefault();
      setDetailAnimating(false);
      setDetailY(Math.min(100, (dy / window.innerHeight) * 120));
    }
  }, []);

  const onDetailTouchEnd = useCallback(() => {
    if (!detailDragging.current) return;
    detailDragging.current = false;
    if (detailY > 25) closeDetail();
    else { setDetailAnimating(true); setDetailY(0); }
  }, [detailY, closeDetail]);

  // 키보드
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") nextCard();
      else if (e.key === "ArrowRight") prevCard();
      else if (e.key === "ArrowUp") openDetail();
      else if (e.key === "ArrowDown" || e.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [nextCard, prevCard, openDetail, closeDetail]);

  // 전체 이미지 프리로드
  useEffect(() => {
    filtered.forEach((r) => { if (r.posterUrl) { const img = new Image(); img.src = r.posterUrl; } });
  }, [filtered]);

  const metaInfo = (r: Recommendation) => [
    r.country?.length > 0 ? r.country.join("/") : null,
    r.date ? r.date.slice(0, 4) : null,
    r.runtime ? `${r.runtime}분` : null,
    r.seasons ? `시즌 ${r.seasons}` : null,
  ].filter(Boolean).join(" · ");

  const filterLabel = [
    filterOrigin === "kr" ? "국내" : filterOrigin === "foreign" ? "해외" : "",
    filterType === "movie" ? "영화" : filterType === "series" ? "시리즈" : "",
  ].filter(Boolean).join(" ");

  const [openDropdown, setOpenDropdown] = useState<"type" | "origin" | "ott" | null>(null);

  const TYPE_LABELS: Record<FilterType, string> = { all: "유형", movie: "영화", series: "시리즈" };
  const ORIGIN_LABELS: Record<FilterOrigin, string> = { all: "국가", kr: "국내", foreign: "해외" };
  const availableOTTs = OTT_OPTIONS.filter((ott) => recs.some((r) => r.providers.some((p) => p.name === ott)));
  const ottLabel = filterOTTs.size === 0 ? "OTT" : filterOTTs.size === 1 ? [...filterOTTs][0] : `OTT ${filterOTTs.size}개`;

  const chipStyle = (active: boolean) => ({
    background: active ? "var(--accent)" : "var(--surface)",
    color: active ? "var(--bg)" : "var(--text-secondary)",
    borderRadius: "var(--radius-full)",
    border: active ? "none" : "1px solid var(--border)",
  });

  const FilterChips = () => (
    <div className="shrink-0 relative">
      {/* 칩 행 — 3개 고정 */}
      <div className="flex gap-2 px-4 pb-2">
        <button onClick={() => setOpenDropdown(openDropdown === "type" ? null : "type")} disabled={loading}
          className="px-3 py-2.5 text-xs whitespace-nowrap transition-colors disabled:opacity-50 flex items-center gap-1 active:scale-95"
          style={chipStyle(filterType !== "all")}>
          {TYPE_LABELS[filterType]} <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
        </button>
        <button onClick={() => setOpenDropdown(openDropdown === "origin" ? null : "origin")} disabled={loading}
          className="px-3 py-2.5 text-xs whitespace-nowrap transition-colors disabled:opacity-50 flex items-center gap-1 active:scale-95"
          style={chipStyle(filterOrigin !== "all")}>
          {ORIGIN_LABELS[filterOrigin]} <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
        </button>
        {availableOTTs.length > 0 && (
          <button onClick={() => setOpenDropdown(openDropdown === "ott" ? null : "ott")}
            className="px-3 py-2.5 text-xs whitespace-nowrap transition-colors flex items-center gap-1 active:scale-95"
            style={chipStyle(filterOTTs.size > 0)}>
            {ottLabel} <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
          </button>
        )}
      </div>

      {/* 드롭다운 패널 — 아래로 펼침 */}
      {openDropdown && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpenDropdown(null)} />
          <div className="absolute left-4 right-4 z-30 p-2 flex flex-wrap gap-1.5 animate-fade-in"
            style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
            {openDropdown === "type" && (["all", "movie", "series"] as const).map((t) => (
              <button key={t} onClick={() => { handleFilterChange(t, filterOrigin); setOpenDropdown(null); }}
                className="px-3 py-2 text-xs whitespace-nowrap transition-colors active:scale-95"
                style={chipStyle(filterType === t)}>
                {t === "all" ? "전체" : TYPE_LABELS[t]}
              </button>
            ))}
            {openDropdown === "origin" && (["all", "kr", "foreign"] as const).map((o) => (
              <button key={o} onClick={() => { handleFilterChange(filterType, o); setOpenDropdown(null); }}
                className="px-3 py-2 text-xs whitespace-nowrap transition-colors active:scale-95"
                style={chipStyle(filterOrigin === o)}>
                {o === "all" ? "전체" : ORIGIN_LABELS[o]}
              </button>
            ))}
            {openDropdown === "ott" && (
              <>
                <button onClick={() => { setFilterOTTs(new Set()); setTopIdx(0); setOpenDropdown(null); }}
                  className="px-3 py-2 text-xs whitespace-nowrap transition-colors active:scale-95"
                  style={chipStyle(filterOTTs.size === 0)}>
                  모든 OTT
                </button>
                {availableOTTs.map((ott) => {
                  const selected = filterOTTs.has(ott);
                  return (
                    <button key={ott} onClick={() => {
                      const next = new Set(filterOTTs);
                      if (selected) next.delete(ott); else next.add(ott);
                      setFilterOTTs(next);
                      setTopIdx(0);
                    }}
                      className="px-3 py-2 text-xs whitespace-nowrap transition-colors flex items-center gap-1.5 active:scale-95"
                      style={chipStyle(selected)}>
                      <img src={getOTTIcon(ott) ?? ""} alt={ott} className="w-4 h-4 object-contain" style={{ borderRadius: "var(--radius-sm)" }} />
                      {ott}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );

  if (!mounted || loading) return (
    <div className="h-dvh flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 shrink-0"><span className="font-display text-lg" style={{ color: "var(--accent)" }}>Neko</span></div>
      <FilterChips />
      <div className="flex-1 flex items-center justify-center px-3">
        {/* 스켈레톤 카드 */}
        <div className="relative w-full h-full max-h-[75dvh] animate-pulse" style={{ borderRadius: "var(--radius-xl)", background: "var(--surface)" }}>
          <div className="absolute top-4 left-4 w-14 h-6" style={{ background: "var(--surface-raised)", borderRadius: "var(--radius-md)" }} />
          <div className="absolute top-4 right-4 w-16 h-6" style={{ background: "var(--surface-raised)", borderRadius: "var(--radius-md)" }} />
          <div className="absolute bottom-0 left-0 right-0 p-5 space-y-2.5">
            <div className="h-6 w-3/5" style={{ background: "var(--surface-raised)", borderRadius: "var(--radius-md)" }} />
            <div className="h-3 w-2/5" style={{ background: "var(--surface-raised)", borderRadius: "var(--radius-sm)" }} />
            <div className="h-4 w-4/5" style={{ background: "var(--surface-raised)", borderRadius: "var(--radius-sm)" }} />
            <div className="flex gap-1.5 pt-1">
              <div className="w-8 h-8" style={{ background: "var(--surface-raised)", borderRadius: "var(--radius-md)" }} />
              <div className="w-8 h-8" style={{ background: "var(--surface-raised)", borderRadius: "var(--radius-md)" }} />
            </div>
          </div>
        </div>
      </div>
      <div className="px-4 pb-2 shrink-0">
        <p className="text-center text-xs py-2" style={{ color: "var(--text-muted)" }}>
          {filterLabel ? `${filterLabel} 추천 생성 중...` : "취향을 분석하고 있어요..."}
        </p>
      </div>
      <BottomNav active="discover" />
    </div>
  );

  if (filtered.length === 0) {
    const hasF = filterType !== "all" || filterOrigin !== "all" || filterOTTs.size > 0;
    return (
      <div className="h-dvh flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 shrink-0"><span className="font-display text-lg" style={{ color: "var(--accent)" }}>Neko</span><button onClick={() => router.push("/reset")} className="text-xs px-2 py-2" style={{ color: "var(--text-muted)" }}>재설정</button></div>
        <FilterChips />
        <div className="flex-1 flex flex-col px-8 justify-center"><div className="space-y-5">
          <IconFilm size={36} color="var(--text-muted)" />
          <div><p className="font-display text-lg font-semibold">{hasF ? "해당 조건의 결과가 없어요" : "추천을 만들지 못했어요"}</p><p className="text-sm mt-1.5" style={{ color: "var(--text-secondary)" }}>{hasF ? "다른 필터를 시도해보세요" : "잠시 후 다시 시도해보세요"}</p></div>
          <div className="flex gap-3">
            {hasF && <button onClick={() => { handleFilterChange("all", "all"); setFilterOTTs(new Set()); }} className="px-5 py-2.5 text-sm font-medium active:scale-95 transition-transform" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-full)" }}>필터 초기화</button>}
            <button onClick={refreshRecommendations} className="px-5 py-2.5 text-sm font-medium flex items-center gap-2 active:scale-95 transition-transform" style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: "var(--radius-full)" }}><IconRefresh size={14} /> 다시 시도</button>
          </div>
        </div></div>
        <BottomNav active="discover" />
      </div>
    );
  }

  // 카드 덱: topIdx부터 최대 3장 역순 렌더 (뒤→앞)
  const deckCards = filtered.slice(topIdx, topIdx + 3).reverse();

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        <span className="font-display text-lg" style={{ color: "var(--accent)" }}>Neko</span>
        <div className="flex items-center gap-3">
          <span className="font-data text-sm" style={{ color: "var(--text-muted)" }}>{topIdx + 1}/{filtered.length}</span>
          <button onClick={() => router.push("/reset")} className="text-xs px-2 py-2" style={{ color: "var(--text-muted)" }}>재설정</button>
        </div>
      </div>
      <FilterChips />

      {/* Pull-to-refresh indicator */}
      {(pullY > 0 || refreshing) && (
        <div className="flex justify-center py-1 shrink-0" style={{ opacity: refreshing ? 1 : Math.min(1, pullY / 40) }}>
          {refreshing ? (
            <NekoSpinner size={24} />
          ) : (
            <div className="w-6 h-6" style={{ transform: `rotate(${pullY * 4}deg)`, border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "var(--radius-full)" }} />
          )}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 min-h-0" style={{ overflowY: scrollLocked ? "hidden" : "hidden", overscrollBehavior: "none" }}>

        {/* Snap 1: 카드 덱 */}
        <div className="relative px-3 pb-2" style={{ height: "100%", scrollSnapAlign: "start", transform: pullY > 0 ? `translateY(${pullY * 0.3}px)` : undefined, transition: pullY === 0 ? "transform 0.2s ease-out" : "none" }}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          {deckCards.map((rec, stackIdx) => {
            const isTop = stackIdx === deckCards.length - 1;
            const depth = deckCards.length - 1 - stackIdx; // 0=맨앞, 1=그다음, 2=맨뒤

            // 부채꼴 오프셋: 뒤 카드일수록 작고, 아래로 살짝
            const scaleVal = 1 - depth * 0.04;
            const yOffset = depth * 12;

            // 맨 앞 카드만 드래그 적용
            const tx = isTop ? dragX : 0;
            const ty = isTop ? dragY + yOffset : yOffset;
            const rot = isTop ? dragX * 0.06 : 0;

            return (
              <div key={rec.tmdbId} className="absolute overflow-hidden will-change-transform"
                style={{
                  top: 0, bottom: "8px", left: "12px", right: "12px",
                  transform: `translateX(${tx}px) translateY(${ty}px) rotate(${rot}deg) scale(${scaleVal})`,
                  transition: isTop && dragging.current ? "none" : (isTop ? "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)" : "transform 0.3s ease-out"),
                  borderRadius: "var(--radius-xl)",
                  zIndex: 10 - depth,
                }}>
                {rec.posterUrl ? (
                  <img src={rec.posterUrl} alt={rec.title} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ background: "var(--surface)" }}>
                    <span className="font-display text-5xl" style={{ color: "var(--text-muted)" }}>N</span>
                  </div>
                )}
                {isTop && (
                  <>
                    {/* 탭 영역 — 드래그와 구분 */}
                    <div className="absolute inset-0 z-[5]"
                      onPointerUp={(e) => {
                        // 드래그 없이 탭만 했을 때
                        const dx = Math.abs(dragX);
                        if (dx < 5 && !swiping) handleCardTap();
                      }}
                    />
                    <div className="absolute top-4 right-4 backdrop-blur-sm px-3 py-1.5 flex items-center gap-1.5 z-10" style={{ background: "var(--bg-overlay)", borderRadius: "var(--radius-md)" }}>
                      <IconStar size={13} color="var(--accent)" /><span className="font-data font-semibold" style={{ color: "var(--accent)" }}>{rec.rating.toFixed(1)}</span>
                    </div>
                    <div className="absolute top-4 left-4 backdrop-blur-sm px-3 py-1.5 text-sm z-10" style={{ background: "var(--bg-overlay)", borderRadius: "var(--radius-md)" }}>
                      {rec.type === "series" ? "시리즈" : "영화"}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-5 pt-24 z-10" style={{ background: "linear-gradient(transparent, var(--bg-overlay-heavy) 40%, var(--bg))" }}>
                      <h2 className="font-display text-2xl font-bold">{rec.title}</h2>
                      {metaInfo(rec) && <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{metaInfo(rec)}</p>}
                      <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{rec.reason}</p>
                      <div className="flex gap-1.5 mt-3 items-center">
                        {rec.providers.slice(0, 4).map((p) => (
                          <img key={p.name} src={getOTTIcon(p.name) ?? p.logoUrl ?? ""} alt={p.name} className="w-8 h-8 object-contain" style={{ borderRadius: "var(--radius-md)", background: "var(--surface)" }} />
                        ))}
                      </div>
                    </div>

                    {/* "봤어요?" 오버레이 */}
                    {showWatched && (
                      <div className="absolute inset-0 flex flex-col items-end justify-end p-5 gap-2 z-20 animate-fade-in"
                        style={{ background: "linear-gradient(transparent 20%, var(--bg) 60%)", borderRadius: "var(--radius-xl)" }}>
                        <div className="w-full mb-1">
                          <div className="font-display text-lg font-bold">본 적 있나요?</div>
                          <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>알려주시면 더 좋은 추천을 드려요</div>
                        </div>
                        <div className="w-full flex flex-wrap gap-2">
                          {([
                            { key: "loved" as WatchReaction, label: "인생작" },
                            { key: "good" as WatchReaction, label: "괜찮았어" },
                            { key: "meh" as WatchReaction, label: "별로였어" },
                            { key: "dropped" as WatchReaction, label: "안 맞았어" },
                          ]).map((r) => (
                            <button
                              key={r.key}
                              onClick={(e) => { e.stopPropagation(); handleWatchedReaction(r.key); }}
                              className="px-4 py-2 text-sm font-medium active:scale-95 transition-transform"
                              style={{ background: "var(--surface)", color: "var(--text-secondary)", borderRadius: "var(--radius-full)", border: "1px solid var(--border)" }}
                            >
                              {r.label}
                            </button>
                          ))}
                        </div>
                        <div className="w-full flex gap-2 mt-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleWatchedSkip(); }}
                            className="flex-1 py-2 text-xs active:scale-95 transition-transform"
                            style={{ color: "var(--text-muted)" }}
                          >
                            안 봤어요
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowWatched(false); }}
                            className="flex-1 py-2 text-xs active:scale-95 transition-transform"
                            style={{ color: "var(--text-muted)" }}
                          >
                            닫기
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* 이전 카드 오버레이 — 오른쪽 스와이프 시 왼쪽에서 덮어씌움 */}
          {prevOverlayX !== null && filtered.length > 1 && (() => {
            const prevIdx = topIdx > 0 ? topIdx - 1 : filtered.length - 1;
            const prev = filtered[prevIdx];
            if (!prev) return null;
            const isDragging = dragging.current;
            return (
              <div className="absolute overflow-hidden will-change-transform"
                style={{
                  top: 0, bottom: "8px", left: "12px", right: "12px",
                  transform: `translateX(${prevOverlayX}px)`,
                  transition: isDragging ? "none" : "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
                  borderRadius: "var(--radius-xl)",
                  zIndex: 20,
                  boxShadow: "8px 0 32px rgba(0,0,0,0.5)",
                }}>
                {prev.posterUrl ? (
                  <img src={prev.posterUrl} alt={prev.title} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ background: "var(--surface)" }}>
                    <span className="font-display text-5xl" style={{ color: "var(--text-muted)" }}>N</span>
                  </div>
                )}
                <div className="absolute top-4 right-4 backdrop-blur-sm px-3 py-1.5 flex items-center gap-1.5" style={{ background: "var(--bg-overlay)", borderRadius: "var(--radius-md)" }}>
                  <IconStar size={13} color="var(--accent)" /><span className="font-data font-semibold" style={{ color: "var(--accent)" }}>{prev.rating.toFixed(1)}</span>
                </div>
                <div className="absolute top-4 left-4 backdrop-blur-sm px-3 py-1.5 text-sm" style={{ background: "var(--bg-overlay)", borderRadius: "var(--radius-md)" }}>
                  {prev.type === "series" ? "시리즈" : "영화"}
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-5 pt-24" style={{ background: "linear-gradient(transparent, var(--bg-overlay-heavy) 40%, var(--bg))" }}>
                  <h2 className="font-display text-2xl font-bold">{prev.title}</h2>
                  {metaInfo(prev) && <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{metaInfo(prev)}</p>}
                  <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{prev.reason}</p>
                  <div className="flex gap-1.5 mt-3 items-center">
                    {prev.providers.slice(0, 4).map((p) => (
                      <img key={p.name} src={getOTTIcon(p.name) ?? p.logoUrl ?? ""} alt={p.name} className="w-8 h-8 object-contain" style={{ borderRadius: "var(--radius-md)", background: "var(--surface)" }} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 하단 */}
      <div className="px-4 pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5 flex-1 mr-3 items-center justify-center">
            {filtered.map((_, i) => (
              <div key={i} className="transition-all" style={{ width: i === topIdx ? 16 : 6, height: 6, background: i === topIdx ? "var(--accent)" : i < topIdx ? "var(--text-muted)" : "var(--border)", borderRadius: "var(--radius-full)" }} />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => current && handleShare(current)} aria-label="공유" className="w-12 h-12 flex items-center justify-center active:scale-90 transition-transform" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-full)" }}>
              <IconShare size={18} color="var(--text-secondary)" />
            </button>
            <button onClick={openDetail} aria-label="상세보기" className="w-12 h-12 flex items-center justify-center active:scale-90 transition-transform" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-full)" }}>
              <IconDetail size={18} color="var(--text-secondary)" />
            </button>
            <button onClick={() => {
              if (!current) return;
              const id = current.tmdbId;
              if (savedIds.has(id)) { removeSaved(id); setSavedIds((s) => { const n = new Set(s); n.delete(id); return n; }); }
              else { addSaved(current); setSavedIds((s) => new Set(s).add(id)); }
            }} aria-label="저장" className="w-12 h-12 flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: current && savedIds.has(current.tmdbId) ? "var(--accent-dim)" : "var(--surface)", border: `1px solid ${current && savedIds.has(current.tmdbId) ? "var(--accent-border)" : "var(--border)"}`, borderRadius: "var(--radius-full)" }}>
              <IconSave size={20} color={current && savedIds.has(current.tmdbId) ? "var(--accent)" : "var(--text-muted)"} filled={!!(current && savedIds.has(current.tmdbId))} />
            </button>
          </div>
        </div>
      </div>
      <BottomNav active="discover" />

      {/* 디테일 바텀시트 오버레이 */}
      {showDetail && current && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ touchAction: "none" }} onClick={closeDetail}
          onTouchMove={(e) => e.stopPropagation()}>
          {/* 배경 딤 */}
          <div className="absolute inset-0" style={{ background: "var(--bg-overlay-heavy)", opacity: 1 - detailY / 100, transition: detailAnimating ? "opacity 0.3s ease-out" : "none" }} />
          {/* 시트 */}
          <div
            className="relative w-full max-w-[480px] max-h-[90dvh] flex flex-col"
            style={{
              background: "var(--bg)",
              borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
              transform: `translateY(${detailY}%)`,
              transition: detailAnimating ? "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)" : "none",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 핸들바 */}
            <div className="px-5 pt-4 pb-2 flex items-center justify-between shrink-0">
              <div className="flex-1 flex justify-center"><div className="w-10 h-1" style={{ background: "var(--border)", borderRadius: "var(--radius-full)" }} /></div>
              <button className="w-11 h-11 flex items-center justify-center flex-shrink-0 -mr-1" style={{ background: "var(--surface)", borderRadius: "var(--radius-full)" }} onClick={closeDetail}>
                <IconClose size={16} color="var(--text-secondary)" />
              </button>
            </div>
            {/* 본문 — 최상단에서 스와이프 다운 시 닫힘 */}
            <div
              ref={detailBodyRef}
              className="flex-1 overflow-y-auto px-5 pb-8"
              style={{ overscrollBehavior: "contain" }}
              onTouchStart={onDetailTouchStart}
              onTouchMove={onDetailTouchMove}
              onTouchEnd={onDetailTouchEnd}
            >
              <h2 className="font-display text-xl font-bold pr-14">{current.title}</h2>
              <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>{current.titleEn} · {metaInfo(current)}</p>
              <div className="flex items-center gap-1.5 mt-2">
                <IconStar size={13} color="var(--accent)" />
                <span className="font-data text-sm font-semibold" style={{ color: "var(--accent)" }}>{current.rating.toFixed(1)}</span>
              </div>
              {current.backdrop && <img src={current.backdrop} alt="" className="w-full h-40 object-cover mt-4" style={{ borderRadius: "var(--radius-md)" }} />}
              <div className="mt-4"><div className="px-3 py-2 text-sm" style={{ background: "var(--accent-dim)", borderRadius: "var(--radius-md)" }}>{current.reason}</div></div>
              {(current.director || current.cast?.length > 0) && (
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
                  {current.director && <div><span className="text-xs" style={{ color: "var(--text-muted)" }}>감독 </span><span className="text-sm">{current.director}</span></div>}
                  {current.cast?.length > 0 && <div><span className="text-xs" style={{ color: "var(--text-muted)" }}>출연 </span><span className="text-sm">{current.cast.join(", ")}</span></div>}
                </div>
              )}
              {current.overview && (
                <div className="mt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>줄거리</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{current.overview}</p>
                </div>
              )}
              <div className="mt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>시청 가능</h3>
                <div className="flex flex-col gap-2">
                  {current.providers.map((p) => {
                    const u = getOTTLink(p.name, current.title);
                    return (
                      <a key={p.name} href={u ?? current.watchLink ?? "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 text-sm font-medium active:scale-[0.98] transition-transform" style={{ background: "var(--surface-raised)", borderRadius: "var(--radius-md)" }}>
                        <img src={getOTTIcon(p.name) ?? p.logoUrl ?? ""} alt={p.name} className="w-8 h-8 object-contain flex-shrink-0" style={{ borderRadius: "var(--radius-sm)", background: "var(--surface)" }} />
                        <span className="flex-1">{p.name}</span>
                        <span className="text-xs" style={{ color: "var(--accent)" }}>열기</span>
                      </a>
                    );
                  })}
                </div>
              </div>
              {/* 공유 */}
              <button
                onClick={() => handleShare(current)}
                className="w-full mt-4 py-3 text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}
              >
                <IconShare size={16} color="var(--text-secondary)" />
                <span style={{ color: "var(--text-secondary)" }}>이 작품 공유하기</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
