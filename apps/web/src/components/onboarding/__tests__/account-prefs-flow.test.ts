/**
 * Onboarding V2 (D4a) 단계별 account_prefs 저장 흐름 무결성 테스트.
 *
 * 단계 컴포넌트가 호출하는 core 헬퍼들이 다음을 보장하는지 검증:
 *  - Taste 단계: setTasteGenres → tasteGenres 저장. 다른 필드 (subscribedOtt, notificationPrefs) 보존
 *  - OTT 단계: setSubscribedOtt → subscribedOtt 저장. 다른 필드 보존
 *  - updateNotificationPrefs: 알림 인프라 활성화 시 설정 화면/푸시 구독 API 에서 호출.
 *    onboarding notify 단계는 2026-06-16 제거 (인프라 disabled). 헬퍼 자체는 보존.
 *
 * 컴포넌트 자체 RTL 테스트보다 데이터 계층 호환성을 우선 검증 (위임 spec §4 게이트).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  setTasteGenres,
  setSubscribedOtt,
  updateNotificationPrefs,
  getAccountPrefs,
  defaultAccountPrefs,
} from "@/lib/account-prefs";

beforeEach(() => {
  localStorage.clear();
});

describe("D4a 단계별 account_prefs 흐름", () => {
  it("초기값은 defaultAccountPrefs 와 동일 (V1 사용자 영향 0)", () => {
    expect(getAccountPrefs()).toEqual(defaultAccountPrefs());
  });

  it("Taste 단계 — setTasteGenres 후 tasteGenres 만 채워진다", () => {
    setTasteGenres(["thriller", "drama", "doc"]);
    const prefs = getAccountPrefs();
    expect(prefs.tasteGenres).toEqual(["thriller", "drama", "doc"]);
    expect(prefs.subscribedOtt).toEqual([]);
    expect(prefs.notificationPrefs.weeklyRec).toBe(false);
  });

  it("OTT 단계 — setSubscribedOtt 가 tasteGenres 를 보존한다", () => {
    setTasteGenres(["thriller", "drama", "doc"]);
    setSubscribedOtt([8, 1883, 337]); // Netflix, Tving, Disney+

    const prefs = getAccountPrefs();
    expect(prefs.tasteGenres).toEqual(["thriller", "drama", "doc"]);
    expect(prefs.subscribedOtt).toEqual([8, 1883, 337]);
    // notificationPrefs 는 default 유지
    expect(prefs.notificationPrefs.weeklyRec).toBe(false);
    expect(prefs.notificationPrefs.pushSubscription).toBeNull();
  });

  it("updateNotificationPrefs — 헬퍼는 다른 필드를 보존한다 (설정 화면/푸시 구독 API 호출 대비)", () => {
    setTasteGenres(["thriller"]);
    setSubscribedOtt([8]);
    updateNotificationPrefs((prev) => ({
      ...prev,
      weeklyRec: true,
      newRelease: true,
      ottExpiry: false,
      monthlyReport: true,
    }));

    const prefs = getAccountPrefs();
    expect(prefs.tasteGenres).toEqual(["thriller"]);
    expect(prefs.subscribedOtt).toEqual([8]);
    expect(prefs.notificationPrefs.weeklyRec).toBe(true);
    expect(prefs.notificationPrefs.newRelease).toBe(true);
    expect(prefs.notificationPrefs.ottExpiry).toBe(false);
    expect(prefs.notificationPrefs.monthlyReport).toBe(true);
    // pushSubscription 은 onboarding 에서 별도 (Web Push subscribe)
    expect(prefs.notificationPrefs.pushSubscription).toBeNull();
  });

  it("onboarding 진행 후 누적된 prefs 는 cold start V2 LLM 입력에 그대로 전달 가능", () => {
    // welcome / hello 는 prefs 변경 X
    // taste
    setTasteGenres(["thriller", "drama", "sf"]);
    // ott
    setSubscribedOtt([8, 1883]);

    const prefs = getAccountPrefs();
    // LLM 입력 (computeV2Inputs body 와 호환)
    expect(prefs.tasteGenres.length).toBeGreaterThanOrEqual(3);
    expect(prefs.subscribedOtt.length).toBeGreaterThan(0);
    // notificationPrefs 는 default 유지 (onboarding 에서 더 이상 토글하지 않음)
    expect(prefs.notificationPrefs.weeklyRec).toBe(false);
  });

  it("도중 종료해도 prefs 가 LocalStorage 에 남아있다 (사용자 재진입 시 복원)", () => {
    setTasteGenres(["thriller", "drama"]);
    // 다른 페이지로 이동 시뮬레이션 — 모듈 캐시 재로드 되지 않으므로 동일 모듈 호출
    const prefs = getAccountPrefs();
    expect(prefs.tasteGenres).toEqual(["thriller", "drama"]);
  });

  it("LocalStorage 키는 V1/V2 가 동일 (`neq_account_prefs`) — 회귀 0", () => {
    setTasteGenres(["thriller"]);
    const raw = localStorage.getItem("neq_account_prefs");
    expect(raw).toBeTruthy();
    const obj = JSON.parse(raw!);
    expect(obj.tasteGenres).toEqual(["thriller"]);
  });
});
