"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { IconCheck } from "@/components/Icons";

/**
 * Persona v2 — 작품 swipe step (design doc step 5).
 *
 * v2 흐름: 컨텍스트 → step 1·2·[3] → favorites_pick (본 컴포넌트) → summarize.
 * 디자인 doc 130: "기존 작품 픽 UX 그대로 — favorites 배열로 LLM seed".
 * NewPersonaSheet 의 mini search + suggestion grid 패턴 재사용 (단순 인라인).
 *
 * 차이:
 * - 이름 입력 X (controller 의 autoName 또는 사용자 입력은 prior step).
 * - 권장 3개 (NewPersonaSheet 정합) + 건너뛰기 옵션 (v2 마찰 최소).
 * - 0~5개 자유 선택 — summarize endpoint 가 0 favorites 도 지원.
 */

export interface FavoritePickItem {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
}

interface Props {
  onNext: (items: FavoritePickItem[]) => void;
  onSkip: () => void;
}

const MINI_FALLBACK: FavoritePickItem[] = [
  { id: 496243, title: "기생충", posterUrl: "https://image.tmdb.org/t/p/w200/jjHccoFjbqlfr4VGLVLT7yek0Xn.jpg", year: "2019" },
  { id: 278, title: "쇼생크 탈출", posterUrl: "https://image.tmdb.org/t/p/w200/oAt6OtpwYCdJI76AVtVKW1eorYx.jpg", year: "1994" },
  { id: 157336, title: "인터스텔라", posterUrl: "https://image.tmdb.org/t/p/w200/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", year: "2014" },
  { id: 238, title: "대부", posterUrl: "https://image.tmdb.org/t/p/w200/I1fkNd5CeJGv56mhrTDoOeMc2r.jpg", year: "1972" },
  { id: 372058, title: "너의 이름은.", posterUrl: "https://image.tmdb.org/t/p/w200/wJsOzBoMSdkLJEFwpPIl0GTvPaJ.jpg", year: "2016" },
  { id: 550, title: "파이트 클럽", posterUrl: "https://image.tmdb.org/t/p/w200/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg", year: "1999" },
  { id: 129, title: "센과 치히로의 행방불명", posterUrl: "https://image.tmdb.org/t/p/w200/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg", year: "2001" },
  { id: 578, title: "라라랜드", posterUrl: "https://image.tmdb.org/t/p/w200/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg", year: "2016" },
];

const MAX_SELECT = 5;
const RECOMMENDED_SELECT = 3;

