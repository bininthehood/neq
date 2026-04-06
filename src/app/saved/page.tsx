"use client";

import { useState, useEffect } from "react";
import { getSaved, removeSaved } from "@/lib/store";
import type { SavedItem } from "@/lib/types";
import BottomNav from "@/components/BottomNav";

export default function SavedPage() {
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [selected, setSelected] = useState<SavedItem | null>(null);

  useEffect(() => {
    setSaved(getSaved());
  }, []);

  const handleRemove = (tmdbId: number) => {
    removeSaved(tmdbId);
    setSaved(getSaved());
    if (selected?.recommendation.tmdbId === tmdbId) setSelected(null);
  };

  const handlePickTonight = () => {
    if (saved.length === 0) return;
    const pick = saved[Math.floor(Math.random() * saved.length)];
    setSelected(pick);
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="px-5 pt-6 pb-2">
        <h1 className="text-2xl font-bold">Saved</h1>
        <p className="text-sm text-zinc-500 mt-1">
          저장한 {saved.length}개 작품
        </p>
      </div>

      {/* 오늘 뭐 볼까 배너 */}
      {saved.length > 0 && (
        <div className="mx-5 mt-2 mb-4">
          <button
            onClick={handlePickTonight}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between active:scale-[0.98] transition-transform"
          >
            <div className="text-left">
              <div className="font-semibold">오늘 뭐 볼까?</div>
              <div className="text-xs text-zinc-500 mt-0.5">
                저장한 작품 중 하나를 골라드려요
              </div>
            </div>
            <div className="bg-green-500 text-black px-4 py-2 rounded-lg text-sm font-semibold">
              고르기
            </div>
          </button>
        </div>
      )}

      {/* 랜덤 선택 결과 */}
      {selected && (
        <div className="mx-5 mb-4 bg-green-500/10 border border-green-500/20 rounded-xl p-4 animate-fade-in">
          <div className="text-xs text-green-400 font-semibold uppercase tracking-wider mb-2">
            오늘의 선택
          </div>
          <div className="flex gap-3">
            {selected.recommendation.posterUrl && (
              <img
                src={selected.recommendation.posterUrl}
                alt={selected.recommendation.title}
                className="w-16 h-24 object-cover rounded-lg flex-shrink-0"
              />
            )}
            <div>
              <div className="font-bold text-lg">
                {selected.recommendation.title}
              </div>
              <div className="text-sm text-zinc-400 mt-1">
                {selected.recommendation.reason}
              </div>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {selected.recommendation.providers.slice(0, 2).map((p) => (
                  <span
                    key={p}
                    className="bg-zinc-800 px-2 py-0.5 rounded text-xs"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 포스터 그리드 */}
      {saved.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 gap-2">
          <span className="text-4xl">♡</span>
          <span>아직 저장한 작품이 없어요</span>
          <span className="text-sm">Discover에서 오른쪽으로 스와이프하세요</span>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 px-5 pb-4 flex-1">
          {saved.map((item) => (
            <div key={item.recommendation.tmdbId} className="relative group">
              {item.recommendation.posterUrl ? (
                <img
                  src={item.recommendation.posterUrl}
                  alt={item.recommendation.title}
                  className="w-full aspect-[2/3] object-cover rounded-lg"
                />
              ) : (
                <div className="w-full aspect-[2/3] bg-zinc-800 rounded-lg flex items-center justify-center text-xs text-zinc-500 p-2 text-center">
                  {item.recommendation.title}
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 rounded-b-lg">
                <div className="text-xs font-medium truncate">
                  {item.recommendation.title}
                </div>
              </div>
              <button
                onClick={() => handleRemove(item.recommendation.tmdbId)}
                className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <BottomNav active="saved" />
    </div>
  );
}
