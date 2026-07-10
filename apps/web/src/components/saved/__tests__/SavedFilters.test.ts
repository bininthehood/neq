import { describe, expect, it } from "vitest";
import { buildSavedViewFilters } from "../SavedFilters";

describe("buildSavedViewFilters", () => {
  it("아카이브가 0개여도 native parity를 위해 아카이브 탭을 항상 노출한다", () => {
    expect(
      buildSavedViewFilters({
        activeCount: 2,
        unwatchedCount: 1,
        watchedCount: 1,
        archivedCount: 0,
      }),
    ).toEqual([
      { key: "all", label: "전체", count: 2 },
      { key: "unwatched", label: "안 본 작품", count: 1 },
      { key: "watched", label: "시청 완료", count: 1 },
      { key: "archived", label: "아카이브", count: 0 },
    ]);
  });

  it("아카이브 카운트가 있으면 같은 탭 순서로 카운트를 표시한다", () => {
    expect(
      buildSavedViewFilters({
        activeCount: 3,
        unwatchedCount: 2,
        watchedCount: 1,
        archivedCount: 4,
      }).map((filter) => [filter.key, filter.count]),
    ).toEqual([
      ["all", 3],
      ["unwatched", 2],
      ["watched", 1],
      ["archived", 4],
    ]);
  });
});
