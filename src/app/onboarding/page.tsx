"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { setFavorites } from "@/lib/store";

interface SearchResult {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults([]);
      return;
    }
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

  const handleNext = () => {
    setFavorites(selected.map((s) => s.title));
    router.push("/discover");
  };

  return (
    <div className="flex-1 flex flex-col max-w-lg mx-auto w-full px-5 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">🐱 Neko</h1>
        <p className="text-zinc-400 mt-2">
          좋아하는 작품을 {selected.length < 3 ? "3-5개" : "더"} 골라주세요
        </p>
        <div className="flex gap-1 mt-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < selected.length ? "bg-green-500" : "bg-zinc-800"
              }`}
            />
          ))}
        </div>
      </div>

      {/* 선택된 작품 */}
      {selected.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {selected.map((item) => (
            <button
              key={item.id}
              onClick={() => toggleSelect(item)}
              className="flex-shrink-0 relative group"
            >
              {item.posterUrl ? (
                <img
                  src={item.posterUrl}
                  alt={item.title}
                  className="w-16 h-24 object-cover rounded-lg"
                />
              ) : (
                <div className="w-16 h-24 bg-zinc-800 rounded-lg flex items-center justify-center text-xs text-zinc-500">
                  {item.title.slice(0, 4)}
                </div>
              )}
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                ✕
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 검색 */}
      <input
        type="text"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        placeholder="영화나 시리즈 제목을 검색하세요"
        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
        autoFocus
      />

      {/* 검색 결과 */}
      <div className="mt-3 flex-1 overflow-y-auto">
        {searching && (
          <div className="text-center text-zinc-500 py-4">검색 중...</div>
        )}
        {results.map((item) => {
          const isSelected = selected.some((s) => s.id === item.id);
          return (
            <button
              key={item.id}
              onClick={() => toggleSelect(item)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                isSelected
                  ? "bg-green-500/10 border border-green-500/30"
                  : "hover:bg-zinc-900"
              }`}
            >
              {item.posterUrl ? (
                <img
                  src={item.posterUrl}
                  alt={item.title}
                  className="w-12 h-18 object-cover rounded-lg flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-18 bg-zinc-800 rounded-lg flex-shrink-0" />
              )}
              <div className="text-left flex-1 min-w-0">
                <div className="font-medium truncate">{item.title}</div>
                <div className="text-sm text-zinc-500">{item.year}</div>
              </div>
              {isSelected && (
                <div className="text-green-500 text-lg flex-shrink-0">✓</div>
              )}
            </button>
          );
        })}
      </div>

      {/* 다음 버튼 */}
      <button
        onClick={handleNext}
        disabled={selected.length < 3}
        className={`mt-4 w-full py-4 rounded-xl text-lg font-semibold transition-all ${
          selected.length >= 3
            ? "bg-green-500 text-black active:scale-95"
            : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
        }`}
      >
        {selected.length < 3
          ? `${3 - selected.length}개 더 선택해주세요`
          : `${selected.length}개 선택 완료 → 시작하기`}
      </button>
    </div>
  );
}
