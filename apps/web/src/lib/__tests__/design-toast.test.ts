/**
 * @neq/design Toast — pure logic 단위 테스트 (v2)
 *
 * 검증 대상:
 *  - pushToastEntry: queue + maxVisible 동시 표시 제한 + FIFO hide
 *  - toastVariantStyles: legacy variant → token 매핑 (호환)
 *  - toastV2Styles: v2 type → token 매핑
 *  - toastCopy: type → microcopy (R3 v2)
 *  - defaultDurationFor: type 별 hold 시간
 *  - 상수: TOAST_DEFAULT_DURATION / TOAST_ENTER_DURATION / TOAST_EXIT_DURATION / TOAST_MAX_VISIBLE
 *
 * 변경 이력:
 *  - 2026-05-02: v2 6종 type 추가 (D8). ToastEntry 시그니처 변경 (message/variant → type/ctx).
 *    TOAST_DEFAULT_DURATION 2500→2400 (핸드오프 v2 기준).
 */

import { describe, it, expect } from "vitest";
import {
  pushToastEntry,
  toastVariantStyles,
  toastV2Styles,
  toastCopy,
  toastTone,
  defaultDurationFor,
  TOAST_DEFAULT_DURATION,
  TOAST_ENTER_DURATION,
  TOAST_EXIT_DURATION,
  TOAST_MAX_VISIBLE,
  TOAST_TYPES_V2,
  type ToastEntry,
} from "@neq/design";

describe("Toast — 상수", () => {
  it("기본 체류/등장/퇴장/최대 동시 값", () => {
    // v2: base 2400ms (핸드오프 R3). type 별 분기는 defaultDurationFor 가 처리.
    expect(TOAST_DEFAULT_DURATION).toBe(2400);
    expect(TOAST_ENTER_DURATION).toBe(250);
    expect(TOAST_EXIT_DURATION).toBe(150);
    expect(TOAST_MAX_VISIBLE).toBe(3);
  });

  it("v2 type 6종 — save/pass/remove/watched/sync-warn/error", () => {
    expect(TOAST_TYPES_V2).toEqual([
      "save",
      "pass",
      "remove",
      "watched",
      "sync-warn",
      "error",
    ]);
  });
});

describe("pushToastEntry — queue 동작", () => {
  const make = (id: number, visible = true): ToastEntry => ({
    id,
    type: "info",
    ctx: { message: `t${id}` },
    duration: 2400,
    visible,
  });

  it("빈 queue에 push → entry 1개", () => {
    const { queue, hideIds } = pushToastEntry(
      [],
      { id: 1, type: "info", ctx: { message: "hi" }, duration: 2400 },
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
      { id: 4, type: "info", ctx: { message: "t4" }, duration: 2400 },
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
      { id: 4, type: "info", ctx: { message: "t4" }, duration: 2400 },
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
      { id: 3, type: "info", ctx: { message: "t3" }, duration: 2400 },
      1,
    );
    // visible after push = [1,2,3] → maxVisible 1 → hide 2개 (1, 2)
    expect(hideIds).toEqual([1, 2]);
    expect(queue.find((t) => t.id === 1)?.visible).toBe(false);
    expect(queue.find((t) => t.id === 2)?.visible).toBe(false);
    expect(queue.find((t) => t.id === 3)?.visible).toBe(true);
  });
});

describe("toastVariantStyles — legacy variant → token (호환)", () => {
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

describe("toastV2Styles — v2 type → token", () => {
  it("save — ok tone (accent amber)", () => {
    const s = toastV2Styles("save");
    expect(s.glyphStroke).toBe("var(--accent)");
    expect(s.actionColor).toBe("var(--accent)");
  });

  it("pass — ok tone (accent amber)", () => {
    const s = toastV2Styles("pass");
    expect(s.glyphStroke).toBe("var(--accent)");
  });

  it("remove — muted glyph (회색)", () => {
    const s = toastV2Styles("remove");
    expect(s.glyphStroke).toBe("var(--text-secondary)");
  });

  it("sync-warn — warning tone", () => {
    const s = toastV2Styles("sync-warn");
    expect(s.glyphStroke).toBe("var(--warning)");
    expect(s.actionColor).toBe("var(--warning)");
  });

  it("error — danger tone", () => {
    const s = toastV2Styles("error");
    expect(s.glyphStroke).toBe("var(--danger)");
    expect(s.background).toBe("var(--danger-dim)");
  });
});

describe("toastTone — type → tone 매핑", () => {
  it("save/pass/remove/watched → ok", () => {
    expect(toastTone("save")).toBe("ok");
    expect(toastTone("pass")).toBe("ok");
    expect(toastTone("remove")).toBe("ok");
    expect(toastTone("watched")).toBe("ok");
  });

  it("sync-warn → warn", () => {
    expect(toastTone("sync-warn")).toBe("warn");
  });

  it("error → err", () => {
    expect(toastTone("error")).toBe("err");
  });
});

describe("defaultDurationFor — type 별 hold 시간", () => {
  it("save/pass/remove/watched → 2400ms", () => {
    expect(defaultDurationFor("save")).toBe(2400);
    expect(defaultDurationFor("pass")).toBe(2400);
    expect(defaultDurationFor("remove")).toBe(2400);
    expect(defaultDurationFor("watched")).toBe(2400);
  });

  it("sync-warn → 3200ms (덜 긴급, 더 길게)", () => {
    expect(defaultDurationFor("sync-warn")).toBe(3200);
  });

  it("error → 4000ms (재시도 결정 시간)", () => {
    expect(defaultDurationFor("error")).toBe(4000);
  });
});

describe("toastCopy — R3 v2 microcopy", () => {
  it("save — 책장에 담았어요 + title secondary + 실행 취소", () => {
    const c = toastCopy("save", { title: "Past Lives" });
    expect(c.primary).toBe("책장에 담았어요");
    expect(c.secondary).toBe("Past Lives");
    expect(c.action).toBe("실행 취소");
  });

  it("pass — 다음 카드 + 학습 안내 + 되돌리기", () => {
    const c = toastCopy("pass");
    expect(c.primary).toBe("다음 카드");
    expect(c.secondary).toBe("취향 학습에 반영해요");
    expect(c.action).toBe("되돌리기");
  });

  it("sync-warn — pending 개수 반영", () => {
    const c = toastCopy("sync-warn", { pending: 3 });
    expect(c.primary).toBe("연결되면 동기화돼요");
    expect(c.secondary).toBe("변경사항 3개 대기");
    expect(c.action).toBeNull();
  });

  it("sync-warn — pending 미지정 시 기본 secondary", () => {
    const c = toastCopy("sync-warn");
    expect(c.secondary).toBe("변경사항 대기");
  });

  it("error — message override 우선", () => {
    const c = toastCopy("error", { message: "검색 중 문제가 생겼어요" });
    expect(c.primary).toBe("검색 중 문제가 생겼어요");
    // message override 시 secondary 는 숨김
    expect(c.secondary).toBeNull();
    expect(c.action).toBe("다시");
  });

  it("error — message 없으면 기본 카피", () => {
    const c = toastCopy("error");
    expect(c.primary).toBe("저장 못 했어요");
    expect(c.secondary).toBe("다시 시도하면 보통 돼요");
  });

  it("watched — title 있으면 ?, 없으면 기본", () => {
    expect(toastCopy("watched", { title: "기생충" }).secondary).toBe("기생충 · 좋았어요?");
    expect(toastCopy("watched").secondary).toBe("좋았어요?");
  });
});
