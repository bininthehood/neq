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
import { useDetailSheet } from "@/hooks/useDetailSheet";
import DetailSheet from "./DetailSheet";
import type {
  Recommendation,
  SearchResult,
  PersonResult,
  GroupedSearchResponse,
} from "@/lib/types";
import { Illust, Button, NeqSpinner, useToast } from "@neq/design";

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
// 순수 로직 — 단위 테스트 대상 (외부 의존 0)
// ─────────────────────────────────────────────────────

export type SearchUiState = "idle" | "loading" | "empty" | "error" | "ok";

export interface SearchUiInput {
  /** 사용자 입력 query (trim 안 된 raw) */
  query: string;
  /** fetch 진행 중 여부 */
  isFetching: boolean;
  /** 마지막 fetch 에러 */
  hasError: boolean;
  /** grouped 응답 (또는 null = 아직 응답 없음) */
  data: GroupedSearchResponse | null;
}

/**
 * 4 케이스 + idle 상태 분기 결정.
 *
 * 우선순위:
 *   1. query 비어있으면 → idle
 *   2. fetch 진행 중이면 → loading
 *   3. 에러 발생했으면 → error
 *   4. data 가 null (아직 응답 X) 또는 모든 그룹 0건 → empty
 *   5. 그 외 → ok
 */
export function resolveSearchUiState(input: SearchUiInput): SearchUiState {
  const trimmed = input.query.trim();
  if (trimmed.length === 0) return "idle";
  if (input.isFetching) return "loading";
  if (input.hasError) return "error";
  if (!input.data) return "empty";
  const total =
    input.data.works.length +
    input.data.directors.length +
    input.data.actors.length;
  if (total === 0) return "empty";
  return "ok";
}

/**
 * 카테고리별 그룹 정의. 0건 그룹은 호출자가 필터링.
 */
export interface CategoryGroup {
  key: "works" | "directors" | "actors";
  label: string;
  count: number;
}

/**
 * grouped 응답 → 카테고리 헤더 메타 (count > 0 그룹만).
 */
export function buildCategoryGroups(
  data: GroupedSearchResponse,
): CategoryGroup[] {
  const groups: CategoryGroup[] = [
    { key: "works", label: "작품", count: data.works.length },
    { key: "directors", label: "감독", count: data.directors.length },
    { key: "actors", label: "배우", count: data.actors.length },
  ];
  return groups.filter((g) => g.count > 0);
}

/** 디바운스 ms — UI/테스트 모두 동일 상수 사용. */
export const SEARCH_DEBOUNCE_MS = 200;

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
    };
  }, []);

  const handleRetry = () => {
    if (query.trim().length > 0) {
      void search(query);
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
              className="w-full px-4 py-3 pr-10 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors bg-surface border border-border rounded-lg text-foreground"
              style={{ fontSize: "16px" }}
            />
            {query.length > 0 && (
              <button
                onClick={() => {
                  handleInput("");
                  inputRef.current?.focus();
                }}
                aria-label="검색어 지우기"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full active:scale-90 transition-transform"
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
          </div>
          <button
            onClick={onClose}
            className="shrink-0 px-3 py-3 text-sm text-muted active:scale-95 transition-transform"
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
            <div className="px-5 pt-4 text-sm text-muted">
              작품, 감독, 배우 이름으로 검색해보세요
            </div>
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
            className="shrink-0 active:scale-[0.98] transition-transform"
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
                  onClick={() =>
                    track("search_ott_clicked", {
                      provider: p.name,
                      tmdb_id: item.id,
                    })
                  }
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

      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={isSaved}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg active:scale-[0.98] transition-all min-h-[44px]"
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
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-lg active:scale-[0.98] transition-all min-h-[44px] disabled:opacity-40"
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
