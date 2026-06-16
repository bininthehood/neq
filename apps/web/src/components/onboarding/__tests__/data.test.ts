/**
 * Onboarding V2 (D4a) 정적 데이터 무결성 테스트.
 *
 * 디자인 산출물 spec 과 LLM 입력 호환성을 보장하기 위한 가드.
 * - GENRE_CHIPS: 디자인 산출물 15종 동일 + id 가 LLM 프롬프트 slug 와 호환
 * - OTT_OPTIONS: TMDB provider id 가 KR region 실제 id 와 일치
 * - STEP_LABELS: 5단계 + 순서 (welcome → hello → genre → persona → ott)
 *
 * 2026-06-16: NOTIF_OPTIONS / notify 단계 제거 (알림 인프라 disabled).
 */

import { describe, it, expect } from "vitest";
import {
  GENRE_CHIPS,
  OTT_OPTIONS,
  STEP_LABELS,
  TOTAL_STEPS,
  PERSONA_SUB_STEPS,
  UNIFIED_TOTAL_STEPS,
  computeUnifiedHeaderCurrent,
} from "../data";

describe("GENRE_CHIPS", () => {
  it("디자인 산출물 spec 의 15종을 정확히 포함한다", () => {
    expect(GENRE_CHIPS).toHaveLength(15);
  });

  it("id 는 모두 unique 한 string slug 다 (LLM 프롬프트 호환)", () => {
    const ids = GENRE_CHIPS.map((g) => g.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
    for (const id of ids) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
      expect(id).toMatch(/^[a-z]+$/); // 소문자 영문만 (LLM 프롬프트 안전)
    }
  });

  it("ko/en 라벨이 비어있지 않다", () => {
    for (const g of GENRE_CHIPS) {
      expect(g.ko.length).toBeGreaterThan(0);
      expect(g.en.length).toBeGreaterThan(0);
    }
  });
});

describe("OTT_OPTIONS", () => {
  it("주요 OTT 7종 (Netflix/Tving/Wavve/Watcha/Disney+/Apple TV+/Coupang Play)", () => {
    expect(OTT_OPTIONS).toHaveLength(7);
    const ids = OTT_OPTIONS.map((o) => o.id);
    expect(ids).toEqual([
      "netflix",
      "tving",
      "wavve",
      "watcha",
      "disney",
      "apple",
      "coupang",
    ]);
  });

  it("providerId 는 모두 양의 정수이며 unique 하다 (TMDB region=KR)", () => {
    const ids = OTT_OPTIONS.map((o) => o.providerId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
    for (const id of ids) {
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThan(0);
    }
  });

  it("Netflix provider id 는 8 (TMDB 표준)", () => {
    const netflix = OTT_OPTIONS.find((o) => o.id === "netflix");
    expect(netflix?.providerId).toBe(8);
  });
});

describe("STEP_LABELS / TOTAL_STEPS", () => {
  it("5단계 + 순서 (welcome → hello → genre → persona → ott)", () => {
    expect(TOTAL_STEPS).toBe(5);
    expect(STEP_LABELS).toEqual([
      "welcome",
      "hello",
      "genre",
      "persona",
      "ott",
    ]);
    expect(STEP_LABELS).toHaveLength(TOTAL_STEPS);
  });
});

describe("UNIFIED_TOTAL_STEPS / PERSONA_SUB_STEPS", () => {
  it("PERSONA_SUB_STEPS = 5 (context + step1 + step2/3 + favorites + summary)", () => {
    expect(PERSONA_SUB_STEPS).toBe(5);
  });

  it("UNIFIED_TOTAL_STEPS = TOTAL_STEPS + PERSONA_SUB_STEPS - 1 (= 9)", () => {
    expect(UNIFIED_TOTAL_STEPS).toBe(TOTAL_STEPS + PERSONA_SUB_STEPS - 1);
    expect(UNIFIED_TOTAL_STEPS).toBe(9);
  });
});

describe("computeUnifiedHeaderCurrent — 산식 매핑", () => {
  it("step < persona(3) 일 때 step 그대로", () => {
    expect(computeUnifiedHeaderCurrent(0, 1)).toBe(0); // welcome → 1/9
    expect(computeUnifiedHeaderCurrent(1, 1)).toBe(1); // hello → 2/9
    expect(computeUnifiedHeaderCurrent(2, 1)).toBe(2); // genre → 3/9
  });

  it("step === persona(3) 일 때 sub-step 1~5 → 3..7 매핑 (4/9 ~ 8/9)", () => {
    expect(computeUnifiedHeaderCurrent(3, 1)).toBe(3); // context_select → 4/9
    expect(computeUnifiedHeaderCurrent(3, 2)).toBe(4); // step 1 → 5/9
    expect(computeUnifiedHeaderCurrent(3, 3)).toBe(5); // step 2/3 → 6/9
    expect(computeUnifiedHeaderCurrent(3, 4)).toBe(6); // favorites → 7/9
    expect(computeUnifiedHeaderCurrent(3, 5)).toBe(7); // summary → 8/9
  });

  it("step > persona(3) 일 때 step + 4 (= step + (PERSONA_SUB_STEPS - 1))", () => {
    expect(computeUnifiedHeaderCurrent(4, 1)).toBe(8); // ott → 9/9 (최종)
  });

  it("subStep 인자는 step !== persona 일 때 무시된다 (stale subStep 안전 가드)", () => {
    // persona 단계 종료 후 OTT 로 advance 했을 때 personaSubStep 이 stale 5 라도
    // headerCurrent = 4 + (PERSONA_SUB_STEPS-1) = 8 — subStep 영향 받지 않음
    expect(computeUnifiedHeaderCurrent(4, 5)).toBe(8);
    // step < persona 도 동일
    expect(computeUnifiedHeaderCurrent(2, 5)).toBe(2);
  });
});
