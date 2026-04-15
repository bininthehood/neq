"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { IconClose, IconStar, IconSave } from "@/components/Icons";
import { getOTTLink, getOTTIcon } from "@/lib/ott-links";
import { addSaved } from "@/lib/store";
import { track } from "@/lib/analytics";
import type { Recommendation } from "@/lib/types";

interface SearchResult {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
  rating: number;
  mediaType: "movie" | "tv";
}

interface ProviderInfo {
  name: string;
  logoUrl: string | null;
}

interface SearchSheetProps {
  show: boolean;
  sheetY: number;
  animating: boolean;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
}

export default function SearchSheet({
  show,
  sheetY,
  animating,
  bodyRef,
  onClose,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: SearchSheetProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(
        data.map((r: { id: number; title: string; posterUrl: string | null; year: string; rating: number; mediaType?: string }) => ({
          ...r,
          mediaType: r.mediaType ?? "movie",
        }))
      );
    } catch {
      /* silent */
    }
    setSearching(false);
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    setSelectedId(null);
    setProviders([]);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(value), 300);
  };

  const handleSelect = async (item: SearchResult) => {
    if (selectedId === item.id) {
      setSelectedId(null);
      setProviders([]);
      return;
    }
    setSelectedId(item.id);
    setLoadingProviders(true);
    track("search_item_selected", { tmdb_id: item.id, title: item.title });
    try {
      const type = item.mediaType === "tv" ? "series" : "movie";
      const res = await fetch(`/api/search/providers?id=${item.id}&type=${type}`);
      const data = await res.json();
      setProviders(data.providers ?? []);
    } catch {
      setProviders([]);
    }
    setLoadingProviders(false);
  };

  const handleSave = (item: SearchResult) => {
    const rec: Recommendation = {
      title: item.title,
      titleEn: item.title,
      type: item.mediaType === "tv" ? "series" : "movie",
      reason: "검색해서 저장한 작품이에요",
      tmdbId: item.id,
      posterUrl: item.posterUrl,
      rating: item.rating,
      date: item.year,
      overview: "",
      providers: providers.map((p) => ({ name: p.name, logoUrl: p.logoUrl })),
      watchLink: null,
      director: null,
      cast: [],
      runtime: null,
      seasons: null,
      country: [],
      backdrop: null,
    };
    addSaved(rec);
    setSavedIds((s) => new Set(s).add(item.id));
    track("search_item_saved", { tmdb_id: item.id, title: item.title });
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background: "var(--bg-overlay-heavy)",
          opacity: 1 - sheetY / 100,
        }}
        onClick={onClose}
      />
      {/* sheet */}
      <div
        className="relative w-full max-w-lg mx-auto flex flex-col bg-surface-raised"
        style={{
          maxHeight: "85dvh",
          borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
          transform: `translateY(${sheetY}%)`,
          transition: animating ? "transform 0.3s cubic-bezier(0.34, 1.3, 0.64, 1)" : "none",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* handle */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--border)" }} />
        </div>

        {/* header */}
        <div className="flex items-center justify-between px-5 pb-3 shrink-0">
          <h2 className="font-display text-lg font-bold">작품 검색</h2>
          <button
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform"
          >
            <IconClose size={18} color="var(--text-muted)" />
          </button>
        </div>

        {/* search input */}
        <div className="px-5 pb-3 shrink-0">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="영화나 시리즈 제목"
            className="w-full px-4 py-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors bg-surface border border-border rounded-lg text-foreground"
          />
        </div>

        {/* results */}
        <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto px-5 pb-6">
          {searching && (
            <div className="text-center py-6 text-sm text-muted">검색 중...</div>
          )}

          {!searching && query.length > 0 && results.length === 0 && (
            <div className="text-center py-6 text-sm text-muted">
              결과가 없어요
            </div>
          )}

          {results.map((item) => {
            const isSelected = selectedId === item.id;
            const isSaved = savedIds.has(item.id);

            return (
              <div key={item.id} className="mb-2">
                <button
                  onClick={() => handleSelect(item)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg active:scale-[0.98] transition-all"
                  style={{
                    background: isSelected ? "var(--surface)" : "transparent",
                  }}
                >
                  {item.posterUrl ? (
                    <Image
                      src={item.posterUrl}
                      alt={item.title}
                      width={44}
                      height={66}
                      className="object-cover flex-shrink-0 rounded-md"
                      sizes="44px"
                    />
                  ) : (
                    <div className="w-11 h-[66px] flex-shrink-0 bg-surface rounded-md flex items-center justify-center text-xs text-muted">
                      {item.title.slice(0, 3)}
                    </div>
                  )}
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.title}</div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted">
                      <span>{item.mediaType === "tv" ? "시리즈" : "영화"}</span>
                      {item.year && <span>{item.year}</span>}
                      {item.rating > 0 && (
                        <span className="flex items-center gap-0.5 font-data">
                          <IconStar size={10} color="var(--accent)" />
                          {item.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {/* OTT providers panel */}
                {isSelected && (
                  <div
                    className="mx-3 mt-1 mb-2 p-3 rounded-lg animate-fade-in"
                    style={{ background: "var(--surface)" }}
                  >
                    {loadingProviders ? (
                      <div className="text-xs text-muted py-2">OTT 조회 중...</div>
                    ) : providers.length > 0 ? (
                      <div>
                        <div className="text-xs text-muted mb-2">시청 가능한 OTT</div>
                        <div className="flex flex-wrap gap-2">
                          {providers.map((p) => {
                            const link = getOTTLink(p.name, item.title);
                            const icon = getOTTIcon(p.name) ?? p.logoUrl;
                            return (
                              <a
                                key={p.name}
                                href={link ?? "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => track("search_ott_clicked", { provider: p.name, tmdb_id: item.id })}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg active:scale-95 transition-transform min-h-[44px]"
                                style={{
                                  background: "var(--surface-raised)",
                                  color: "var(--text-primary)",
                                }}
                              >
                                {icon && (
                                  <Image
                                    src={icon}
                                    alt={p.name}
                                    width={20}
                                    height={20}
                                    className="object-contain rounded-sm"
                                    unoptimized
                                  />
                                )}
                                {p.name}
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted py-1">
                        한국에서 이용 가능한 OTT가 없어요
                      </div>
                    )}

                    {/* Save button */}
                    <button
                      onClick={() => handleSave(item)}
                      disabled={isSaved}
                      className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg active:scale-[0.98] transition-all min-h-[44px]"
                      style={{
                        background: isSaved ? "var(--surface-raised)" : "var(--accent-dim)",
                        color: isSaved ? "var(--text-muted)" : "var(--accent)",
                      }}
                    >
                      <IconSave size={16} color={isSaved ? "var(--text-muted)" : "var(--accent)"} filled={isSaved} />
                      {isSaved ? "저장됨" : "저장하기"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
