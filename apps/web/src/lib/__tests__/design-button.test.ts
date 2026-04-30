/**
 * @neq/design Button — pure logic 단위 테스트
 *
 * 검증 대상:
 *  - buttonSizeStyles: size → padding/font/radius/spinnerSize 매핑
 *  - buttonVariantStyles: variant → background/color/border 매핑
 *  - 상수: BUTTON_ACTIVE_DURATION_MS / BUTTON_ACTIVE_SCALE
 *
 * 핵심 게이트: BUTTON_ACTIVE_SCALE === 0.97 (Quiet Ink 원칙 — NOT 0.9)
 */

import { describe, it, expect } from "vitest";
import {
  buttonSizeStyles,
  buttonVariantStyles,
  BUTTON_ACTIVE_DURATION_MS,
  BUTTON_ACTIVE_SCALE,
} from "@neq/design";

describe("Button — 상수 (Quiet Ink 원칙)", () => {
  it("active scale = 0.97 (NOT 0.9)", () => {
    // Day 25 디자인 산출물 motion-demos.jsx #7 명시 — 강한 누름 X, 미묘한 응답 O
    expect(BUTTON_ACTIVE_SCALE).toBe(0.97);
  });

  it("active duration = 80ms", () => {
    expect(BUTTON_ACTIVE_DURATION_MS).toBe(80);
  });
});

describe("buttonSizeStyles — size 매핑", () => {
  it("sm — padding 7px 12px / font sm / radius md", () => {
    const s = buttonSizeStyles("sm");
    expect(s.padding).toBe("7px 12px");
    expect(s.fontSize).toContain("--text-sm");
    expect(s.spinnerSize).toBe("sm");
  });

  it("md — padding 10px 18px / font sm / radius lg", () => {
    const s = buttonSizeStyles("md");
    expect(s.padding).toBe("10px 18px");
    expect(s.borderRadius).toContain("--radius-lg");
  });

  it("lg — padding 13px 24px / font base / spinner md", () => {
    const s = buttonSizeStyles("lg");
    expect(s.padding).toBe("13px 24px");
    expect(s.fontSize).toContain("--text-base");
    expect(s.spinnerSize).toBe("md");
  });
});

describe("buttonVariantStyles — variant 매핑", () => {
  it("primary — background = accent + color = text-inverse", () => {
    const v = buttonVariantStyles("primary");
    expect(v.background).toBe("var(--accent)");
    expect(v.color).toContain("--text-inverse");
    expect(v.hoverBackground).toBe("var(--accent-hover)");
  });

  it("secondary — background = surface + border-strong", () => {
    const v = buttonVariantStyles("secondary");
    expect(v.background).toBe("var(--surface)");
    expect(v.color).toBe("var(--text-primary)");
    expect(v.border).toContain("--border-strong");
  });

  it("ghost — background = transparent + color = accent", () => {
    const v = buttonVariantStyles("ghost");
    expect(v.background).toBe("transparent");
    expect(v.color).toBe("var(--accent)");
    expect(v.hoverBackground).toBe("var(--accent-dim)");
  });
});
