/**
 * @neq/design NeqSpinner — pure logic 단위 테스트
 *
 * 검증 대상:
 *  - neqSpinnerDimensions: size → 컨테이너(글자 height) 매핑
 *  - 상수: NEQ_SPINNER_DURATION_MS (Fraunces morph loop)
 */

import { describe, it, expect } from "vitest";
import {
  neqSpinnerDimensions,
  NEQ_SPINNER_DURATION_MS,
} from "@neq/design";

describe("NeqSpinner — 상수", () => {
  it("morph 1400ms loop", () => {
    expect(NEQ_SPINNER_DURATION_MS).toBe(1400);
  });
});

describe("neqSpinnerDimensions — size 매핑 (글자 height)", () => {
  it("sm = 16 / md = 24 / lg = 32", () => {
    expect(neqSpinnerDimensions("sm").container).toBe(16);
    expect(neqSpinnerDimensions("md").container).toBe(24);
    expect(neqSpinnerDimensions("lg").container).toBe(32);
  });

  it("default = md (24px)", () => {
    expect(neqSpinnerDimensions().container).toBe(24);
  });
});
