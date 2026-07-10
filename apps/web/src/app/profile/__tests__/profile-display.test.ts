import { describe, expect, it } from "vitest";
import { buildProfilePersonasForDisplay } from "../profile-display";
import type { SavedItem } from "@/lib/types";

const saved = (title: string, tmdbId: number): SavedItem =>
  ({
    savedAt: tmdbId,
    recommendation: {
      tmdbId,
      title,
      titleEn: title,
      type: "movie",
      reason: "test",
      posterUrl: null,
      rating: 0,
      date: "2026-01-01",
      overview: "",
      providers: [],
      watchLink: null,
      director: null,
      cast: [],
      runtime: null,
      seasons: null,
      country: [],
      backdrop: null,
    },
  }) as SavedItem;

describe("buildProfilePersonasForDisplay", () => {
  it("첫 페르소나 favorites가 비어 있으면 loved/good 기반 tasteItems를 최대 5개 채운다", () => {
    const personas = [
      { id: "p1", name: "기본", favorites: [] },
      { id: "p2", name: "액션", favorites: [] },
    ];

    expect(
      buildProfilePersonasForDisplay({
        personas,
        tasteItems: ["기생충", "미나리", "헤어질 결심", "올드보이", "괴물", "박쥐"],
        savedItems: [saved("저장작", 1)],
      }),
    ).toEqual([
      { id: "p1", name: "기본", favorites: ["기생충", "미나리", "헤어질 결심", "올드보이", "괴물"] },
      { id: "p2", name: "액션", favorites: [] },
    ]);
  });

  it("tasteItems가 없으면 saved 상위 5개 제목으로 첫 페르소나를 보정한다", () => {
    const personas = [{ id: "p1", name: "기본", favorites: [] }];

    expect(
      buildProfilePersonasForDisplay({
        personas,
        tasteItems: [],
        savedItems: [1, 2, 3, 4, 5, 6].map((n) => saved(`저장작${n}`, n)),
      })[0].favorites,
    ).toEqual(["저장작1", "저장작2", "저장작3", "저장작4", "저장작5"]);
  });

  it("첫 페르소나에 기존 favorites가 있으면 보정하지 않는다", () => {
    const personas = [{ id: "p1", name: "기본", favorites: ["이미 있음"] }];

    expect(
      buildProfilePersonasForDisplay({
        personas,
        tasteItems: ["기생충"],
        savedItems: [saved("저장작", 1)],
      }),
    ).toEqual(personas);
  });
});