export default function TasteSurveyFavoritesPicker({ onNext, onSkip }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FavoritePickItem[]>([]);
  const [selected, setSelected] = useState<FavoritePickItem[]>([]);
  const [suggestions, setSuggestions] = useState<FavoritePickItem[]>(MINI_FALLBACK);
  const [searching, setSearching] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTrending = useCallback(async () => {
    setLoadingSuggestions(true);
    try {
      const res = await fetch("/api/trending");
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) setSuggestions(data);
    } catch { /* fallback 유지 */ }
    setLoadingSuggestions(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) void fetchTrending();
    });
    return () => { cancelled = true; };
  }, [fetchTrending]);

  const runSearch = useCallback(async (q: string) => {
    if (q.length < 1) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) { setResults([]); setSearching(false); return; }
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch { setResults([]); }
    setSearching(false);
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 1) { setResults([]); return; }
    debounceRef.current = setTimeout(() => runSearch(value), 300);
  };

  const toggleSelect = (item: FavoritePickItem) => {
    if (selected.some((s) => s.id === item.id)) {
      setSelected(selected.filter((s) => s.id !== item.id));
    } else if (selected.length < MAX_SELECT) {
      setSelected([...selected, item]);
    }
  };

  const reachedMin = selected.length >= RECOMMENDED_SELECT;
  const canNext = selected.length > 0; // 1개 이상이면 진행 가능

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-7 pt-8 shrink-0">
        <p
          className="font-display italic text-[26px] leading-[1.2] mb-2"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
        >
          좋아하는 작품도 알려주세요
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}>
          {RECOMMENDED_SELECT}개 이상 권장 · 최대 {MAX_SELECT}개
        </p>

        {selected.length > 0 && (
          <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
            {selected.map((item) => (
              <button
                key={item.id}
                onClick={() => toggleSelect(item)}
                className="flex-shrink-0 relative"
                aria-label={`${item.title} 선택 해제`}
              >
                {item.posterUrl ? (
                  <Image src={item.posterUrl} alt={item.title} width={44} height={64} className="object-cover rounded-md" sizes="44px" />
                ) : (
                  <div className="w-11 h-16 flex items-center justify-center text-xs rounded-md" style={{ background: "var(--surface)", color: "var(--text-muted)" }}>
                    {item.title.slice(0, 2)}
                  </div>
                )}
                <div className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full" style={{ background: "var(--danger, #d54e4e)" }}>
                  <span style={{ fontSize: 10, color: "var(--text-primary)" }}>✕</span>
                </div>
              </button>
            ))}
          </div>
        )}

        <input
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="작품을 검색하세요"
          className="w-full px-4 py-3 mt-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors rounded-lg text-sm"
          style={{
            background: "var(--surface-sunken)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-7 pt-3 pb-3">
        {searching && (
          <div className="text-center py-4 text-sm" style={{ color: "var(--text-muted)" }}>검색 중...</div>
        )}
        {query.length === 0 && results.length === 0 && (
          <div>
            <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>이런 작품은 어때요?</p>
            <div className="grid grid-cols-2 gap-2" style={{ gridAutoRows: "auto" }}>
              {suggestions.slice(0, 8).map((item, i) => {
                const isSelected = selected.some((s) => s.id === item.id);
                const isLarge = i % 3 === 0;
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleSelect(item)}
                    className={`relative overflow-hidden transition-all active:scale-95 rounded-md${isLarge ? " col-span-2" : ""}`}
                    style={{
                      outline: isSelected ? "2px solid var(--accent)" : "none",
                      outlineOffset: "-2px",
                      aspectRatio: isLarge ? "4/3" : "2/3",
                    }}
                    aria-label={`${item.title} ${isSelected ? "선택 해제" : "선택"}`}
                  >
                    {item.posterUrl ? (
                      <Image src={item.posterUrl} alt={item.title} fill className="object-cover" sizes="(max-width: 480px) 33vw, 120px" />
                    ) : (
                      <div className="w-full h-full" style={{ background: "var(--surface)" }} />
                    )}
                    <div className="absolute bottom-0 left-0 right-0 p-1" style={{ background: "linear-gradient(transparent, var(--bg-overlay-heavy))" }}>
                      <div className="text-xs truncate" style={{ color: "var(--text-primary)" }}>{item.title}</div>
                    </div>
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded-full" style={{ background: "var(--accent)" }}>
                        <IconCheck size={10} color="var(--bg)" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={fetchTrending}
              disabled={loadingSuggestions}
              className="w-full mt-3 py-2 min-h-[44px] text-xs font-medium transition-colors disabled:opacity-30 active:scale-[0.98]"
              style={{ color: "var(--text-muted)" }}
            >
              {loadingSuggestions ? "로딩..." : "다른 작품 보기"}
            </button>
          </div>
        )}
        {results.map((item) => {
          const isSelected = selected.some((s) => s.id === item.id);
          return (
            <button
              key={item.id}
              onClick={() => toggleSelect(item)}
              className="w-full flex items-center gap-3 p-2.5 transition-colors rounded-lg"
              style={{
                background: isSelected ? "var(--accent-dim)" : "transparent",
              }}
              aria-label={`${item.title} ${isSelected ? "선택 해제" : "선택"}`}
            >
              {item.posterUrl ? (
                <Image src={item.posterUrl} alt={item.title} width={36} height={54} className="object-cover rounded-md flex-shrink-0" sizes="36px" />
              ) : (
                <div className="w-9 h-[54px] flex items-center justify-center text-xs rounded-md flex-shrink-0" style={{ background: "var(--surface)", color: "var(--text-muted)" }}>
                  {item.title.slice(0, 2)}
                </div>
              )}
              <div className="flex-1 text-left min-w-0">
                <div className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{item.title}</div>
                {item.year && (
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>{item.year}</div>
                )}
              </div>
              {isSelected && (
                <div className="w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0" style={{ background: "var(--accent)" }}>
                  <IconCheck size={12} color="var(--bg)" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="px-6 pb-8 pt-3 flex flex-col gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onNext(selected)}
          disabled={!canNext}
          aria-disabled={!canNext}
          className="w-full py-4 text-base font-semibold rounded-lg transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
          style={{
            background: canNext ? "var(--accent)" : "var(--surface-raised)",
            color: canNext ? "var(--bg)" : "var(--text-muted)",
            cursor: canNext ? "pointer" : "default",
          }}
        >
          {reachedMin ? "다음" : `${RECOMMENDED_SELECT - selected.length}개 더 권장`}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="w-full py-3 text-sm rounded-md transition-transform active:scale-[0.99]"
          style={{
            color: "var(--text-secondary)",
            background: "transparent",
            border: "1px solid var(--border)",
          }}
        >
          건너뛰기
        </button>
      </div>
    </div>
  );
}
