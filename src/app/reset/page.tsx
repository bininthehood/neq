"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getFavorites, setFavorites, clearAllRecommendations } from "@/lib/store";
import { IconClose, IconCheck } from "@/components/Icons";

interface SearchResult {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
}

export default function ResetPage() {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentFavorites = getFavorites();

  useEffect(() => { fetchTrending(); }, []);

  const fetchTrending = async () => {
    setLoadingSuggestions(true);
    try {
      const res = await fetch("/api/trending");
      const data = await res.json();
      if (data.length > 0) setSuggestions(data);
    } catch { /* fallback */ }
    setLoadingSuggestions(false);
  };

  const search = useCallback(async (q: string) => {
    if (q.length < 1) { setResults([]); return; }
    setSearching(true);
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setResults(data);
    setSearching(false);
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(value), 300);
  };

  const toggleSelect = (item: SearchResult) => {
    if (selected.some((s) => s.id === item.id)) {
      setSelected(selected.filter((s) => s.id !== item.id));
    } else if (selected.length < 5) {
      setSelected([...selected, item]);
    }
  };

  const handleReset = () => {
    setFavorites(selected.map((s) => s.title));
    clearAllRecommendations();
    router.replace("/discover");
  };

  const showSuggestions = query.length === 0 && results.length === 0;

  // 경고 화면
  if (!confirmed) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center px-8 max-w-lg mx-auto">
        <div className="space-y-5 text-center">
          <h1 className="font-display text-2xl font-bold">추천 기반 재설정</h1>
          <div className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            <p>현재 선택한 기반 작품이 초기화되고,</p>
            <p>새로운 작품을 기반으로 추천을 다시 받습니다.</p>
            <p className="mt-3 font-medium" style={{ color: "var(--text-primary)" }}>저장한 작품과 시청 리포트는 유지됩니다.</p>
          </div>
          {currentFavorites.length > 0 && (
            <div className="pt-2">
              <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>현재 기반 작품</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {currentFavorites.map((f) => (
                  <span key={f} className="px-3 py-1 text-xs" style={{ background: "var(--surface)", borderRadius: "var(--radius-full)", color: "var(--text-secondary)" }}>{f}</span>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3 justify-center pt-3">
            <button
              onClick={() => router.back()}
              className="px-6 py-3 text-sm font-medium active:scale-95 transition-transform"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-full)" }}
            >
              돌아가기
            </button>
            <button
              onClick={() => setConfirmed(true)}
              className="px-6 py-3 text-sm font-semibold active:scale-95 transition-transform"
              style={{ background: "var(--danger)", color: "var(--text-primary)", borderRadius: "var(--radius-full)" }}
            >
              재설정하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 작품 선택 화면 (온보딩과 유사)
  return (
    <div className="h-dvh flex flex-col max-w-lg mx-auto w-full">
      <div className="shrink-0 px-5 pt-8 pb-3">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-xl font-bold" style={{ color: "var(--accent)" }}>취향 재설정</h1>
          <button onClick={() => router.back()} className="px-2 py-2 text-xs" style={{ color: "var(--text-muted)" }}>취소</button>
        </div>
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          새로운 기반 작품을 {selected.length < 3 ? "3-5개" : "더"} 골라주세요
        </p>
        <div className="flex gap-1 mt-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-1 flex-1 transition-colors" style={{ background: i < selected.length ? "var(--accent)" : "var(--border)", borderRadius: "var(--radius-full)" }} />
          ))}
        </div>

        {selected.length > 0 && (
          <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
            {selected.map((item) => (
              <button key={item.id} onClick={() => toggleSelect(item)} className="flex-shrink-0 relative">
                {item.posterUrl ? (
                  <img src={item.posterUrl} alt={item.title} className="w-16 h-24 object-cover" style={{ borderRadius: "var(--radius-md)" }} />
                ) : (
                  <div className="w-16 h-24 flex items-center justify-center text-xs" style={{ background: "var(--surface)", borderRadius: "var(--radius-md)", color: "var(--text-muted)" }}>{item.title.slice(0, 4)}</div>
                )}
                <div className="absolute -top-2 -right-2 w-7 h-7 flex items-center justify-center" style={{ background: "var(--danger)", borderRadius: "var(--radius-full)" }}>
                  <IconClose size={12} color="var(--text-primary)" />
                </div>
              </button>
            ))}
          </div>
        )}

        <input
          type="text" value={query} onChange={(e) => handleInput(e.target.value)}
          placeholder="영화나 시리즈 제목을 검색하세요"
          className="w-full px-4 py-3 mt-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", color: "var(--text-primary)" }}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-24">
        {searching && <div className="text-center py-4" style={{ color: "var(--text-muted)" }}>검색 중...</div>}

        {showSuggestions && (
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>이런 작품은 어떠세요?</p>
              <button onClick={fetchTrending} disabled={loadingSuggestions} className="text-xs transition-colors disabled:opacity-30 py-2 px-3" style={{ color: "var(--text-muted)" }}>
                {loadingSuggestions ? "로딩..." : "↻ 다른 작품 보기"}
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {suggestions.map((item, i) => {
                const isSelected = selected.some((s) => s.id === item.id);
                return (
                  <button key={item.id} onClick={() => toggleSelect(item)} className="relative overflow-hidden transition-all active:scale-95"
                    style={{ borderRadius: "var(--radius-lg)", outline: isSelected ? "2px solid var(--accent)" : "none", outlineOffset: "-2px", aspectRatio: "2/3" }}>
                    {item.posterUrl ? <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: "var(--surface)" }} />}
                    <div className="absolute bottom-0 left-0 right-0 p-1.5" style={{ background: "linear-gradient(transparent, var(--bg-overlay-heavy))" }}>
                      <div className="text-[11px] font-medium truncate">{item.title}</div>
                    </div>
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center" style={{ background: "var(--accent)", borderRadius: "var(--radius-full)" }}>
                        <IconCheck size={12} color="var(--bg)" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {results.map((item) => {
          const isSelected = selected.some((s) => s.id === item.id);
          return (
            <button key={item.id} onClick={() => toggleSelect(item)} className="w-full flex items-center gap-3 p-3 transition-colors"
              style={{ borderRadius: "var(--radius-lg)", background: isSelected ? "var(--accent-dim)" : "transparent", border: isSelected ? "1px solid var(--accent-border)" : "1px solid transparent" }}>
              {item.posterUrl ? <img src={item.posterUrl} alt={item.title} className="w-12 h-18 object-cover flex-shrink-0" style={{ borderRadius: "var(--radius-md)" }} /> : <div className="w-12 h-18 flex-shrink-0" style={{ background: "var(--surface)", borderRadius: "var(--radius-md)" }} />}
              <div className="text-left flex-1 min-w-0">
                <div className="font-medium truncate">{item.title}</div>
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>{item.year}</div>
              </div>
              {isSelected && <div className="flex-shrink-0" style={{ color: "var(--accent)" }}><IconCheck size={18} /></div>}
            </button>
          );
        })}
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-5 pb-6 pt-3 max-w-lg mx-auto" style={{ background: "linear-gradient(transparent, var(--bg) 30%)" }}>
        <button onClick={handleReset} disabled={selected.length < 3}
          className="w-full py-4 text-lg font-semibold transition-all active:scale-[0.98]"
          style={{ background: selected.length >= 3 ? "var(--accent)" : "var(--surface)", color: selected.length >= 3 ? "var(--bg)" : "var(--text-muted)", borderRadius: "var(--radius-lg)", cursor: selected.length >= 3 ? "pointer" : "not-allowed" }}>
          {selected.length < 3 ? `${3 - selected.length}개 더 선택해주세요` : `${selected.length}개 선택 → 추천 재설정`}
        </button>
      </div>
    </div>
  );
}
