"use client";

import { useState, useEffect } from "react";
import { getSaved, removeSaved } from "@/lib/store";
import type { SavedItem } from "@/lib/types";
import BottomNav from "@/components/BottomNav";

export default function SavedPage() {
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [selected, setSelected] = useState<SavedItem | null>(null);

  useEffect(() => { setSaved(getSaved()); }, []);

  const handleRemove = (tmdbId: number) => {
    removeSaved(tmdbId);
    setSaved(getSaved());
    if (selected?.recommendation.tmdbId === tmdbId) setSelected(null);
  };

  const handlePickTonight = () => {
    if (saved.length === 0) return;
    setSelected(saved[Math.floor(Math.random() * saved.length)]);
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="px-5 pt-6 pb-2">
        <h1 className="font-display text-2xl font-bold">Saved</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          저장한 {saved.length}개 작품
        </p>
      </div>

      {/* Tonight banner */}
      {saved.length > 0 && (
        <div className="mx-5 mt-2 mb-4">
          <button
            onClick={handlePickTonight}
            className="w-full p-4 flex items-center justify-between active:scale-[0.98] transition-transform"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}
          >
            <div className="text-left">
              <div className="font-display font-semibold">오늘 뭐 볼까?</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                저장한 작품 중 하나를 골라드려요
              </div>
            </div>
            <div
              className="px-4 py-2 text-sm font-semibold"
              style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: "var(--radius-md)" }}
            >
              고르기
            </div>
          </button>
        </div>
      )}

      {/* Tonight pick */}
      {selected && (
        <div
          className="mx-5 mb-4 p-4 animate-fade-in"
          style={{ background: "var(--accent-dim)", border: "1px solid rgba(232,123,53,0.2)", borderRadius: "var(--radius-lg)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--accent)" }}>
            오늘의 선택
          </div>
          <div className="flex gap-3">
            {selected.recommendation.posterUrl && (
              <img
                src={selected.recommendation.posterUrl}
                alt={selected.recommendation.title}
                className="w-16 h-24 object-cover flex-shrink-0"
                style={{ borderRadius: "var(--radius-md)" }}
              />
            )}
            <div>
              <div className="font-display font-bold text-lg">{selected.recommendation.title}</div>
              <div className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                {selected.recommendation.reason}
              </div>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {selected.recommendation.providers.slice(0, 2).map((p) => (
                  <span key={p} className="px-2 py-0.5 text-xs" style={{ background: "var(--surface-raised)", borderRadius: "var(--radius-sm)" }}>
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Poster grid */}
      {saved.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2" style={{ color: "var(--text-muted)" }}>
          <span className="text-4xl">♡</span>
          <span>아직 저장한 작품이 없어요</span>
          <span className="text-sm">Discover에서 오른쪽으로 스와이프하세요</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-5 pb-4 flex-1 auto-rows-min">
          {saved.map((item, i) => (
            <div
              key={item.recommendation.tmdbId}
              className="relative group"
              style={{ height: i % 3 === 0 ? "240px" : "200px" }}
            >
              {item.recommendation.posterUrl ? (
                <img
                  src={item.recommendation.posterUrl}
                  alt={item.recommendation.title}
                  className="w-full h-full object-cover"
                  style={{ borderRadius: "var(--radius-lg)" }}
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-xs p-2 text-center"
                  style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", color: "var(--text-muted)" }}
                >
                  {item.recommendation.title}
                </div>
              )}
              <div
                className="absolute bottom-0 left-0 right-0 p-2"
                style={{ background: "linear-gradient(transparent, rgba(12,10,9,0.85))", borderRadius: "0 0 var(--radius-lg) var(--radius-lg)" }}
              >
                <div className="text-xs font-medium truncate">{item.recommendation.title}</div>
                <div className="font-data text-[10px]" style={{ color: "var(--text-muted)" }}>
                  ⭐ {item.recommendation.rating.toFixed(1)}
                </div>
              </div>
              <button
                onClick={() => handleRemove(item.recommendation.tmdbId)}
                className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center text-xs sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                style={{ background: "rgba(12,10,9,0.7)", borderRadius: "var(--radius-full)" }}
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
