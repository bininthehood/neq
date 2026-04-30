/**
 * @neq/design Skeleton — pure logic 단위 테스트
 *
 * 검증 대상:
 *  - skeletonVariantDefaults: variant → width/height/borderRadius 매핑
 *  - 상수: SKELETON_PULSE_DURATION_MS
 */

import { describe, it, expect } from "vitest";
import {
  skeletonVariantDefaults,
  SKELETON_PULSE_DURATION_MS,
} from "@neq/design";

describe("Skeleton — 상수", () => {
  it("pulse 2000ms (조급하지 않은 호흡)", () => {
    expect(SKELETON_PULSE_DURATION_MS).toBe(2000);
  });
});

describe("skeletonVariantDefaults", () => {
  it("text — height 14px, radius sm", () => {
    const d = skeletonVariantDefaults("text");
    expect(d.height).toBe(14);
    expect(d.borderRadius).toContain("--radius-sm");
  });

  it("poster — width 100%, radius lg (12px)", () => {
    const d = skeletonVariantDefaults("poster");
    expect(d.width).toBe("100%");
    expect(d.borderRadius).toContain("--radius-lg");
  });

  it("card — radius xl (16px) — 카드 자리 표시자", () => {
    const d = skeletonVariantDefaults("card");
    expect(d.borderRadius).toContain("--radius-xl");
  });
});
