"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setFavorites } from "@/lib/store";

interface SearchResult {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
}

// 초기 폴백용 (API 로딩 전 표시)
const FALLBACK_SUGGESTIONS: SearchResult[] = [
  { id: 496243, title: "기생충", posterUrl: "https://image.tmdb.org/t/p/w200/jjHccoFjbqlfr4VGLVLT7yek0Xn.jpg", year: "2019" },
  { id: 278, title: "쇼생크 탈출", posterUrl: "https://image.tmdb.org/t/p/w200/oAt6OtpwYCdJI76AVtVKW1eorYx.jpg", year: "1994" },
  { id: 157336, title: "인터스텔라", posterUrl: "https://image.tmdb.org/t/p/w200/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", year: "2014" },
  { id: 238, title: "대부", posterUrl: "https://image.tmdb.org/t/p/w200/I1fkNd5CeJGv56mhrTDoOeMc2r.jpg", year: "1972" },
  { id: 372058, title: "너의 이름은.", posterUrl: "https://image.tmdb.org/t/p/w200/wJsOzBoMSdkLJEFwpPIl0GTvPaJ.jpg", year: "2016" },
  { id: 550, title: "파이트 클럽", posterUrl: "https://image.tmdb.org/t/p/w200/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg", year: "1999" },
  { id: 121, title: "반지의 제왕: 두 개의 탑", posterUrl: "https://image.tmdb.org/t/p/w200/5VTN0pR8gcqV3EPUHHfMGnJYN9L.jpg", year: "2002" },
  { id: 569094, title: "스파이더맨: 어크로스 더 유니버스", posterUrl: "https://image.tmdb.org/t/p/w200/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg", year: "2023" },
  { id: 497, title: "그린 마일", posterUrl: "https://image.tmdb.org/t/p/w200/sOHqdY1RnSn6kcfAHKu74CU1HwI.jpg", year: "1999" },
  { id: 578, title: "라라랜드", posterUrl: "https://image.tmdb.org/t/p/w200/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg", year: "2016" },
  { id: 680, title: "펄프 픽션", posterUrl: "https://image.tmdb.org/t/p/w200/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg", year: "1994" },
  { id: 129, title: "센과 치히로의 행방불명", posterUrl: "https://image.tmdb.org/t/p/w200/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg", year: "2001" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchResult[]>(FALLBACK_SUGGESTIONS);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 첫 로드 시 트렌딩 목록 가져오기
  useEffect(() => {
    fetchTrending();
  }, []);

  const fetchTrending = async () => {
    setLoadingSuggestions(true);
    try {
      const res = await fetch("/api/trending");
      const data = await res.json();
      if (data.length > 0) setSuggestions(data);
    } catch {
      // 실패하면 폴백 유지
    }
    setLoadingSuggestions(false);
  };

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

  const showSuggestions = query.length === 0 && results.length === 0;

  return (
    <div className="flex-1 flex flex-col max-w-lg mx-auto w-full px-5 py-8">
      <div className="mb-6">
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
              className="flex-shrink-0 relative"
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
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs">
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

      {/* 검색 결과 또는 추천 작품 */}
      <div className="mt-3 flex-1 overflow-y-auto">
        {searching && (
          <div className="text-center text-zinc-500 py-4">검색 중...</div>
        )}

        {/* 추천 작품 그리드 (검색 전) */}
        {showSuggestions && (
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <p className="text-xs text-zinc-500">이런 작품은 어떠세요?</p>
              <button
                onClick={fetchTrending}
                disabled={loadingSuggestions}
                className="text-xs text-zinc-500 hover:text-green-400 transition-colors disabled:opacity-30"
              >
                {loadingSuggestions ? "로딩..." : "↻ 다른 작품 보기"}
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {suggestions.map((item) => {
                const isSelected = selected.some((s) => s.id === item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleSelect(item)}
                    className={`relative rounded-lg overflow-hidden transition-all ${
                      isSelected ? "ring-2 ring-green-500 scale-95" : "active:scale-95"
                    }`}
                  >
                    {item.posterUrl ? (
                      <img
                        src={item.posterUrl}
                        alt={item.title}
                        className="w-full aspect-[2/3] object-cover"
                      />
                    ) : (
                      <div className="w-full aspect-[2/3] bg-zinc-800" />
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                      <div className="text-[10px] font-medium truncate">{item.title}</div>
                    </div>
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-xs text-black font-bold">
                        ✓
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 검색 결과 리스트 */}
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
