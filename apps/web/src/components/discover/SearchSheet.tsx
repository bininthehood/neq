"use client";

/**
 * SearchSheet — D10 grouped 카로셀 리뉴얼.
 *
 * `/api/search?grouped=1` 응답 (`{ works, directors, actors }`) 기반으로
 * 카테고리별 가로 스크롤 카로셀을 렌더한다.
 *
 * 4 상태 매핑 (D9 + D11 컴포넌트 사용):
 *   - 비입력 (idle):  최근 검색어 / 추천 (현재는 hint 텍스트 — 별도 트랙)
 *   - 로딩 (loading): <NeqSpinner size="md" />
 *   - 결과 0 (empty): <Illust name="noResults" /> + "다른 키워드를 시도해보세요"
 *   - 에러 (error):   <Illust name="error" /> + <Button>다시 시도</Button> + toast
 *   - 정상 (ok):      카테고리 그룹 카로셀
 *
 * 디바운싱 200ms — 빠른 입력 시 이전 fetch는 AbortController 로 취소.
 *
 * 호환성: 기존 props API 그대로 (호출처 회귀 0).
 */

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { IconStar, IconSave } from "@/components/Icons";
import { getOTTLink, getOTTIcon } from "@/lib/ott-links";
import { addSaved } from "@/lib/store";
import { track } from "@/lib/analytics";
import {
  addRecentSearch,
  getRecentSearches,
  removeRecentSearch,
  type RecentSearch,
} from "@/lib/recent-searches";
import {
  isVoiceSearchSupported,
  startVoiceRecognition,
  type VoiceRecognitionHandle,
} from "@/lib/voice-search";
import { useDetailSheet } from "@/hooks/useDetailSheet";
import DetailSheet from "./DetailSheet";
import type {
  Recommendation,
  SearchResult,
  PersonResult,
  GroupedSearchResponse,
} from "@/lib/types";
import { Illust, Button, NeqSpinner, useToast } from "@neq/design";

// idle 상태에서 호출되는 trending API 응답 (apps/web/src/app/api/trending/route.ts)
interface TrendingItem {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
}
import {
  resolveSearchUiState,
  buildCategoryGroups,
  SEARCH_DEBOUNCE_MS,
  type SearchUiState,
  type SearchUiInput,
  type CategoryGroup,
} from "@neq/core";

// ─────────────────────────────────────────────────────
// 순수 로직 re-export (D10n: packages/core/src/search.ts 로 추출 — web/native 공용).
// 기존 테스트 import path (`"../SearchSheet"`) 보존을 위해 re-export 유지.
// ─────────────────────────────────────────────────────

export {
  resolveSearchUiState,
  buildCategoryGroups,
  SEARCH_DEBOUNCE_MS,
};
export type { SearchUiState, SearchUiInput, CategoryGroup };

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

