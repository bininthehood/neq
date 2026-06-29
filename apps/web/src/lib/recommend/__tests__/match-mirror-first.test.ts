/**
 * match-mirror-first (2026-06-29 원칙화) — `matchFavoritesToTMDB` 단위 테스트.
 *
 * 검증 핵심:
 *   - flag off → 변경 전 prod 경로 (searchTMDB movie-first, bit-identical 롤백)
 *   - flag on  → 미러(tmdb_metadata + tmdb_catalog.popularity) popularity-best resolve
 *   - flag on 미러 미스 → searchBestByPopularity (search/multi popularity) fallback
 *   - 동명이작 → popularity desc 로 best 선택 (movie-first 폐기)
 *   - 무명 高rating 오염 회피 → rating 보다 popularity 우선
 *   - 미러 throw → 전량 popularity fallback
 *
 * 실제 DB / 외부 TMDB 호출 없음 — supabase-admin / tmdb 모듈 mock.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.TMDB_API_KEY = "test-tmdb-key";
  process.env.OPENAI_API_KEY = "sk-test-0123456789abcdef0123456789abcdef";
});

// ── tmdb 모듈 mock ──
// searchTMDB (off 경로, movie-first): fixtureSearch 테이블 기반.
type SearchKey = string; // `${title}|${type}`
let searchTable: Record<SearchKey, { id: number; genre_ids: number[] } | null> = {};
const searchSpy = vi.fn(
  async (title: string, type: "movie" | "series") => {
    const v = searchTable[`${title}|${type}`];
    return v ? { id: v.id, genre_ids: v.genre_ids } : null;
  },
);

// searchBestByPopularity (on 경로 fallback): title → BestMatch | null.
let bestTable: Record<string, { id: number; type: "movie" | "series"; genreIds: number[] } | null> = {};
const bestSpy = vi.fn(async (title: string) => bestTable[title] ?? null);

vi.mock("../../tmdb", () => ({
  searchTMDB: (title: string, type: "movie" | "series") => searchSpy(title, type),
  searchBestByPopularity: (title: string) => bestSpy(title),
  getTMDBRecommendations: vi.fn(async () => []),
}));

// ── supabase-admin mock ──
// from("tmdb_metadata").select().or()  → mirrorRows (title/title_en/rating 매칭)
// from("tmdb_catalog").select().in()   → catalogRows (popularity)
type MirrorRow = {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string | null;
  title_en: string | null;
  rating: number | null;
  genre_ids: number[] | null;
};
type CatalogRow = {
  tmdb_id: number;
  media_type: "movie" | "tv";
  popularity: number | null;
};
let mirrorRows: MirrorRow[] = [];
let catalogRows: CatalogRow[] = [];
let mirrorShouldThrow = false;
let orCalls: string[] = [];

function makeMetadataQuery() {
  const self: Record<string, unknown> = {};
  self.select = vi.fn(() => self);
  self.or = vi.fn((expr: string) => {
    orCalls.push(expr);
    return self;
  });
  (self as { then: unknown }).then = (
    resolve: (v: { data: MirrorRow[] | null; error: unknown }) => unknown,
  ) => {
    if (mirrorShouldThrow) {
      return Promise.resolve({ data: null, error: new Error("mirror boom") }).then(
        resolve,
      );
    }
    return Promise.resolve({ data: mirrorRows, error: null }).then(resolve);
  };
  return self;
}

function makeCatalogQuery() {
  const self: Record<string, unknown> = {};
  self.select = vi.fn(() => self);
  self.in = vi.fn((_col: string, ids: number[]) => {
    (self as { _ids?: number[] })._ids = ids;
    return self;
  });
  (self as { then: unknown }).then = (
    resolve: (v: { data: CatalogRow[] | null; error: unknown }) => unknown,
  ) => {
    const ids = (self as { _ids?: number[] })._ids ?? [];
    const data = catalogRows.filter((r) => ids.includes(r.tmdb_id));
    return Promise.resolve({ data, error: null }).then(resolve);
  };
  return self;
}

vi.mock("../../supabase-admin", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "tmdb_metadata") return makeMetadataQuery();
      if (table === "tmdb_catalog") return makeCatalogQuery();
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { matchFavoritesToTMDB } from "../match";

beforeEach(() => {
  searchTable = {};
  bestTable = {};
  mirrorRows = [];
  catalogRows = [];
  mirrorShouldThrow = false;
  orCalls = [];
  searchSpy.mockClear();
  bestSpy.mockClear();
  delete process.env.REC_MIRROR_MATCH_ENABLED;
});

afterEach(() => {
  delete process.env.REC_MIRROR_MATCH_ENABLED;
});

describe("matchFavoritesToTMDB — flag off (변경 전 prod, movie-first)", () => {
  it("flag off 면 미러 안 보고 searchTMDB 만 사용 (movie-first)", async () => {
    searchTable["기생충|movie"] = { id: 496243, genre_ids: [35, 18, 53] };
    const r = await matchFavoritesToTMDB(["기생충"]);
    expect(r).toEqual([
      { id: 496243, type: "movie", title: "기생충", genreIds: [35, 18, 53] },
    ]);
    expect(orCalls.length).toBe(0);
    expect(searchSpy).toHaveBeenCalledWith("기생충", "movie");
    expect(bestSpy).not.toHaveBeenCalled();
  });

  it("flag off — movie 미스 시 series 폴백 (변경 전 우선순위 보존)", async () => {
    searchTable["오징어 게임|movie"] = null;
    searchTable["오징어 게임|series"] = { id: 93405, genre_ids: [10759, 9648] };
    const r = await matchFavoritesToTMDB(["오징어 게임"]);
    expect(r).toEqual([
      { id: 93405, type: "series", title: "오징어 게임", genreIds: [10759, 9648] },
    ]);
  });

  it("빈 favorites → 빈 배열, 외부 호출 0", async () => {
    const r = await matchFavoritesToTMDB([]);
    expect(r).toEqual([]);
    expect(searchSpy).not.toHaveBeenCalled();
    expect(bestSpy).not.toHaveBeenCalled();
  });
});

describe("matchFavoritesToTMDB — flag on (popularity 원칙화)", () => {
  beforeEach(() => {
    process.env.REC_MIRROR_MATCH_ENABLED = "true";
  });

  it("미러 단일 히트 → searchTMDB/best 호출 없이 resolve", async () => {
    mirrorRows = [
      {
        tmdb_id: 496243,
        media_type: "movie",
        title: "기생충",
        title_en: "Parasite",
        rating: 8.5,
        genre_ids: [35, 18, 53],
      },
    ];
    catalogRows = [{ tmdb_id: 496243, media_type: "movie", popularity: 34 }];
    const r = await matchFavoritesToTMDB(["기생충"]);
    expect(r).toEqual([
      { id: 496243, type: "movie", title: "기생충", genreIds: [35, 18, 53] },
    ]);
    expect(searchSpy).not.toHaveBeenCalled();
    expect(bestSpy).not.toHaveBeenCalled();
    expect(orCalls.length).toBe(1);
  });

  it("title_en 으로도 매칭 (영문 favorite)", async () => {
    mirrorRows = [
      {
        tmdb_id: 496243,
        media_type: "movie",
        title: "기생충",
        title_en: "Parasite",
        rating: 8.5,
        genre_ids: [35, 18, 53],
      },
    ];
    catalogRows = [{ tmdb_id: 496243, media_type: "movie", popularity: 34 }];
    const r = await matchFavoritesToTMDB(["Parasite"]);
    expect(r[0].id).toBe(496243);
    expect(bestSpy).not.toHaveBeenCalled();
  });

  it("정규화 (대소문자/공백) 매칭", async () => {
    mirrorRows = [
      {
        tmdb_id: 1,
        media_type: "movie",
        title: null,
        title_en: "The Matrix",
        rating: 8.2,
        genre_ids: [28, 878],
      },
    ];
    catalogRows = [{ tmdb_id: 1, media_type: "movie", popularity: 40 }];
    const r = await matchFavoritesToTMDB(["  the   matrix "]);
    expect(r[0].id).toBe(1);
    expect(bestSpy).not.toHaveBeenCalled();
  });

  it("동명이작 → popularity 최상위 채택 (movie/tv 통합, movie-first 폐기)", async () => {
    // 같은 제목 olddboy: movie 670(pop 12.8) vs movie 87516(pop 5.4) → 670 채택.
    mirrorRows = [
      { tmdb_id: 670, media_type: "movie", title: "올드보이", title_en: "올드보이", rating: 8.2, genre_ids: [18, 53] },
      { tmdb_id: 87516, media_type: "movie", title: "올드보이", title_en: "Oldboy", rating: 5.9, genre_ids: [28] },
    ];
    catalogRows = [
      { tmdb_id: 670, media_type: "movie", popularity: 12.8 },
      { tmdb_id: 87516, media_type: "movie", popularity: 5.4 },
    ];
    const r = await matchFavoritesToTMDB(["올드보이"]);
    expect(r[0]).toEqual({ id: 670, type: "movie", title: "올드보이", genreIds: [18, 53] });
  });

  it("동명이작 movie/tv → popularity 더 높은 type 선택 (movie 우선 아님)", async () => {
    // 오징어 게임: tv 93405(pop 61) vs 무명 movie 1412113(pop 7) → tv 채택.
    mirrorRows = [
      { tmdb_id: 93405, media_type: "tv", title: "오징어 게임", title_en: "Squid Game", rating: 7.9, genre_ids: [10759, 9648] },
      { tmdb_id: 1412113, media_type: "movie", title: "오징어 게임", title_en: "Squid Game BTS", rating: 8.4, genre_ids: [99] },
    ];
    catalogRows = [
      { tmdb_id: 93405, media_type: "tv", popularity: 61 },
      { tmdb_id: 1412113, media_type: "movie", popularity: 7 },
    ];
    const r = await matchFavoritesToTMDB(["오징어 게임"]);
    expect(r[0]).toEqual({ id: 93405, type: "series", title: "오징어 게임", genreIds: [10759, 9648] });
  });

  it("무명 高rating 오염 회피 → popularity 우선 (리틀 포레스트)", async () => {
    // tv 92286 rating=10/pop=1.1 (무명) vs movie 448491 rating=7.6/pop=2.06 (정답).
    mirrorRows = [
      { tmdb_id: 92286, media_type: "tv", title: "리틀 포레스트", title_en: "리틀 포레스트", rating: 10, genre_ids: [99] },
      { tmdb_id: 448491, media_type: "movie", title: "리틀 포레스트", title_en: "Little Forest", rating: 7.6, genre_ids: [18] },
    ];
    catalogRows = [
      { tmdb_id: 92286, media_type: "tv", popularity: 1.1 },
      { tmdb_id: 448491, media_type: "movie", popularity: 2.06 },
    ];
    const r = await matchFavoritesToTMDB(["리틀 포레스트"]);
    expect(r[0].id).toBe(448491);
    expect(r[0].type).toBe("movie");
  });

  it("popularity 동률 → rating tie-break", async () => {
    mirrorRows = [
      { tmdb_id: 10, media_type: "movie", title: "동률작", title_en: null, rating: 6, genre_ids: [1] },
      { tmdb_id: 20, media_type: "movie", title: "동률작", title_en: null, rating: 8, genre_ids: [2] },
    ];
    catalogRows = [
      { tmdb_id: 10, media_type: "movie", popularity: 5 },
      { tmdb_id: 20, media_type: "movie", popularity: 5 },
    ];
    const r = await matchFavoritesToTMDB(["동률작"]);
    expect(r[0].id).toBe(20); // rating 8 > 6
  });

  it("catalog popularity 부재 → rating 으로 best (둘 다 -1 fallback)", async () => {
    mirrorRows = [
      { tmdb_id: 30, media_type: "movie", title: "노카탈로그", title_en: null, rating: 6, genre_ids: [1] },
      { tmdb_id: 40, media_type: "tv", title: "노카탈로그", title_en: null, rating: 8.5, genre_ids: [2] },
    ];
    catalogRows = []; // catalog 미존재 → 둘 다 popularity -1 → rating 으로 결정.
    const r = await matchFavoritesToTMDB(["노카탈로그"]);
    expect(r[0].id).toBe(40); // rating 8.5 > 6
    expect(r[0].type).toBe("series");
  });

  it("미러 미스 → searchBestByPopularity fallback", async () => {
    mirrorRows = [];
    bestTable["없는작품"] = { id: 777, type: "series", genreIds: [18] };
    const r = await matchFavoritesToTMDB(["없는작품"]);
    expect(r).toEqual([
      { id: 777, type: "series", title: "없는작품", genreIds: [18] },
    ]);
    expect(bestSpy).toHaveBeenCalledWith("없는작품");
    expect(searchSpy).not.toHaveBeenCalled(); // off 경로 searchTMDB 미사용
  });

  it("혼합 — 히트는 미러, 미스만 popularity fallback", async () => {
    mirrorRows = [
      { tmdb_id: 496243, media_type: "movie", title: "기생충", title_en: "Parasite", rating: 8.5, genre_ids: [35, 18, 53] },
    ];
    catalogRows = [{ tmdb_id: 496243, media_type: "movie", popularity: 34 }];
    bestTable["미러없음"] = { id: 555, type: "movie", genreIds: [12] };
    const r = await matchFavoritesToTMDB(["기생충", "미러없음"]);
    const byTitle = Object.fromEntries(r.map((m) => [m.title, m]));
    expect(byTitle["기생충"].id).toBe(496243);
    expect(byTitle["미러없음"].id).toBe(555);
    expect(bestSpy).toHaveBeenCalledTimes(1);
    expect(bestSpy).toHaveBeenCalledWith("미러없음");
  });

  it("미러 쿼리 throw → 전량 popularity fallback", async () => {
    mirrorShouldThrow = true;
    bestTable["기생충"] = { id: 496243, type: "movie", genreIds: [35, 18, 53] };
    const r = await matchFavoritesToTMDB(["기생충"]);
    expect(r).toEqual([
      { id: 496243, type: "movie", title: "기생충", genreIds: [35, 18, 53] },
    ]);
    expect(bestSpy).toHaveBeenCalledWith("기생충");
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it("fallback 도 미스 → 해당 favorite 스킵 (null 필터)", async () => {
    mirrorRows = [];
    bestTable["완전없음"] = null;
    const r = await matchFavoritesToTMDB(["완전없음"]);
    expect(r).toEqual([]);
  });

  it("genre_ids null 인 미러 row → 빈 배열로 정규화", async () => {
    mirrorRows = [
      { tmdb_id: 9, media_type: "movie", title: "장르없음", title_en: null, rating: 6, genre_ids: null },
    ];
    catalogRows = [{ tmdb_id: 9, media_type: "movie", popularity: 3 }];
    const r = await matchFavoritesToTMDB(["장르없음"]);
    expect(r[0].genreIds).toEqual([]);
  });
});

describe("matchFavoritesToTMDB — off vs on 의도적 차이 (원칙화)", () => {
  it("시리즈 favorite: off 는 무명 movie 오매칭, on 은 popularity-top tv 교정", async () => {
    // off (movie-first): movie 검색이 무명작 1412113 을 먼저 잡음.
    searchTable["오징어 게임|movie"] = { id: 1412113, genre_ids: [99] };

    delete process.env.REC_MIRROR_MATCH_ENABLED;
    const off = await matchFavoritesToTMDB(["오징어 게임"]);
    expect(off[0].id).toBe(1412113); // off 의 latent 버그 (무명 movie)

    // on: 미러 popularity-top = tv 93405.
    mirrorRows = [
      { tmdb_id: 93405, media_type: "tv", title: "오징어 게임", title_en: "Squid Game", rating: 7.9, genre_ids: [10759, 9648] },
      { tmdb_id: 1412113, media_type: "movie", title: "오징어 게임", title_en: "Squid Game BTS", rating: 8.4, genre_ids: [99] },
    ];
    catalogRows = [
      { tmdb_id: 93405, media_type: "tv", popularity: 61 },
      { tmdb_id: 1412113, media_type: "movie", popularity: 7 },
    ];
    process.env.REC_MIRROR_MATCH_ENABLED = "true";
    const on = await matchFavoritesToTMDB(["오징어 게임"]);
    expect(on[0].id).toBe(93405); // on 이 교정
    expect(on[0].type).toBe("series");
  });
});
