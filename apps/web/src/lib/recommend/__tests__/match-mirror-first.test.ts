/**
 * match-mirror-first (2026-06-24) — `matchFavoritesToTMDB` 미러-우선 경로 단위 테스트.
 *
 * 검증 핵심 (정확성 1순위):
 *   - flag off → 변경 전 searchTMDB-only 경로 (bit-identical)
 *   - flag on  → 미러 히트는 searchTMDB 호출 없이 resolve
 *   - 미러 미스 → 기존 searchTMDB fallback (적중 수 불변)
 *   - 혼합 (일부 히트 + 일부 미스) → 미스만 searchTMDB
 *   - 미러 throw → 전량 searchTMDB fallback
 *   - 적중 id/type/genreIds 가 변경 전(searchTMDB-only)과 동일
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

// ── tmdb 모듈 mock (searchTMDB / getTMDBRecommendations) ──
// searchTMDB 는 type 별로 응답 — fixtureSearch 테이블 기반.
type SearchKey = string; // `${title}|${type}`
let searchTable: Record<SearchKey, { id: number; genre_ids: number[] } | null> = {};
const searchSpy = vi.fn(
  async (title: string, type: "movie" | "series") => {
    const v = searchTable[`${title}|${type}`];
    return v ? { id: v.id, genre_ids: v.genre_ids } : null;
  },
);

vi.mock("../../tmdb", () => ({
  searchTMDB: (title: string, type: "movie" | "series") => searchSpy(title, type),
  getTMDBRecommendations: vi.fn(async () => []),
}));

// ── supabase-admin mock — .or() 쿼리 1회 (await 시 mirrorRows resolve) ──
type MirrorRow = {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string | null;
  title_en: string | null;
  genre_ids: number[] | null;
};
let mirrorRows: MirrorRow[] = [];
let mirrorShouldThrow = false;
let orCalls: string[] = [];

function makeMirrorQuery() {
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

vi.mock("../../supabase-admin", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== "tmdb_metadata") throw new Error(`unexpected table ${table}`);
      return makeMirrorQuery();
    },
  }),
}));

import { matchFavoritesToTMDB } from "../match";

beforeEach(() => {
  searchTable = {};
  mirrorRows = [];
  mirrorShouldThrow = false;
  orCalls = [];
  searchSpy.mockClear();
  delete process.env.REC_MIRROR_MATCH_ENABLED;
});

afterEach(() => {
  delete process.env.REC_MIRROR_MATCH_ENABLED;
});

describe("matchFavoritesToTMDB — flag off (기존 경로)", () => {
  it("flag off 면 미러 안 보고 searchTMDB 만 사용", async () => {
    searchTable["기생충|movie"] = { id: 496243, genre_ids: [35, 18, 53] };
    const r = await matchFavoritesToTMDB(["기생충"]);
    expect(r).toEqual([
      { id: 496243, type: "movie", title: "기생충", genreIds: [35, 18, 53] },
    ]);
    // 미러 쿼리 미사용
    expect(orCalls.length).toBe(0);
    // movie 검색 1회
    expect(searchSpy).toHaveBeenCalledWith("기생충", "movie");
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
  });
});

describe("matchFavoritesToTMDB — flag on (미러-우선)", () => {
  beforeEach(() => {
    process.env.REC_MIRROR_MATCH_ENABLED = "true";
  });

  it("미러 히트 → searchTMDB 호출 없이 resolve", async () => {
    mirrorRows = [
      {
        tmdb_id: 496243,
        media_type: "movie",
        title: "기생충",
        title_en: "Parasite",
        genre_ids: [35, 18, 53],
      },
    ];
    const r = await matchFavoritesToTMDB(["기생충"]);
    expect(r).toEqual([
      { id: 496243, type: "movie", title: "기생충", genreIds: [35, 18, 53] },
    ]);
    expect(searchSpy).not.toHaveBeenCalled();
    expect(orCalls.length).toBe(1);
  });

  it("title_en 으로도 매칭 (영문 favorite)", async () => {
    mirrorRows = [
      {
        tmdb_id: 496243,
        media_type: "movie",
        title: "기생충",
        title_en: "Parasite",
        genre_ids: [35, 18, 53],
      },
    ];
    const r = await matchFavoritesToTMDB(["Parasite"]);
    expect(r[0].id).toBe(496243);
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it("정규화 (대소문자/공백) 매칭", async () => {
    mirrorRows = [
      {
        tmdb_id: 1,
        media_type: "movie",
        title: null,
        title_en: "The Matrix",
        genre_ids: [28, 878],
      },
    ];
    const r = await matchFavoritesToTMDB(["  the   matrix "]);
    expect(r[0].id).toBe(1);
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it("미러 미스 → searchTMDB fallback (적중 유지)", async () => {
    mirrorRows = []; // 미러에 없음
    searchTable["없는작품|movie"] = null;
    searchTable["없는작품|series"] = { id: 777, genre_ids: [18] };
    const r = await matchFavoritesToTMDB(["없는작품"]);
    expect(r).toEqual([
      { id: 777, type: "series", title: "없는작품", genreIds: [18] },
    ]);
    expect(searchSpy).toHaveBeenCalledWith("없는작품", "movie");
    expect(searchSpy).toHaveBeenCalledWith("없는작품", "series");
  });

  it("혼합 — 히트는 미러, 미스만 searchTMDB", async () => {
    mirrorRows = [
      {
        tmdb_id: 496243,
        media_type: "movie",
        title: "기생충",
        title_en: "Parasite",
        genre_ids: [35, 18, 53],
      },
    ];
    searchTable["미러없음|movie"] = { id: 555, genre_ids: [12] };
    const r = await matchFavoritesToTMDB(["기생충", "미러없음"]);
    const byTitle = Object.fromEntries(r.map((m) => [m.title, m]));
    expect(byTitle["기생충"].id).toBe(496243);
    expect(byTitle["미러없음"].id).toBe(555);
    // 미러 히트("기생충")는 searchTMDB 미호출, 미스("미러없음")만 호출
    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(searchSpy).toHaveBeenCalledWith("미러없음", "movie");
  });

  it("movie 우선 — 같은 제목 movie/tv 양쪽 존재 시 movie 채택", async () => {
    mirrorRows = [
      { tmdb_id: 200, media_type: "tv", title: "동명작", title_en: null, genre_ids: [18] },
      { tmdb_id: 100, media_type: "movie", title: "동명작", title_en: null, genre_ids: [28] },
    ];
    const r = await matchFavoritesToTMDB(["동명작"]);
    expect(r[0]).toEqual({ id: 100, type: "movie", title: "동명작", genreIds: [28] });
  });

  it("미러 쿼리 throw → 전량 searchTMDB fallback", async () => {
    mirrorShouldThrow = true;
    searchTable["기생충|movie"] = { id: 496243, genre_ids: [35, 18, 53] };
    const r = await matchFavoritesToTMDB(["기생충"]);
    expect(r).toEqual([
      { id: 496243, type: "movie", title: "기생충", genreIds: [35, 18, 53] },
    ]);
    expect(searchSpy).toHaveBeenCalledWith("기생충", "movie");
  });

  it("genre_ids null 인 미러 row → 빈 배열로 정규화", async () => {
    mirrorRows = [
      { tmdb_id: 9, media_type: "movie", title: "장르없음", title_en: null, genre_ids: null },
    ];
    const r = await matchFavoritesToTMDB(["장르없음"]);
    expect(r[0].genreIds).toEqual([]);
  });
});

describe("matchFavoritesToTMDB — 적중 동등성 (flag on vs off)", () => {
  it("동일 favorites 셋: 미러 히트 결과 == searchTMDB-only 결과 (id/type/genreIds)", async () => {
    // searchTMDB-only (off) 가 내놓을 값
    searchTable["기생충|movie"] = { id: 496243, genre_ids: [35, 18, 53] };
    searchTable["오징어 게임|movie"] = null;
    searchTable["오징어 게임|series"] = { id: 93405, genre_ids: [10759, 9648] };

    delete process.env.REC_MIRROR_MATCH_ENABLED;
    const off = await matchFavoritesToTMDB(["기생충", "오징어 게임"]);

    // 미러가 동일 작품을 동일 id/type/genre 로 보유 (동일 TMDB 원천)
    mirrorRows = [
      { tmdb_id: 496243, media_type: "movie", title: "기생충", title_en: "Parasite", genre_ids: [35, 18, 53] },
      { tmdb_id: 93405, media_type: "tv", title: "오징어 게임", title_en: "Squid Game", genre_ids: [10759, 9648] },
    ];
    process.env.REC_MIRROR_MATCH_ENABLED = "true";
    const on = await matchFavoritesToTMDB(["기생충", "오징어 게임"]);

    const norm = (xs: typeof off) =>
      xs.map((m) => ({ id: m.id, type: m.type, genreIds: m.genreIds })).sort((a, b) => a.id - b.id);
    expect(norm(on)).toEqual(norm(off));
  });
});
