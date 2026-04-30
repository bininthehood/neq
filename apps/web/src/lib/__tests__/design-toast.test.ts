/**
 * @neq/design Toast — pure logic 단위 테스트
 *
 * 검증 대상:
 *  - pushToastEntry: queue + maxVisible 동시 표시 제한 + FIFO hide
 *  - toastVariantStyles: variant → token 매핑
 *  - 상수: TOAST_DEFAULT_DURATION / TOAST_ENTER_DURATION / TOAST_EXIT_DURATION / TOAST_MAX_VISIBLE
 */

import { describe, it, expect } from "vitest";
import {
  pushToastEntry,
  toastVariantStyles,
  TOAST_DEFAULT_DURATION,
  TOAST_ENTER_DURATION,
  TOAST_EXIT_DURATION,
  TOAST_MAX_VISIBLE,
  type ToastEntry,
} from "@neq/design";

describe("Toast — 상수", () => {
  it("기본 체류/등장/퇴장/최대 동시 값", () => {
    expect(TOAST_DEFAULT_DURATION).toBe(2500);
    expect(TOAST_ENTER_DURATION).toBe(250);
    expect(TOAST_EXIT_DURATION).toBe(150);
    expect(TOAST_MAX_VISIBLE).toBe(3);
  });
});

describe("pushToastEntry — queue 동작", () => {
  const make = (id: number, visible = true): ToastEntry => ({
    id,
    message: `t${id}`,
    variant: "info",
    duration: 2500,
    visible,
  });

  it("빈 queue에 push → entry 1개", () => {
    const { queue, hideIds } = pushToastEntry(
      [],
      { id: 1, message: "hi", variant: "info", duration: 2500 },
      3,
    );
    expect(queue).toHaveLength(1);
    expect(queue[0].visible).toBe(true);
    expect(hideIds).toEqual([]);
  });

  it("3개 visible 상태에서 4번째 push → 가장 오래된 visible(id=1)이 hide", () => {
    const initial: ToastEntry[] = [make(1), make(2), make(3)];
    const { queue, hideIds } = pushToastEntry(
      initial,
      { id: 4, message: "t4", variant: "info", duration: 2500 },
      3,
    );
    expect(queue).toHaveLength(4);
    expect(hideIds).toEqual([1]);
    expect(queue.find((t) => t.id === 1)?.visible).toBe(false);
    expect(queue.find((t) => t.id === 4)?.visible).toBe(true);
  });

  it("이미 hide 상태인 항목은 visible 카운트에서 제외", () => {
    // id=1은 이미 hide. 신규 push해도 visible은 [2,3,4] = 3개 → maxVisible 3 OK, hide 없음
    const initial: ToastEntry[] = [make(1, false), make(2), make(3)];
    const { queue, hideIds } = pushToastEntry(
      initial,
      { id: 4, message: "t4", variant: "info", duration: 2500 },
      3,
    );
    expect(queue).toHaveLength(4);
    expect(hideIds).toEqual([]);
    expect(queue.find((t) => t.id === 4)?.visible).toBe(true);
  });

  it("maxVisible=1 — 새 push 시 기존 visible 모두 hide", () => {
    const initial: ToastEntry[] = [make(1), make(2)];
    const { queue, hideIds } = pushToastEntry(
      initial,
      { id: 3, message: "t3", variant: "info", duration: 2500 },
      1,
    );
    // visible after push = [1,2,3] → maxVisible 1 → hide 2개 (1, 2)
    expect(hideIds).toEqual([1, 2]);
    expect(queue.find((t) => t.id === 1)?.visible).toBe(false);
    expect(queue.find((t) => t.id === 2)?.visible).toBe(false);
    expect(queue.find((t) => t.id === 3)?.visible).toBe(true);
  });
});

describe("toastVariantStyles — variant → token", () => {
  it("success — left border accent = success token", () => {
    const s = toastVariantStyles("success");
    expect(s.accent).toBe("var(--success)");
    expect(s.background).toBe("var(--surface-raised)");
  });

  it("error — left border accent = danger + role=alert 사용 (Item에서)", () => {
    const s = toastVariantStyles("error");
    expect(s.accent).toBe("var(--danger)");
    // error는 border도 danger로 강조
    expect(s.border).toContain("var(--danger)");
  });

  it("info — accent = info token", () => {
    const s = toastVariantStyles("info");
    expect(s.accent).toBe("var(--info)");
  });
});
