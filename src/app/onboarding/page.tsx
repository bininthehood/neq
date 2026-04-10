"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { setFavorites, setFavoritesMeta } from "@/lib/store";
import { track } from "@/lib/analytics";
import { IconClose, IconCheck } from "@/components/Icons";

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
  const trackedRef = useRef(false);

  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    track("onboarding_started");
    fetchTrending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const fetchTrending = async () => {
    setLoadingSuggestions(true);
    try {
      const res = await fetch("/api/trending");
      const data = await res.json();
      if (data.length > 0) setSuggestions(data);
    } catch { /* fallback */ }
    setLoadingSuggestions(false);
    scrollAreaRef.current?.scrollTo({ top: 0 });
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
      const newCount = selected.length + 1;
      setSelected([...selected, item]);
      track("onboarding_favorite_added", { total: newCount });
    }
  };

  const handleNext = () => {
    track("onboarding_completed", { favorites_count: selected.length });
    setFavorites(selected.map((s) => s.title));
    setFavoritesMeta(selected.map((s) => ({ id: s.id, title: s.title, posterUrl: s.posterUrl })));
    router.push("/discover");
  };

  const showSuggestions = query.length === 0 && results.length === 0;

  // Step 0: 앱 소개
  if (step === 0) return (
    <div className="h-dvh flex flex-col max-w-lg mx-auto w-full overflow-y-auto">
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-10">
        <h1 className="font-display font-bold text-accent" style={{ fontSize: "3.5rem" }}>neq,</h1>
        <p className="font-display italic text-xl mt-3 text-center text-foreground">
          당신의 취향을 발견하세요
        </p>
        <p className="text-sm mt-2 text-center text-muted">
          오늘 뭐 볼까? 고민은 이제 그만.
        </p>

        <div className="w-full max-w-[320px] mt-12 space-y-3">
          <div className="flex items-start gap-3 px-4 py-3 bg-surface rounded-lg">
            <span className="font-display text-xl text-accent shrink-0">1</span>
            <div>
              <div className="text-sm font-semibold">좋아하는 작품 3개</div>
              <div className="text-xs mt-0.5 text-muted">당신의 취향을 알려주세요</div>
            </div>
          </div>
          <div className="flex items-start gap-3 px-4 py-3 bg-surface rounded-lg">
            <span className="font-display text-xl text-accent shrink-0">2</span>
            <div>
              <div className="text-sm font-semibold">숨겨진 명작 발견</div>
              <div className="text-xs mt-0.5 text-muted">알고리즘 밖의 작품을 큐레이션해요</div>
            </div>
          </div>
          <div className="flex items-start gap-3 px-4 py-3 bg-surface rounded-lg">
            <span className="font-display text-xl text-accent shrink-0">3</span>
            <div>
              <div className="text-sm font-semibold">스와이프하며 저장</div>
              <div className="text-xs mt-0.5 text-muted">마음에 들면 하트, 보기 싫으면 넘기기</div>
            </div>
          </div>
        </div>

        <button
          onClick={() => setStep(1)}
          className="mt-10 w-full max-w-[320px] py-4 text-base font-semibold active:scale-[0.98] transition-transform bg-accent text-background rounded-lg"
        >
          시작하기
        </button>
      </div>
    </div>
  );

  // Step 1: 작품 선택
  return (
    <div className="h-dvh flex flex-col max-w-lg mx-auto w-full">
      {/* Fixed header */}
      <div className="shrink-0 px-5 pt-8 pb-3">
        <h1 className="font-display font-bold text-accent" style={{ fontSize: "36px" }}>
          neq,
        </h1>
        <p className="mt-2 text-secondary">
          마음에 드는 작품 {selected.length < 3 ? "3-5개" : "더"} 골라주세요
        </p>
        <div className="flex gap-1 mt-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 transition-colors rounded-full"
              style={{
                background: i < selected.length ? "var(--accent)" : "var(--border)",
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
                    <Image src={item.posterUrl} alt={item.title} width={56} height={80} className="object-cover rounded-md" sizes="56px" />
                  ) : (
                    <div className="w-14 h-20 flex items-center justify-center text-xs bg-surface rounded-md text-muted">
                      {item.title.slice(0, 3)}
                    </div>
                  )}
                  <div className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center bg-danger rounded-full">
                    <IconClose size={10} color="var(--text-primary)" />
                  </div>
                </button>
              );
            }
            return (
              <div key={`empty-${i}`} className="w-14 h-20 flex-shrink-0 flex items-center justify-center bg-surface rounded-md" style={{ border: "1px dashed var(--border)" }}>
                <span className="text-lg text-muted">+</span>
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
          className="w-full px-4 py-3 mt-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors bg-surface border border-border rounded-lg text-foreground"
        />
      </div>

      {/* Scrollable content area */}
      <div ref={scrollAreaRef} className="flex-1 min-h-0 overflow-y-auto px-5 pb-24">
        {searching && (
          <div className="text-center py-4 text-muted">검색 중...</div>
        )}

        {/* Suggestion grid */}
        {showSuggestions && (
          <div>
            <p className="text-xs text-muted mb-3 px-1">이런 작품은 어때요?</p>
            <div className="grid grid-cols-3 gap-2">
              {suggestions.slice(0, 12).map((item, i) => {
                const isSelected = selected.some((s) => s.id === item.id);
                const tall = i % 3 === 1; // 비대칭 aspect-ratio (DESIGN.md)
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleSelect(item)}
                    className="relative overflow-hidden transition-all active:scale-95 rounded-lg animate-fade-in"
                    style={{
                      outline: isSelected ? "2px solid var(--accent)" : "none",
                      outlineOffset: "-2px",
                      aspectRatio: tall ? "2/3.5" : "2/3",
                      animationDelay: `${i * 50}ms`,
                      animationFillMode: "backwards",
                    }}
                  >
                    {item.posterUrl ? (
                      <Image src={item.posterUrl} alt={item.title} fill className="object-cover" sizes="(max-width: 480px) 33vw, 160px" />
                    ) : (
                      <div className="w-full h-full bg-surface" />
                    )}
                    <div
                      className="absolute bottom-0 left-0 right-0 p-1.5"
                      style={{ background: "linear-gradient(transparent, var(--bg-overlay-heavy))" }}
                    >
                      <div className="text-xs font-medium truncate">{item.title}</div>
                    </div>
                    {isSelected && (
                      <div
                        className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-accent rounded-full"
                      >
                        <IconCheck size={12} color="var(--bg)" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={fetchTrending}
              disabled={loadingSuggestions}
              className="w-full mt-4 py-3 text-sm font-medium transition-colors disabled:opacity-30 text-muted active:scale-[0.98]"
            >
              {loadingSuggestions ? "로딩..." : "↻ 다른 작품 보기"}
            </button>
          </div>
        )}

        {/* Search results */}
        {results.map((item) => {
          const isSelected = selected.some((s) => s.id === item.id);
          return (
            <button
              key={item.id}
              onClick={() => toggleSelect(item)}
              className="w-full flex items-center gap-3 p-3 transition-colors rounded-lg"
              style={{
                background: isSelected ? "var(--accent-dim)" : "transparent",
                border: isSelected ? "1px solid var(--accent-border)" : "1px solid transparent",
              }}
            >
              {item.posterUrl ? (
                <Image src={item.posterUrl} alt={item.title} width={48} height={72} className="object-cover flex-shrink-0 rounded-md" sizes="48px" />
              ) : (
                <div className="w-12 h-18 flex-shrink-0 bg-surface rounded-md" />
              )}
              <div className="text-left flex-1 min-w-0">
                <div className="font-medium truncate">{item.title}</div>
                <div className="text-sm text-muted">{item.year}</div>
              </div>
              {isSelected && (
                <div className="flex-shrink-0 text-accent">
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
          className="w-full py-4 text-lg font-semibold transition-all active:scale-[0.98] rounded-lg"
          style={{
            background: selected.length >= 3 ? "var(--accent)" : "var(--surface)",
            color: selected.length >= 3 ? "var(--bg)" : "var(--text-muted)",
            cursor: selected.length >= 3 ? "pointer" : "not-allowed",
          }}
        >
          {selected.length < 3
            ? `${3 - selected.length}개만 더 골라주세요`
            : `${selected.length}개 선택 완료, 시작할게요`}
        </button>
      </div>
    </div>
  );
}
