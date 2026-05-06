/**
 * Onboarding V2 (D4a) 정적 데이터 무결성 테스트.
 *
 * 디자인 산출물 spec 과 LLM 입력 호환성을 보장하기 위한 가드.
 * - GENRE_CHIPS: 디자인 산출물 15종 동일 + id 가 LLM 프롬프트 slug 와 호환
 * - OTT_OPTIONS: TMDB provider id 가 KR region 실제 id 와 일치
 * - NOTIF_OPTIONS: NotificationPrefs 필드명과 1:1 매칭 (id == prefs key)
 * - STEP_LABELS: 5단계 + 순서 (welcome → ... → notify)
 */

import { describe, it, expect } from "vitest";
import {
  GENRE_CHIPS,
  OTT_OPTIONS,
  NOTIF_OPTIONS,
  STEP_LABELS,
  TOTAL_STEPS,
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

describe("NOTIF_OPTIONS", () => {
  it("4종 (weeklyRec/newRelease/ottExpiry/monthlyReport) 알림", () => {
    expect(NOTIF_OPTIONS).toHaveLength(4);
    const ids = NOTIF_OPTIONS.map((n) => n.id).sort();
    expect(ids).toEqual([
      "monthlyReport",
      "newRelease",
      "ottExpiry",
      "weeklyRec",
    ]);
  });

  it("id 가 NotificationPrefs 의 key 와 1:1 매칭한다", () => {
    // updateNotificationPrefs 호출 시 직접 key 로 사용 — 오타 방지
    const requiredKeys = ["weeklyRec", "newRelease", "ottExpiry", "monthlyReport"];
    const ids = NOTIF_OPTIONS.map((n) => n.id);
    for (const k of requiredKeys) {
      expect(ids).toContain(k);
    }
  });

  it("기본 ON 3건 + OFF 1건 (ottExpiry false)", () => {
    const onCount = NOTIF_OPTIONS.filter((n) => n.defaultOn).length;
    const offCount = NOTIF_OPTIONS.filter((n) => !n.defaultOn).length;
    expect(onCount).toBe(3);
    expect(offCount).toBe(1);
    const ottExpiry = NOTIF_OPTIONS.find((n) => n.id === "ottExpiry");
    expect(ottExpiry?.defaultOn).toBe(false);
  });
});

describe("STEP_LABELS / TOTAL_STEPS", () => {
  it("6단계 + 순서 (welcome → hello → genre → taste → ott → notify)", () => {
    expect(TOTAL_STEPS).toBe(6);
    expect(STEP_LABELS).toEqual([
      "welcome",
      "hello",
      "genre",
      "taste",
      "ott",
      "notify",
    ]);
    expect(STEP_LABELS).toHaveLength(TOTAL_STEPS);
  });
});
