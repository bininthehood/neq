/**
 * @neq/design tokens — Category 색상 매핑 회귀 가드
 *
 * D13 (Day 26) — Categories 5→3 매핑 변경 검증.
 * 결정: DECISIONS.md #26 — movie / series / variety 3종만. 음악·책 V1 배제. show → variety rename.
 *
 * 검증 대상:
 *  - colors.catMovie / colors.catSeries / colors.catVariety 3종 존재
 *  - 제거된 키 (catMusic / catBook / catShow) 부재
 *  - 색상 값이 디자인 산출물 (neko-data.jsx) 과 일치
 *
 * 사용처가 0건이라 회귀 영향은 무관하지만, 후속 트랙에서 카테고리 배지를 활성화할 때
 * 잘못된 키를 참조하지 않도록 contract 명문화.
 */

import { describe, it, expect } from "vitest";
import { colors } from "@neq/design";

describe("Category tokens — D13 5→3 매핑 (DECISIONS.md #26)", () => {
  it("3종 카테고리 색상이 정의된다 (movie / series / variety)", () => {
    expect(colors.catMovie).toBe("#C4A35A"); // amber
    expect(colors.catSeries).toBe("#9B8AE0"); // violet
    expect(colors.catVariety).toBe("#E08A6C"); // coral (디자인 산출물 neko-data.jsx variety 색)
  });

  it("제거된 키 (catMusic / catBook / catShow) 는 colors 에 부재", () => {
    // 음악·책은 V1 배제. show 는 variety 로 rename.
    // typeof / in 검사로 런타임 부재 검증.
    const c = colors as Record<string, unknown>;
    expect(c.catMusic).toBeUndefined();
    expect(c.catBook).toBeUndefined();
    expect(c.catShow).toBeUndefined();
  });

  it("3종 색상은 서로 다른 시각적 구분을 가진다 (단순 동등성 가드)", () => {
    const set = new Set([colors.catMovie, colors.catSeries, colors.catVariety]);
    expect(set.size).toBe(3);
  });
});
