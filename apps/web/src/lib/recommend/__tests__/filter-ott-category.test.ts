/**
 * applyFilters OTT 필터 — category(subscription/rent/buy) 인식 검증.
 *
 * 버그(2026-07-03 사용자 피드백): wavve 필터인데 wavve rent/buy 전용 작품이 통과 →
 * display 필터(rent/buy 제거)와 겹쳐 카드에 OTT 칩이 빈 채로 노출.
 * 데이터 실측: wavve 포함 작품의 ~47%가 rent/buy 전용.
 * fix: 구독으로 볼 수 있는 provider만 OTT 매칭에 인정.
 */
import { describe, it, expect } from "vitest";
import { applyFilters } from "../filter";
import type { EnrichedCandidate } from "../types";

const mk = (
  providers: { name: string; category?: "subscription" | "rent" | "buy" }[],
): EnrichedCandidate =>
  ({
    type: "movie",
    item: { title: "X", genre_ids: [] },
    details: { country: [] },
    providers: providers.map((p) => ({ ...p, logoUrl: null })),
  }) as unknown as EnrichedCandidate;

describe("applyFilters — OTT category 인식", () => {
  it("wavve 구독 제공 작품은 통과", () => {
    const out = applyFilters([mk([{ name: "wavve", category: "subscription" }])], {
      ott: ["wavve"],
    });
    expect(out).toHaveLength(1);
  });

  it("wavve rent/buy 전용 작품은 제외", () => {
    const out = applyFilters(
      [
        mk([{ name: "wavve", category: "rent" }]),
        mk([{ name: "wavve", category: "buy" }]),
      ],
      { ott: ["wavve"] },
    );
    expect(out).toHaveLength(0);
  });

  it("category 없는 구버전 데이터는 구독 간주 → 통과", () => {
    const out = applyFilters([mk([{ name: "wavve" }])], { ott: ["wavve"] });
    expect(out).toHaveLength(1);
  });
});
