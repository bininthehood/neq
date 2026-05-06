/**
 * useSwipeGesture 단위 테스트 — Stage 4 D1 (F7 + #3) 4방향 제스처.
 *
 * 검증 범위 (swipe-stack.jsx 패턴 — `decideSwipe` 순수 함수):
 *  - 탭 판정: |dx|<8 ∧ |dy|<8 ∧ dt<300 → "tap" (DetailSheet 열림 트리거)
 *  - 위 스와이프: dy<-70 (dominant vertical) → "up" (분류만; G1-A 이후 hook 에서 미사용)
 *  - 아래 스와이프: dy>70 (dominant vertical) → "down" (save 트리거)
 *  - 좌 스와이프: dx<-70 (dominant horizontal) → "left" (nextCard)
 *  - 우 스와이프: dx>70 (dominant horizontal) → "right" (이전 카드 오버레이)
 *  - 임계 미만 → "none" (snap back)
 *  - tap 우선: dt<300 + 미세 이동 → "tap" (방향 판정 우회)
 *
 * 주의: G1-A 결정 (Handoff v2 Phase B) 이후 ↑ 스와이프 진입은 제거됐지만,
 *      `decideSwipe` 순수 분류기는 분류 결과 자체로 유효하므로 'up' 케이스를 보존.
 *      실제 hook 처리부 (onTouchEnd) 에서는 dragY < -THRESH 분기를 삭제했음.
 *
 * 순수 함수로 분리해 React mount 없이 검증 — 모노레포 호이스트 React 버전 충돌 회피.
 */
import { describe, it, expect } from "vitest";
import {
  decideSwipe,
  SWIPE_THRESHOLD,
  TAP_THRESHOLD,
  TAP_DURATION,
} from "../useSwipeGesture";

describe("decideSwipe (Stage 4 D1 — 4방향 + tap)", () => {
  it("상수: THRESH=70, TAP=8, TAP_DURATION=300 (swipe-stack.jsx 동일)", () => {
    expect(SWIPE_THRESHOLD).toBe(70);
    expect(TAP_THRESHOLD).toBe(8);
    expect(TAP_DURATION).toBe(300);
  });

  it("탭 (|dx|=2, |dy|=3, dt=200) → 'tap'", () => {
    expect(decideSwipe(2, 3, 200)).toBe("tap");
  });

  it("탭 임계 직전 (|dx|=7, |dy|=7, dt=299) → 'tap'", () => {
    expect(decideSwipe(7, 7, 299)).toBe("tap");
  });

  it("탭 dt 초과 (|dx|=2, |dy|=3, dt=400) → 미세 이동이라 'none' (방향 임계 미달)", () => {
    expect(decideSwipe(2, 3, 400)).toBe("none");
  });

  it("아래 스와이프 (dy=100 > 70) → 'down' (save 트리거)", () => {
    expect(decideSwipe(0, 100, 500)).toBe("down");
  });

  it("아래 스와이프 dx 동률보다 큰 dy (dx=20, dy=80) → vertical dominant 'down'", () => {
    expect(decideSwipe(20, 80, 500)).toBe("down");
  });

  it("위 스와이프 (dy=-100 < -70) → 'up' (DetailSheet)", () => {
    expect(decideSwipe(0, -100, 500)).toBe("up");
  });

  it("좌 스와이프 (dx=-120 < -70) → 'left' (nextCard)", () => {
    expect(decideSwipe(-120, 0, 500)).toBe("left");
  });

  it("우 스와이프 (dx=100 > 70) → 'right' (이전 카드 오버레이)", () => {
    expect(decideSwipe(100, 0, 500)).toBe("right");
  });

  it("dy 임계 미달 (dy=50, dx=0) → 'none'", () => {
    expect(decideSwipe(0, 50, 500)).toBe("none");
  });

  it("dx 임계 미달 (dx=-30) → 'none'", () => {
    expect(decideSwipe(-30, 0, 500)).toBe("none");
  });

  it("dominant axis: |dx|>|dy| 면 horizontal 우선 (dx=-90, dy=80) → 'left'", () => {
    expect(decideSwipe(-90, 80, 500)).toBe("left");
  });

  it("dominant axis: |dy|>|dx| 면 vertical 우선 (dx=60, dy=-90) → 'up'", () => {
    expect(decideSwipe(60, -90, 500)).toBe("up");
  });

  it("dominant horizontal 이지만 임계 미달 (dx=50, dy=10) → 'none'", () => {
    expect(decideSwipe(50, 10, 500)).toBe("none");
  });
});
