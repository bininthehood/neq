/**
 * recent-searches.ts 단위 테스트 — D10b
 *
 * 검증:
 *   - getRecentSearches: 비어있을 때 []
 *   - addRecentSearch: 신규 추가, dedupe (대소문자 무시), FIFO 최대 10
 *   - removeRecentSearch: 정규화 비교, 없는 항목 → no-op
 *   - clearRecentSearches: 전체 초기화
 *   - 정규화: trim 적용, 표시 case 보존
 *   - parse fallback: 잘못된 JSON / 형태 → []
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

async function loadModule() {
  return await import("../recent-searches");
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getRecentSearches (empty)", () => {
  it("LocalStorage 비어있으면 빈 배열 반환", async () => {
    const m = await loadModule();
    expect(m.getRecentSearches()).toEqual([]);
  });

  it("잘못된 JSON 이면 빈 배열 반환", async () => {
    localStorage.setItem("neq_recent_searches", "{not json{{");
    const m = await loadModule();
    expect(m.getRecentSearches()).toEqual([]);
  });

  it("배열이 아니면 빈 배열 반환", async () => {
    localStorage.setItem("neq_recent_searches", JSON.stringify({ a: 1 }));
    const m = await loadModule();
    expect(m.getRecentSearches()).toEqual([]);
  });
});

describe("addRecentSearch / getRecentSearches 라운드트립", () => {
  it("저장한 query 가 최신 순으로 반환된다", async () => {
    const m = await loadModule();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T00:00:00Z"));
    m.addRecentSearch("박찬욱");
    vi.advanceTimersByTime(1000);
    m.addRecentSearch("봉준호");
    vi.advanceTimersByTime(1000);
    m.addRecentSearch("이정재");

    const got = m.getRecentSearches();
    expect(got.map((it) => it.query)).toEqual([
      "이정재",
      "봉준호",
      "박찬욱",
    ]);
    expect(got[0].ts).toBeGreaterThan(got[2].ts);
  });

  it("trim 으로 공백 제거, 표시 case 보존", async () => {
    const m = await loadModule();
    m.addRecentSearch("   Park Chan-Wook   ");
    const got = m.getRecentSearches();
    expect(got).toHaveLength(1);
    expect(got[0].query).toBe("Park Chan-Wook");
  });

  it("빈 / 공백만 query 는 무시한다", async () => {
    const m = await loadModule();
    m.addRecentSearch("");
    m.addRecentSearch("   ");
    expect(m.getRecentSearches()).toEqual([]);
  });

  it("동일 query 재입력 시 dedupe — 최신 ts 로 재삽입 (case-insensitive)", async () => {
    const m = await loadModule();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T00:00:00Z"));
    m.addRecentSearch("박찬욱");
    vi.advanceTimersByTime(1000);
    m.addRecentSearch("봉준호");
    vi.advanceTimersByTime(1000);
    // 대소문자 다른 영문 (한글은 case 차이 없음 — 영문으로 검증)
    m.addRecentSearch("hello");
    vi.advanceTimersByTime(1000);
    m.addRecentSearch("HELLO");

    const got = m.getRecentSearches();
    // hello dedupe → 1개만, 최신 ts. 박찬욱/봉준호 보존
    expect(got).toHaveLength(3);
    expect(got[0].query).toBe("HELLO"); // 최신 case 보존
    const helloItems = got.filter(
      (it) => it.query.toLowerCase() === "hello",
    );
    expect(helloItems).toHaveLength(1);
  });

  it("FIFO — 11번째 query 추가 시 가장 오래된 것이 제거됨", async () => {
    const m = await loadModule();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T00:00:00Z"));
    for (let i = 0; i < 11; i++) {
      m.addRecentSearch(`query-${i}`);
      vi.advanceTimersByTime(1000);
    }
    const got = m.getRecentSearches();
    expect(got).toHaveLength(10);
    // query-0 (최초) 제거, query-10 (최신) 포함
    expect(got.map((it) => it.query)).toContain("query-10");
    expect(got.map((it) => it.query)).not.toContain("query-0");
    // 최신 우선 정렬
    expect(got[0].query).toBe("query-10");
  });
});

describe("removeRecentSearch", () => {
  it("일치 항목 제거 (정규화 — 대소문자 무시)", async () => {
    const m = await loadModule();
    m.addRecentSearch("hello");
    m.addRecentSearch("world");
    m.removeRecentSearch("HELLO");
    const got = m.getRecentSearches();
    expect(got.map((it) => it.query)).toEqual(["world"]);
  });

  it("없는 query 제거 시도 → no-op", async () => {
    const m = await loadModule();
    m.addRecentSearch("hello");
    m.removeRecentSearch("nonexistent");
    expect(m.getRecentSearches()).toHaveLength(1);
  });

  it("빈 query 제거 시도 → no-op", async () => {
    const m = await loadModule();
    m.addRecentSearch("hello");
    m.removeRecentSearch("");
    m.removeRecentSearch("   ");
    expect(m.getRecentSearches()).toHaveLength(1);
  });
});

describe("clearRecentSearches", () => {
  it("전체 초기화 후 빈 배열", async () => {
    const m = await loadModule();
    m.addRecentSearch("hello");
    m.addRecentSearch("world");
    m.clearRecentSearches();
    expect(m.getRecentSearches()).toEqual([]);
  });
});
