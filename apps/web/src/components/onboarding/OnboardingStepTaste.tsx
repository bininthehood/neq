"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import { GENRE_CHIPS, type GenreChip } from "./data";
import { setTasteGenres } from "@/lib/account-prefs";
import { setFavorites, setFavoritesMeta, addSaved } from "@/lib/store";
import { track } from "@/lib/analytics";
import { IconClose, IconCheck } from "@/components/Icons";

/**
 * Onboarding V2 — Step 3: Taste.
 *
 * 두 가지 입력을 한 화면에 통합:
 *  1. 장르 칩 (멀티 선택, 3개 이상 권장) → account_prefs.tasteGenres
 *  2. 작품 5픽 (3-5개 필수) → favorites + favoritesMeta + saved 자동 시드 (V1 호환)
 *
 * 저장 시점: "다음" 버튼 클릭 시.
 *  - tasteGenres → setTasteGenres()
 *  - favorites → setFavorites() + setFavoritesMeta() (기존 V1 동일 경로)
 *  - 작품 픽은 saved 에 자동 시드 (V1 호환, /api/tmdb/hydrate)
 *
 * 진행 조건: 장르 3+ AND 작품 3+. 둘 중 하나라도 부족하면 disabled + 안내.
 */

interface SearchItem {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
}

const FALLBACK_SUGGESTIONS: SearchItem[] = [
  { id: 496243, title: "기생충",        posterUrl: "https://image.tmdb.org/t/p/w200/jjHccoFjbqlfr4VGLVLT7yek0Xn.jpg", year: "2019" },
  { id: 278,    title: "쇼생크 탈출",    posterUrl: "https://image.tmdb.org/t/p/w200/oAt6OtpwYCdJI76AVtVKW1eorYx.jpg", year: "1994" },
  { id: 157336, title: "인터스텔라",    posterUrl: "https://image.tmdb.org/t/p/w200/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", year: "2014" },
  { id: 238,    title: "대부",          posterUrl: "https://image.tmdb.org/t/p/w200/I1fkNd5CeJGv56mhrTDoOeMc2r.jpg",  year: "1972" },
  { id: 372058, title: "너의 이름은.",  posterUrl: "https://image.tmdb.org/t/p/w200/wJsOzBoMSdkLJEFwpPIl0GTvPaJ.jpg", year: "2016" },
  { id: 550,    title: "파이트 클럽",   posterUrl: "https://image.tmdb.org/t/p/w200/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg", year: "1999" },
  { id: 569094, title: "스파이더맨: 어크로스 더 유니버스", posterUrl: "https://image.tmdb.org/t/p/w200/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg", year: "2023" },
  { id: 578,    title: "라라랜드",      posterUrl: "https://image.tmdb.org/t/p/w200/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg", year: "2016" },
  { id: 680,    title: "펄프 픽션",     posterUrl: "https://image.tmdb.org/t/p/w200/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg", year: "1994" },
];

const MIN_GENRES = 3;
const MIN_FAVORITES = 3;
const MAX_FAVORITES = 5;

interface Props {
  onNext: () => void;
  initialGenres?: string[];
}

