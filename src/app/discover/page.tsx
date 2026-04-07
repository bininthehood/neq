"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getFavorites,
  getRecommendations,
  setRecommendations,
  clearAllRecommendations,
  addSaved,
  hasOnboarded,
  getWatchReports,
  getSaved,
} from "@/lib/store";
import type { Recommendation } from "@/lib/types";
import BottomNav from "@/components/BottomNav";
import { IconPass, IconSave, IconInfo, IconUndo, IconClose, IconRefresh } from "@/components/Icons";

type FilterType = "all" | "movie" | "series";
type FilterOrigin = "all" | "kr" | "foreign";

export default function DiscoverPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showDetail, setShowDetail] = useState(false);
  const [showHint, setShowHint] = useState(true);

  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterOrigin, setFilterOrigin] = useState<FilterOrigin>("all");
  const [history, setHistory] = useState<number[]>([]);

  const [offsetX, setOffsetX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [exitDir, setExitDir] = useState<"left" | "right" | null>(null);

  const startX = useRef(0);
  const startY = useRef(0);
  const isDragging = useRef(false);
  const directionLocked = useRef<"horizontal" | "vertical" | null>(null);

  useEffect(() => {
    setMounted(true);
    if (!hasOnboarded()) {
      router.replace("/onboarding");
      return;
    }
    loadRecs("all", "all");
  }, [router]);

  const loadRecs = async (ft: FilterType, fo: FilterOrigin) => {
    // 캐시 확인
    const cached = getRecommendations(ft, fo);
    if (cached.length > 0) {
      setRecs(cached);
      setCurrentIndex(0);
      setHistory([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const favorites = getFavorites();
    const filter: any = {};
    if (ft !== "all") filter.type = ft;
    if (fo !== "all") filter.origin = fo;

    // 시청 피드백 수집
    const reports = getWatchReports();
    const savedItems = getSaved();
    const feedback: { loved: string[]; dropped: string[] } = { loved: [], dropped: [] };
    for (const r of reports) {
      const item = savedItems.find((s) => s.recommendation.tmdbId === r.tmdbId);
      if (!item) continue;
      if (r.reaction === "loved") feedback.loved.push(item.recommendation.title);
      else if (r.reaction === "dropped") feedback.dropped.push(item.recommendation.title);
    }
    const hasFeedback = feedback.loved.length > 0 || feedback.dropped.length > 0;

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
    setHistory([]);
    setLoading(false);
  };

  const handleFilterChange = (newType: FilterType, newOrigin: FilterOrigin) => {
    setFilterType(newType);
    setFilterOrigin(newOrigin);
    setShowDetail(false);
    loadRecs(newType, newOrigin);
  };

  const refreshRecommendations = async () => {
    // 현재 필터의 캐시만 삭제하고 새로 요청
    setRecommendations([], filterType, filterOrigin);
    loadRecs(filterType, filterOrigin);
  };

  const current = recs[currentIndex];

  const goNext = useCallback(
    (direction: "left" | "right") => {
      if (!current || isAnimating) return;
      if (direction === "right") addSaved(current);
      if (showHint && currentIndex >= 2) setShowHint(false);

      setIsAnimating(true);
      setExitDir(direction);
      setHistory((h) => [...h, currentIndex]);

      setTimeout(() => {
        setCurrentIndex((i) => i + 1);
        setOffsetX(0);
        setExitDir(null);
        setIsAnimating(false);
        setShowDetail(false);
      }, 300);
    },
    [current, currentIndex, showHint, isAnimating]
  );

  const handleUndo = useCallback(() => {
    if (history.length === 0 || isAnimating) return;
    const prevIndex = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setCurrentIndex(prevIndex);
  }, [history, isAnimating]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (showDetail || isAnimating) return;
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      isDragging.current = true;
      directionLocked.current = null;
    },
    [showDetail, isAnimating]
  );

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (!directionLocked.current) {
      if (Math.abs(dx) > 10) directionLocked.current = "horizontal";
      else if (Math.abs(dy) > 10) { directionLocked.current = "vertical"; isDragging.current = false; return; }
      else return;
    }
    if (directionLocked.current !== "horizontal") return;
    e.preventDefault();
    setOffsetX(dx);
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!isDragging.current && directionLocked.current !== "horizontal") return;
    isDragging.current = false;
    if (Math.abs(offsetX) > 80) goNext(offsetX > 0 ? "right" : "left");
    else setOffsetX(0);
    directionLocked.current = null;
  }, [offsetX, goNext]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goNext("left");
      else if (e.key === "ArrowRight") goNext("right");
      else if (e.key === "ArrowUp" || e.key === "Enter") setShowDetail(true);
      else if (e.key === "ArrowDown" || e.key === "Escape") setShowDetail(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext]);

  const getCardStyle = (): React.CSSProperties => {
    if (exitDir) {
      const x = exitDir === "left" ? -500 : 500;
      return { transform: `translateX(${x}px) rotate(${x * 0.05}deg)`, transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-out", opacity: 0 };
    }
    if (offsetX !== 0) return { transform: `translateX(${offsetX}px) rotate(${offsetX * 0.05}deg)`, transition: "none" };
    return { transform: "translateX(0) rotate(0deg)", transition: "transform 0.2s ease-out" };
  };

  const passOpacity = Math.min(1, Math.max(0, -offsetX / 120));
  const saveOpacity = Math.min(1, Math.max(0, offsetX / 120));

  const filterLabel = [
    filterOrigin === "kr" ? "국내" : filterOrigin === "foreign" ? "해외" : "",
    filterType === "movie" ? "영화" : filterType === "series" ? "시리즈" : "",
  ].filter(Boolean).join(" ");

  // --- Filter chips component (shared) ---
  const FilterChips = () => (
    <div className="flex gap-2 px-4 pb-2 shrink-0 overflow-x-auto">
      {(["all", "movie", "series"] as const).map((t) => (
        <button
          key={t}
          onClick={() => handleFilterChange(t, filterOrigin)}
          disabled={loading}
          className="px-3 py-1 text-xs whitespace-nowrap transition-colors disabled:opacity-50"
          style={{
            background: filterType === t ? "var(--accent)" : "var(--surface)",
            color: filterType === t ? "var(--bg)" : "var(--text-secondary)",
            borderRadius: "var(--radius-full)",
            border: filterType === t ? "none" : "1px solid var(--border)",
          }}
        >
          {t === "all" ? "전체" : t === "movie" ? "영화" : "시리즈"}
        </button>
      ))}
      <div style={{ width: 1, background: "var(--border)", margin: "4px 0" }} />
      {(["all", "kr", "foreign"] as const).map((o) => (
        <button
          key={o}
          onClick={() => handleFilterChange(filterType, o)}
          disabled={loading}
          className="px-3 py-1 text-xs whitespace-nowrap transition-colors disabled:opacity-50"
          style={{
            background: filterOrigin === o ? "var(--accent)" : "var(--surface)",
            color: filterOrigin === o ? "var(--bg)" : "var(--text-secondary)",
            borderRadius: "var(--radius-full)",
            border: filterOrigin === o ? "none" : "1px solid var(--border)",
          }}
        >
          {o === "all" ? "전체" : o === "kr" ? "국내" : "해외"}
        </button>
      ))}
    </div>
  );

  if (!mounted || loading) {
    return (
      <div className="h-dvh flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 shrink-0">
          <span className="font-display text-lg" style={{ color: "var(--accent)" }}>Neko</span>
        </div>
        <FilterChips />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <h2 className="font-display text-xl" style={{ color: "var(--accent)" }}>
            {filterLabel ? `${filterLabel} 추천 생성 중...` : "취향을 분석하고 있어요..."}
          </h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>10-20초 걸려요</p>
        </div>
        <BottomNav active="discover" />
      </div>
    );
  }

  // 추천 결과가 없을 때
  if (recs.length === 0 || currentIndex >= recs.length) {
    const hasFilter = filterType !== "all" || filterOrigin !== "all";
    return (
      <div className="h-dvh flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 shrink-0">
          <span className="font-display text-lg" style={{ color: "var(--accent)" }}>Neko</span>
          <button
            onClick={() => {
              ["neko_favorites", "neko_saved"].forEach((k) => localStorage.removeItem(k));
              clearAllRecommendations();
              router.replace("/onboarding");
            }}
            className="text-xs" style={{ color: "var(--text-muted)" }}
          >
            재설정
          </button>
        </div>
        <FilterChips />
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8">
          {currentIndex >= recs.length && recs.length > 0 ? (
            <>
              <div className="text-4xl" style={{ color: "var(--text-muted)" }}>◆</div>
              <div className="font-display text-lg">모든 추천을 확인했어요!</div>
              <button
                onClick={refreshRecommendations}
                className="px-6 py-3 font-semibold flex items-center gap-2 active:scale-95 transition-transform"
                style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: "var(--radius-full)" }}
              >
                <IconRefresh size={16} /> 새로운 추천 받기
              </button>
            </>
          ) : (
            <>
              <div className="font-display text-4xl" style={{ color: "var(--text-muted)" }}>?</div>
              <div className="text-center">
                <p className="font-display text-lg">
                  {hasFilter ? `${filterLabel} 추천을 찾지 못했어요` : "추천을 생성하지 못했어요"}
                </p>
                <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
                  다시 시도하거나 다른 필터를 선택해보세요.
                </p>
              </div>
              <div className="flex gap-3">
                {hasFilter && (
                  <button
                    onClick={() => handleFilterChange("all", "all")}
                    className="px-5 py-2.5 text-sm font-medium active:scale-95 transition-transform"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-full)" }}
                  >
                    필터 초기화
                  </button>
                )}
                <button
                  onClick={refreshRecommendations}
                  className="px-5 py-2.5 text-sm font-medium flex items-center gap-2 active:scale-95 transition-transform"
                  style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: "var(--radius-full)" }}
                >
                  <IconRefresh size={14} /> 다시 시도
                </button>
              </div>
            </>
          )}
        </div>
        <BottomNav active="discover" />
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col overflow-hidden" style={{ touchAction: "pan-y" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        <span className="font-display text-lg" style={{ color: "var(--accent)" }}>Neko</span>
        <div className="flex items-center gap-3">
          <span className="font-data text-sm" style={{ color: "var(--text-muted)" }}>
            {currentIndex + 1}/{recs.length}
          </span>
          <button
            onClick={() => {
              ["neko_favorites", "neko_saved"].forEach((k) => localStorage.removeItem(k));
              clearAllRecommendations();
              router.replace("/onboarding");
            }}
            className="text-xs" style={{ color: "var(--text-muted)" }}
          >
            재설정
          </button>
        </div>
      </div>

      <FilterChips />

      {/* Card area */}
      <div
        className="flex-1 min-h-0 px-3 pb-2 relative"
        style={{ touchAction: "none", overscrollBehavior: "none" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          key={`${filterType}-${filterOrigin}-${currentIndex}`}
          className="h-full overflow-hidden relative will-change-transform cursor-pointer"
          style={{ ...getCardStyle(), borderRadius: "var(--radius-xl)" }}
          onClick={() => { if (Math.abs(offsetX) < 5) setShowDetail(true); }}
        >
          {current.posterUrl ? (
            <img src={current.posterUrl} alt={current.title} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "var(--surface)" }}>
              <span className="font-display text-5xl" style={{ color: "var(--text-muted)" }}>N</span>
            </div>
          )}

          <div className="absolute top-4 right-4 backdrop-blur-sm px-3 py-1.5 flex items-center gap-1.5" style={{ background: "var(--bg-overlay)", borderRadius: "var(--radius-md)" }}>
            <span className="font-data font-semibold" style={{ color: "var(--accent)" }}>⭐ {current.rating.toFixed(1)}</span>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>TMDB</span>
          </div>

          <div className="absolute top-4 left-4 backdrop-blur-sm px-3 py-1.5 text-sm" style={{ background: "var(--bg-overlay)", borderRadius: "var(--radius-md)" }}>
            {current.type === "series" ? "시리즈" : "영화"}
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-5 pt-24" style={{ background: "linear-gradient(transparent, var(--bg-overlay-heavy) 40%, var(--bg))" }}>
            <h2 className="font-display text-2xl font-bold">{current.title}</h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{current.reason}</p>
            <div className="flex gap-2 mt-3 flex-wrap items-center">
              {current.providers.slice(0, 3).map((p) => (
                <span key={p} className="px-2.5 py-1 text-xs" style={{ background: "var(--text-primary-dim)", borderRadius: "var(--radius-sm)" }}>{p}</span>
              ))}
              {current.watchLink && (
                <a href={current.watchLink} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 text-xs font-medium" style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: "var(--radius-sm)" }} onClick={(e) => e.stopPropagation()}>
                  지금 보기 →
                </a>
              )}
            </div>
          </div>

          {showHint && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-50">
              <div className="text-xs px-3 py-1.5" style={{ background: "var(--bg-overlay)", borderRadius: "var(--radius-full)" }}>탭하여 상세보기</div>
            </div>
          )}

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ background: "var(--danger-overlay)", opacity: passOpacity }}>
            <IconPass size={80} color="var(--danger)" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ background: "var(--accent-dim)", opacity: saveOpacity }}>
            <IconSave size={80} color="var(--accent)" />
          </div>
        </div>

        {showDetail && (
          <div className="absolute inset-0 mx-3 backdrop-blur overflow-y-auto p-5 animate-fade-in z-10" style={{ background: "var(--bg-overlay-solid)", borderRadius: "var(--radius-xl)", touchAction: "pan-y" }}>
            <button className="absolute top-4 right-4 z-20 w-11 h-11 flex items-center justify-center" style={{ background: "var(--surface)", borderRadius: "var(--radius-full)" }} onClick={() => setShowDetail(false)}>
              <IconClose size={16} color="var(--text-secondary)" />
            </button>
            <h2 className="font-display text-2xl font-bold pr-10">{current.title}</h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{current.titleEn} · {current.date.slice(0, 4)}</p>
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>왜 추천했나요?</h3>
              <div className="px-3 py-2 text-sm" style={{ background: "var(--accent-dim)", borderRadius: "var(--radius-md)" }}>{current.reason}</div>
            </div>
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>줄거리</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{current.overview}</p>
            </div>
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>시청 가능</h3>
              <div className="flex gap-2 flex-wrap">
                {current.providers.map((p) => (
                  <span key={p} className="px-3 py-1.5 text-sm" style={{ background: "var(--surface-raised)", borderRadius: "var(--radius-md)" }}>{p}</span>
                ))}
              </div>
              {current.watchLink && (
                <a href={current.watchLink} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium active:scale-95 transition-transform" style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: "var(--radius-full)" }}>
                  지금 보기 →
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-4 pb-2 shrink-0">
        {showHint && (
          <div className="flex justify-between text-xs mb-2 px-8" style={{ color: "var(--text-muted)" }}>
            <span>← Pass</span><span>탭 = Detail</span><span>Save →</span>
          </div>
        )}
        <div className="flex gap-3 justify-center items-center">
          {history.length > 0 && (
            <button onClick={handleUndo} disabled={isAnimating} className="w-10 h-10 flex items-center justify-center active:scale-90 transition-transform" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-full)" }} title="되돌리기">
              <IconUndo size={16} color="var(--text-muted)" />
            </button>
          )}
          <button onClick={() => goNext("left")} disabled={isAnimating} className="w-14 h-14 flex items-center justify-center active:scale-90 transition-transform" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-full)" }}>
            <IconPass size={22} color="var(--text-secondary)" />
          </button>
          <button onClick={() => setShowDetail(!showDetail)} className="w-14 h-14 flex items-center justify-center active:scale-90 transition-transform" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-full)" }}>
            <IconInfo size={22} color="var(--text-secondary)" />
          </button>
          <button onClick={() => goNext("right")} disabled={isAnimating} className="w-14 h-14 flex items-center justify-center active:scale-90 transition-transform" style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)", borderRadius: "var(--radius-full)" }}>
            <IconSave size={22} color="var(--accent)" />
          </button>
        </div>
      </div>

      <BottomNav active="discover" />
    </div>
  );
}
