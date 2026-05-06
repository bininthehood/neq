"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import { GENRE_CHIPS, type GenreChip } from "./data";
import { getAccountPrefs } from "@/lib/account-prefs";
import { setFavorites, setFavoritesMeta, addSaved, archiveItem } from "@/lib/store";
import { track } from "@/lib/analytics";
import { IconClose, IconCheck } from "@/components/Icons";

/**
 * Onboarding V2 — Step 3-2: Taste (작품 선택).
 *
 * 직전 단계(Genre)에서 선택한 3개 장르를 account_prefs.tasteGenres 에서 읽어와
 * 각 장르별 추천 작품 카로셀 + 검색 input 을 함께 노출. 사용자는 자유롭게 3-5개 선택.
 *
 * 저장 시점: "다음" 버튼 클릭.
 *  - favorites/favoritesMeta → V1 호환 경로
 *  - 작품 픽 saved 자동 시드 + 즉시 archive (메인 영역 노출 X, '아카이브' 탭에서만)
 *
 * 진행 조건: 작품 3+. 장르는 직전 단계 통과 가정 (3개 강제).
 */

interface SearchItem {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
}

const MIN_FAVORITES = 3;
const MAX_FAVORITES = 5;

interface Props {
  onNext: () => void;
}

export default function OnboardingStepTaste({ onNext }: Props) {
  // 직전 Genre 단계에서 저장된 장르 slug 3개
  const [genreSlugs] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    return getAccountPrefs().tasteGenres ?? [];
  });

  // slug → GenreChip
  const selectedGenres: GenreChip[] = genreSlugs
    .map((slug) => GENRE_CHIPS.find((g) => g.id === slug))
    .filter((g): g is GenreChip => !!g);

  // 장르별 추천 캐시 (slug → SearchItem[])
  const [genreRecs, setGenreRecs] = useState<Record<string, SearchItem[]>>({});
  const [loadingGenres, setLoadingGenres] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries: [string, SearchItem[]][] = await Promise.all(
        selectedGenres.map(async (g) => {
          if (g.tmdbMovieId == null) return [g.id, []] as [string, SearchItem[]];
          try {
            const res = await fetch(`/api/tmdb/by-genre?genre=${g.tmdbMovieId}`);
            if (!res.ok) return [g.id, []] as [string, SearchItem[]];
            const data = await res.json();
            return [g.id, Array.isArray(data) ? data : []] as [string, SearchItem[]];
          } catch {
            return [g.id, []] as [string, SearchItem[]];
          }
        }),
      );
      if (cancelled) return;
      setGenreRecs(Object.fromEntries(entries));
      setLoadingGenres(false);
    })();
    return () => {
      cancelled = true;
    };
    // selectedGenres 는 mount 시 1회 결정되어 안정. eslint 가드.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 작품 검색 (기존 유지)
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        setResults([]);
        setSearching(false);
        return;
      }
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

  // 작품 선택 상태
  const [selected, setSelected] = useState<SearchItem[]>([]);

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

  const enoughFavorites = selected.length >= MIN_FAVORITES;
  const ctaLabel = enoughFavorites
    ? "다음"
    : `${MIN_FAVORITES - selected.length}개 더 선택해주세요`;

  const handleNext = () => {
    const titles = selected.map((s) => s.title);
    setFavorites(titles);
    setFavoritesMeta(
      selected.map((s) => ({ id: s.id, title: s.title, posterUrl: s.posterUrl })),
    );

    // saved 자동 시드 + 즉시 archive (race condition 회피).
    for (const s of selected) {
      archiveItem(s.id);
      fetch(`/api/tmdb/hydrate?id=${s.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((rec) => { if (rec) addSaved(rec); })
        .catch(() => { /* silent */ });
    }

    onNext();
  };

  const showSearchResults = query.length > 0;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-7 pt-6 shrink-0">
        <p
          className="font-display italic text-[26px] leading-[1.2] mb-2"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
        >
          이런 작품은 어때요?
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}>
          좋아하는 작품 3-5개를 골라주세요
        </p>
      </div>

      {/* 선택된 작품 5칸 — sticky (스크롤 외부) */}
      <div className="flex gap-2 mt-5 mb-3 px-7 shrink-0">
        {Array.from({ length: MAX_FAVORITES }).map((_, i) => {
          const item = selected[i];
          if (item) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleSelect(item)}
                className="flex-shrink-0 relative"
                aria-label={`${item.title} 선택 해제`}
              >
                {item.posterUrl ? (
                  <Image
                    src={item.posterUrl}
                    alt={item.title}
                    width={56}
                    height={80}
                    className="object-cover rounded-md"
                    sizes="56px"
                  />
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

      {/* 검색 input — sticky (스크롤 외부) */}
      <div className="px-7 mb-3 shrink-0">
        <input
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="작품 검색"
          aria-label="작품 검색"
          className="w-full px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-lg"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* 스크롤 영역 — 검색 결과 또는 장르별 카로셀만 */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-4">
        {searching && (
          <p
            className="text-center py-3 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            검색 중...
          </p>
        )}

        {showSearchResults && results.length > 0 && (
          <div className="px-7 flex flex-col gap-1 mb-4">
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
                    <Image
                      src={item.posterUrl}
                      alt={item.title}
                      width={48}
                      height={72}
                      className="object-cover flex-shrink-0 rounded-md"
                      sizes="48px"
                    />
                  ) : (
                    <div
                      className="w-12 h-18 flex-shrink-0 rounded-md"
                      style={{ background: "var(--surface)" }}
                    />
                  )}
                  <div className="text-left flex-1 min-w-0">
                    <div className="font-medium truncate" style={{ color: "var(--text-primary)" }}>
                      {item.title}
                    </div>
                    <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                      {item.year}
                    </div>
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

        {/* 장르별 추천 — 검색 입력 없을 때만 노출 */}
        {!showSearchResults && (
          <div className="flex flex-col gap-6">
            {selectedGenres.map((g) => {
              const items = genreRecs[g.id] ?? [];
              if (loadingGenres && items.length === 0) {
                return (
                  <div key={g.id} className="px-7">
                    <p className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                      {g.ko}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      추천 불러오는 중...
                    </p>
                  </div>
                );
              }
              if (items.length === 0) return null;
              return (
                <div key={g.id}>
                  <div className="px-7 mb-2">
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {g.ko}
                    </p>
                  </div>
                  <div
                    className="flex gap-3 overflow-x-auto px-7 pb-1"
                    style={{ scrollbarWidth: "none" }}
                  >
                    {items.map((item) => {
                      const isSelected = selected.some((s) => s.id === item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleSelect(item)}
                          className="flex-shrink-0 w-20 active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
                          aria-label={`${item.title}${isSelected ? " 선택됨" : ""}`}
                          aria-pressed={isSelected}
                        >
                          <div
                            className="relative w-20 h-28 overflow-hidden rounded-md"
                            style={{
                              background: "var(--surface)",
                              border: isSelected ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                              boxShadow: isSelected ? "0 0 0 3px var(--accent-dim)" : "none",
                            }}
                          >
                            {item.posterUrl ? (
                              <Image
                                src={item.posterUrl}
                                alt={item.title}
                                fill
                                className="object-cover"
                                sizes="80px"
                              />
                            ) : (
                              <div
                                className="w-full h-full flex items-center justify-center text-xs"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {item.title.slice(0, 6)}
                              </div>
                            )}
                            {isSelected && (
                              <div
                                className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full"
                                style={{ background: "var(--accent)" }}
                              >
                                <IconCheck size={12} color="var(--bg)" />
                              </div>
                            )}
                          </div>
                          <p
                            className="text-xs mt-1 truncate text-left"
                            style={{ color: isSelected ? "var(--text-primary)" : "var(--text-muted)" }}
                          >
                            {item.title}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-6 pb-8 pt-3 shrink-0">
        <button
          type="button"
          onClick={handleNext}
          disabled={!enoughFavorites}
          className="w-full py-4 text-base font-semibold rounded-lg transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
          style={{
            background: enoughFavorites ? "var(--accent)" : "var(--surface-raised)",
            color: enoughFavorites ? "var(--bg)" : "var(--text-muted)",
            cursor: enoughFavorites ? "pointer" : "default",
          }}
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
