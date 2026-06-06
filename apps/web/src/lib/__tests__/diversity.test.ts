/**
 * diversity.ts 단위 테스트 — Phase C (2026-06-06)
 *
 * 검증:
 *   - 빈 배열 / 단일 요소 → 그대로
 *   - 같은 type 단조 입력 → drop 없이 통과
 *   - mixed type → 연속 같은 type 차단
 *   - decade 위반 → 연속 cap 적용
 *   - OTT 위반 → 연속 cap 적용
 *   - 모두 동일 입력 → 길이 보존
 *   - DEFAULT_DIVERSITY 호출 가능 (인자 생략)
 *   - 입력 길이 항상 보존 (drop 없음)
 */
import { describe, it, expect } from "vitest";
import { applyDiversityReorder, DEFAULT_DIVERSITY } from "../diversity";
import type { Recommendation } from "../types";

function makeRec(opts: {
  tmdbId: number;
  type?: "movie" | "series" | "variety";
  date?: string;
  ottName?: string | null;
  title?: string;
}): Recommendation {
  const providers =
    opts.ottName === null
      ? []
      : opts.ottName
        ? [{ name: opts.ottName, logoUrl: null }]
        : [];
  return {
    title: opts.title ?? `T-${opts.tmdbId}`,
    titleEn: `T-${opts.tmdbId}-en`,
    type: opts.type ?? "movie",
    reason: "test",
    tmdbId: opts.tmdbId,
    posterUrl: null,
    rating: 0,
    date: opts.date ?? "2020-01-01",
    overview: "",
    providers,
    watchLink: null,
    director: null,
    cast: [],
    runtime: null,
    seasons: null,
    country: [],
    backdrop: null,
  };
}

function countMaxConsecutive(
  recs: Recommendation[],
  attr: (r: Recommendation) => string | null,
): number {
  let max = 0;
  let cur = 0;
  let last: string | null | undefined = undefined;
  for (const r of recs) {
    const v = attr(r);
    if (v !== null && v === last) {
      cur++;
    } else {
      cur = 1;
      last = v;
    }
    if (v !== null && cur > max) max = cur;
  }
  return max;
}

