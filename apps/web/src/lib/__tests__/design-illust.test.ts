/**
 * @neq/design Illust — pure logic 단위 테스트
 *
 * 검증 대상:
 *  - illustSizePx: size → px 매핑 (sm 64 / md 96 / lg 128)
 *  - resolveIllustStyle: letterpress/lineart → editorial fallback
 *  - illustHasNativeStyle: name × style 매트릭스 (8 names × {editorial,geometric})
 *  - 상수: ILLUST_NAMES (8) / ILLUST_STYLES (4) / 색상 토큰 hex
 */

import { describe, it, expect } from "vitest";
import {
  illustSizePx,
  resolveIllustStyle,
  illustHasNativeStyle,
  ILLUST_NAMES,
  ILLUST_STYLES,
  ILLUST_AMBER,
  ILLUST_INK,
  ILLUST_PAPER,
  ILLUST_BG,
  ILLUST_STROKE,
  type IllustName,
} from "@neq/design";

describe("Illust — 상수", () => {
  it("ILLUST_NAMES — 8 시나리오 (welcome/emptyDiscover/emptySaved/noResults/calibrating/error/onboarding/archive)", () => {
    expect(ILLUST_NAMES).toHaveLength(8);
    expect(ILLUST_NAMES).toEqual([
      "welcome",
      "emptyDiscover",
      "emptySaved",
      "noResults",
      "calibrating",
      "error",
      "onboarding",
      "archive",
    ]);
  });

  it("ILLUST_STYLES — 4종 (geometric/editorial/letterpress/lineart)", () => {
    expect(ILLUST_STYLES).toHaveLength(4);
    expect(ILLUST_STYLES).toEqual([
      "geometric",
      "editorial",
      "letterpress",
      "lineart",
    ]);
  });

  it("색상 토큰 — illustrations.jsx 와 동일 hex (amber/ink/paper/bg/stroke)", () => {
    // illustrations.jsx 단일 진실 공급원 — 디자인 산출물 색상 동기화 확인
    expect(ILLUST_AMBER).toBe("#C4A35A");
    expect(ILLUST_INK).toBe("#6B6C75");
    expect(ILLUST_PAPER).toBe("#24231E");
    expect(ILLUST_BG).toBe("#12110E");
    expect(ILLUST_STROKE).toBe("#3A3833");
  });
});

describe("illustSizePx — size → px 매핑", () => {
  it("sm = 64, md = 96, lg = 128", () => {
    expect(illustSizePx("sm")).toBe(64);
    expect(illustSizePx("md")).toBe(96);
    expect(illustSizePx("lg")).toBe(128);
  });

  it("default = md (96px)", () => {
    expect(illustSizePx()).toBe(96);
  });
});

describe("resolveIllustStyle — fallback 로직", () => {
  it("editorial — pass-through", () => {
    expect(resolveIllustStyle("editorial")).toBe("editorial");
  });

  it("geometric — pass-through", () => {
    expect(resolveIllustStyle("geometric")).toBe("geometric");
  });

  it("letterpress → editorial (fallback)", () => {
    expect(resolveIllustStyle("letterpress")).toBe("editorial");
  });

  it("lineart → editorial (fallback)", () => {
    expect(resolveIllustStyle("lineart")).toBe("editorial");
  });
});

describe("illustHasNativeStyle — name × style 매트릭스", () => {
  it("editorial 스타일 — 8 name 모두 정의됨", () => {
    for (const name of ILLUST_NAMES) {
      expect(illustHasNativeStyle(name, "editorial")).toBe(true);
    }
  });

  it("geometric 스타일 — 8 name 모두 정의됨", () => {
    for (const name of ILLUST_NAMES) {
      expect(illustHasNativeStyle(name, "geometric")).toBe(true);
    }
  });

  it("letterpress 스타일 — 모두 native false (editorial로 fallback됨)", () => {
    for (const name of ILLUST_NAMES) {
      expect(illustHasNativeStyle(name, "letterpress")).toBe(false);
    }
  });

  it("lineart 스타일 — 모두 native false (editorial로 fallback됨)", () => {
    for (const name of ILLUST_NAMES) {
      expect(illustHasNativeStyle(name, "lineart")).toBe(false);
    }
  });
});

describe("Illust — 시나리오 매핑 contract", () => {
  // StatusScreens 8 시나리오 → IllustName 매핑 검증.
  // 본 D9 위임의 핵심 contract.
  const SCENARIO_MAPPING: Record<string, IllustName> = {
    discover_loading: "calibrating",
    discover_empty: "noResults",
    discover_error: "error",
    saved_empty: "emptySaved",
    saved_filter_empty: "emptyDiscover",
    search_empty: "noResults",
    search_onboarding_empty: "onboarding",
    welcome_landing: "welcome",
  };

  it("8 시나리오 — 모두 ILLUST_NAMES 안에 정의된 name 사용", () => {
    for (const [, name] of Object.entries(SCENARIO_MAPPING)) {
      expect(ILLUST_NAMES).toContain(name);
    }
  });

  it("Discover 첫 로딩 → calibrating", () => {
    expect(SCENARIO_MAPPING.discover_loading).toBe("calibrating");
  });

  it("Discover 추천 0개 → noResults", () => {
    expect(SCENARIO_MAPPING.discover_empty).toBe("noResults");
  });

  it("Discover 네트워크 에러 → error", () => {
    expect(SCENARIO_MAPPING.discover_error).toBe("error");
  });

  it("Saved 0건 → emptySaved", () => {
    expect(SCENARIO_MAPPING.saved_empty).toBe("emptySaved");
  });

  it("Saved 필터 적용 0건 → emptyDiscover", () => {
    expect(SCENARIO_MAPPING.saved_filter_empty).toBe("emptyDiscover");
  });

  it("Search 결과 0건 → noResults", () => {
    expect(SCENARIO_MAPPING.search_empty).toBe("noResults");
  });

  it("온보딩 검색 0건 → onboarding", () => {
    expect(SCENARIO_MAPPING.search_onboarding_empty).toBe("onboarding");
  });

  it("Welcome (정의만 유지, V2가 처리) → welcome", () => {
    expect(SCENARIO_MAPPING.welcome_landing).toBe("welcome");
  });

  it("archive — 시청 리포트 #9 제거 결정으로 매핑에서 제외 (정의는 유지)", () => {
    // archive name 자체는 정의되어 있어야 — 이후 다른 용도로 활용 가능
    expect(ILLUST_NAMES).toContain("archive");
    // 본 SCENARIO_MAPPING 8개 중 archive 사용 X
    expect(Object.values(SCENARIO_MAPPING)).not.toContain("archive");
  });
});
