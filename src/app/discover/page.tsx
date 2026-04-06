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

  // 스와이프 애니메이션 상태
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

  const current = recs[currentIndex];

  const goNext = useCallback(
    (direction: "left" | "right") => {
      if (!current || isAnimating) return;

      if (direction === "right") {
        addSaved(current);
      }
      if (showHint && currentIndex >= 2) setShowHint(false);

      // 카드를 화면 밖으로 날리는 애니메이션
      setIsAnimating(true);
      setExitDir(direction);

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

  // Touch handlers — 수평 스와이프만 처리, 수직은 무시
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

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging.current) return;

      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;

      // 방향 잠금: 처음 10px 이동으로 수평/수직 결정
      if (!directionLocked.current) {
        if (Math.abs(dx) > 10) {
          directionLocked.current = "horizontal";
        } else if (Math.abs(dy) > 10) {
          directionLocked.current = "vertical";
          isDragging.current = false;
          return;
        } else {
          return;
        }
      }

      if (directionLocked.current !== "horizontal") return;

      // 수평 스와이프 중에는 페이지 스크롤 방지
      e.preventDefault();
      setOffsetX(dx);
    },
    []
  );

  const onTouchEnd = useCallback(() => {
    if (!isDragging.current && directionLocked.current !== "horizontal") return;
    isDragging.current = false;

    const threshold = 80;
    if (Math.abs(offsetX) > threshold) {
      goNext(offsetX > 0 ? "right" : "left");
    } else {
      // 스냅백 애니메이션
      setOffsetX(0);
    }
    directionLocked.current = null;
  }, [offsetX, goNext]);

  // 키보드 지원
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goNext("left");
      else if (e.key === "ArrowRight") goNext("right");
      else if (e.key === "ArrowUp") setShowDetail(true);
      else if (e.key === "ArrowDown" || e.key === "Escape")
        setShowDetail(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext]);

  // 카드 transform 계산
  const getCardStyle = (): React.CSSProperties => {
    if (exitDir) {
      const x = exitDir === "left" ? -500 : 500;
      return {
        transform: `translateX(${x}px) rotate(${x * 0.05}deg)`,
        transition: "transform 0.3s ease-out, opacity 0.3s ease-out",
        opacity: 0,
      };
    }
    if (offsetX !== 0) {
      return {
        transform: `translateX(${offsetX}px) rotate(${offsetX * 0.05}deg)`,
        transition: "none",
      };
    }
    return {
      transform: "translateX(0) rotate(0deg)",
      transition: "transform 0.2s ease-out",
    };
  };

  // 스와이프 방향 인디케이터 opacity
  const passOpacity = Math.min(1, Math.max(0, -offsetX / 120));
  const saveOpacity = Math.min(1, Math.max(0, offsetX / 120));

  if (!mounted || loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
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
    <div
      className="h-dvh flex flex-col overflow-hidden"
      style={{ touchAction: "pan-y" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        <span className="text-lg font-bold">Discover</span>
        <span className="text-sm text-zinc-500">
          {currentIndex + 1}/{recs.length}
        </span>
      </div>

      {/* Card area — 스크롤 차단 */}
      <div
        className="flex-1 min-h-0 px-4 pb-2 relative"
        style={{ touchAction: "none", overscrollBehavior: "none" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* 카드 */}
        <div
          key={currentIndex}
          className="h-full rounded-2xl overflow-hidden relative will-change-transform"
          style={getCardStyle()}
        >
          {/* 포스터 */}
          {current.posterUrl ? (
            <img
              src={current.posterUrl}
              alt={current.title}
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center">
              <span className="text-6xl">🎬</span>
            </div>
          )}

          {/* 매칭 점수 + 출처 */}
          <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5">
            <span className="text-green-400 font-bold">
              ⭐ {current.rating.toFixed(1)}
            </span>
            <span className="text-zinc-400 text-[10px]">TMDB</span>
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

          {/* 스와이프 방향 오버레이 — 드래그 중 점진적 표시 */}
          <div
            className="absolute inset-0 flex items-center justify-center bg-red-500/30 pointer-events-none"
            style={{ opacity: passOpacity }}
          >
            <span className="text-7xl">👋</span>
          </div>
          <div
            className="absolute inset-0 flex items-center justify-center bg-green-500/30 pointer-events-none"
            style={{ opacity: saveOpacity }}
          >
            <span className="text-7xl">💚</span>
          </div>
        </div>

        {/* Detail 오버레이 */}
        {showDetail && (
          <div
            className="absolute inset-0 bg-zinc-950/95 backdrop-blur rounded-2xl overflow-y-auto p-5 animate-fade-in z-10"
            style={{ touchAction: "pan-y" }}
            onClick={() => setShowDetail(false)}
          >
            <button
              className="absolute top-4 right-4 text-zinc-400 text-xl z-20"
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

      {/* 버튼 영역 */}
      <div className="px-4 pb-2 shrink-0">
        {showHint && (
          <div className="flex justify-between text-xs text-zinc-600 mb-2 px-8">
            <span>← Pass</span>
            <span>↑ Detail</span>
            <span>Save →</span>
          </div>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => goNext("left")}
            disabled={isAnimating}
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
            onClick={() => goNext("right")}
            disabled={isAnimating}
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
