"use client";

/**
 * SearchSheet — D10 grouped 카로셀 리뉴얼 (orchestrator).
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
 *
 * 2026-05-06 구조 분할 — search/ 하위로 sub-component 모듈화.
 *   - SearchInput.tsx       — input + voice + cancel
 *   - SearchEmpty.tsx       — Idle / Loading / Empty / Error 4 상태
 *   - SearchResults.tsx     — uiState=ok 카로셀 + dim/floating panel + (Works|People)Carousel
 *   - SelectedWorkPanel.tsx — 작품 선택 panel (OTT/Save/Detail)
 *   - SelectedPersonPanel.tsx — 인물 panel (작품 그리드 + nestedWorkPanel)
 * 본 파일은 state + debounce/abort fetch + DetailSheet 진입 + props 내림 만 담당.
 */

import { useState, useRef, useCallback, useEffect } from "react";
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
import { useToast } from "@neq/design";
import {
  resolveSearchUiState,
  buildCategoryGroups,
  SEARCH_DEBOUNCE_MS,
  type SearchUiState,
  type SearchUiInput,
  type CategoryGroup,
} from "@neq/core";
import SearchInput from "./search/SearchInput";
import {
  IdleContent,
  LoadingState,
  ErrorState,
  EmptyState,
  type TrendingItem,
} from "./search/SearchEmpty";
import SearchResults from "./search/SearchResults";
import { type ProviderInfo } from "./search/SelectedWorkPanel";

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

  const dismissSelection = () => {
    setSelectedWork(null);
    setProviders([]);
    setDetailRec(null);
    setSelectedPerson(null);
    setPersonWorks([]);
    setPersonWorksError(false);
  };

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
        <SearchInput
          ref={inputRef}
          query={query}
          voiceSupported={voiceSupported}
          listening={listening}
          onChange={handleInput}
          onClear={() => {
            handleInput("");
            inputRef.current?.focus();
          }}
          onMicClick={handleMicClick}
          onClose={onClose}
        />

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

          {uiState === "loading" && <LoadingState />}

          {uiState === "error" && <ErrorState onRetry={handleRetry} />}

          {uiState === "empty" && <EmptyState query={query} />}

          {uiState === "ok" && data && (
            <SearchResults
              data={data}
              groups={groups}
              selectedWork={selectedWork}
              selectedPerson={selectedPerson}
              providers={providers}
              loadingProviders={loadingProviders}
              loadingDetail={loadingDetail}
              detailRec={detailRec}
              personWorks={personWorks}
              personWorksLoading={personWorksLoading}
              personWorksError={personWorksError}
              savedIds={savedIds}
              onSelectWork={handleSelectWork}
              onSelectPerson={handleSelectPerson}
              onDismissSelection={dismissSelection}
              onSave={handleSave}
              onOpenDetail={() => {
                if (detailRec) detail.openDetail();
              }}
            />
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
          savedIds={savedIds}
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
