/**
 * Discover FilterType 카테고리 매핑 회귀 가드 — D13 (Day 26).
 *
 * 결정: DECISIONS.md #26 — Categories 5→3 (movie / series / variety).
 * 음악·책 V1 배제. show → variety rename.
 *
 * 검증 대상:
 *  - FilterType enum 값이 'all' | 'movie' | 'series' | 'variety' 4종
 *  - TYPE_LABELS 키가 정확히 4종 (UI 옵션 항목 일치)
 *  - 한국어 라벨 값 — '영화' / '시리즈' / '예능'
 *  - VARIETY_GENRE_IDS — TMDB Reality(10764) + Talk(10767)
 *
 * 본 트랙은 코드상 enum 변경은 0건 (이미 3종 + all 로 정착). 본 테스트는 회귀 가드.
 */

import { describe, it, expect } from "vitest";
import {
  TYPE_LABELS,
  ORIGIN_LABELS,
  YEAR_LABELS,
  VARIETY_GENRE_IDS,
  type FilterType,
} from "@neq/core";

describe("Discover FilterType — D13 카테고리 3종 (DECISIONS.md #26)", () => {
  it("TYPE_LABELS 키는 'all' / 'movie' / 'series' / 'variety' 4종이다", () => {
    const keys = Object.keys(TYPE_LABELS).sort();
    expect(keys).toEqual(["all", "movie", "series", "variety"]);
  });

  it("제거된 카테고리 (show / music / book) 는 TYPE_LABELS 에 부재", () => {
    const labels = TYPE_LABELS as Record<string, string>;
    expect(labels.show).toBeUndefined();
    expect(labels.music).toBeUndefined();
    expect(labels.book).toBeUndefined();
  });

  it("한국어 라벨 — 영화 / 시리즈 / 예능", () => {
    expect(TYPE_LABELS.movie).toBe("영화");
    expect(TYPE_LABELS.series).toBe("시리즈");
    expect(TYPE_LABELS.variety).toBe("예능");
  });

  it("FilterType 타입 호환성 (컴파일 타임 검증)", () => {
    const movie: FilterType = "movie";
    const series: FilterType = "series";
    const variety: FilterType = "variety";
    const all: FilterType = "all";
    expect([movie, series, variety, all]).toHaveLength(4);
  });

  it("VARIETY_GENRE_IDS 는 TMDB Reality(10764) + Talk(10767)", () => {
    // show → variety rename 의 의미 단계 — TMDB 는 reality/talk 도 tv 하위로 분류.
    expect(VARIETY_GENRE_IDS).toEqual([10764, 10767]);
  });

  it("ORIGIN_LABELS / YEAR_LABELS 는 D13 변경 영향 없다 (회귀 가드)", () => {
    expect(Object.keys(ORIGIN_LABELS).sort()).toEqual(["all", "foreign", "kr"]);
    expect(Object.keys(YEAR_LABELS).sort()).toEqual(["2010s", "all", "classic", "recent"]);
  });
});
