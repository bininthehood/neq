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
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showDetail, setShowDetail] = useState(false);
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | null>(null);
  const [showHint, setShowHint] = useState(true);

  // 스와이프 상태
  const cardRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const deltaX = useRef(0);
  const deltaY = useRef(0);
  const swiping = useRef(false);

  useEffect(() => {
    if (!hasOnboarded()) {
      router.replace("/onboarding");
      return;
    }
    loadRecommendations();
  }, [router]);

  const loadRecommendations = async () => {
    // 캐시된 추천이 있으면 사용
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

  const current = recs[currentIndex];

  const handleSwipe = useCallback(
    (direction: "left" | "right") => {
      if (!current) return;
      setSwipeDir(direction);
      if (direction === "right") {
        addSaved(current);
      }
      if (showHint && currentIndex >= 2) setShowHint(false);
      setTimeout(() => {
        setSwipeDir(null);
        setShowDetail(false);
        setCurrentIndex((i) => i + 1);
      }, 200);
    },
    [current, currentIndex, showHint]
  );

  // Touch handlers
  const onTouchStart = (e: React.TouchEvent) => {
    if (showDetail) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    deltaX.current = 0;
    deltaY.current = 0;
    swiping.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!swiping.current) return;
    deltaX.current = e.touches[0].clientX - startX.current;
    deltaY.current = e.touches[0].clientY - startY.current;
    if (cardRef.current) {
      const rotation = deltaX.current * 0.1;
      cardRef.current.style.transform = `translateX(${deltaX.current}px) rotate(${rotation}deg)`;
    }
  };

  const onTouchEnd = () => {
    if (!swiping.current) return;
    swiping.current = false;

    const absX = Math.abs(deltaX.current);
    const absY = Math.abs(deltaY.current);

    if (absX > 80 && absX > absY) {
      handleSwipe(deltaX.current > 0 ? "right" : "left");
    } else if (deltaY.current < -60 && absY > absX) {
      setShowDetail(true);
    } else if (cardRef.current) {
      cardRef.current.style.transform = "";
    }

    if (cardRef.current) {
      cardRef.current.style.transition = "transform 0.2s ease-out";
      setTimeout(() => {
        if (cardRef.current) cardRef.current.style.transition = "";
      }, 200);
    }
  };

  // 키보드 지원
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handleSwipe("left");
      else if (e.key === "ArrowRight") handleSwipe("right");
      else if (e.key === "ArrowUp") setShowDetail(true);
      else if (e.key === "ArrowDown" || e.key === "Escape")
        setShowDetail(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSwipe]);

  if (loading) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-4">
        <div className="text-4xl animate-pulse">🐱</div>
        <div className="text-zinc-400">취향을 분석하고 있어요...</div>
        <div className="text-zinc-600 text-sm">첫 로딩은 10-20초 걸려요</div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-4 px-6">
        <div className="text-4xl">🎬</div>
        <div className="text-lg font-medium">모든 추천을 확인했어요!</div>
        <button
          onClick={() => {
            setRecommendations([]);
            setCurrentIndex(0);
            loadRecommendations();
          }}
          className="bg-green-500 text-black px-6 py-3 rounded-xl font-semibold active:scale-95 transition-transform"
        >
          새로운 추천 받기
        </button>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        <span className="text-lg font-bold">Discover</span>
        <span className="text-sm text-zinc-500">
          {currentIndex + 1}/{recs.length}
        </span>
      </div>

      {/* Card */}
      <div className="flex-1 min-h-0 px-4 pb-2 relative">
        <div
          ref={cardRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className={`h-full rounded-2xl overflow-hidden relative ${
            swipeDir === "left"
              ? "-translate-x-full opacity-0 transition-all duration-200"
              : swipeDir === "right"
                ? "translate-x-full opacity-0 transition-all duration-200"
                : ""
          }`}
        >
          {/* 포스터 */}
          {current.posterUrl ? (
            <img
              src={current.posterUrl}
              alt={current.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center">
              <span className="text-6xl">🎬</span>
            </div>
          )}

          {/* 매칭 점수 */}
          <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-lg">
            <span className="text-green-400 font-bold">
              ⭐ {current.rating.toFixed(1)}
            </span>
          </div>

          {/* 타입 뱃지 */}
          <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-lg text-sm">
            {current.type === "series" ? "📺 시리즈" : "🎬 영화"}
          </div>

          {/* 하단 정보 */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-5 pt-20">
            <h2 className="text-2xl font-bold">{current.title}</h2>
            <p className="text-zinc-300 text-sm mt-1">{current.reason}</p>
            <div className="flex gap-2 mt-3 flex-wrap">
              {current.providers.slice(0, 3).map((p) => (
                <span
                  key={p}
                  className="bg-white/10 px-2.5 py-1 rounded-md text-xs"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>

          {/* 스와이프 인디케이터 */}
          {swipeDir === "left" && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-500/20">
              <span className="text-6xl">👋</span>
            </div>
          )}
          {swipeDir === "right" && (
            <div className="absolute inset-0 flex items-center justify-center bg-green-500/20">
              <span className="text-6xl">💚</span>
            </div>
          )}
        </div>

        {/* Detail 오버레이 */}
        {showDetail && (
          <div
            className="absolute inset-0 mx-4 bg-zinc-950/95 backdrop-blur rounded-2xl overflow-y-auto p-5 animate-fade-in"
            onClick={() => setShowDetail(false)}
          >
            <button
              className="absolute top-4 right-4 text-zinc-400 text-xl"
              onClick={() => setShowDetail(false)}
            >
              ✕
            </button>
            <h2 className="text-2xl font-bold pr-8">{current.title}</h2>
            <p className="text-zinc-500 text-sm mt-1">
              {current.titleEn} · {current.date.slice(0, 4)}
            </p>

            <div className="mt-5">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                왜 추천했나요?
              </h3>
              <div className="bg-green-500/10 border-l-2 border-green-500 pl-3 py-2 text-sm">
                {current.reason}
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                줄거리
              </h3>
              <p className="text-sm text-zinc-300 leading-relaxed">
                {current.overview}
              </p>
            </div>

            <div className="mt-5">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                시청 가능
              </h3>
              <div className="flex gap-2 flex-wrap">
                {current.providers.map((p) => (
                  <span
                    key={p}
                    className="bg-zinc-800 px-3 py-1.5 rounded-lg text-sm"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 스와이프 힌트 + 버튼 */}
      <div className="px-4 pb-2">
        {showHint && (
          <div className="flex justify-between text-xs text-zinc-600 mb-2 px-8">
            <span>← Pass</span>
            <span>↑ Detail</span>
            <span>Save →</span>
          </div>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => handleSwipe("left")}
            className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xl active:scale-90 transition-transform"
          >
            👋
          </button>
          <button
            onClick={() => setShowDetail(!showDetail)}
            className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xl active:scale-90 transition-transform"
          >
            ℹ️
          </button>
          <button
            onClick={() => handleSwipe("right")}
            className="w-14 h-14 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center text-xl active:scale-90 transition-transform"
          >
            💚
          </button>
        </div>
      </div>

      <BottomNav active="discover" />
    </div>
  );
}
