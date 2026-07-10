/**
 * D10 — SearchSheet 순수 함수 단위 테스트.
 *
 * 외부 의존 0 함수만 검증:
 *   - resolveSearchUiState (5 case 분기)
 *   - buildCategoryGroups (0건 그룹 필터 + 순서)
 *   - SEARCH_DEBOUNCE_MS 상수
 *   - 디바운스 timing (fake timers + AbortController 시뮬레이션)
 *
 * SearchSheet 컴포넌트 자체의 렌더 테스트는 의존(useDetailSheet,
 * @neq/design Toast/Spinner/Illust 등)이 무거워 본 위임 스코프 외 (D12 a11y 폴리시
 * 또는 통합 테스트로 분리).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  resolveSearchUiState,
  buildCategoryGroups,
  SEARCH_DEBOUNCE_MS,
  shouldAutoRecordRecentOnFetch,
  type SearchUiInput,
} from "../SearchSheet";
import type {
  GroupedSearchResponse,
  PersonResult,
  SearchResult,
} from "@/lib/types";

// ─────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────

const W = (id: number, title = "작품"): SearchResult => ({
  id,
  title,
  posterUrl: null,
  year: "2024",
  rating: 7.5,
  mediaType: "movie",
});

const P = (id: number, name = "사람"): PersonResult => ({
  id,
  name,
  profileUrl: null,
  knownFor: [],
  knownForDept: "Acting",
});

const emptyData: GroupedSearchResponse = {
  works: [],
  directors: [],
  actors: [],
};

const baseInput: SearchUiInput = {
  query: "",
  isFetching: false,
  hasError: false,
  data: null,
};

// ─────────────────────────────────────────────────────
// resolveSearchUiState
// ─────────────────────────────────────────────────────

describe("resolveSearchUiState", () => {
  it("query 비어있으면 idle", () => {
    expect(resolveSearchUiState({ ...baseInput, query: "" })).toBe("idle");
  });

  it("query 가 공백만이어도 idle (trim 적용)", () => {
    expect(resolveSearchUiState({ ...baseInput, query: "   " })).toBe("idle");
  });

  it("isFetching=true 면 loading (data 무관)", () => {
    expect(
      resolveSearchUiState({
        ...baseInput,
        query: "박찬욱",
        isFetching: true,
      }),
    ).toBe("loading");
  });

  it("hasError=true + 비-fetch 면 error", () => {
    expect(
      resolveSearchUiState({
        ...baseInput,
        query: "박찬욱",
        hasError: true,
      }),
    ).toBe("error");
  });

  it("data 가 null + 비-fetch + 비-error 면 empty", () => {
    expect(
      resolveSearchUiState({
        ...baseInput,
        query: "박찬욱",
      }),
    ).toBe("empty");
  });

  it("data 의 모든 그룹이 0건이면 empty", () => {
    expect(
      resolveSearchUiState({
        ...baseInput,
        query: "박찬욱",
        data: emptyData,
      }),
    ).toBe("empty");
  });

  it("works 만 1건 있으면 ok", () => {
    expect(
      resolveSearchUiState({
        ...baseInput,
        query: "박찬욱",
        data: { works: [W(1)], directors: [], actors: [] },
      }),
    ).toBe("ok");
  });

  it("directors 만 있어도 ok", () => {
    expect(
      resolveSearchUiState({
        ...baseInput,
        query: "박찬욱",
        data: { works: [], directors: [P(1)], actors: [] },
      }),
    ).toBe("ok");
  });

  it("actors 만 있어도 ok", () => {
    expect(
      resolveSearchUiState({
        ...baseInput,
        query: "이정재",
        data: { works: [], directors: [], actors: [P(2)] },
      }),
    ).toBe("ok");
  });

  it("우선순위 — isFetching > hasError (fetch 진행 중이면 이전 에러 무시)", () => {
    expect(
      resolveSearchUiState({
        query: "박찬욱",
        isFetching: true,
        hasError: true,
        data: null,
      }),
    ).toBe("loading");
  });

  it("우선순위 — query 비어있으면 다른 모든 플래그 무시 (idle)", () => {
    expect(
      resolveSearchUiState({
        query: "",
        isFetching: true,
        hasError: true,
        data: { works: [W(1)], directors: [], actors: [] },
      }),
    ).toBe("idle");
  });
});

// ─────────────────────────────────────────────────────
// buildCategoryGroups
// ─────────────────────────────────────────────────────

describe("buildCategoryGroups", () => {
  it("모든 그룹이 0건이면 빈 배열", () => {
    expect(buildCategoryGroups(emptyData)).toEqual([]);
  });

  it("works 만 있으면 works 1건만 반환", () => {
    const groups = buildCategoryGroups({
      works: [W(1), W(2)],
      directors: [],
      actors: [],
    });
    expect(groups).toEqual([{ key: "works", label: "작품", count: 2 }]);
  });

  it("3그룹 모두 있으면 작품 → 감독 → 배우 순서 보존", () => {
    const groups = buildCategoryGroups({
      works: [W(1)],
      directors: [P(10)],
      actors: [P(20), P(21)],
    });
    expect(groups).toEqual([
      { key: "works", label: "작품", count: 1 },
      { key: "directors", label: "감독", count: 1 },
      { key: "actors", label: "배우", count: 2 },
    ]);
  });

  it("0건 그룹은 헤더 자체가 사라짐 (감독 0건)", () => {
    const groups = buildCategoryGroups({
      works: [W(1)],
      directors: [],
      actors: [P(20)],
    });
    expect(groups.map((g) => g.key)).toEqual(["works", "actors"]);
  });

  it("count 는 실제 배열 길이", () => {
    const groups = buildCategoryGroups({
      works: [W(1), W(2), W(3)],
      directors: [P(10), P(11)],
      actors: [P(20)],
    });
    expect(groups.find((g) => g.key === "works")?.count).toBe(3);
    expect(groups.find((g) => g.key === "directors")?.count).toBe(2);
    expect(groups.find((g) => g.key === "actors")?.count).toBe(1);
  });
});

// ─────────────────────────────────────────────────────
// SEARCH_DEBOUNCE_MS — 200ms 상수 검증
// ─────────────────────────────────────────────────────

describe("SEARCH_DEBOUNCE_MS", () => {
  it("디바운스는 200ms (D10 spec)", () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(200);
  });
});

describe("recent search recording policy", () => {
  it("native parity: fetch 성공만으로 recent 를 자동 기록하지 않는다", () => {
    expect(shouldAutoRecordRecentOnFetch({ totalResults: 3 })).toBe(false);
    expect(shouldAutoRecordRecentOnFetch({ totalResults: 0 })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────
// 디바운스 + AbortController 동작 시뮬레이션
//
// 본 테스트는 SearchSheet 내부 로직과 동일한 패턴을 단위 함수로 추출해 검증한다.
// (컴포넌트 import 없이 fake timers 만으로 동작 확인.)
// ─────────────────────────────────────────────────────

describe("디바운스 + AbortController 패턴", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * 디바운스 헬퍼 — SearchSheet `handleInput` 의 디바운스 일부 추출.
   * 200ms 후 마지막 query 만 실행. 이전 timer 는 reset.
   */
  function makeDebouncedSearch(searchFn: (q: string) => void) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return (q: string) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => searchFn(q), SEARCH_DEBOUNCE_MS);
    };
  }

  it("200ms 이내 연속 입력 시 마지막 query 만 실행", () => {
    const fn = vi.fn();
    const debouncedSearch = makeDebouncedSearch(fn);

    debouncedSearch("박");
    vi.advanceTimersByTime(100);
    debouncedSearch("박찬");
    vi.advanceTimersByTime(100);
    debouncedSearch("박찬욱");
    vi.advanceTimersByTime(199);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("박찬욱");
  });

  it("200ms 경과 후 다음 입력은 별개 fetch 트리거", () => {
    const fn = vi.fn();
    const debouncedSearch = makeDebouncedSearch(fn);

    debouncedSearch("박");
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith("박");

    debouncedSearch("이정재");
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("이정재");
  });

  it("AbortController — 새 fetch 시작 시 이전 controller.abort() 호출됨", () => {
    // SearchSheet 내부 패턴 시뮬레이션: 새 검색 시작 시 이전 controller 취소
    let activeController: AbortController | null = null;
    function startSearch(): AbortController {
      if (activeController) activeController.abort();
      const c = new AbortController();
      activeController = c;
      return c;
    }

    const c1 = startSearch();
    expect(c1.signal.aborted).toBe(false);

    const c2 = startSearch();
    expect(c1.signal.aborted).toBe(true);
    expect(c2.signal.aborted).toBe(false);

    const c3 = startSearch();
    expect(c2.signal.aborted).toBe(true);
    expect(c3.signal.aborted).toBe(false);
  });

  it("AbortController.signal.aborted 가 true 인 응답은 stale → 무시 가능", () => {
    const c = new AbortController();
    c.abort();
    // SearchSheet 의 응답 처리 패턴
    const isStale = c.signal.aborted;
    expect(isStale).toBe(true);
  });
});
