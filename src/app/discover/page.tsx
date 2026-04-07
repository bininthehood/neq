"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getFavorites,
  getRecommendations,
  setRecommendations,
  addSaved,
  hasOnboarded,
} from "@/lib/store";
import type { Recommendation } from "@/lib/types";
import BottomNav from "@/components/BottomNav";

export default function DiscoverPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showDetail, setShowDetail] = useState(false);
  const [showHint, setShowHint] = useState(true);

  const [filterType, setFilterType] = useState<"all" | "movie" | "series">("all");
  const [filterOrigin, setFilterOrigin] = useState<"all" | "kr" | "foreign">("all");
  const [history, setHistory] = useState<number[]>([]); // 이전 인덱스 스택

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
    loadRecommendations();
  }, [router]);

  const loadRecommendations = async () => {
    const cached = getRecommendations();
    if (cached.length > 0) {
      setRecs(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    const favorites = getFavorites();
    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorites }),
    });
    const data = await res.json();
    setRecommendations(data.recommendations);
    setRecs(data.recommendations);
    setLoading(false);
  };

  const KR_CODES = ["KR"];
  const filteredRecs = recs.filter((r) => {
    if (filterType !== "all" && r.type !== filterType) return false;
    if (filterOrigin === "kr" && !(r.originCountry ?? []).some((c) => KR_CODES.includes(c))) return false;
    if (filterOrigin === "foreign" && (r.originCountry ?? []).some((c) => KR_CODES.includes(c))) return false;
    return true;
  });
  const current = filteredRecs[currentIndex];

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
      else if (Math.abs(dy) > 10) {
        directionLocked.current = "vertical";
        isDragging.current = false;
        return;
      } else return;
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
      else if (e.key === "ArrowUp") setShowDetail(true);
      else if (e.key === "ArrowDown" || e.key === "Escape") setShowDetail(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext]);

  const getCardStyle = (): React.CSSProperties => {
    if (exitDir) {
      const x = exitDir === "left" ? -500 : 500;
      return {
        transform: `translateX(${x}px) rotate(${x * 0.05}deg)`,
        transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-out",
        opacity: 0,
      };
    }
    if (offsetX !== 0) {
      return { transform: `translateX(${offsetX}px) rotate(${offsetX * 0.05}deg)`, transition: "none" };
    }
    return { transform: "translateX(0) rotate(0deg)", transition: "transform 0.2s ease-out" };
  };

  const passOpacity = Math.min(1, Math.max(0, -offsetX / 120));
  const saveOpacity = Math.min(1, Math.max(0, offsetX / 120));

  if (!mounted || loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <h2 className="font-display text-2xl" style={{ color: "var(--accent)" }}>Neko</h2>
        <p style={{ color: "var(--text-secondary)" }}>취향을 분석하고 있어요...</p>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>첫 로딩은 10-20초 걸려요</p>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-4 px-6">
        <div className="text-4xl">🎬</div>
        <div className="font-display text-xl">모든 추천을 확인했어요!</div>
        <button
          onClick={() => { setRecommendations([]); setCurrentIndex(0); loadRecommendations(); }}
          className="px-6 py-3 font-semibold active:scale-95 transition-transform"
          style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: "var(--radius-full)" }}
        >
          새로운 추천 받기
        </button>
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
            {currentIndex + 1}/{filteredRecs.length}
          </span>
          <button
            onClick={() => {
              ["neko_favorites", "neko_saved", "neko_recommendations"].forEach((k) => localStorage.removeItem(k));
              router.replace("/onboarding");
            }}
            className="text-xs transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            재설정
          </button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 px-4 pb-2 shrink-0 overflow-x-auto">
        {(["all", "movie", "series"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setFilterType(t); setCurrentIndex(0); }}
            className="px-3 py-1 text-xs whitespace-nowrap transition-colors"
            style={{
              background: filterType === t ? "var(--accent)" : "var(--surface)",
              color: filterType === t ? "var(--bg)" : "var(--text-secondary)",
              borderRadius: "var(--radius-full)",
              border: filterType === t ? "none" : "1px solid var(--border)",
            }}
          >
            {t === "all" ? "전체" : t === "movie" ? "🎬 영화" : "📺 시리즈"}
          </button>
        ))}
        <div style={{ width: 1, background: "var(--border)", margin: "4px 0" }} />
        {(["all", "kr", "foreign"] as const).map((o) => (
          <button
            key={o}
            onClick={() => { setFilterOrigin(o); setCurrentIndex(0); }}
            className="px-3 py-1 text-xs whitespace-nowrap transition-colors"
            style={{
              background: filterOrigin === o ? "var(--accent)" : "var(--surface)",
              color: filterOrigin === o ? "var(--bg)" : "var(--text-secondary)",
              borderRadius: "var(--radius-full)",
              border: filterOrigin === o ? "none" : "1px solid var(--border)",
            }}
          >
            {o === "all" ? "전체" : o === "kr" ? "🇰🇷 국내" : "🌍 해외"}
          </button>
        ))}
      </div>

      {/* Card area */}
      <div
        className="flex-1 min-h-0 px-3 pb-2 relative"
        style={{ touchAction: "none", overscrollBehavior: "none" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          key={currentIndex}
          className="h-full overflow-hidden relative will-change-transform"
          style={{ ...getCardStyle(), borderRadius: "var(--radius-xl)" }}
        >
          {/* Poster */}
          {current.posterUrl ? (
            <img src={current.posterUrl} alt={current.title} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "var(--surface)" }}>
              <span className="text-6xl">🎬</span>
            </div>
          )}

          {/* Rating badge */}
          <div
            className="absolute top-4 right-4 backdrop-blur-sm px-3 py-1.5 flex items-center gap-1.5"
            style={{ background: "rgba(12,10,9,0.7)", borderRadius: "var(--radius-md)" }}
          >
            <span className="font-data font-semibold" style={{ color: "var(--accent)" }}>
              ⭐ {current.rating.toFixed(1)}
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>TMDB</span>
          </div>

          {/* Type badge */}
          <div
            className="absolute top-4 left-4 backdrop-blur-sm px-3 py-1.5 text-sm"
            style={{ background: "rgba(12,10,9,0.7)", borderRadius: "var(--radius-md)" }}
          >
            {current.type === "series" ? "📺 시리즈" : "🎬 영화"}
          </div>

          {/* Bottom info */}
          <div
            className="absolute bottom-0 left-0 right-0 p-5 pt-24"
            style={{ background: "linear-gradient(transparent, rgba(12,10,9,0.85) 40%, var(--bg))" }}
          >
            <h2 className="font-display text-2xl font-bold">{current.title}</h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{current.reason}</p>
            <div className="flex gap-2 mt-3 flex-wrap items-center">
              {current.providers.slice(0, 3).map((p) => (
                <span
                  key={p}
                  className="px-2.5 py-1 text-xs"
                  style={{ background: "rgba(245,240,235,0.08)", borderRadius: "var(--radius-sm)" }}
                >
                  {p}
                </span>
              ))}
              {current.watchLink && (
                <a
                  href={current.watchLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 text-xs font-medium"
                  style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: "var(--radius-sm)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  지금 보기 →
                </a>
              )}
            </div>
          </div>

          {/* Swipe overlays */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ background: "rgba(220,74,58,0.25)", opacity: passOpacity }}
          >
            <span className="text-7xl">👋</span>
          </div>
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ background: "var(--accent-dim)", opacity: saveOpacity }}
          >
            <span className="text-7xl">💚</span>
          </div>
        </div>

        {/* Detail overlay */}
        {showDetail && (
          <div
            className="absolute inset-0 mx-3 backdrop-blur overflow-y-auto p-5 animate-fade-in z-10"
            style={{ background: "rgba(12,10,9,0.97)", borderRadius: "var(--radius-xl)", touchAction: "pan-y" }}
            onClick={() => setShowDetail(false)}
          >
            <button
              className="absolute top-4 right-4 text-xl z-20"
              style={{ color: "var(--text-muted)" }}
              onClick={() => setShowDetail(false)}
            >
              ✕
            </button>
            <h2 className="font-display text-2xl font-bold pr-8">{current.title}</h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              {current.titleEn} · {current.date.slice(0, 4)}
            </p>

            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
                왜 추천했나요?
              </h3>
              <div
                className="pl-3 py-2 text-sm"
                style={{ background: "var(--accent-dim)", borderLeft: "2px solid var(--accent)" }}
              >
                {current.reason}
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
                줄거리
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {current.overview}
              </p>
            </div>

            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
                시청 가능
              </h3>
              <div className="flex gap-2 flex-wrap">
                {current.providers.map((p) => (
                  <span
                    key={p}
                    className="px-3 py-1.5 text-sm"
                    style={{ background: "var(--surface-raised)", borderRadius: "var(--radius-md)" }}
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-4 pb-2 shrink-0">
        {showHint && (
          <div className="flex justify-between text-xs mb-2 px-8" style={{ color: "var(--text-muted)" }}>
            <span>← Pass</span>
            <span>↑ Detail</span>
            <span>Save →</span>
          </div>
        )}
        <div className="flex gap-3 justify-center items-center">
          {history.length > 0 && (
            <button
              onClick={handleUndo}
              disabled={isAnimating}
              className="w-10 h-10 flex items-center justify-center text-sm active:scale-90 transition-transform"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-full)", color: "var(--text-muted)" }}
              title="되돌리기"
            >
              ↩
            </button>
          )}
          <button
            onClick={() => goNext("left")}
            disabled={isAnimating}
            className="w-14 h-14 flex items-center justify-center text-xl active:scale-90 transition-transform"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-full)" }}
          >
            👋
          </button>
          <button
            onClick={() => setShowDetail(!showDetail)}
            className="w-14 h-14 flex items-center justify-center text-xl active:scale-90 transition-transform"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-full)" }}
          >
            ℹ️
          </button>
          <button
            onClick={() => goNext("right")}
            disabled={isAnimating}
            className="w-14 h-14 flex items-center justify-center text-xl active:scale-90 transition-transform"
            style={{ background: "var(--accent-dim)", border: "1px solid rgba(232,123,53,0.3)", borderRadius: "var(--radius-full)" }}
          >
            💚
          </button>
        </div>
      </div>

      <BottomNav active="discover" />
    </div>
  );
}
