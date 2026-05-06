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

import { Fragment, useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { IconStar, IconSave } from "@/components/Icons";
import PosterFallback from "@/components/PosterFallback";
import { getOTTLink, getOTTIcon } from "@/lib/ott-links";
import { addSaved, removeSaved } from "@/lib/store";
import { track } from "@/lib/analytics";
import { shareRecommendation } from "@/lib/share";
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
  /**
   * 위임 J #3 — 외부에서 sheet open 과 함께 자동 검색을 트리거할 때 사용.
   * DetailSheet Cast 클릭 → 그 사람 이름으로 즉시 검색 결과 표시.
   */
  initialQuery?: string;
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
  initialQuery,
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

  // 위임 J #2 — Person 카드 클릭 시 그 사람 작품 펼침 패널.
  // - selectedPerson: 현재 펼쳐진 인물. null 이면 작품 패널 미노출.
  // - personWorks: TMDB /person/{id}/combined_credits 에서 popularity desc top 10.
  // - personWorksLoading/Err: 로딩/오류 상태.
  // 같은 카드 다시 누르면 펼침 닫음 (toggle).
  const [selectedPerson, setSelectedPerson] = useState<PersonResult | null>(null);
  const [personWorks, setPersonWorks] = useState<SearchResult[]>([]);
  const [personWorksLoading, setPersonWorksLoading] = useState(false);
  const [personWorksError, setPersonWorksError] = useState(false);

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
    // 위임 J #2 — 검색어 변경 시 인물 펼침 패널도 리셋
    setSelectedPerson(null);
    setPersonWorks([]);

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

  // 위임 J #3 — initialQuery 가 들어오면 sheet 가 보일 때 자동 검색 트리거.
  // initialQuery 변경 또는 show=true 전이 시 발동. 빈 문자열은 무시.
  // selectedPerson/work 등 stale 잔해 초기화.
  // setState 는 microtask 로 미뤄 react-hooks/set-state-in-effect 규칙 준수.
  useEffect(() => {
    if (!show) return;
    if (!initialQuery || initialQuery.trim().length === 0) return;
    const q = initialQuery.trim();
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setQuery(q);
      setSelectedWork(null);
      setProviders([]);
      setDetailRec(null);
      setSelectedPerson(null);
      setPersonWorks([]);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      void search(q);
    });
    return () => {
      cancelled = true;
    };
    // search 는 useCallback 으로 안정적. q 만 바뀌면 재실행.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, initialQuery]);

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

  /**
   * 위임 J #2 — Person 카드 클릭 시 그 사람의 작품 리스트 토글.
   *
   * 같은 카드 다시 누르면 닫음. 다른 카드 누르면 갈아탐.
   * `/api/tmdb/person-works?id=X&dept=Directing|Acting` 호출 → SearchResult[] 형태로 매핑.
   * 캐싱: 직전 응답 기억 X (단순 fetch). 사용자가 다른 인물 본 뒤 돌아오면 다시 fetch.
   */
  const handleSelectPerson = async (person: PersonResult) => {
    if (selectedPerson?.id === person.id) {
      setSelectedPerson(null);
      setPersonWorks([]);
      setPersonWorksError(false);
      // 인물 panel 닫을 때 nested 작품 선택도 정리
      setSelectedWork(null);
      setProviders([]);
      setDetailRec(null);
      return;
    }
    // 새 인물로 갈아탈 때 — 이전 작품 선택도 정리 (이전 인물의 nested 작품이거나
    // works 카로셀에서 선택한 작품이거나 모두 시각 혼선 회피)
    setSelectedWork(null);
    setProviders([]);
    setDetailRec(null);

    setSelectedPerson(person);
    setPersonWorks([]);
    setPersonWorksLoading(true);
    setPersonWorksError(false);
    track("search_person_selected", {
      person_id: person.id,
      name: person.name,
      dept: person.knownForDept,
    });
    try {
      const dept =
        person.knownForDept === "Directing" ? "Directing" : "Acting";
      const res = await fetch(
        `/api/tmdb/person-works?id=${person.id}&dept=${dept}`,
      );
      if (!res.ok) {
        throw new Error(`person-works failed (${res.status})`);
      }
      const works = (await res.json()) as SearchResult[];
      setPersonWorks(Array.isArray(works) ? works.slice(0, 10) : []);
    } catch {
      setPersonWorksError(true);
      setPersonWorks([]);
    } finally {
      setPersonWorksLoading(false);
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
    // toggle: 이미 저장된 상태면 해제, 아니면 저장. DetailSheet save 동선과 동일 — toast undo 포함.
    const buildRec = (): Recommendation =>
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

    if (savedIds.has(item.id)) {
      removeSaved(item.id);
      setSavedIds((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
      track("card_unsaved", { tmdb_id: item.id, source: "search_panel" });
      toast.show("remove", {
        ctx: { title: item.title },
        onAction: () => {
          const rec = buildRec();
          addSaved(rec);
          setSavedIds((s) => new Set(s).add(item.id));
        },
      });
      return;
    }

    const rec = buildRec();
    addSaved(rec);
    setSavedIds((s) => new Set(s).add(item.id));
    track("search_item_saved", { tmdb_id: item.id, title: item.title });
    toast.show("save", {
      ctx: { title: item.title },
      onAction: () => {
        removeSaved(item.id);
        setSavedIds((s) => {
          const n = new Set(s);
          n.delete(item.id);
          return n;
        });
      },
    });
  };

  // 위임 S (2026-05-02) — ESC 키로 선택 패널 닫기 (a11y 보강).
  // dim 클릭 dismiss 와 동등 동선. 선택이 있을 때만 ESC 처리, 없으면 sheet 자체는 손대지 않음
  // (sheet 닫기는 부모 onClose 가 별도로 처리). selectedWork || selectedPerson 둘 다 nullify.
  // capture phase 사용 X — sheet body 의 자연스러운 키 이벤트 흐름.
  useEffect(() => {
    if (!show) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (!selectedWork && !selectedPerson) return;
      e.preventDefault();
      e.stopPropagation();
      setSelectedWork(null);
      setProviders([]);
      setDetailRec(null);
      setSelectedPerson(null);
      setPersonWorks([]);
      setPersonWorksError(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [show, selectedWork, selectedPerson]);

  // 위임 P #1 (2026-05-02) — 옵션 A: sheet pop (slide-up) 진입 애니메이션 제거.
  // /search 라우트 진입 시 탭 전환 슬라이드와 sheet pop 이 중첩되어 부자연스럽다는
  // 사용자 직접 테스트 피드백. Discover 상단 search 진입에도 즉시 표시 (일관).
  //
  // useDetailSheet 은 sheetY 100→0 (rAF 후 0) 으로 진입 transition 을 그리는데,
  // 첫 paint 동안만 transform 0%/no-transition 으로 강제해 슬라이드 업을 무력화.
  // 이후 paint 부터는 일반 동작 — 사용자 드래그 닫기 보존.
  //
  // 위임 R #2 (2026-05-02) — close (slide-down) 애니메이션도 제거.
  // 사용자 직접 테스트: open immediate / close 슬라이드 잔존 → 비대칭. 둘 다 즉시.
  // 구현: animating && sheetY === 100 (close 단계) 일 때 transition=none + 즉시 unmount.
  // 드래그 닫기는 detailY 가 점진적으로 변하므로 자연 동작이 유지됨 (animating=false 분기).
  // hooks 는 early return(!show) 위에 위치해야 하므로 여기 선언.
  // setState 는 항상 비동기 콜백 안에서만 호출 (react-hooks/set-state-in-effect 준수).
  const [hasPainted, setHasPainted] = useState(false);
  useEffect(() => {
    if (show && !hasPainted) {
      const id = requestAnimationFrame(() => setHasPainted(true));
      return () => cancelAnimationFrame(id);
    }
    if (!show && hasPainted) {
      // microtask 로 setState 미뤄 effect body 직접 호출 회피.
      let cancelled = false;
      Promise.resolve().then(() => {
        if (!cancelled) setHasPainted(false);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [show, hasPainted]);

  if (!show) return null;

  const uiState = resolveSearchUiState({
    query,
    isFetching,
    hasError,
    data,
  });

  const groups = data ? buildCategoryGroups(data) : [];

  // 위임 R #2 — close (sheetY 100 도달) 단계에서는 transition=none 으로 즉시 위치 이동.
  // animating=true && sheetY===100 = 닫기 명령. 드래그 닫기는 animating=false 라 영향 X.
  const isClosing = hasPainted && animating && sheetY >= 100;
  const sheetTransform = hasPainted ? `translateY(${sheetY}%)` : "translateY(0)";
  const sheetTransition =
    hasPainted && animating && !isClosing
      ? "transform 0.3s cubic-bezier(0.34, 1.3, 0.64, 1)"
      : "none";
  const backdropOpacity = hasPainted ? 1 - sheetY / 100 : 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background: "var(--bg-overlay-heavy)",
          opacity: backdropOpacity,
        }}
        onClick={onClose}
      />
      {/* sheet — full height, 키보드에 가려지지 않음 */}
      <div
        className="relative w-full max-w-lg mx-auto flex flex-col bg-surface-raised"
        style={{
          height: "100dvh",
          borderRadius: 0,
          transform: sheetTransform,
          transition: sheetTransition,
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
            // D7 / Round 3 v2 — SR-02 "맞는" → "겹치는", SR-03 행동 가이드 추가
            <div className="flex flex-col items-center justify-center px-8 py-12 gap-4 text-center">
              <Illust
                name="noResults"
                style="editorial"
                size="lg"
                aria-label="검색 결과 없음"
              />
              <div>
                <p className="font-display text-lg">
                  &quot;{query.trim()}&quot;와 겹치는 게 없어요
                </p>
                <p
                  className="text-sm mt-1.5 leading-relaxed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  단어를 조금 바꿔 보세요.
                  <br />
                  <span style={{ color: "var(--accent)" }}>
                    감독 이름이나 분위기
                  </span>
                  도 좋아요
                </p>
              </div>
            </div>
          )}

          {uiState === "ok" && data && (
            // 위임 Q (2026-05-02) — 작품/인물 선택 시 floating panel + scoped dim 패턴.
            // 사용자 피드백: "정보 섹션 레이아웃이 선택한 작품 밑으로 공중에 띄워주고,
            // 후방은 반투명 레이아웃으로 덮으면 직관적일것같아요."
            //
            // 채택: Inline panel + per-section dim (옵션 B 강화).
            //   - 선택된 항목이 속한 group section 바로 아래에 패널을 inline 렌더 →
            //     "이 카드 → 이 정보" 시각 인접성 자연 확보 (좌표 측정 X, 가로 스크롤 호환)
            //   - 비활성 그룹에 dim overlay (per-section scope) → 후방 반투명 덮음
            //   - dim 클릭 시 선택 해제 (popover-style dismiss)
            //   - 진입 모션: panel fadeIn + 8px translateY → 0 (200ms, --ease-detail-morph)
            //   - prefers-reduced-motion 은 globals.css 전역 규칙으로 즉시 적용됨
            (() => {
              const hasSelection = !!(selectedWork || selectedPerson);
              // 우선순위: selectedPerson 활성 시 인물 panel 그룹 → 인물 panel 안에서 작품 선택해도
              // 인물 panel 자체는 활성 유지. selectedWork 만 있을 때만 "works" 그룹 활성.
              // 이 우선순위 변경으로 인물 panel 내부에 SelectedWorkPanel 을 nested 표시 가능.
              const activeGroupKey: "works" | "directors" | "actors" | null =
                selectedPerson
                  ? selectedPerson.knownForDept === "Directing"
                    ? "directors"
                    : "actors"
                  : selectedWork
                    ? "works"
                    : null;
              const dismissSelection = () => {
                setSelectedWork(null);
                setProviders([]);
                setDetailRec(null);
                setSelectedPerson(null);
                setPersonWorks([]);
                setPersonWorksError(false);
              };
              return (
                <div className="space-y-4 pt-2 relative min-h-full">
                  {groups.map((g) => {
                    const isActive = g.key === activeGroupKey;
                    const isDimmed = hasSelection && !isActive;
                    return (
                      <section
                        key={g.key}
                        aria-label={`${g.label} 검색 결과 ${g.count}건`}
                        className="relative"
                        style={{
                          // 활성 섹션은 dim 위로, 비활성은 dim 가려짐
                          zIndex: isActive ? 2 : 0,
                        }}
                      >
                        {/* 2026-05-02 사용자 직접 테스트 D-2 #3:
                            검색 결과 좌우 padding px-5 (20px) → px-6 (24px = --space-lg).
                            사용자가 "왼쪽 margin이 없어서 화면에 너무 붙어있는 느낌"이라
                            한 단계 더 여유. SelectedWorkPanel mx-6 와 정합. */}
                        <div
                          className="flex items-baseline justify-between px-6 pt-2 pb-2"
                          style={{
                            opacity: isDimmed ? 0.35 : 1,
                            transition: "opacity 180ms var(--ease-detail-morph)",
                          }}
                        >
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

                        <div
                          style={{
                            opacity: isDimmed ? 0.35 : 1,
                            transition:
                              "opacity 180ms var(--ease-detail-morph)",
                            // 비활성 섹션은 클릭 차단 — dim 클릭으로만 닫히게
                            pointerEvents: isDimmed ? "none" : "auto",
                          }}
                          aria-hidden={isDimmed || undefined}
                        >
                          {g.key === "works" && (
                            <WorksCarousel
                              items={data.works}
                              selectedId={selectedWork?.id ?? null}
                              onSelect={handleSelectWork}
                            />
                          )}

                          {g.key === "directors" && (
                            <PeopleCarousel
                              items={data.directors}
                              selectedId={selectedPerson?.id ?? null}
                              onSelect={handleSelectPerson}
                            />
                          )}
                          {g.key === "actors" && (
                            <PeopleCarousel
                              items={data.actors}
                              selectedId={selectedPerson?.id ?? null}
                              onSelect={handleSelectPerson}
                            />
                          )}
                        </div>

                        {/* 위임 Q — 활성 그룹 바로 아래에 floating panel inline */}
                        {isActive && selectedWork && g.key === "works" && (
                          <div className="search-floating-panel">
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
                          </div>
                        )}
                        {isActive && selectedPerson && g.key !== "works" && (
                          <div className="search-floating-panel">
                            <SelectedPersonPanel
                              person={selectedPerson}
                              works={personWorks}
                              loading={personWorksLoading}
                              error={personWorksError}
                              selectedWorkId={selectedWork?.id ?? null}
                              onSelectWork={(item) => {
                                // 인물 panel 유지 + 작품 panel (SelectedWorkPanel) 을 nested 표시.
                                // handleSelectWork 가 selectedWork 세팅 + provider/detail fetch 처리.
                                // 사용자는 OTT/save 카드 (SelectedWorkPanel) 를 먼저 보고, OPEN 버튼으로 detail 진입.
                                // (track 호출은 SelectedPersonPanel 내부에서 이미 처리)
                                void handleSelectWork(item);
                              }}
                              nestedWorkPanel={
                                selectedWork ? (
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
                                ) : null
                              }
                            />
                          </div>
                        )}
                      </section>
                    );
                  })}

                  {/* dim overlay — 활성 섹션 외부 클릭 시 선택 해제.
                      활성 섹션은 z-index 2, dim 은 z-index 1, 비활성은 z-index 0.
                      dim 은 overflow-y-auto 컨테이너 안에서 absolute inset-0 으로 덮어
                      세로 스크롤 시에도 모든 비활성 콘텐츠를 덮음. */}
                  {hasSelection && (
                    <button
                      type="button"
                      onClick={dismissSelection}
                      aria-label="선택 해제"
                      className="search-dim-overlay"
                    />
                  )}

                  <style>{`
                    /* panel 을 layout flow 안에 배치 — scroll body 가 panel 높이를 정상 인식.
                       활성 section 자체 zIndex:2 stacking context 안 → dim(zIndex:1) 위 자동 표시.
                       다음 section 을 밀게 되지만 dim 이 그 영역을 가리므로 시각적으로 동일.
                       이 결정의 효과: 인물 panel 안 nested SelectedWorkPanel 이 길어져도 scroll 로 끝까지 접근 가능 — absolute 일 때는 scroll body 가 panel 높이를 모르고 잘렸음. */
                    .search-floating-panel {
                      position: relative;
                      animation: searchPanelEnter 200ms var(--ease-detail-morph);
                    }
                    .search-dim-overlay {
                      position: absolute;
                      inset: 0;
                      z-index: 1;
                      background: var(--bg-overlay);
                      border: 0;
                      padding: 0;
                      cursor: pointer;
                      animation: searchDimEnter 180ms var(--ease-detail-morph);
                    }
                    @keyframes searchPanelEnter {
                      from { opacity: 0; transform: translateY(8px); }
                      to   { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes searchDimEnter {
                      from { opacity: 0; }
                      to   { opacity: 1; }
                    }
                  `}</style>
                </div>
              );
            })()
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
          /* save / share — Discover/Saved 의 DetailSheet 와 동일 동선.
             save: addSaved/removeSaved + savedIds state 동기화 + toast.
             share: lib/share.ts shareRecommendation (navigator.share 또는 clipboard 폴백). */
          isSaved={savedIds.has(detailRec.tmdbId)}
          onToggleSave={(rec) => {
            const id = rec.tmdbId;
            if (savedIds.has(id)) {
              removeSaved(id);
              setSavedIds((s) => {
                const n = new Set(s);
                n.delete(id);
                return n;
              });
              track("card_unsaved", { tmdb_id: id, source: "search_detail" });
              toast.show("remove", {
                ctx: { title: rec.title },
                onAction: () => {
                  addSaved(rec);
                  setSavedIds((s) => new Set(s).add(id));
                },
              });
            } else {
              addSaved(rec);
              setSavedIds((s) => new Set(s).add(id));
              track("card_saved", {
                tmdb_id: id,
                title: rec.title,
                source: "search_detail",
              });
              toast.show("save", {
                ctx: { title: rec.title },
                onAction: () => {
                  removeSaved(id);
                  setSavedIds((s) => {
                    const n = new Set(s);
                    n.delete(id);
                    return n;
                  });
                },
              });
            }
          }}
          onShare={(rec) => shareRecommendation(rec)}
          /* 위임 P #4 (2026-05-02) — SearchSheet 내부 DetailSheet 의 Cast 클릭 회귀 수정.
             기존: onSearchPerson 미전달 → CastItem 이 div 로 폴백 → 클릭 무반응.
             수정: 같은 SearchSheet 의 검색창에 인물 이름을 자동 입력 + 즉시 검색.
             동선: DetailSheet 닫고 → applyQuery(name) 으로 검색 트리거. */
          onSearchPerson={(name) => {
            track("detail_cast_clicked", { name, role: "" });
            detail.closeDetail();
            applyQuery(name);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// D10b — Idle 컨텐츠 (Recent / Trending / Voice listening)
// 2026-05-02 사용자 직접 테스트 D-2 #2: Browse 카테고리(BROWSE_CATEGORIES) 영역 철회.
// 디자인은 좋았으나 기능상 불필요하다는 사용자 피드백으로 제거.
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

      {recents.length === 0 && trending.length === 0 && (
        <div className="px-5 pt-4 text-sm text-muted">
          작품, 감독, 배우 이름으로 검색해보세요
        </div>
      )}
    </div>
  );
}

function SectionHead({ label }: { label: string }) {
  // 2026-05-02 amber 누적 분배 정책: ChapterMark 첫 1개만 amber, 나머지는 primary.
  // SearchSheet TRENDING/RECENT 헤더는 보조 위계라 색→가중치(semibold)로 위계 표현.
  return (
    <div className="px-5 pt-4 pb-2">
      <h3
        className="text-xs font-data uppercase"
        style={{
          color: "var(--text-primary)",
          fontWeight: 600,
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
        &ldquo;토요일 느릿한 한국 영화&rdquo; 처럼 말해 보세요
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
    // 2026-05-02 사용자 직접 테스트 D-2 #3: px-5 → px-6 (24px) — 첫 카드 좌측 여유.
    // scroll-snap-align: start 가 padding-left 를 무시하고 첫 카드를 left=0 에 붙이는
    // 문제(브라우저 기본 동작)를 scrollPaddingLeft 24px 로 해결 — snap 기준점을 24px 안쪽으로.
    <div
      className="flex gap-3 px-6 pb-1 overflow-x-auto"
      style={{
        scrollSnapType: "x mandatory",
        scrollPaddingLeft: 24,
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
                <PosterFallback title={item.title} size="sm" />
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
                      <IconStar size={9} color="var(--text-secondary)" />
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

function PeopleCarousel({
  items,
  selectedId,
  onSelect,
}: {
  items: PersonResult[];
  selectedId: number | null;
  onSelect: (person: PersonResult) => void;
}) {
  return (
    // 2026-05-02 사용자 직접 테스트 D-2 #3: px-5 → px-6 — WorksCarousel 와 동일.
    // scrollPaddingLeft 24px 로 snap 기준점을 padding 안쪽으로 조정 (첫 카드 left=0 방지).
    <div
      className="flex gap-3 px-6 pb-1 overflow-x-auto"
      style={{
        scrollSnapType: "x mandatory",
        scrollPaddingLeft: 24,
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {items.map((p) => (
        <PersonCard
          key={p.id}
          person={p}
          isSelected={selectedId === p.id}
          onSelect={() => onSelect(p)}
        />
      ))}
    </div>
  );
}

function PersonCard({
  person,
  isSelected,
  onSelect,
}: {
  person: PersonResult;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const knownForText =
    person.knownFor.length > 0
      ? person.knownFor.map((k) => k.title).join(", ")
      : null;
  return (
    // 위임 J #2 — 카드 자체가 button. 클릭 시 작품 패널 토글.
    // isSelected 시 amber 1.5px 보더로 활성 표현 (WorksCarousel 와 동일 패턴).
    // amber 누적 정책: 카로셀 카드 보더는 일시적/단일 활성이므로 ≤4 카운트 영향 미미.
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={`${person.name} ${
        person.knownForDept === "Directing" ? "감독" : "배우"
      } 작품 보기`}
      className="shrink-0 flex flex-col items-center text-center active:scale-[0.97] transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
      style={{ width: 96, scrollSnapAlign: "start" }}
    >
      <div
        className="rounded-full overflow-hidden"
        style={{
          width: 72,
          height: 72,
          background: "var(--surface)",
          border: isSelected
            ? "1.5px solid var(--accent)"
            : "1px solid var(--border)",
          transition: "border-color 150ms",
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
    </button>
  );
}

/**
 * SelectedPersonPanel — 선택된 인물의 작품 리스트 (위임 J #2).
 *
 * 구조: 인물 이름/역할(감독·배우) + 작품 그리드 (3열, 포스터 + title + year).
 * 작품 카드 클릭 → 호출처가 handleSelectWork 로 전이 (그 작품 상세 패널 띄움).
 *
 * 안티-슬랍 #3 균일 그리드 우려: 3열 grid 사용하지만 SearchSheet 내부 보조 패널이라
 * 화면 전체 비율로 보면 비대칭 (위 카로셀, 아래 그리드). 이 정도는 수용.
 */
function SelectedPersonPanel({
  person,
  works,
  loading,
  error,
  selectedWorkId,
  onSelectWork,
  nestedWorkPanel,
}: {
  person: PersonResult;
  works: SearchResult[];
  loading: boolean;
  error: boolean;
  /** 현재 선택된 작품 id — 카드에 amber border highlight 로 표시. */
  selectedWorkId?: number | null;
  onSelectWork: (item: SearchResult) => void;
  /** 선택된 작품의 SelectedWorkPanel — 작품 그리드 아래 nested 렌더. 호출처가 인스턴스 생성. */
  nestedWorkPanel?: React.ReactNode;
}) {
  const roleLabel =
    person.knownForDept === "Directing" ? "감독" : "배우";
  return (
    // 위임 S 옵션 B-1: SelectedWorkPanel 와 동일한 시각 연결 단서.
    // border-top amber-border-light → 선택 인물 카드의 amber 1.5px 외곽선과 색 계열 동기.
    <div
      className="mx-6 mt-2 p-4 rounded-lg space-y-3"
      style={{
        background: "var(--surface)",
        borderTop: "1px solid var(--accent-border-light)",
        borderRight: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        borderLeft: "1px solid var(--border)",
      }}
      aria-label={`${person.name} ${roleLabel} 작품 목록`}
    >
      <div className="flex items-baseline justify-between">
        <div>
          <div
            className="text-[11px] font-data uppercase"
            style={{
              color: "var(--text-muted)",
              letterSpacing: "0.12em",
            }}
          >
            {roleLabel}
          </div>
          <div
            className="text-base font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {person.name}
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <NeqSpinner size="sm" label="작품 불러오는 중" />
        </div>
      )}

      {!loading && error && (
        <div
          className="text-xs py-3"
          style={{ color: "var(--text-secondary)" }}
        >
          작품 정보를 불러오지 못했어요
        </div>
      )}

      {!loading && !error && works.length === 0 && (
        <div
          className="text-xs py-3"
          style={{ color: "var(--text-muted)" }}
        >
          공개된 작품이 없어요
        </div>
      )}

      {!loading && !error && works.length > 0 && (() => {
        // works 를 3개씩 row 로 분할 → 선택 작품이 속한 row 바로 다음에 nestedWorkPanel 을
        // grid-column: 1 / -1 (full row span) 으로 끼워 넣음.
        // 의도: WorksCarousel 처럼 "선택한 카드 바로 아래" 시각 인접성. 그리드 끝에 떨어지지 않음.
        const ROW_SIZE = 3;
        const selectedIdx = selectedWorkId
          ? works.findIndex((w) => w.id === selectedWorkId)
          : -1;
        const selectedRowIdx = selectedIdx >= 0 ? Math.floor(selectedIdx / ROW_SIZE) : -1;
        const rows: SearchResult[][] = [];
        for (let i = 0; i < works.length; i += ROW_SIZE) {
          rows.push(works.slice(i, i + ROW_SIZE));
        }
        return (
          <div className="grid grid-cols-3 gap-2.5">
            {rows.map((row, rowIdx) => (
              <Fragment key={`row-${rowIdx}`}>
                {row.map((w) => {
                  const isSelected = selectedWorkId === w.id;
                  return (
                    <button
                      key={`${w.id}-${w.mediaType}`}
                      type="button"
                      onClick={() => {
                        track("search_person_work_clicked", {
                          person_id: person.id,
                          tmdb_id: w.id,
                        });
                        onSelectWork(w);
                      }}
                      aria-label={`${w.title} 상세 보기${isSelected ? " (선택됨)" : ""}`}
                      aria-current={isSelected ? "true" : undefined}
                      className="text-left active:scale-[0.97] transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
                      style={{
                        // 선택 작품 있을 때 비선택 카드 dim → 검색 시 dim overlay 와 동일 시각 위계.
                        // 선택 + panel 의 시각 무게 살리고, 비선택 클릭은 그대로 가능 (갈아탐).
                        opacity: selectedWorkId && !isSelected ? 0.35 : 1,
                        transition: "opacity 180ms var(--ease-detail-morph)",
                      }}
                    >
                      <div
                        className="relative rounded-md overflow-hidden"
                        style={{
                          aspectRatio: "2 / 3",
                          background: "var(--surface-raised)",
                          // 선택 작품: amber 1.5px border + 약한 amber-dim 외곽 → "이 작품의 카드가 아래 떠있음" 단서.
                          border: isSelected
                            ? "1.5px solid var(--accent)"
                            : "1px solid var(--border)",
                          boxShadow: isSelected
                            ? "0 0 0 3px var(--accent-dim)"
                            : "none",
                          transition:
                            "border-color 180ms var(--ease-detail-morph), box-shadow 180ms var(--ease-detail-morph)",
                        }}
                      >
                        {w.posterUrl ? (
                          <Image
                            src={w.posterUrl}
                            alt={w.title}
                            fill
                            sizes="100px"
                            className="object-cover"
                          />
                        ) : (
                          <PosterFallback title={w.title} size="sm" />
                        )}
                      </div>
                      <div
                        className="mt-1 text-[11px] font-medium leading-tight line-clamp-2"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {w.title}
                      </div>
                      {w.year && (
                        <div
                          className="font-data text-[10px] mt-0.5"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {w.year}
                        </div>
                      )}
                    </button>
                  );
                })}
                {/* 선택 작품의 row 바로 뒤에 nestedWorkPanel 을 full-row 로 끼움.
                    -mx-4 로 인물 panel 의 p-4 padding 까지 확장 → panel 자체가 인물 panel edge 까지 차지. */}
                {rowIdx === selectedRowIdx && nestedWorkPanel && (
                  <div style={{ gridColumn: "1 / -1" }} className="-mx-4">
                    {nestedWorkPanel}
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        );
      })()}
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
    // 2026-05-02 사용자 직접 테스트 D-2 #3: mx-5 → mx-6 — 카로셀 px-6 와 정합
    // 위임 S 옵션 B-1: 카드 ↔ panel 시각 연결 단서.
    //   - border-top: 1px var(--accent-border-light) → 선택 카드의 amber 1.5px 보더 색 계열과 동기.
    //     선택 카드 외곽선이 amber → 그 아래 panel 상단도 같은 계열의 hairline → "이 카드 → 이 정보" 인지.
    //   - 나머지 3면은 var(--border) 로 유지 (subtle, 시각 무게중심을 상단으로).
    //   - DESIGN.md anti-slop 정책: borderLeft accent 인용 패턴 외 신규 X. border-top 은 hairline 1px
    //     으로 장식이 아닌 연결 단서. amber-border-light(15% alpha) 라 강한 amber 면적 누적 X.
    <div
      className="mx-6 mt-2 p-4 rounded-lg space-y-3"
      style={{
        background: "var(--surface)",
        borderTop: "1px solid var(--accent-border-light)",
        borderRight: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        borderLeft: "1px solid var(--border)",
      }}
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
          aria-label={isSaved ? `${item.title} 저장 해제` : `${item.title} 저장하기`}
          aria-pressed={isSaved}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg active:scale-[0.98] transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          style={
            // DetailSheet save 버튼과 동일 패턴 — 시각·동작 일관.
            isSaved
              ? {
                  background: "var(--surface-raised)",
                  border: "1px solid var(--accent-border)",
                  color: "var(--accent)",
                }
              : {
                  background: "var(--accent)",
                  border: "1px solid var(--accent)",
                  color: "var(--bg)",
                }
          }
        >
          <IconSave
            size={16}
            color={isSaved ? "var(--accent)" : "var(--bg)"}
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
