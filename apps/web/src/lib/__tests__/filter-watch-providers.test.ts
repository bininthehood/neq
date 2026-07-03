/**
 * filterWatchProviders — where-to-watch 표시용 provider 필터 단위 테스트.
 *
 * 검증 핵심 (사용자 피드백 2026-07-02):
 *   - rent/buy(구매·대여, 예: Google Play Movies)는 OTT 구독 맥락에 부적합 → 제외
 *   - 광고형 요금제 변종("Netflix Standard with Ads")은 정규 provider 중복 노이즈 → 제외
 *   - category 없는 구버전 데이터는 구독으로 간주 → 유지 (name 필터는 여전히 적용)
 */
import { describe, it, expect } from "vitest";
import { filterWatchProviders } from "../tmdb";

describe("filterWatchProviders", () => {
  it("구독만 남기고 rent/buy 제거", () => {
    const input = [
      { name: "Netflix", logoUrl: null, category: "subscription" as const },
      { name: "Google Play Movies", logoUrl: null, category: "rent" as const },
      { name: "Apple TV", logoUrl: null, category: "buy" as const },
    ];
    expect(filterWatchProviders(input).map((p) => p.name)).toEqual(["Netflix"]);
  });

  it("Netflix 광고형 변종 제거, 정규 Netflix 유지", () => {
    const input = [
      { name: "Netflix", logoUrl: null, category: "subscription" as const },
      { name: "Netflix Standard with Ads", logoUrl: null, category: "subscription" as const },
    ];
    expect(filterWatchProviders(input).map((p) => p.name)).toEqual(["Netflix"]);
  });

  it("category 없는 데이터는 구독 간주 → 유지", () => {
    const input = [{ name: "TVING", logoUrl: null }];
    expect(filterWatchProviders(input)).toHaveLength(1);
  });

  it("앱 미지원 provider(Crunchyroll·MUBI 등 TMDB 잡음)는 제외", () => {
    const input = [
      { name: "Netflix", logoUrl: null, category: "subscription" as const },
      { name: "Crunchyroll", logoUrl: null, category: "subscription" as const },
      { name: "MUBI", logoUrl: null, category: "subscription" as const },
    ];
    expect(filterWatchProviders(input).map((p) => p.name)).toEqual(["Netflix"]);
  });
});
