import { describe, expect, it } from "vitest";
import {
  monthKeyOf,
  monthLabelOf,
  monthOptionsOf,
  resolveSnapIndex,
  rulerSlotsOf,
} from "../SavedSortControl";
import type { SavedItem } from "@/lib/types";

const item = (savedAt: number, tmdbId = savedAt): SavedItem =>
  ({ savedAt, recommendation: { tmdbId } }) as SavedItem;

describe("Saved month/ruler helpers", () => {
  it("monthKeyOf/monthLabelOf는 로컬 저장 월을 단조 key와 한국어 라벨로 변환한다", () => {
    const jun15 = item(new Date(2026, 5, 15, 12).getTime());
    const jun01 = item(new Date(2026, 5, 1, 0).getTime());
    const may31 = item(new Date(2026, 4, 31, 23).getTime());

    expect(monthKeyOf(jun15)).toBe(monthKeyOf(jun01));
    expect(monthKeyOf(jun15)).not.toBe(monthKeyOf(may31));
    expect(monthLabelOf(monthKeyOf(jun15))).toBe("2026년 6월");
  });

  it("monthOptionsOf는 실제 데이터가 있는 월만 최신순으로 중복 제거한다", () => {
    const items = [
      item(new Date(2026, 4, 31, 23).getTime()),
      item(new Date(2026, 5, 1, 0).getTime()),
      item(new Date(2025, 5, 30, 12).getTime()),
      item(new Date(2026, 5, 15, 12).getTime()),
    ];

    expect(monthOptionsOf(items).map((option) => option.label)).toEqual([
      "2026년 6월",
      "2026년 5월",
      "2025년 6월",
    ]);
  });

  it("rulerSlotsOf는 첫 저장 월부터 현재 월까지 빈 달 포함 연속 슬롯을 만든다", () => {
    const may = item(new Date(2026, 4, 10).getTime());
    const jul = item(new Date(2026, 6, 5).getTime());
    const nowKey = 2026 * 12 + 6; // 2026년 7월

    const slots = rulerSlotsOf([jul, may], nowKey);

    expect(slots).toHaveLength(3);
    expect(slots.map((slot) => [slot.label, slot.hasData])).toEqual([
      ["2026년 5월", true],
      ["2026년 6월", false],
      ["2026년 7월", true],
    ]);
    expect(slots[0].yearLabel).toBe("2026");
    expect(slots[1].yearLabel).toBeNull();
  });

  it("resolveSnapIndex는 빈 달 정지를 가장 가까운 데이터 월로 해석하고 전체 존은 유지한다", () => {
    const may = item(new Date(2026, 4, 10).getTime());
    const jul = item(new Date(2026, 6, 5).getTime());
    const slots = rulerSlotsOf([jul, may], 2026 * 12 + 6);

    expect(resolveSnapIndex(slots, 1)).toBe(2);
    expect(resolveSnapIndex(slots, 0)).toBe(0);
    expect(resolveSnapIndex(slots, 3)).toBe(3);
    expect(resolveSnapIndex(slots, -2)).toBe(0);
  });
});
