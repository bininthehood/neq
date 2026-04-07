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
} from "@/lib/store";
import type { Recommendation } from "@/lib/types";
import BottomNav from "@/components/BottomNav";
import { IconSave, IconClose, IconRefresh, IconStar, IconFilm, IconDetail } from "@/components/Icons";
import { getOTTLink, getOTTIcon } from "@/lib/ott-links";

type FilterType = "all" | "movie" | "series";
type FilterOrigin = "all" | "kr" | "foreign";

// 한국 주요 OTT 목록 (필터용)
const OTT_OPTIONS = ["Netflix", "Disney Plus", "Watcha", "wavve", "Coupang Play", "TVING", "Apple TV Plus"];

export default function DiscoverPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [slideUp, setSlideUp] = useState(0); // 0=카드만, 100=디테일 완전 노출 (%)
  const [slideSnapping, setSlideSnapping] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterOrigin, setFilterOrigin] = useState<FilterOrigin>("all");
  const [filterOTT, setFilterOTT] = useState<string>("all");

  // 캐러셀 회전
  const [rotation, setRotation] = useState(0);
  const [isSnapping, setIsSnapping] = useState(false);
  const rotationAtDragStart = useRef(0);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startX = useRef(0);
  const startY = useRef(0);
  const isDragging = useRef(false);
  const directionLocked = useRef<"horizontal" | "vertical" | null>(null);
  const slideStartY = useRef(0);

  useEffect(() => {
    setMounted(true);
    if (!hasOnboarded()) {
      router.replace("/onboarding");
      return;
    }
    loadRecs("all", "all");
    setSavedIds(new Set(getSaved().map((s) => s.recommendation.tmdbId)));
  }, [router]);

  const loadRecs = async (ft: FilterType, fo: FilterOrigin) => {
    const cached = getRecommendations(ft, fo);
    if (cached.length > 0) {
      setRecs(cached);
      setCurrentIndex(0);
      setLoading(false);
      return;
    }

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
      const title = item.recommendation.title;
      if (r.reaction === "loved") feedback.loved.push(title);
      else if (r.reaction === "good") feedback.good.push(title);
      else if (r.reaction === "meh") feedback.meh.push(title);
      else if (r.reaction === "dropped") feedback.dropped.push(title);
    }
    const hasFeedback = feedback.loved.length + feedback.good.length + feedback.meh.length + feedback.dropped.length > 0;

    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorites, filter, ...(hasFeedback ? { feedback } : {}) }),
    });
    const data = await res.json();
    const newRecs = data.recommendations ?? [];
    setRecommendations(newRecs, ft, fo);
    setRecs(newRecs);
    setCurrentIndex(0);
    setLoading(false);
  };

  const handleFilterChange = (newType: FilterType, newOrigin: FilterOrigin) => {
    setFilterType(newType);
    setFilterOrigin(newOrigin);
    setSlideUp(0);
    setFilterOTT("all");
    loadRecs(newType, newOrigin);
  };

  const refreshRecommendations = async () => {
    setRecommendations([], filterType, filterOrigin);
    await loadRecs(filterType, filterOrigin);
  };

  // OTT 필터 적용 (클라이언트 측 — 이미 로드된 추천에서 필터링)
  const filteredRecs = filterOTT === "all"
    ? recs
    : recs.filter((r) => r.providers.some((p) => p.name === filterOTT));

  // 원통 캐러셀 계산
  const cardCount = filteredRecs.length;
  const anglePerCard = cardCount > 0 ? 360 / cardCount : 0;
  const totalRotation = rotation;
  const activeIndex = cardCount > 0
    ? ((Math.round(-totalRotation / anglePerCard) % cardCount) + cardCount) % cardCount
    : 0;
  const current = filteredRecs[activeIndex];

  // 카드로 이동
  const goTo = useCallback(
    (direction: "left" | "right") => {
      if (isSnapping) return;
      const delta = direction === "right" ? -anglePerCard : anglePerCard;
      const target = rotation + delta;
      setIsSnapping(true);
      setRotation(target);
      setTimeout(() => setIsSnapping(false), 400);
    },
    [rotation, anglePerCard, isSnapping]
  );

  // 인덱스 동기화
  useEffect(() => {
    setCurrentIndex(activeIndex);
  }, [activeIndex]);

  // 카드 터치 핸들러
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (slideUp > 50 || isSnapping) return;
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      isDragging.current = true;
      directionLocked.current = null;
      rotationAtDragStart.current = rotation;
    },
    [slideUp, isSnapping, rotation]
  );

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (!directionLocked.current) {
      if (Math.abs(dx) > 10) directionLocked.current = "horizontal";
      else if (Math.abs(dy) > 10) directionLocked.current = "vertical";
      else return;
    }
    if (directionLocked.current === "horizontal") {
      e.preventDefault();
      // 드래그 → 회전 각도로 직접 변환
      const dragAngle = (dx / window.innerWidth) * anglePerCard * 1.2;
      setRotation(rotationAtDragStart.current + dragAngle);
    } else if (directionLocked.current === "vertical") {
      if (dy < 0) {
        // 위로 스와이프 → 카드 자체를 위로 밀어올림
        e.preventDefault();
        const pct = Math.min(100, Math.max(0, (-dy / window.innerHeight) * 150));
        setSlideUp(pct);
      } else if (dy > 0 && slideUp > 0) {
        // 디테일 상태에서 아래로 → 카드 복귀
        e.preventDefault();
        const pct = Math.max(0, slideUp - (dy / window.innerHeight) * 150);
        setSlideUp(pct);
      } else if (dy > 0 && !refreshing) {
        e.preventDefault();
        setPullY(Math.min(80, dy * 0.5));
      }
    }
  }, [anglePerCard, slideUp, refreshing]);

  const onTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const dir = directionLocked.current;
    directionLocked.current = null;
    if (dir === "horizontal") {
      // 드래그 방향 감지 후 가장 가까운 카드로 스냅
      const dragDelta = rotation - rotationAtDragStart.current;
      let snapped: number;
      if (Math.abs(dragDelta) > anglePerCard * 0.2) {
        // 20% 이상 드래그 → 다음/이전 카드로 확정 이동
        snapped = dragDelta > 0
          ? Math.ceil(rotation / anglePerCard) * anglePerCard
          : Math.floor(rotation / anglePerCard) * anglePerCard;
      } else {
        // 미세 드래그 → 원래 카드로 복귀
        snapped = Math.round(rotationAtDragStart.current / anglePerCard) * anglePerCard;
      }
      setRotation(snapped);
      setIsSnapping(true);
      setTimeout(() => setIsSnapping(false), 400);
    } else if (dir === "vertical") {
      // 30% 이상 밀었으면 디테일 열기, 아니면 닫기
      if (slideUp > 30) snapSlide(100);
      else snapSlide(0);
      if (pullY > 50) {
        setRefreshing(true); setPullY(40);
        refreshRecommendations().then(() => { setRefreshing(false); setPullY(0); });
      } else { setPullY(0); }
    }
  }, [rotation, anglePerCard, slideUp, pullY]);

  const snapSlide = useCallback((target: number) => {
    setSlideSnapping(true);
    setSlideUp(target);
    setTimeout(() => setSlideSnapping(false), 350);
  }, []);
  const openDetail = useCallback(() => snapSlide(100), [snapSlide]);
  const closeDetail = useCallback(() => snapSlide(0), [snapSlide]);

  // 키보드
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goTo("left");
      else if (e.key === "ArrowRight") goTo("right");
      else if (e.key === "ArrowUp" || e.key === "Enter") openDetail();
      else if (e.key === "ArrowDown" || e.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goTo, openDetail, closeDetail]);

  useEffect(() => {
    if (slideUp > 50) { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }
  }, [slideUp]);

  // 전체 이미지 프리로드
  useEffect(() => {
    filteredRecs.forEach((r) => {
      if (r.posterUrl) { const img = new Image(); img.src = r.posterUrl; }
    });
  }, [filteredRecs]);

  // 원통 캐러셀 제거 — 평면 peek 슬라이드 사용

  const filterLabel = [
    filterOrigin === "kr" ? "국내" : filterOrigin === "foreign" ? "해외" : "",
    filterType === "movie" ? "영화" : filterType === "series" ? "시리즈" : "",
  ].filter(Boolean).join(" ");

  // 메타 정보 문자열
  const metaInfo = (r: Recommendation) => {
    const parts: string[] = [];
    if (r.country?.length > 0) parts.push(r.country.join("/"));
    if (r.date) parts.push(r.date.slice(0, 4));
    if (r.runtime) parts.push(`${r.runtime}분`);
    if (r.seasons) parts.push(`시즌 ${r.seasons}`);
    return parts.join(" · ");
  };

  const FilterChips = () => (
    <div className="flex gap-2 px-4 pb-2 shrink-0 overflow-x-auto">
      {(["all", "movie", "series"] as const).map((t) => (
        <button key={t} onClick={() => { handleFilterChange(t, filterOrigin); setCurrentIndex(0); }} disabled={loading}
          className="px-3 py-2.5 text-xs whitespace-nowrap transition-colors disabled:opacity-50"
          style={{ background: filterType === t ? "var(--accent)" : "var(--surface)", color: filterType === t ? "var(--bg)" : "var(--text-secondary)", borderRadius: "var(--radius-full)", border: filterType === t ? "none" : "1px solid var(--border)" }}>
          {t === "all" ? "전체" : t === "movie" ? "영화" : "시리즈"}
        </button>
      ))}
      <div style={{ width: 1, background: "var(--border)", margin: "4px 0" }} />
      {(["all", "kr", "foreign"] as const).map((o) => (
        <button key={o} onClick={() => { handleFilterChange(filterType, o); setCurrentIndex(0); }} disabled={loading}
          className="px-3 py-2.5 text-xs whitespace-nowrap transition-colors disabled:opacity-50"
          style={{ background: filterOrigin === o ? "var(--accent)" : "var(--surface)", color: filterOrigin === o ? "var(--bg)" : "var(--text-secondary)", borderRadius: "var(--radius-full)", border: filterOrigin === o ? "none" : "1px solid var(--border)" }}>
          {o === "all" ? "전체" : o === "kr" ? "국내" : "해외"}
        </button>
      ))}
      {/* OTT 필터 */}
      {recs.length > 0 && (
        <>
          <div style={{ width: 1, background: "var(--border)", margin: "4px 0" }} />
          {["all", ...OTT_OPTIONS.filter((ott) => recs.some((r) => r.providers.some((p) => p.name === ott)))].map((ott) => (
            <button key={ott} onClick={() => { setFilterOTT(ott); setCurrentIndex(0); }}
              className="px-3 py-2.5 text-xs whitespace-nowrap transition-colors flex items-center gap-1.5"
              style={{ background: filterOTT === ott ? "var(--accent)" : "var(--surface)", color: filterOTT === ott ? "var(--bg)" : "var(--text-secondary)", borderRadius: "var(--radius-full)", border: filterOTT === ott ? "none" : "1px solid var(--border)" }}>
              {ott === "all" ? "모든 OTT" : (
                <>
                  <img src={getOTTIcon(ott) ?? ""} alt={ott} className="w-4 h-4 object-contain" style={{ borderRadius: "2px" }} />
                  {ott}
                </>
              )}
            </button>
          ))}
        </>
      )}
    </div>
  );

  // 로딩
  if (!mounted || loading) {
    return (
      <div className="h-dvh flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 shrink-0">
          <span className="font-display text-lg" style={{ color: "var(--accent)" }}>Neko</span>
        </div>
        <FilterChips />
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <div className="w-10 h-10 animate-spin" style={{ border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "var(--radius-full)" }} />
          <div className="text-center">
            <h2 className="font-display text-lg" style={{ color: "var(--text-primary)" }}>
              {filterLabel ? `${filterLabel} 추천 생성 중` : "취향을 분석하고 있어요"}
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>잠시만 기다려주세요</p>
          </div>
        </div>
        <BottomNav active="discover" />
      </div>
    );
  }

  // 빈 결과
  if (filteredRecs.length === 0) {
    const hasFilter = filterType !== "all" || filterOrigin !== "all" || filterOTT !== "all";
    return (
      <div className="h-dvh flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 shrink-0">
          <span className="font-display text-lg" style={{ color: "var(--accent)" }}>Neko</span>
          <button onClick={() => router.push("/reset")} className="text-xs px-2 py-2" style={{ color: "var(--text-muted)" }}>재설정</button>
        </div>
        <FilterChips />
        <div className="flex-1 flex flex-col px-8 justify-center">
          <div className="space-y-5">
            <IconFilm size={36} color="var(--text-muted)" />
            <div>
              <p className="font-display text-lg font-semibold">{hasFilter ? "해당 조건의 결과가 없어요" : "추천을 만들지 못했어요"}</p>
              <p className="text-sm mt-1.5" style={{ color: "var(--text-secondary)" }}>{hasFilter ? "다른 필터를 시도해보세요" : "잠시 후 다시 시도해보세요"}</p>
            </div>
            <div className="flex gap-3">
              {hasFilter && (
                <button onClick={() => { handleFilterChange("all", "all"); setFilterOTT("all"); }} className="px-5 py-2.5 text-sm font-medium active:scale-95 transition-transform" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-full)" }}>필터 초기화</button>
              )}
              <button onClick={refreshRecommendations} className="px-5 py-2.5 text-sm font-medium flex items-center gap-2 active:scale-95 transition-transform" style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: "var(--radius-full)" }}>
                <IconRefresh size={14} /> 다시 시도
              </button>
            </div>
          </div>
        </div>
        <BottomNav active="discover" />
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        <span className="font-display text-lg" style={{ color: "var(--accent)" }}>Neko</span>
        <div className="flex items-center gap-3">
          <span className="font-data text-sm" style={{ color: "var(--text-muted)" }}>
            {currentIndex + 1}/{filteredRecs.length}
          </span>
          <button onClick={() => router.push("/reset")} className="text-xs px-2 py-2" style={{ color: "var(--text-muted)" }}>재설정</button>
        </div>
      </div>

      <FilterChips />

      {/* Pull-to-refresh indicator */}
      {pullY > 0 && (
        <div className="flex justify-center py-1 shrink-0" style={{ opacity: Math.min(1, pullY / 40) }}>
          <div className={`w-6 h-6 ${refreshing ? "animate-spin" : ""}`} style={{ border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "var(--radius-full)", transform: `rotate(${pullY * 4}deg)` }} />
        </div>
      )}

      {/* 카드 + 디테일 영역 */}
      <div
        className="flex-1 min-h-0 relative overflow-hidden"
        style={{ touchAction: "none", overscrollBehavior: "none", transform: pullY > 0 ? `translateY(${pullY * 0.3}px)` : undefined, transition: pullY === 0 ? "none" : "transform 0.2s ease-out" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* 디테일 (카드 뒤에 깔려있음, 카드가 올라가면 드러남) */}
        {current && slideUp > 0 && (
          <div
            className="absolute inset-0 overflow-y-auto px-5 pt-4 pb-8 z-20"
            style={{ background: "var(--bg)", touchAction: "none", pointerEvents: slideUp > 30 ? "auto" : "none" }}
            onTouchStart={(e) => { slideStartY.current = e.touches[0].clientY; }}
            onTouchMove={(e) => {
              const dy = e.touches[0].clientY - slideStartY.current;
              if (dy > 0) {
                e.preventDefault();
                setSlideUp(Math.max(0, 100 - (dy / window.innerHeight) * 150));
              }
            }}
            onTouchEnd={() => {
              if (slideUp < 70) snapSlide(0); else snapSlide(100);
            }}
          >
            <div className="flex justify-center mb-3">
              <div className="w-10 h-1" style={{ background: "var(--border)", borderRadius: "var(--radius-full)" }} />
            </div>
            <button className="absolute top-4 right-5 w-11 h-11 flex items-center justify-center z-30" style={{ background: "var(--surface)", borderRadius: "var(--radius-full)" }} onClick={closeDetail}>
              <IconClose size={16} color="var(--text-secondary)" />
            </button>

            <h2 className="font-display text-xl font-bold pr-14">{current.title}</h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>{current.titleEn} · {metaInfo(current)}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <IconStar size={13} color="var(--accent)" />
              <span className="font-data text-sm font-semibold" style={{ color: "var(--accent)" }}>{current.rating.toFixed(1)}</span>
            </div>

            {current.backdrop && (
              <img src={current.backdrop} alt="" className="w-full h-40 object-cover mt-4" style={{ borderRadius: "var(--radius-md)" }} />
            )}

            <div className="mt-4">
              <div className="px-3 py-2 text-sm" style={{ background: "var(--accent-dim)", borderRadius: "var(--radius-md)" }}>{current.reason}</div>
            </div>
            {(current.director || current.cast?.length > 0) && (
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
                {current.director && (<div><span className="text-xs" style={{ color: "var(--text-muted)" }}>감독 </span><span className="text-sm">{current.director}</span></div>)}
                {current.cast?.length > 0 && (<div><span className="text-xs" style={{ color: "var(--text-muted)" }}>출연 </span><span className="text-sm">{current.cast.join(", ")}</span></div>)}
              </div>
            )}
            {current.overview && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>줄거리</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{current.overview}</p>
              </div>
            )}
            <div className="mt-5 pb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>시청 가능</h3>
              <div className="flex flex-col gap-2">
                {current.providers.map((p) => {
                  const ottUrl = getOTTLink(p.name, current.title);
                  return (
                    <a key={p.name} href={ottUrl ?? current.watchLink ?? "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 text-sm font-medium active:scale-[0.98] transition-transform" style={{ background: "var(--surface-raised)", borderRadius: "var(--radius-md)" }}>
                      <img src={getOTTIcon(p.name) ?? p.logoUrl ?? ""} alt={p.name} className="w-8 h-8 object-contain flex-shrink-0" style={{ borderRadius: "var(--radius-sm)", background: "var(--surface)" }} />
                      <span className="flex-1">{p.name}</span>
                      <span className="text-xs" style={{ color: "var(--accent)" }}>열기</span>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 카드 캐러셀 (위에 덮여있음, 위로 슬라이드하면 올라감) */}
        <div className="absolute inset-0 z-10" style={{ pointerEvents: slideUp > 80 ? "none" : "auto" }}>
        <div className="h-full flex items-stretch px-3">
          {filteredRecs.map((rec, i) => {
            // 연속 위치 계산 (소수점 포함 — 드래그 중 부드러운 보간)
            const continuousIndex = cardCount > 0 ? (-totalRotation / anglePerCard) : 0;
            const offset = i - continuousIndex;
            // 무한 회전 보정
            let adjustedOffset = offset;
            if (cardCount > 0) {
              while (adjustedOffset > cardCount / 2) adjustedOffset -= cardCount;
              while (adjustedOffset < -cardCount / 2) adjustedOffset += cardCount;
            }
            const pos = adjustedOffset;

            // 인접 3장만 렌더
            if (Math.abs(pos) > 1.5) return null;

            const translateX = pos * 85;
            const scale = 1 - Math.abs(pos) * 0.12;
            const rotateYDeg = pos * -8;
            const zIndex = 10 - Math.abs(Math.round(pos));
            const opacity = 1 - Math.abs(pos) * 0.4;
            // 활성 카드만 위로 슬라이드
            const isActive = Math.abs(pos) < 0.5;
            const slideYPx = isActive ? -(slideUp / 100) * window.innerHeight * 0.85 : 0;

            return (
              <div
                key={rec.tmdbId}
                className="absolute inset-y-0 overflow-hidden will-change-transform"
                style={{
                  left: "3%",
                  right: "3%",
                  transform: `translateX(${translateX}%) translateY(${slideYPx}px) scale(${scale}) rotateY(${rotateYDeg}deg)`,
                  transition: isSnapping ? "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease-out" : slideSnapping ? "transform 0.3s ease-out, opacity 0.3s ease-out" : "none",
                  borderRadius: "var(--radius-xl)",
                  zIndex,
                  opacity,
                  pointerEvents: Math.abs(pos) < 0.5 ? "auto" : "none",
                }}
              >
                {rec.posterUrl ? (
                  <img src={rec.posterUrl} alt={rec.title} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ background: "var(--surface)" }}>
                    <span className="font-display text-5xl" style={{ color: "var(--text-muted)" }}>N</span>
                  </div>
                )}

                {Math.abs(pos) < 0.5 && (
                  <>
                    <div className="absolute top-4 right-4 backdrop-blur-sm px-3 py-1.5 flex items-center gap-1.5" style={{ background: "var(--bg-overlay)", borderRadius: "var(--radius-md)" }}>
                      <IconStar size={13} color="var(--accent)" /><span className="font-data font-semibold" style={{ color: "var(--accent)" }}>{rec.rating.toFixed(1)}</span>
                    </div>

                    <div className="absolute top-4 left-4 backdrop-blur-sm px-3 py-1.5 text-sm" style={{ background: "var(--bg-overlay)", borderRadius: "var(--radius-md)" }}>
                      {rec.type === "series" ? "시리즈" : "영화"}
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 p-5 pt-24" style={{ background: "linear-gradient(transparent, var(--bg-overlay-heavy) 40%, var(--bg))" }}>
                      <h2 className="font-display text-2xl font-bold">{rec.title}</h2>
                      {metaInfo(rec) && (
                        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{metaInfo(rec)}</p>
                      )}
                      <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{rec.reason}</p>
                      <div className="flex gap-1.5 mt-3 items-center">
                        {rec.providers.slice(0, 4).map((p) => (
                          <img key={p.name} src={getOTTIcon(p.name) ?? p.logoUrl ?? ""} alt={p.name} title={p.name} className="w-8 h-8 object-contain" style={{ borderRadius: "var(--radius-md)", background: "var(--surface)" }} />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="px-4 pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5 flex-1 mr-3 items-center justify-center">
            {filteredRecs.map((_, i) => (
              <div key={i} className="transition-all" style={{
                width: i === activeIndex ? 16 : 6,
                height: 6,
                background: i === activeIndex ? "var(--accent)" : "var(--border)",
                borderRadius: "var(--radius-full)",
              }} />
            ))}
          </div>
          <div className="flex gap-2">
            {/* Detail 버튼 */}
            <button onClick={openDetail} aria-label="상세보기"
              className="w-12 h-12 flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-full)" }}>
              <IconDetail size={18} color="var(--text-secondary)" />
            </button>
            {/* 저장 토글 */}
            <button
              onClick={() => {
                const id = current.tmdbId;
                if (savedIds.has(id)) { removeSaved(id); setSavedIds((s) => { const n = new Set(s); n.delete(id); return n; }); }
                else { addSaved(current); setSavedIds((s) => new Set(s).add(id)); }
              }}
              aria-label={savedIds.has(current.tmdbId) ? "저장 취소" : "저장"}
              className="w-12 h-12 flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: savedIds.has(current.tmdbId) ? "var(--accent-dim)" : "var(--surface)", border: `1px solid ${savedIds.has(current.tmdbId) ? "var(--accent-border)" : "var(--border)"}`, borderRadius: "var(--radius-full)" }}>
              <IconSave size={20} color={savedIds.has(current.tmdbId) ? "var(--accent)" : "var(--text-muted)"} filled={savedIds.has(current.tmdbId)} />
            </button>
          </div>
        </div>
      </div>

      <BottomNav active="discover" />
    </div>
  );
}
