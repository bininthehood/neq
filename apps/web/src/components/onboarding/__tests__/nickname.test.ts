/**
 * Onboarding V2 — Hello 단계의 닉네임 헬퍼 (`getUserNickname` / `setUserNickname`) 테스트.
 *
 * - LocalStorage 라운드트립
 * - 빈 문자열 → 키 제거 (V1 사용자 데이터 누락)
 * - trim 처리 (앞/뒤 공백 제거)
 * - SSR 안전 (window 없음 시 빈 문자열 + no-op)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getUserNickname, setUserNickname } from "../OnboardingStepHello";

beforeEach(() => {
  localStorage.clear();
});

describe("setUserNickname / getUserNickname 라운드트립", () => {
  it("빈 LocalStorage 면 빈 문자열 반환", () => {
    expect(getUserNickname()).toBe("");
  });

  it("저장한 값을 그대로 복원", () => {
    setUserNickname("민지");
    expect(getUserNickname()).toBe("민지");
  });

  it("앞/뒤 공백은 trim 처리", () => {
    setUserNickname("  지수  ");
    expect(getUserNickname()).toBe("지수");
  });

  it("빈 문자열 set 시 LocalStorage 에서 키 제거", () => {
    setUserNickname("민지");
    expect(localStorage.getItem("neq_user_nickname")).toBe("민지");
    setUserNickname("");
    expect(localStorage.getItem("neq_user_nickname")).toBeNull();
    expect(getUserNickname()).toBe("");
  });

  it("공백만 있는 입력도 키 제거", () => {
    setUserNickname("    ");
    expect(localStorage.getItem("neq_user_nickname")).toBeNull();
    expect(getUserNickname()).toBe("");
  });

  it("덮어쓰기 가능", () => {
    setUserNickname("민지");
    setUserNickname("지수");
    expect(getUserNickname()).toBe("지수");
  });
});