// ─────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────

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
  const [data, setData] = useState<GroupedSearchResponse | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [hasError, setHasError] = useState(false);

  const [selectedWork, setSelectedWork] = useState<SearchResult | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [detailRec, setDetailRec] = useState<Recommendation | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // D10b — Recent / Trending / Voice
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  const [trending, setTrending] = useState<TrendingItem[]>([]);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const voiceHandleRef = useRef<VoiceRecognitionHandle | null>(null);

  const detail = useDetailSheet();
  const toast = useToast();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 본 리뉴얼 fetch — grouped=1 으로 호출. AbortController 로 빠른 입력 시 이전 fetch 취소.
  const search = useCallback(async (q: string) => {
    if (q.trim().length < 1) {
      setData(null);
      setHasError(false);
      setIsFetching(false);
      return;
    }
    // 이전 in-flight 취소
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setIsFetching(true);
    setHasError(false);

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&grouped=1`,
        { signal: controller.signal },
      );
      if (!res.ok) {
        throw new Error(`search failed (${res.status})`);
      }
      const body = (await res.json()) as GroupedSearchResponse;
      // 응답 직전에 새 controller 가 갈아탄 경우 — 이 응답은 stale, 무시
      if (controller.signal.aborted) return;
      setData(body);
      setIsFetching(false);
      // D10b — 결과가 있을 때만 recent 에 기록 (0건 검색 / 오타 노이즈 제외)
      const total =
        (body.works?.length ?? 0) +
        (body.directors?.length ?? 0) +
        (body.actors?.length ?? 0);
      if (total > 0) {
        addRecentSearch(q);
        setRecents(getRecentSearches());
      }
    } catch (err) {
      if (controller.signal.aborted) return; // 정상 취소
      if (err instanceof DOMException && err.name === "AbortError") return;
      setHasError(true);
      setData(null);
      setIsFetching(false);
      toast.error("검색 중 문제가 생겼어요");
    }
  }, [toast]);

  const handleInput = (value: string) => {
    setQuery(value);
    // 진입 시 work selection 초기화 (이전 검색 결과 클릭 상태 유지 X)
    setSelectedWork(null);
    setProviders([]);
    setDetailRec(null);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (value.trim().length === 0) {
      // 즉시 idle 처리 — 디바운스 대기 X
      if (abortRef.current) abortRef.current.abort();
      setData(null);
      setIsFetching(false);
      setHasError(false);
      return;
    }
    debounceTimerRef.current = setTimeout(() => {
      void search(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  // unmount 정리
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortRef.current) abortRef.current.abort();
      voiceHandleRef.current?.stop();
    };
  }, []);

  // D10b — sheet open 시 idle 컨텐츠 (recents / trending / voice 지원) 준비
  useEffect(() => {
    if (!show) return;
    setVoiceSupported(isVoiceSearchSupported());
    setRecents(getRecentSearches());

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/trending");
        if (!res.ok) return;
        const body = (await res.json()) as TrendingItem[];
        if (cancelled) return;
        setTrending(Array.isArray(body) ? body.slice(0, 6) : []);
      } catch {
        // 무시 — trending 은 보조 컨텐츠
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [show]);

  const handleRetry = () => {
    if (query.trim().length > 0) {
      void search(query);
    }
  };

  // D10b — Recent / Trending 칩에서 query 적용 → 즉시 검색 트리거 (debounce 우회)
  const applyQuery = (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length === 0) return;
    setQuery(trimmed);
    setSelectedWork(null);
    setProviders([]);
    setDetailRec(null);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    void search(trimmed);
  };

  const handleRemoveRecent = (q: string) => {
    removeRecentSearch(q);
    setRecents(getRecentSearches());
    track("search_recent_removed", { query: q });
  };

  // D10b — Voice 입력
  const handleMicClick = () => {
    if (listening) {
      voiceHandleRef.current?.stop();
      return;
    }
    if (!voiceSupported) return;
    setListening(true);
    track("search_voice_started");
    try {
      voiceHandleRef.current = startVoiceRecognition({
        lang: "ko-KR",
        onResult: (transcript, isFinal) => {
          // interim 은 input 에 표시, final 일 때 검색 트리거
          setQuery(transcript);
          if (isFinal) {
            const trimmed = transcript.trim();
            if (trimmed.length > 0) {
              if (debounceTimerRef.current)
                clearTimeout(debounceTimerRef.current);
              void search(trimmed);
              track("search_voice_completed", {
                length: trimmed.length,
              });
            }
          }
        },
        onError: (err) => {
          track("search_voice_error", { error: err });
          if (err !== "aborted" && err !== "no-speech") {
            toast.error("음성 인식 실패");
          }
        },
        onEnd: () => {
          setListening(false);
          voiceHandleRef.current = null;
        },
      });
    } catch {
      setListening(false);
      toast.error("음성 인식 실패");
    }
  };

  const handleSelectWork = async (item: SearchResult) => {
    if (selectedWork?.id === item.id) {
      setSelectedWork(null);
      setDetailRec(null);
      setProviders([]);
      return;
    }
    setSelectedWork(item);
    setLoadingDetail(true);
    setLoadingProviders(true);
    track("search_item_selected", { tmdb_id: item.id, title: item.title });
    try {
      const type = item.mediaType === "tv" ? "series" : "movie";
      const [provRes, hydRes] = await Promise.all([
        fetch(`/api/search/providers?id=${item.id}&type=${type}`),
        fetch(`/api/tmdb/hydrate?id=${item.id}&type=${type}`),
      ]);
      const provData = await provRes.json();
      setProviders(provData.providers ?? []);
      if (hydRes.ok) {
        const rec = await hydRes.json();
        setDetailRec(rec);
      } else {
        setDetailRec(null);
      }
    } catch {
      setProviders([]);
      setDetailRec(null);
    }
    setLoadingProviders(false);
    setLoadingDetail(false);
  };

  const handleSave = (item: SearchResult) => {
    const rec: Recommendation =
      detailRec && detailRec.tmdbId === item.id
        ? { ...detailRec, reason: detailRec.reason || "검색해서 저장한 작품이에요" }
        : {
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

  const uiState = resolveSearchUiState({
    query,
    isFetching,
    hasError,
    data,
  });

  const groups = data ? buildCategoryGroups(data) : [];

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
      {/* sheet — full height, 키보드에 가려지지 않음 */}
      <div
        className="relative w-full max-w-lg mx-auto flex flex-col bg-surface-raised"
        style={{
          height: "100dvh",
          borderRadius: 0,
          transform: `translateY(${sheetY}%)`,
          transition: animating
            ? "transform 0.3s cubic-bezier(0.34, 1.3, 0.64, 1)"
            : "none",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* handle */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div
            className="w-10 h-1 rounded-full"
            style={{ background: "var(--border)" }}
          />
        </div>

        {/* search input + close */}
        <div className="flex items-center gap-2 px-4 pb-3 shrink-0">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleInput(e.target.value)}
              placeholder="작품, 감독, 배우"
              aria-label="검색"
              className="w-full px-4 py-3 pr-20 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors bg-surface border border-border rounded-lg text-foreground"
              style={{ fontSize: "16px" }}
            />
            {query.length > 0 && (
              <button
                onClick={() => {
                  handleInput("");
                  inputRef.current?.focus();
                }}
                aria-label="검색어 지우기"
                className="absolute right-10 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full active:scale-90 transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none focus-visible:ring-offset-1"
                style={{
                  background: "var(--text-muted)",
                  color: "var(--surface)",
                }}
              >
                <svg
                  width={10}
                  height={10}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="square"
                >
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            )}
            {voiceSupported && (
              <button
                onClick={handleMicClick}
                aria-label={listening ? "음성 인식 중지" : "음성으로 검색"}
                aria-pressed={listening}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full active:scale-90 transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                style={{
                  background: listening ? "var(--accent)" : "transparent",
                  color: listening
                    ? "var(--surface)"
                    : "var(--text-muted)",
                }}
              >
                <svg
                  width={14}
                  height={16}
                  viewBox="0 0 12 14"
                  fill="none"
                >
                  <rect
                    x="3"
                    y="0.5"
                    width="6"
                    height="9"
                    rx="3"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    fill={listening ? "currentColor" : "none"}
                  />
                  <path
                    d="M1 7C1 9.76142 3.23858 12 6 12V13.5M11 7C11 9.76142 8.76142 12 6 12"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="검색 닫기"
            className="shrink-0 px-3 py-3 text-sm text-muted active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
          >
            취소
          </button>
        </div>

        {/* body */}
        <div
          ref={bodyRef}
          className="flex-1 min-h-0 overflow-y-auto pb-6"
        >
          {uiState === "idle" && (
            <IdleContent
              listening={listening}
              recents={recents}
              trending={trending}
              onApplyQuery={applyQuery}
              onRemoveRecent={handleRemoveRecent}
            />
          )}

          {uiState === "loading" && (
            <div className="flex items-center justify-center py-12">
              <NeqSpinner size="md" label="검색 중" />
            </div>
          )}

          {uiState === "error" && (
            <div className="flex flex-col items-center justify-center px-8 py-12 gap-4 text-center">
              <Illust
                name="error"
                style="editorial"
                size="lg"
                aria-label="검색 오류"
              />
              <p
                className="text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                검색 중 문제가 생겼어요
              </p>
              <Button variant="secondary" size="md" onClick={handleRetry}>
                다시 시도
              </Button>
            </div>
          )}

          {uiState === "empty" && (
            <div className="flex flex-col items-center justify-center px-8 py-12 gap-4 text-center">
              <Illust
                name="noResults"
                style="editorial"
                size="lg"
                aria-label="검색 결과 없음"
              />
              <div>
                <p className="font-display text-lg">
                  &quot;{query.trim()}&quot;에 맞는 게 없어요
                </p>
                <p
                  className="text-sm mt-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  다른 키워드를 시도해보세요
                </p>
              </div>
            </div>
          )}

          {uiState === "ok" && data && (
            <div className="space-y-4 pt-2">
              {groups.map((g) => (
                <section
                  key={g.key}
                  aria-label={`${g.label} 검색 결과 ${g.count}건`}
                >
                  <div className="flex items-baseline justify-between px-5 pt-2 pb-2">
                    <h3
                      className="text-xs font-data uppercase tracking-widest"
                      style={{
                        color: "var(--accent)",
                        letterSpacing: "0.12em",
                      }}
                    >
                      {g.label}
                    </h3>
                    <span
                      className="text-xs font-data"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {g.count}
                    </span>
                  </div>

                  {g.key === "works" && (
                    <WorksCarousel
                      items={data.works}
                      selectedId={selectedWork?.id ?? null}
                      onSelect={handleSelectWork}
                    />
                  )}

                  {g.key === "directors" && (
                    <PeopleCarousel items={data.directors} />
                  )}
                  {g.key === "actors" && (
                    <PeopleCarousel items={data.actors} />
                  )}
                </section>
              ))}

              {/* 선택된 작품 상세 패널 */}
              {selectedWork && (
                <SelectedWorkPanel
                  item={selectedWork}
                  providers={providers}
                  loadingProviders={loadingProviders}
                  loadingDetail={loadingDetail}
                  detailRec={detailRec}
                  isSaved={savedIds.has(selectedWork.id)}
                  onSave={() => handleSave(selectedWork)}
                  onOpenDetail={() => {
                    if (detailRec) detail.openDetail();
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
      {detailRec && detail.showDetail && (
        <DetailSheet
          rec={detailRec}
          showDetail={detail.showDetail}
          detailY={detail.detailY}
          detailAnimating={detail.detailAnimating}
          detailBodyRef={detail.detailBodyRef}
          onClose={detail.closeDetail}
          onDetailTouchStart={detail.onDetailTouchStart}
          onDetailTouchMove={detail.onDetailTouchMove}
          onDetailTouchEnd={detail.onDetailTouchEnd}
          onShare={async () => {}}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// D10b — Idle 컨텐츠 (Recent / Trending / Voice listening)
// ─────────────────────────────────────────────────────

function IdleContent({
  listening,
  recents,
  trending,
  onApplyQuery,
  onRemoveRecent,
}: {
  listening: boolean;
  recents: RecentSearch[];
  trending: TrendingItem[];
  onApplyQuery: (q: string) => void;
  onRemoveRecent: (q: string) => void;
}) {
  if (listening) return <VoiceListening />;

  const hasContent = recents.length > 0 || trending.length > 0;

  if (!hasContent) {
    return (
      <div className="px-5 pt-4 text-sm text-muted">
        작품, 감독, 배우 이름으로 검색해보세요
      </div>
    );
  }

  return (
    <div className="pb-4">
      {recents.length > 0 && (
        <section aria-label="최근 검색어">
          <SectionHead label="Recent · 최근 검색" />
          <div className="px-5 flex flex-wrap gap-2">
            {recents.slice(0, 7).map((r) => (
              <RecentChip
                key={r.query}
                query={r.query}
                onApply={() => onApplyQuery(r.query)}
                onRemove={() => onRemoveRecent(r.query)}
              />
            ))}
          </div>
        </section>
      )}
      {trending.length > 0 && (
        <section aria-label="지금 떠오르는" className="mt-1">
          <SectionHead label="Trending · 지금 떠오르는" />
          <div className="px-5 flex flex-wrap gap-2">
            {trending.slice(0, 6).map((t) => (
              <TrendingChip
                key={t.id}
                label={t.title}
                onApply={() => {
                  onApplyQuery(t.title);
                  track("search_trending_clicked", {
                    tmdb_id: t.id,
                    title: t.title,
                  });
                }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHead({ label }: { label: string }) {
  return (
    <div className="px-5 pt-4 pb-2">
      <h3
        className="text-xs font-data uppercase"
        style={{
          color: "var(--accent)",
          letterSpacing: "0.12em",
        }}
      >
        {label}
      </h3>
    </div>
  );
}

function RecentChip({
  query,
  onApply,
  onRemove,
}: {
  query: string;
  onApply: () => void;
  onRemove: () => void;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <button
        onClick={onApply}
        className="pl-3 pr-1.5 py-1.5 text-xs font-medium active:scale-[0.97] transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-l-full"
        style={{ color: "var(--text-primary)" }}
        aria-label={`${query} 다시 검색`}
      >
        <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>
          ↺{" "}
        </span>
        {query}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`${query} 검색 기록에서 제거`}
        className="pr-2.5 pl-1 py-1.5 active:scale-90 transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-r-full"
        style={{ color: "var(--text-muted)" }}
      >
        <svg
          width={9}
          height={9}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="square"
        >
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>
    </span>
  );
}

function TrendingChip({
  label,
  onApply,
}: {
  label: string;
  onApply: () => void;
}) {
  return (
    <button
      onClick={onApply}
      className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium active:scale-[0.97] transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
      style={{
        background: "var(--accent-dim)",
        color: "var(--accent)",
        border: "1px solid var(--accent-dim)",
      }}
      aria-label={`${label} 검색`}
    >
      {label}
    </button>
  );
}

function VoiceListening() {
  return (
    <div
      className="flex flex-col items-center justify-center px-6 py-12 gap-3"
      style={{
        background:
          "radial-gradient(circle at center, rgba(196,163,90,0.12) 0%, transparent 70%)",
      }}
    >
      <div
        className="relative"
        style={{ width: 120, height: 120 }}
        aria-hidden="true"
      >
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className="absolute inset-0 rounded-full"
            style={{
              border: "1px solid var(--accent)",
              opacity: 0.4 / i,
              animation: `neq-voice-pulse 2s ${i * 0.4}s ease-out infinite`,
            }}
          />
        ))}
        <span
          className="absolute flex items-center justify-center rounded-full"
          style={{
            inset: 30,
            background: "var(--accent)",
            color: "var(--surface)",
          }}
        >
          <svg width="22" height="26" viewBox="0 0 22 26" fill="none">
            <rect
              x="6"
              y="1"
              width="10"
              height="14"
              rx="5"
              fill="currentColor"
            />
            <path
              d="M2 12C2 16.9706 6.02944 21 11 21V25M20 12C20 16.9706 15.9706 21 11 21"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </div>
      <p
        className="font-display italic text-xl"
        style={{ color: "var(--text-primary)" }}
      >
        듣는 중…
      </p>
      <p
        className="text-xs text-center max-w-[220px] leading-relaxed"
        style={{ color: "var(--text-muted)" }}
      >
        &ldquo;느릿한 한국 영화&rdquo; 처럼 자연스럽게 말해 보세요
      </p>
      <style>{`
        @keyframes neq-voice-pulse {
          0% { transform: scale(0.6); opacity: 0.6; }
          100% { transform: scale(1.4); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 카로셀 — 작품
// ─────────────────────────────────────────────────────

function WorksCarousel({
  items,
  selectedId,
  onSelect,
}: {
  items: SearchResult[];
  selectedId: number | null;
  onSelect: (item: SearchResult) => void;
}) {
  return (
    <div
      className="flex gap-3 px-5 pb-1 overflow-x-auto"
      style={{
        scrollSnapType: "x mandatory",
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {items.map((item) => {
        const isSelected = selectedId === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            aria-label={`${item.title} 선택`}
            aria-pressed={isSelected}
            className="shrink-0 active:scale-[0.98] transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
            style={{
              width: 112,
              scrollSnapAlign: "start",
            }}
          >
            <div
              className="relative rounded-md overflow-hidden"
              style={{
                width: 112,
                aspectRatio: "2 / 3",
                background: "var(--surface)",
                border: isSelected
                  ? "1.5px solid var(--accent)"
                  : "1px solid var(--border)",
                transition: "border-color 150ms",
              }}
            >
              {item.posterUrl ? (
                <Image
                  src={item.posterUrl}
                  alt={item.title}
                  fill
                  sizes="112px"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-muted text-center px-2">
                  {item.title.slice(0, 8)}
                </div>
              )}
            </div>
            <div className="mt-2 text-left">
              <div
                className="text-xs font-medium truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {item.title}
              </div>
              <div
                className="flex items-center gap-1.5 mt-0.5 text-[10px]"
                style={{ color: "var(--text-muted)" }}
              >
                <span>{item.mediaType === "tv" ? "시리즈" : "영화"}</span>
                {item.year && <span>·</span>}
                {item.year && <span>{item.year}</span>}
                {item.rating > 0 && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-0.5 font-data">
                      <IconStar size={9} color="var(--accent)" />
                      {item.rating.toFixed(1)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 카로셀 — 인물 (감독 / 배우 공용)
// ─────────────────────────────────────────────────────

function PeopleCarousel({ items }: { items: PersonResult[] }) {
  return (
    <div
      className="flex gap-3 px-5 pb-1 overflow-x-auto"
      style={{
        scrollSnapType: "x mandatory",
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {items.map((p) => (
        <PersonCard key={p.id} person={p} />
      ))}
    </div>
  );
}

function PersonCard({ person }: { person: PersonResult }) {
  const knownForText =
    person.knownFor.length > 0
      ? person.knownFor.map((k) => k.title).join(", ")
      : null;
  return (
    <div
      className="shrink-0 flex flex-col items-center text-center"
      style={{ width: 96, scrollSnapAlign: "start" }}
    >
      <div
        className="rounded-full overflow-hidden"
        style={{
          width: 72,
          height: 72,
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        {person.profileUrl ? (
          <Image
            src={person.profileUrl}
            alt={person.name}
            width={72}
            height={72}
            className="object-cover w-full h-full"
            sizes="72px"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center font-display text-2xl"
            style={{ color: "var(--accent)" }}
          >
            {person.name.charAt(0)}
          </div>
        )}
      </div>
      <div
        className="mt-2 text-xs font-medium truncate w-full"
        style={{ color: "var(--text-primary)" }}
      >
        {person.name}
      </div>
      {knownForText && (
        <div
          className="text-[10px] mt-0.5 truncate w-full"
          style={{ color: "var(--text-muted)" }}
          title={knownForText}
        >
          {knownForText}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 선택된 작품 상세 패널 (저장 / 상세 진입 / OTT)
// ─────────────────────────────────────────────────────

function SelectedWorkPanel({
  item,
  providers,
  loadingProviders,
  loadingDetail,
  detailRec,
  isSaved,
  onSave,
  onOpenDetail,
}: {
  item: SearchResult;
  providers: ProviderInfo[];
  loadingProviders: boolean;
  loadingDetail: boolean;
  detailRec: Recommendation | null;
  isSaved: boolean;
  onSave: () => void;
  onOpenDetail: () => void;
}) {
  return (
    <div
      className="mx-5 mt-2 p-4 rounded-lg space-y-3"
      style={{ background: "var(--surface)" }}
      aria-label={`${item.title} 상세 액션`}
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
                  aria-label={`${p.name}에서 ${item.title} 보기 (새 탭)`}
                  onClick={() =>
                    track("search_ott_clicked", {
                      provider: p.name,
                      tmdb_id: item.id,
                    })
                  }
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg active:scale-95 transition-transform min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
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

      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={isSaved}
          aria-label={isSaved ? `${item.title} 저장됨` : `${item.title} 저장하기`}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg active:scale-[0.98] transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          style={{
            background: isSaved ? "var(--surface-raised)" : "var(--accent-dim)",
            color: isSaved ? "var(--text-muted)" : "var(--accent)",
          }}
        >
          <IconSave
            size={16}
            color={isSaved ? "var(--text-muted)" : "var(--accent)"}
            filled={isSaved}
          />
          {isSaved ? "저장됨" : "저장하기"}
        </button>
        <button
          onClick={onOpenDetail}
          disabled={loadingDetail || !detailRec}
          aria-label={`${item.title} 상세보기`}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-lg active:scale-[0.98] transition-all min-h-[44px] disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          style={{
            background: "var(--surface-raised)",
            color: "var(--text-secondary)",
          }}
        >
          상세
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="square"
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