export default function OnboardingStepTaste({ onNext, initialGenres = [] }: Props) {
  // ── 장르 칩 상태 ──
  const [genres, setGenres] = useState<Set<string>>(new Set(initialGenres));

  // ── 작품 5픽 상태 ──
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [selected, setSelected] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchItem[]>(FALLBACK_SUGGESTIONS);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trendingFetched = useRef(false);

  useEffect(() => {
    if (trendingFetched.current) return;
    trendingFetched.current = true;
    (async () => {
      setLoadingSuggestions(true);
      try {
        const res = await fetch("/api/trending");
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) setSuggestions(data);
      } catch { /* fallback 유지 */ }
      setLoadingSuggestions(false);
    })();
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 1) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) { setResults([]); setSearching(false); return; }
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setResults([]);
    }
    setSearching(false);
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(value), 300);
  };

  const toggleGenre = (g: GenreChip) => {
    setGenres((prev) => {
      const next = new Set(prev);
      if (next.has(g.id)) next.delete(g.id);
      else next.add(g.id);
      return next;
    });
  };

  const toggleSelect = (item: SearchItem) => {
    setSelected((prev) => {
      if (prev.some((s) => s.id === item.id)) {
        return prev.filter((s) => s.id !== item.id);
      }
      if (prev.length >= MAX_FAVORITES) return prev;
      track("onboarding_favorite_added", { total: prev.length + 1 });
      return [...prev, item];
    });
  };

  const enoughGenres = genres.size >= MIN_GENRES;
  const enoughFavorites = selected.length >= MIN_FAVORITES;
  const canNext = enoughGenres && enoughFavorites;

  const ctaLabel = (() => {
    if (!enoughGenres && !enoughFavorites) return "장르 3개, 작품 3개 이상";
    if (!enoughGenres) return `장르 ${MIN_GENRES - genres.size}개만 더`;
    if (!enoughFavorites) return `작품 ${MIN_FAVORITES - selected.length}개만 더`;
    return "다음";
  })();

  const handleNext = () => {
    // 1. 장르 즉시 저장
    setTasteGenres(Array.from(genres));

    // 2. 작품 5픽 저장 (V1 호환 경로)
    const titles = selected.map((s) => s.title);
    setFavorites(titles);
    setFavoritesMeta(
      selected.map((s) => ({ id: s.id, title: s.title, posterUrl: s.posterUrl })),
    );

    // 3. saved 자동 시드 — 백그라운드, UX 영향 없음
    for (const s of selected) {
      fetch(`/api/tmdb/hydrate?id=${s.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((rec) => { if (rec) addSaved(rec); })
        .catch(() => { /* silent */ });
    }

    onNext();
  };

  const showSuggestions = query.length === 0 && results.length === 0;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-7 pt-6 shrink-0">
        <p
          className="font-display italic text-[26px] leading-[1.2] mb-2"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
        >
          어떤 작품을 좋아하세요?
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}>
          장르 3개 이상 + 작품 3-5개를 골라 주세요
        </p>
      </div>

      {/* 스크롤 컨테이너 — 장르 + 작품 모두 포함 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-7 pt-5 pb-4">
        {/* 장르 칩 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <p
              className="text-xs uppercase tracking-[0.08em]"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-data)" }}
            >
              Genres · 장르
            </p>
            <p
              className="text-[11px] tabular-nums"
              style={{
                // 2026-05-02 amber 누적 분배 정책: 카운터 amber → primary semibold.
                // 진행 상태는 색이 아니라 가중치로 표현.
                color: enoughGenres ? "var(--text-primary)" : "var(--text-muted)",
                fontWeight: enoughGenres ? 600 : 400,
                fontFamily: "var(--font-data)",
              }}
            >
              {genres.size} / {MIN_GENRES}+
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {GENRE_CHIPS.map((g) => {
              const on = genres.has(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggleGenre(g)}
                  className="px-4 py-2.5 rounded-full text-[13px] font-medium transition-colors flex items-center gap-1.5 active:scale-95"
                  style={{
                    background: on ? "var(--accent)" : "var(--surface)",
                    border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                    color: on ? "var(--bg)" : "var(--text-primary)",
                    fontWeight: on ? 600 : 500,
                  }}
                >
                  {on && <span style={{ fontSize: 10 }}>✓</span>}
                  {g.ko}
                </button>
              );
            })}
          </div>
        </div>

        {/* 작품 픽 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p
              className="text-xs uppercase tracking-[0.08em]"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-data)" }}
            >
              Picks · 작품
            </p>
            <p
              className="text-[11px] tabular-nums"
              style={{
                // 2026-05-02 amber 누적 분배 정책: 카운터 amber → primary semibold.
                color: enoughFavorites ? "var(--text-primary)" : "var(--text-muted)",
                fontWeight: enoughFavorites ? 600 : 400,
                fontFamily: "var(--font-data)",
              }}
            >
              {selected.length} / {MIN_FAVORITES}+
            </p>
          </div>

          {/* 선택된 작품 5칸 */}
          <div className="flex gap-2 mb-3">
            {Array.from({ length: MAX_FAVORITES }).map((_, i) => {
              const item = selected[i];
              if (item) {
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleSelect(item)}
                    className="flex-shrink-0 relative"
                  >
                    {item.posterUrl ? (
                      <Image src={item.posterUrl} alt={item.title} width={56} height={80} className="object-cover rounded-md" sizes="56px" />
                    ) : (
                      <div
                        className="w-14 h-20 flex items-center justify-center text-xs rounded-md"
                        style={{ background: "var(--surface)", color: "var(--text-muted)" }}
                      >
                        {item.title.slice(0, 3)}
                      </div>
                    )}
                    <div
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full"
                      style={{ background: "var(--danger)" }}
                    >
                      <IconClose size={10} color="var(--text-primary)" />
                    </div>
                  </button>
                );
              }
              return (
                <div
                  key={`empty-${i}`}
                  className="w-14 h-20 flex-shrink-0 flex items-center justify-center rounded-md"
                  style={{ background: "var(--surface)", border: "1px dashed var(--border)" }}
                >
                  <span className="text-lg" style={{ color: "var(--text-muted)" }}>+</span>
                </div>
              );
            })}
          </div>

          {/* 검색 */}
          <input
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="영화나 시리즈 제목을 검색하세요"
            className="w-full px-4 py-3 mt-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-lg"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />

          {searching && (
            <p className="text-center py-3 text-sm" style={{ color: "var(--text-muted)" }}>
              검색 중...
            </p>
          )}

          {/* 추천 그리드 */}
          {showSuggestions && (
            <div className="mt-4">
              <p className="text-xs mb-3 px-1" style={{ color: "var(--text-muted)" }}>
                {loadingSuggestions ? "추천을 불러오는 중..." : "이런 작품은 어때요?"}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {suggestions.slice(0, 9).map((item, i) => {
                  const isSelected = selected.some((s) => s.id === item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleSelect(item)}
                      className="relative overflow-hidden transition-all active:scale-95 rounded-lg"
                      style={{
                        outline: isSelected ? "2px solid var(--accent)" : "none",
                        outlineOffset: "-2px",
                        aspectRatio: "2/3",
                        background: "var(--surface)",
                        animationDelay: `${i * 40}ms`,
                      }}
                    >
                      {item.posterUrl ? (
                        <Image
                          src={item.posterUrl}
                          alt={item.title}
                          fill
                          className="object-cover"
                          sizes="(max-width: 480px) 33vw, 160px"
                          priority={i < 3}
                        />
                      ) : (
                        <div className="w-full h-full" style={{ background: "var(--surface)" }} />
                      )}
                      <div
                        className="absolute bottom-0 left-0 right-0 p-1.5"
                        style={{ background: "linear-gradient(transparent, var(--bg-overlay-heavy))" }}
                      >
                        <div className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                          {item.title}
                        </div>
                      </div>
                      {isSelected && (
                        <div
                          className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full"
                          style={{ background: "var(--accent)" }}
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

          {/* 검색 결과 */}
          {!showSuggestions && results.length > 0 && (
            <div className="mt-3 flex flex-col gap-1">
              {results.map((item) => {
                const isSelected = selected.some((s) => s.id === item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleSelect(item)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg transition-colors"
                    style={{
                      background: isSelected ? "var(--accent-dim)" : "transparent",
                      border: `1px solid ${isSelected ? "var(--accent-border)" : "transparent"}`,
                    }}
                  >
                    {item.posterUrl ? (
                      <Image src={item.posterUrl} alt={item.title} width={48} height={72} className="object-cover flex-shrink-0 rounded-md" sizes="48px" />
                    ) : (
                      <div className="w-12 h-18 flex-shrink-0 rounded-md" style={{ background: "var(--surface)" }} />
                    )}
                    <div className="text-left flex-1 min-w-0">
                      <div className="font-medium truncate" style={{ color: "var(--text-primary)" }}>{item.title}</div>
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
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="px-6 pb-8 pt-3 shrink-0">
        <button
          type="button"
          onClick={handleNext}
          disabled={!canNext}
          className="w-full py-4 text-base font-semibold rounded-lg transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
          style={{
            background: canNext ? "var(--accent)" : "var(--surface-raised)",
            color: canNext ? "var(--bg)" : "var(--text-muted)",
            cursor: canNext ? "pointer" : "default",
          }}
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
