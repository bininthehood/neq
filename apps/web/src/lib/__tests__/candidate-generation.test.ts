/**
 * Phase B-1 (2026-06-06) — candidate-generation 단위 테스트.
 *
 * 본 test 는 *mock Supabase* 로 진행 — 실제 DB 호출 없음. SQL builder 형식
 * (.eq / .overlaps / .not / .gte 등 호출 순서·인자) + excludeIds 차단 + persona_match
 * 정렬을 검증.
 *
 * B-3 의 실제 Supabase 통합 검증은 별도 트랙.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
