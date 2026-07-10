import { describe, expect, it } from "vitest";
import {
  chooseDiscoverEmptyState,
  chooseDiscoverLoadingState,
  getDiscoverErrorCopy,
} from "../discover-status";

describe("chooseDiscoverEmptyState", () => {
  it("필터가 없고 추천 후보가 비었으면 native parity를 위해 empty copy 대신 fallback loader를 선택한다", () => {
    expect(chooseDiscoverEmptyState({ hasFilter: false })).toBe("fallback-loader");
  });

  it("필터가 활성화된 상태의 빈 결과는 사용자가 풀 수 있도록 기존 empty/filter guidance를 유지한다", () => {
    expect(chooseDiscoverEmptyState({ hasFilter: true })).toBe("filter-empty");
  });
});

describe("chooseDiscoverLoadingState", () => {
  it("사용자 refresh 로딩은 별도 refresh loader를 유지한다", () => {
    expect(chooseDiscoverLoadingState({ refreshing: true, isColdStart: false })).toBe("refresh-loader");
  });

  it("cold-start라도 native parity를 위해 카드 스켈레톤을 선택한다", () => {
    expect(chooseDiscoverLoadingState({ refreshing: false, isColdStart: true })).toBe("card-skeleton");
  });

  it("일반 첫 진입/필터 변경 로딩도 카드 스켈레톤을 선택한다", () => {
    expect(chooseDiscoverLoadingState({ refreshing: false, isColdStart: false })).toBe("card-skeleton");
  });
});

describe("getDiscoverErrorCopy", () => {
  it("native 기준 error headline/body를 반환한다", () => {
    expect(getDiscoverErrorCopy()).toEqual({
      headline: "잠시 멈췄어요",
      body: "잠시 후 다시 시도해주세요",
    });
  });
});
