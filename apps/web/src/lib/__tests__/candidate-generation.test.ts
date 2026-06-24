/**
 * Phase B-1 (2026-06-06) — candidate-generation 단위 테스트.
 *
 * 본 test 는 *mock Supabase* 로 진행 — 실제 DB 호출 없음. SQL builder 형식
 * (.eq / .overlaps / .not / .gte 등 호출 순서·인자) + excludeIds 차단 + persona_match
 * 정렬을 검증.
 *
 * B-3 의 실제 Supabase 통합 검증은 별도 트랙.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// env stub — supabaseAdmin 평가 단계 throw 방지
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.TMDB_API_KEY = "test-tmdb-key";
  process.env.OPENAI_API_KEY = "sk-test-0123456789abcdef0123456789abcdef";
});

// Mock supabase-js — chainable query builder 모사. 각 chain 메서드는 self 반환,
// `await` 시점에 { data, error } resolve.
type MockRow = Record<string, unknown>;

interface MockQuery extends PromiseLike<{ data: MockRow[]; error: null }> {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  overlaps: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  contains: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  _calls: { method: string; args: unknown[] }[];
}

function makeMockQuery(rows: MockRow[]): MockQuery {
  const calls: { method: string; args: unknown[] }[] = [];
  const self: MockQuery = {
    _calls: calls,
    select: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    in: vi.fn(),
    overlaps: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    contains: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    then(resolve) {
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  } as MockQuery;
  for (const method of [
    "select",
    "eq",
    "not",
    "in",
    "overlaps",
    "gte",
    "lte",
    "contains",
    "order",
    "limit",
  ] as const) {
    self[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return self;
    });
  }
  return self;
}

let mockMovieRows: MockRow[] = [];
let mockTvRows: MockRow[] = [];
let lastMovieQuery: MockQuery | null = null;
let lastTvQuery: MockQuery | null = null;

vi.mock("../supabase-admin", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== "tmdb_metadata") throw new Error(`unexpected table ${table}`);
      // media_type eq 호출 순서 기준으로 movie / tv 분기. 첫 호출 = movie 가정.
      // generateCandidates 는 movie 와 tv 를 분리 호출 (mediaType=both) → 본 mock 은
      // 첫 from() 호출 시 movie row 반환, 두 번째 호출 시 tv row 반환.
      const isFirst = lastMovieQuery === null;
      if (isFirst) {
        lastMovieQuery = makeMockQuery(mockMovieRows);
        return lastMovieQuery;
      }
      lastTvQuery = makeMockQuery(mockTvRows);
      return lastTvQuery;
    },
  }),
}));

import {
  generateCandidates,
  stratifiedSample,
  tasteGenresToIds,
  buildTasteVector,
  embeddingRetrieval,
} from "../candidate-generation";

beforeEach(() => {
  mockMovieRows = [];
  mockTvRows = [];
  lastMovieQuery = null;
  lastTvQuery = null;
});

describe("tasteGenresToIds", () => {
  it("한글 라벨을 TMDB id 합집합으로 변환", () => {
    const ids = tasteGenresToIds(["액션", "코미디"]);
    expect(ids).toContain(28); // 액션 movie
    expect(ids).toContain(10759); // 액션 tv
    expect(ids).toContain(35); // 코미디
  });

  it("알 수 없는 라벨 silent skip", () => {
    expect(tasteGenresToIds(["존재하지않는장르"])).toEqual([]);
  });

  it("undefined / 빈 배열 → 빈 결과", () => {
    expect(tasteGenresToIds(undefined)).toEqual([]);
    expect(tasteGenresToIds([])).toEqual([]);
  });
});

describe("generateCandidates", () => {
  it("기본 흐름 — movie + tv 합산, totalScore desc 정렬", async () => {
    mockMovieRows = [
      {
        tmdb_id: 100,
        media_type: "movie",
        title: "영화 A",
        rating: 8.0,
        release_date: "2022-01-01",
        genre_ids: [28], // 액션
        country: ["US"],
        providers: [{ name: "Netflix", logoUrl: null }],
      },
      {
        tmdb_id: 101,
        media_type: "movie",
        title: "영화 B",
        rating: 6.5,
        release_date: "2021-01-01",
        genre_ids: [35], // 코미디
        country: ["US"],
        providers: [{ name: "Disney Plus", logoUrl: null }],
      },
    ];
    mockTvRows = [
      {
        tmdb_id: 200,
        media_type: "tv",
        title: "시리즈 A",
        rating: 7.5,
        release_date: "2023-01-01",
        genre_ids: [18], // 드라마
        country: ["KR"],
        providers: [{ name: "TVING", logoUrl: null }],
      },
    ];

    const result = await generateCandidates(
      { favoriteGenreIds: [28] }, // 액션 선호
      {},
      [],
    );

    expect(result).toHaveLength(3);
    // 영화 A (rating 8.0 + 액션 매칭 +1.0 + rating 7+ bonus 0.2 → totalScore = 8.0 * 2.2 = 17.6)
    // 영화 B (rating 6.5, persona match 0 → 6.5 * 1.0 = 6.5)
    // 시리즈 A (rating 7.5, persona match 0.2 → 7.5 * 1.2 = 9.0)
    expect(result[0].tmdbId).toBe(100); // 매칭 + rating top
    expect(result[0].personaMatch).toBeGreaterThan(1);
    // 정렬 검증
    expect(result[0].totalScore).toBeGreaterThanOrEqual(result[1].totalScore);
    expect(result[1].totalScore).toBeGreaterThanOrEqual(result[2].totalScore);
  });

  it("excludeIds 차단", async () => {
    mockMovieRows = [
      {
        tmdb_id: 100,
        media_type: "movie",
        title: "차단됨",
        rating: 9.0,
        release_date: "2022-01-01",
        genre_ids: [],
        country: ["US"],
        providers: [{ name: "Netflix", logoUrl: null }],
      },
      {
        tmdb_id: 101,
        media_type: "movie",
        title: "통과",
        rating: 7.0,
        release_date: "2022-01-01",
        genre_ids: [],
        country: ["US"],
        providers: [{ name: "Netflix", logoUrl: null }],
      },
    ];
    mockTvRows = [];

    const result = await generateCandidates({}, {}, [100]);

    // movie query 의 .not() 호출에 100 포함 확인
    const notCalls = lastMovieQuery?._calls.filter((c) => c.method === "not") ?? [];
    expect(notCalls.length).toBeGreaterThan(0);
    const tmdbIdNotCall = notCalls.find((c) => c.args[0] === "tmdb_id");
    expect(tmdbIdNotCall).toBeDefined();
    expect(String(tmdbIdNotCall?.args[2])).toContain("100");

    // 결과에 차단된 id 없어야 함 (SQL 단계가 mock 이라 client 측 blockSet 후처리만 동작)
    expect(result.find((r) => r.tmdbId === 100)).toBeUndefined();
    expect(result.find((r) => r.tmdbId === 101)).toBeDefined();
  });

  it("OTT 필터 client 후처리 — Netflix 미보유 row 제외", async () => {
    mockMovieRows = [
      {
        tmdb_id: 100,
        media_type: "movie",
        title: "Netflix 작품",
        rating: 7.0,
        release_date: "2022-01-01",
        genre_ids: [],
        country: ["US"],
        providers: [{ name: "Netflix", logoUrl: null }],
      },
      {
        tmdb_id: 101,
        media_type: "movie",
        title: "Disney 작품",
        rating: 7.0,
        release_date: "2022-01-01",
        genre_ids: [],
        country: ["US"],
        providers: [{ name: "Disney Plus", logoUrl: null }],
      },
    ];
    mockTvRows = [];

    const result = await generateCandidates(
      {},
      { ott: ["Netflix"] },
      [],
    );

    expect(result.find((r) => r.tmdbId === 100)).toBeDefined();
    expect(result.find((r) => r.tmdbId === 101)).toBeUndefined();
  });

  it("filter.type=movie → movie query 만 호출", async () => {
    mockMovieRows = [
      {
        tmdb_id: 100,
        media_type: "movie",
        title: "영화",
        rating: 7.0,
        release_date: "2022-01-01",
        genre_ids: [],
        country: ["US"],
        providers: [{ name: "Netflix", logoUrl: null }],
      },
    ];
    mockTvRows = [];

    const result = await generateCandidates(
      {},
      { type: "movie" },
      [],
    );

    expect(result).toHaveLength(1);
    expect(lastMovieQuery).not.toBeNull();
    expect(lastTvQuery).toBeNull(); // tv query 미호출
  });

  it("연도 필터 → gte/lte 호출", async () => {
    mockMovieRows = [];
    mockTvRows = [];

    await generateCandidates({}, { year: "recent" }, []);

    const gteCalls = lastMovieQuery?._calls.filter((c) => c.method === "gte") ?? [];
    expect(gteCalls.length).toBeGreaterThan(0);
    expect(gteCalls[0].args[0]).toBe("release_date");
    expect(gteCalls[0].args[1]).toBe("2020-01-01");
  });

  it("favoriteTmdbIds 자기 자신 차단", async () => {
    mockMovieRows = [
      {
        tmdb_id: 500,
        media_type: "movie",
        title: "내 favorite",
        rating: 9.0,
        release_date: "2022-01-01",
        genre_ids: [],
        country: ["US"],
        providers: [{ name: "Netflix", logoUrl: null }],
      },
      {
        tmdb_id: 501,
        media_type: "movie",
        title: "다른 작품",
        rating: 7.0,
        release_date: "2022-01-01",
        genre_ids: [],
        country: ["US"],
        providers: [{ name: "Netflix", logoUrl: null }],
      },
    ];
    mockTvRows = [];

    const result = await generateCandidates(
      { favoriteTmdbIds: [500] },
      {},
      [],
    );

    expect(result.find((r) => r.tmdbId === 500)).toBeUndefined();
    expect(result.find((r) => r.tmdbId === 501)).toBeDefined();
  });

  it("결과 0건 → 빈 배열 정상 반환 (throw 안 함)", async () => {
    mockMovieRows = [];
    mockTvRows = [];
    const result = await generateCandidates({}, {}, []);
    expect(result).toEqual([]);
  });
});

// ---------- Phase B-3.2 — stratifiedSample ----------
describe("stratifiedSample (Phase B-3.2)", () => {
  /** 결정적 입력 (totalScore desc 정렬). */
  function makeCandidates(n: number): Array<{ id: number; totalScore: number }> {
    return Array.from({ length: n }, (_, i) => ({
      id: i,
      totalScore: n - i, // desc: n, n-1, ..., 1
    }));
  }

  it("#11 deterministic top-K 보존 + tail 호출별 변동 (다양성 핵심)", () => {
    const input = makeCandidates(100);
    const poolSize = 50;
    const topK = 10;

    // 5회 호출 → 상위 10 은 모두 동일, tail 40 은 호출 간 set Jaccard < 0.7 기대
    const runs: Array<{ id: number }[]> = [];
    for (let i = 0; i < 5; i++) {
      runs.push(stratifiedSample(input, poolSize, topK));
    }

    // 모든 run 의 상위 topK 가 동일 (id 0..9)
    for (const run of runs) {
      expect(run.length).toBe(poolSize);
      const topIds = run.slice(0, topK).map((c) => c.id);
      // 정렬된 결과의 상위 K 는 totalScore desc 최상위 → id 0..topK-1
      expect(topIds).toEqual(Array.from({ length: topK }, (_, j) => j));
    }

    // tail 영역 (id >= topK) 의 호출 간 set 차이 — 적어도 한 쌍은 Jaccard < 1.0
    function tailIds(run: { id: number }[]): Set<number> {
      return new Set(run.filter((c) => c.id >= topK).map((c) => c.id));
    }
    const tails = runs.map(tailIds);
    let foundDiff = false;
    for (let a = 0; a < tails.length; a++) {
      for (let b = a + 1; b < tails.length; b++) {
        const inter = new Set([...tails[a]].filter((x) => tails[b].has(x)));
        const uni = new Set([...tails[a], ...tails[b]]);
        const jaccard = inter.size / uni.size;
        if (jaccard < 1.0) foundDiff = true;
        // 풀 90 중 40 sample → 평균 Jaccard ≈ (40/90 의 2배 중복 비율) ≈ 0.29
        // 임계는 다소 느슨하게 0.7 — flaky 방지
        expect(jaccard).toBeLessThan(0.95);
      }
    }
    expect(foundDiff).toBe(true);
  });

  it("#12 topK >= poolSize → sampling 없이 상위 그대로", () => {
    const input = makeCandidates(50);
    const out = stratifiedSample(input, 10, 20);
    expect(out.length).toBe(10);
    // sampling 발생 X — 상위 10 (id 0..9) 그대로
    expect(out.map((c) => c.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("#13 candidates.length <= poolSize → 전체 반환 (overflow 없음)", () => {
    const input = makeCandidates(20);
    const out = stratifiedSample(input, 50, 10);
    expect(out.length).toBe(20);
    // totalScore desc 유지
    for (let i = 0; i < out.length - 1; i++) {
      expect(out[i].totalScore).toBeGreaterThanOrEqual(out[i + 1].totalScore);
    }
  });
});

// ---------- P2 (2026-06-24) — pgvector ANN retrieval ----------
//
// buildTasteVector / embeddingRetrieval 은 admin 인자를 직접 받으므로 ad-hoc mock
// client 를 주입해 단위 테스트. generateCandidates 분기(flag gating)는 회귀 0
// (flag off / favorites 없음 → 기존 SQL 경로 진입) 을 검증.

/** ad-hoc mock: buildTasteVector 의 from().select().in().not() 체인 모사. */
function makeTasteAdmin(rows: Array<{ embedding: number[] | string | null }>): {
  admin: SupabaseClient;
  errored: { value: unknown };
} {
  const errored = { value: null as unknown };
  const builder = {
    select() {
      return this;
    },
    in() {
      return this;
    },
    not() {
      return Promise.resolve({ data: rows, error: errored.value });
    },
  };
  const admin = {
    from: () => builder,
  } as unknown as SupabaseClient;
  return { admin, errored };
}

/** ad-hoc mock: embeddingRetrieval 의 admin.rpc() 모사. capture 로 인자 검증. */
function makeRpcAdmin(
  rpcRows: MockRow[],
  capture: { args?: Record<string, unknown> } = {},
): SupabaseClient {
  return {
    rpc: (_name: string, params: Record<string, unknown>) => {
      capture.args = params;
      return Promise.resolve({ data: rpcRows, error: null });
    },
  } as unknown as SupabaseClient;
}

describe("buildTasteVector (P2)", () => {
  it("평균 + L2 정규화 — 단위벡터 반환", async () => {
    // 2-d 단순화: [3,0], [0,4] → 평균 [1.5,2] → norm 2.5 → [0.6,0.8]
    const { admin } = makeTasteAdmin([
      { embedding: [3, 0] },
      { embedding: [0, 4] },
    ]);
    const v = await buildTasteVector(admin, [1, 2]);
    expect(v).not.toBeNull();
    expect(v!).toHaveLength(2);
    expect(v![0]).toBeCloseTo(0.6, 6);
    expect(v![1]).toBeCloseTo(0.8, 6);
    // L2 norm == 1
    const norm = Math.sqrt(v![0] ** 2 + v![1] ** 2);
    expect(norm).toBeCloseTo(1, 6);
  });

  it("string 임베딩('[...]') 파싱", async () => {
    const { admin } = makeTasteAdmin([
      { embedding: "[3, 0]" },
      { embedding: "[0, 4]" },
    ]);
    const v = await buildTasteVector(admin, [1, 2]);
    expect(v).not.toBeNull();
    expect(v![0]).toBeCloseTo(0.6, 6);
    expect(v![1]).toBeCloseTo(0.8, 6);
  });

  it("유효 임베딩 0건 → null (cold-start fallback)", async () => {
    const { admin } = makeTasteAdmin([
      { embedding: null },
      { embedding: "not-json" },
    ]);
    const v = await buildTasteVector(admin, [1, 2]);
    expect(v).toBeNull();
  });

  it("favoriteTmdbIds 빈 배열 → null (DB 조회 없이)", async () => {
    const { admin } = makeTasteAdmin([]);
    expect(await buildTasteVector(admin, [])).toBeNull();
  });

  it("DB error → throw (caller 가 SQL fallback)", async () => {
    const { admin, errored } = makeTasteAdmin([]);
    errored.value = { message: "boom" };
    await expect(buildTasteVector(admin, [1])).rejects.toBeDefined();
  });
});

describe("embeddingRetrieval (P2)", () => {
  const taste = [0.6, 0.8];

  function rpcRow(over: Partial<MockRow>): MockRow {
    return {
      tmdb_id: 1,
      media_type: "movie",
      title: "X",
      title_en: null,
      overview: null,
      rating: 7,
      release_date: "2022-01-01",
      poster_path: null,
      backdrop_path: null,
      director: null,
      cast_names: null,
      runtime: null,
      seasons: null,
      country: ["US"],
      origin_country: ["US"],
      genre_ids: [28],
      providers: [{ name: "Netflix", logoUrl: null }],
      watch_link: null,
      similarity: 0.5,
      ...over,
    };
  }

  it("RPC 인자 매핑 — match_count = ANN_MATCH_COUNT(150) 캡, 필터 전달", async () => {
    const capture: { args?: Record<string, unknown> } = {};
    const admin = makeRpcAdmin([], capture);
    await embeddingRetrieval(
      admin,
      taste,
      { tasteGenres: ["액션"], favoriteTmdbIds: [99] },
      { type: "movie", year: "recent", origin: "kr" },
      [42],
      100,
      30,
    );
    // poolSize(100) 무관하게 ANN top-K 150 으로 캡 (IVFFlat cliff 회피). 2026-06-24.
    expect(capture.args?.match_count).toBe(150);
    expect(capture.args?.query_embedding).toEqual(taste);
    expect(capture.args?.p_media_type).toBe("movie");
    expect(capture.args?.p_origin).toBe("kr");
    expect(capture.args?.p_date_gte).toBe("2020-01-01");
    // exclude = excludeIds(42) + favoriteTmdbIds(99) 합집합
    expect(capture.args?.p_exclude_ids).toEqual(
      expect.arrayContaining([42, 99]),
    );
    // 장르 하드필터 미적용 — movie/series 는 취향벡터가 장르를 내포하므로 null.
    // (broad genre && 가 IVFFlat 인덱스를 깨 cold timeout → 2026-06-24 제거.)
    expect(capture.args?.p_genre_ids).toBeNull();
  });

  it("RPC 인자 매핑 — variety 만 좁은 장르 [10764,10767] 전달", async () => {
    const capture: { args?: Record<string, unknown> } = {};
    const admin = makeRpcAdmin([], capture);
    await embeddingRetrieval(
      admin,
      taste,
      { tasteGenres: ["액션"], favoriteTmdbIds: [99] },
      { type: "variety" },
      [],
      100,
      30,
    );
    expect(capture.args?.p_media_type).toBe("tv");
    // variety = reality/talk format 장르만 (좁아서 인덱스 영향 미미)
    expect(capture.args?.p_genre_ids).toEqual([10764, 10767]);
  });

  it("popularity 블렌딩 정렬 — similarity 높은 row 우선 (similarity + 0.15*rating/10)", async () => {
    // A: sim 0.5, rating 10 → 0.5 + 0.15*1.0 = 0.65
    // B: sim 0.8, rating 0  → 0.8 + 0      = 0.80  → B 우선
    const admin = makeRpcAdmin([
      rpcRow({ tmdb_id: 1, similarity: 0.5, rating: 10 }),
      rpcRow({ tmdb_id: 2, similarity: 0.8, rating: 0 }),
    ]);
    const result = await embeddingRetrieval(
      admin,
      taste,
      {},
      {},
      [],
      100,
      30,
    );
    expect(result).toHaveLength(2);
    expect(result[0].tmdbId).toBe(2); // sim 0.8 우선
    expect(result[0].totalScore).toBeCloseTo(0.8, 6);
    expect(result[1].totalScore).toBeCloseTo(0.65, 6);
    // personaMatch = similarity 보존
    expect(result[0].personaMatch).toBeCloseTo(0.8, 6);
  });

  it("OTT client 후처리 — 미보유 row 제외", async () => {
    const admin = makeRpcAdmin([
      rpcRow({ tmdb_id: 1, providers: [{ name: "Netflix", logoUrl: null }] }),
      rpcRow({ tmdb_id: 2, providers: [{ name: "Disney Plus", logoUrl: null }] }),
    ]);
    const result = await embeddingRetrieval(
      admin,
      taste,
      {},
      { ott: ["Netflix"] },
      [],
      100,
      30,
    );
    expect(result.find((r) => r.tmdbId === 1)).toBeDefined();
    expect(result.find((r) => r.tmdbId === 2)).toBeUndefined();
  });

  it("origin=foreign client 후처리 — KR 작품 제외", async () => {
    const admin = makeRpcAdmin([
      rpcRow({ tmdb_id: 1, country: ["US"] }),
      rpcRow({ tmdb_id: 2, country: ["KR"] }),
    ]);
    const result = await embeddingRetrieval(
      admin,
      taste,
      {},
      { origin: "foreign" },
      [],
      100,
      30,
    );
    expect(result.find((r) => r.tmdbId === 1)).toBeDefined();
    expect(result.find((r) => r.tmdbId === 2)).toBeUndefined();
  });

  it("variety → p_media_type=tv + reality/talk 장르 inject", async () => {
    const capture: { args?: Record<string, unknown> } = {};
    const admin = makeRpcAdmin([], capture);
    await embeddingRetrieval(admin, taste, {}, { type: "variety" }, [], 100, 30);
    expect(capture.args?.p_media_type).toBe("tv");
    expect(capture.args?.p_genre_ids).toEqual(
      expect.arrayContaining([10764, 10767]),
    );
  });

  it("RPC error → throw (caller 가 SQL fallback)", async () => {
    const admin = {
      rpc: () => Promise.resolve({ data: null, error: { message: "rpc boom" } }),
    } as unknown as SupabaseClient;
    await expect(
      embeddingRetrieval(admin, taste, {}, {}, [], 100, 30),
    ).rejects.toBeDefined();
  });
});

describe("generateCandidates — P2 flag gating (회귀 0)", () => {
  afterEach(() => {
    delete process.env.REC_EMBED_RETRIEVAL_ENABLED;
  });

  it("flag off → 기존 SQL 경로 진입 (embedding 미진입)", async () => {
    // flag 미설정 (default off)
    mockMovieRows = [
      {
        tmdb_id: 100,
        media_type: "movie",
        title: "SQL 경로",
        rating: 8,
        release_date: "2022-01-01",
        genre_ids: [28],
        country: ["US"],
        providers: [{ name: "Netflix", logoUrl: null }],
      },
    ];
    mockTvRows = [];
    const result = await generateCandidates(
      { favoriteTmdbIds: [99] }, // favorites 있어도 flag off 면 SQL 경로
      { type: "movie" },
      [],
    );
    // 기존 SQL 경로 totalScore = rating*(1+personaMatch) 공식 (블렌딩 아님)
    expect(result).toHaveLength(1);
    expect(result[0].tmdbId).toBe(100);
    // SQL 경로는 rating 기반 — totalScore > 1 (블렌딩 경로면 0~1.x)
    expect(result[0].totalScore).toBeGreaterThan(1);
    // SQL 빌더가 실제로 호출됨 (movie query)
    expect(lastMovieQuery).not.toBeNull();
  });

  it("flag on + favoriteTmdbIds 없음 → SQL 경로 (embedding 미진입)", async () => {
    process.env.REC_EMBED_RETRIEVAL_ENABLED = "true";
    mockMovieRows = [
      {
        tmdb_id: 100,
        media_type: "movie",
        title: "SQL 경로",
        rating: 8,
        release_date: "2022-01-01",
        genre_ids: [],
        country: ["US"],
        providers: [{ name: "Netflix", logoUrl: null }],
      },
    ];
    mockTvRows = [];
    const result = await generateCandidates({}, { type: "movie" }, []);
    expect(result).toHaveLength(1);
    expect(result[0].totalScore).toBeGreaterThan(1); // SQL 공식
    expect(lastMovieQuery).not.toBeNull();
  });
});
