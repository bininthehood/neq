/**
 * @neq/design NeqSpinner — pure logic 단위 테스트
 *
 * 검증 대상:
 *  - neqSpinnerDimensions: size → 컨테이너/dot/반경 매핑
 *  - 상수: NEQ_SPINNER_DURATION_MS / NEQ_SPINNER_PHASE_DELAY_MS
 */

import { describe, it, expect } from "vitest";
import {
  neqSpinnerDimensions,
  NEQ_SPINNER_DURATION_MS,
  NEQ_SPINNER_PHASE_DELAY_MS,
} from "@neq/design";

describe("NeqSpinner — 상수", () => {
  it("회전 1400ms / phase 150ms", () => {
    expect(NEQ_SPINNER_DURATION_MS).toBe(1400);
    expect(NEQ_SPINNER_PHASE_DELAY_MS).toBe(150);
  });
});

describe("neqSpinnerDimensions — size 매핑", () => {
  it("sm = 16 / md = 24 / lg = 32 (컨테이너)", () => {
    expect(neqSpinnerDimensions("sm").container).toBe(16);
    expect(neqSpinnerDimensions("md").container).toBe(24);
    expect(neqSpinnerDimensions("lg").container).toBe(32);
  });

  it("default = md (24px)", () => {
    expect(neqSpinnerDimensions().container).toBe(24);
  });

  it("dot 크기는 size에 비례 — sm=3 / md=4 / lg=6", () => {
    expect(neqSpinnerDimensions("sm").dot).toBe(3);
    expect(neqSpinnerDimensions("md").dot).toBe(4);
    expect(neqSpinnerDimensions("lg").dot).toBe(6);
  });

  it("dot 반경은 컨테이너의 ~1/3 ~ 1/2 — 맞물림 검증", () => {
    const sm = neqSpinnerDimensions("sm");
    const md = neqSpinnerDimensions("md");
    const lg = neqSpinnerDimensions("lg");
    // 반경 + dot/2 ≤ container/2 (dot이 컨테이너 안쪽에 들어가야 함)
    expect(sm.radius + sm.dot / 2).toBeLessThanOrEqual(sm.container / 2);
    expect(md.radius + md.dot / 2).toBeLessThanOrEqual(md.container / 2);
    expect(lg.radius + lg.dot / 2).toBeLessThanOrEqual(lg.container / 2);
  });
});
