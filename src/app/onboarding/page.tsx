"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setFavorites } from "@/lib/store";
import { IconClose, IconCheck, NekoLogo } from "@/components/Icons";

interface SearchResult {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
}

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
  const [step, setStep] = useState(0); // 0=소개, 1=작품 선택
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchResult[]>(FALLBACK_SUGGESTIONS);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleNext = () => {
    setFavorites(selected.map((s) => s.title));
    router.push("/discover");
  };

  const showSuggestions = query.length === 0 && results.length === 0;

  // Step 0: 앱 소개
  if (step === 0) return (
    <div className="h-dvh flex flex-col items-center justify-center px-8 max-w-lg mx-auto">
      <NekoLogo size={64} />
      <h1 className="font-display text-3xl font-bold mt-5" style={{ color: "var(--accent)" }}>Neko</h1>
      <p className="text-center mt-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        넷플릭스 알고리즘이 추천하지 않는,<br />
        당신이 좋아할 작품을 찾아드려요.
      </p>
      <div className="mt-8 space-y-3 w-full max-w-[280px]">
        {[
          { icon: "🎬", text: "좋아하는 작품 3개만 골라주세요" },
          { icon: "✨", text: "AI가 숨겨진 명작을 찾아드려요" },
          { icon: "👆", text: "스와이프하며 마음에 드는 작품 저장" },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3" style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)" }}>
            <span className="text-lg">{item.icon}</span>
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{item.text}</span>
          </div>
        ))}
      </div>
      <button
        onClick={() => setStep(1)}
        className="mt-8 w-full max-w-[280px] py-4 text-lg font-semibold active:scale-[0.98] transition-transform"
        style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: "var(--radius-lg)" }}
      >
        시작하기
      </button>
    </div>
  );

  // Step 1: 작품 선택
  return (
    <div className="h-dvh flex flex-col max-w-lg mx-auto w-full">
      {/* Fixed header */}
      <div className="shrink-0 px-5 pt-8 pb-3">
        <h1 className="font-display font-bold" style={{ color: "var(--accent)", fontSize: "36px" }}>
          Neko
        </h1>
        <p className="mt-2" style={{ color: "var(--text-secondary)" }}>
          좋아하는 작품을 {selected.length < 3 ? "3-5개" : "더"} 골라주세요
        </p>
        <div className="flex gap-1 mt-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 transition-colors"
              style={{
                background: i < selected.length ? "var(--accent)" : "var(--border)",
                borderRadius: "var(--radius-full)",
              }}
            />
          ))}
        </div>

        {/* Selected items — 항상 표시 */}
        <div className="flex gap-2 mt-4 pb-2">
          {Array.from({ length: 5 }).map((_, i) => {
            const item = selected[i];
            if (item) {
              return (
                <button key={item.id} onClick={() => toggleSelect(item)} className="flex-shrink-0 relative">
                  {item.posterUrl ? (
                    <img src={item.posterUrl} alt={item.title} className="w-14 h-20 object-cover" style={{ borderRadius: "var(--radius-md)" }} />
                  ) : (
                    <div className="w-14 h-20 flex items-center justify-center text-[10px]" style={{ background: "var(--surface)", borderRadius: "var(--radius-md)", color: "var(--text-muted)" }}>
                      {item.title.slice(0, 3)}
                    </div>
                  )}
                  <div className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center" style={{ background: "var(--danger)", borderRadius: "var(--radius-full)" }}>
                    <IconClose size={10} color="var(--text-primary)" />
                  </div>
                </button>
              );
            }
            return (
              <div key={`empty-${i}`} className="w-14 h-20 flex-shrink-0 flex items-center justify-center" style={{ background: "var(--surface)", borderRadius: "var(--radius-md)", border: "1px dashed var(--border)" }}>
                <span className="text-lg" style={{ color: "var(--text-muted)" }}>+</span>
              </div>
            );
          })}
        </div>

        {/* Search */}
        <input
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="영화나 시리즈 제목을 검색하세요"
          className="w-full px-4 py-3 mt-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-24">
        {searching && (
          <div className="text-center py-4" style={{ color: "var(--text-muted)" }}>검색 중...</div>
        )}

        {/* Suggestion grid */}
        {showSuggestions && (
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>이런 작품은 어떠세요?</p>
              <button
                onClick={fetchTrending}
                disabled={loadingSuggestions}
                className="text-xs transition-colors disabled:opacity-30 min-h-[44px] flex items-center py-2 px-3"
                style={{ color: "var(--text-muted)" }}
              >
                {loadingSuggestions ? "로딩..." : "↻ 다른 작품 보기"}
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {suggestions.slice(0, 12).map((item, i) => {
                const isSelected = selected.some((s) => s.id === item.id);
                const tall = false; // 균일 높이로 3로우 고정
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleSelect(item)}
                    className="relative overflow-hidden transition-all active:scale-95"
                    style={{
                      borderRadius: "var(--radius-lg)",
                      outline: isSelected ? "2px solid var(--accent)" : "none",
                      outlineOffset: "-2px",
                      aspectRatio: tall ? "2/3.5" : "2/3",
                    }}
                  >
                    {item.posterUrl ? (
                      <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full" style={{ background: "var(--surface)" }} />
                    )}
                    <div
                      className="absolute bottom-0 left-0 right-0 p-1.5"
                      style={{ background: "linear-gradient(transparent, var(--bg-overlay-heavy))" }}
                    >
                      <div className="text-[11px] font-medium truncate">{item.title}</div>
                    </div>
                    {isSelected && (
                      <div
                        className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center"
                        style={{ background: "var(--accent)", borderRadius: "var(--radius-full)" }}
                      >
                        <IconCheck size={12} color="var(--bg)" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search results */}
        {results.map((item) => {
          const isSelected = selected.some((s) => s.id === item.id);
          return (
            <button
              key={item.id}
              onClick={() => toggleSelect(item)}
              className="w-full flex items-center gap-3 p-3 transition-colors"
              style={{
                borderRadius: "var(--radius-lg)",
                background: isSelected ? "var(--accent-dim)" : "transparent",
                border: isSelected ? "1px solid var(--accent-border)" : "1px solid transparent",
              }}
            >
              {item.posterUrl ? (
                <img src={item.posterUrl} alt={item.title} className="w-12 h-18 object-cover flex-shrink-0" style={{ borderRadius: "var(--radius-md)" }} />
              ) : (
                <div className="w-12 h-18 flex-shrink-0" style={{ background: "var(--surface)", borderRadius: "var(--radius-md)" }} />
              )}
              <div className="text-left flex-1 min-w-0">
                <div className="font-medium truncate">{item.title}</div>
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>{item.year}</div>
              </div>
              {isSelected && (
                <div className="flex-shrink-0" style={{ color: "var(--accent)" }}>
                  <IconCheck size={18} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Next button — fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 px-5 pb-6 pt-3 max-w-lg mx-auto" style={{ background: "linear-gradient(transparent, var(--bg) 30%)" }}>
        <button
          onClick={handleNext}
          disabled={selected.length < 3}
          className="w-full py-4 text-lg font-semibold transition-all active:scale-[0.98]"
          style={{
            background: selected.length >= 3 ? "var(--accent)" : "var(--surface)",
            color: selected.length >= 3 ? "var(--bg)" : "var(--text-muted)",
            borderRadius: "var(--radius-lg)",
            cursor: selected.length >= 3 ? "pointer" : "not-allowed",
          }}
        >
          {selected.length < 3
            ? `${3 - selected.length}개 더 선택해주세요`
            : `${selected.length}개 선택 완료 → 시작하기`}
        </button>
      </div>
    </div>
  );
}