describe("applyDiversityReorder", () => {
  it("빈 배열 → 빈 배열", () => {
    expect(applyDiversityReorder([])).toEqual([]);
  });

  it("단일 요소 → 그대로", () => {
    const rec = makeRec({ tmdbId: 1 });
    expect(applyDiversityReorder([rec])).toEqual([rec]);
  });

  it("같은 type 5개 단조 입력 → drop 없이 통과 (길이 보존)", () => {
    const recs = [1, 2, 3, 4, 5].map((i) =>
      makeRec({ tmdbId: i, type: "movie", date: `202${i}-01-01` }),
    );
    const out = applyDiversityReorder(recs);
    expect(out.length).toBe(recs.length);
    const ids = new Set(out.map((r) => r.tmdbId));
    expect(ids.size).toBe(recs.length);
  });

  it("mixed type 10개 (movie 5 / series 5) → 같은 type 연속 ≤ 1", () => {
    // 다른 제약 (decade / OTT) 은 위반하지 않도록 분산
    const recs = [
      ...[1, 2, 3, 4, 5].map((i) =>
        makeRec({
          tmdbId: i,
          type: "movie",
          date: `${1990 + i * 5}-01-01`,
          ottName: null,
        }),
      ),
      ...[6, 7, 8, 9, 10].map((i) =>
        makeRec({
          tmdbId: i,
          type: "series",
          date: `${1990 + i * 3}-01-01`,
          ottName: null,
        }),
      ),
    ];
    const out = applyDiversityReorder(recs);
    expect(out.length).toBe(10);
    const maxC = countMaxConsecutive(out, (r) => r.type);
    expect(maxC).toBeLessThanOrEqual(DEFAULT_DIVERSITY.maxConsecutiveSameGenre);
  });

  it("decade 위반 — 2020 3개 + 1990 3개 → 연속 같은 decade ≤ 2", () => {
    // type 제약은 분산 (movie/series 번갈아), ott 없음
    const recs = [
      makeRec({ tmdbId: 1, type: "movie", date: "2020-01-01", ottName: null }),
      makeRec({ tmdbId: 2, type: "series", date: "2021-01-01", ottName: null }),
      makeRec({ tmdbId: 3, type: "movie", date: "2022-01-01", ottName: null }),
      makeRec({ tmdbId: 4, type: "series", date: "1990-01-01", ottName: null }),
      makeRec({ tmdbId: 5, type: "movie", date: "1991-01-01", ottName: null }),
      makeRec({ tmdbId: 6, type: "series", date: "1992-01-01", ottName: null }),
    ];
    const out = applyDiversityReorder(recs);
    expect(out.length).toBe(6);
    const maxDecade = countMaxConsecutive(out, (r) => {
      const m = /^(\d{4})/.exec(r.date);
      if (!m) return null;
      return `${Math.floor(parseInt(m[1], 10) / 10) * 10}s`;
    });
    expect(maxDecade).toBeLessThanOrEqual(DEFAULT_DIVERSITY.maxConsecutiveSameDecade);
  });

  it("OTT 위반 — Netflix 6 + Disney+ 1 → Netflix 연속 ≤ 3", () => {
    const recs = [
      ...[1, 2, 3, 4, 5, 6].map((i) =>
        makeRec({
          tmdbId: i,
          type: i % 2 === 0 ? "movie" : "series",
          date: `${2000 + i * 3}-01-01`, // decade 도 분산
          ottName: "Netflix",
        }),
      ),
      makeRec({
        tmdbId: 7,
        type: "movie",
        date: "2020-01-01",
        ottName: "Disney+",
      }),
    ];
    const out = applyDiversityReorder(recs);
    expect(out.length).toBe(7);
    const maxOtt = countMaxConsecutive(out, (r) => r.providers[0]?.name ?? null);
    expect(maxOtt).toBeLessThanOrEqual(DEFAULT_DIVERSITY.maxConsecutiveSameOtt);
  });

  it("제약 충족 불가 — 모두 동일 속성 50개 → 길이 보존 (drop 0)", () => {
    const recs = Array.from({ length: 50 }, (_, i) =>
      makeRec({
        tmdbId: i + 1,
        type: "movie",
        date: "2020-01-01",
        ottName: "Netflix",
      }),
    );
    const out = applyDiversityReorder(recs);
    expect(out.length).toBe(50);
    const ids = new Set(out.map((r) => r.tmdbId));
    expect(ids.size).toBe(50);
  });

  it("DEFAULT_DIVERSITY — 인자 생략 시 default 적용", () => {
    expect(DEFAULT_DIVERSITY.maxConsecutiveSameGenre).toBe(1);
    expect(DEFAULT_DIVERSITY.maxConsecutiveSameDecade).toBe(2);
    expect(DEFAULT_DIVERSITY.maxConsecutiveSameOtt).toBe(3);
    const recs = [
      makeRec({ tmdbId: 1, type: "movie" }),
      makeRec({ tmdbId: 2, type: "series" }),
    ];
    const a = applyDiversityReorder(recs);
    const b = applyDiversityReorder(recs, DEFAULT_DIVERSITY);
    expect(a).toEqual(b);
  });

  it("input 길이 항상 보존 (제약 충돌 회피 경로 포함)", () => {
    const recs = [
      makeRec({ tmdbId: 1, type: "movie", date: "2020-01-01", ottName: "Netflix" }),
      makeRec({ tmdbId: 2, type: "movie", date: "2020-02-01", ottName: "Netflix" }),
      makeRec({ tmdbId: 3, type: "movie", date: "2020-03-01", ottName: "Netflix" }),
      makeRec({ tmdbId: 4, type: "series", date: "2010-01-01", ottName: "Disney+" }),
    ];
    const out = applyDiversityReorder(recs);
    expect(out.length).toBe(4);
    expect(new Set(out.map((r) => r.tmdbId)).size).toBe(4);
  });
});
