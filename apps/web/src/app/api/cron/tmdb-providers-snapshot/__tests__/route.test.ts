/**
 * tmdb-providers-snapshot route 단위 테스트
 *
 * 검증 범위:
 *  - 401 (인증 실패) / disabled (flag OFF)
 *  - 정상 흐름: saved_items → 미러 join → TMDB 호출 → snapshot UPSERT → prune
 *  - 빈 saved_items 시 0 응답
 *  - TMDB 호출 실패 시 errors 배열 누적 (다른 row 는 정상 처리)
 *
 * 모킹:
 *  - supabaseAdmin → 인메모리 fake (chainable .from / .select / .range / .upsert / .delete)
 *  - fetch → vi.fn (TMDB API)
 *  - env: NEXT_PUBLIC_NOTIFICATIONS_ENABLED, CRON_SECRET, TMDB_API_KEY
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────
// mocks
// ─────────────────────────────────────────────────────────────────

interface SavedRow { tmdb_id: number; type: "movie" | "tv" }
interface MirrorRow { tmdb_id: number; media_type: "movie" | "tv"; providers: unknown; providers_fetched_at: string | null }

interface FakeSupabaseState {
  savedItems: SavedRow[];
  mirror: MirrorRow[];
  upsertedSnapshots: Array<{ work_id: number; media_type: string; snapshot_date: string; providers: unknown }>;
  deletedBefore: string | null;
  deletedCount: number;
}

const state: FakeSupabaseState = {
  savedItems: [],
  mirror: [],
  upsertedSnapshots: [],
  deletedBefore: null,
  deletedCount: 0,
};

function resetState() {
  state.savedItems = [];
  state.mirror = [];
  state.upsertedSnapshots = [];
  state.deletedBefore = null;
  state.deletedCount = 0;
}

function makeFakeAdmin() {
  return {
    from(table: string) {
      if (table === "saved_items") {
        return {
          select(_cols: string) {
            void _cols;
            return {
              range(from: number, to: number) {
                const slice = state.savedItems.slice(from, to + 1);
                return Promise.resolve({ data: slice, error: null });
              },
            };
          },
        };
      }
      if (table === "tmdb_metadata") {
        return {
          select(_cols: string) {
            void _cols;
            return {
              in(_col: string, ids: number[]) {
                const data = state.mirror.filter((r) => ids.includes(r.tmdb_id));
                return Promise.resolve({ data, error: null });
              },
            };
          },
        };
      }
      if (table === "tmdb_provider_snapshots") {
        return {
          upsert(rows: Array<{ work_id: number; media_type: string; snapshot_date: string; providers: unknown }>, _opts: unknown) {
            void _opts;
            state.upsertedSnapshots.push(...rows);
            return Promise.resolve({ error: null });
          },
          delete(_opts: unknown) {
            void _opts;
            return {
              lt(_col: string, value: string) {
                void _col;
                state.deletedBefore = value;
                // 삭제 row 수: state.upsertedSnapshots 중 snapshot_date < value
                state.deletedCount = 0; // 본 fake 는 삭제할 prior row 가 없다고 가정
                return Promise.resolve({ count: state.deletedCount, error: null });
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: () => makeFakeAdmin(),
}));

beforeEach(() => {
  resetState();
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.stubEnv("TMDB_API_KEY", "test-tmdb-key");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
  vi.stubEnv("NEXT_PUBLIC_NOTIFICATIONS_ENABLED", "true");
  vi.unstubAllGlobals();
});

function authedReq(): Request {
  return new Request("https://example.com/api/cron/tmdb-providers-snapshot", {
    headers: { Authorization: "Bearer test-secret" },
  });
}

// ─────────────────────────────────────────────────────────────────
// tests
// ─────────────────────────────────────────────────────────────────

describe("GET /api/cron/tmdb-providers-snapshot", () => {
  it("인증 실패 시 401", async () => {
    const { GET } = await import("../route");
    const res = await GET(
      new Request("https://example.com/x", {
        headers: { Authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("flag OFF 시 disabled 응답 (DB 호출 없음)", async () => {
    vi.stubEnv("NEXT_PUBLIC_NOTIFICATIONS_ENABLED", "false");
    const { GET } = await import("../route");
    const res = await GET(authedReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, disabled: true });
  });

  it("saved_items 비어있으면 0 응답 (TMDB 호출 0)", async () => {
    state.savedItems = [];
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { GET } = await import("../route");
    const res = await GET(authedReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.saved_works).toBe(0);
    expect(body.tmdb_calls).toBe(0);
    expect(body.snapshots_inserted).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("미러 fresh 시 TMDB 호출 0, snapshot UPSERT 정상", async () => {
    state.savedItems = [
      { tmdb_id: 550, type: "movie" },
      { tmdb_id: 1399, type: "tv" },
    ];
    // 두 작품 모두 24h 이내 fetched_at
    const recent = new Date(Date.now() - 1 * 3600 * 1000).toISOString();
    state.mirror = [
      {
        tmdb_id: 550,
        media_type: "movie",
        providers: [{ name: "Netflix", category: "subscription" }],
        providers_fetched_at: recent,
      },
      {
        tmdb_id: 1399,
        media_type: "tv",
        providers: [{ name: "TVING", category: "subscription" }],
        providers_fetched_at: recent,
      },
    ];

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { GET } = await import("../route");
    const res = await GET(authedReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.saved_works).toBe(2);
    expect(body.mirror_hits).toBe(2);
    expect(body.tmdb_calls).toBe(0);
    expect(body.snapshots_inserted).toBe(2);
    expect(state.upsertedSnapshots).toHaveLength(2);

    const movie = state.upsertedSnapshots.find((s) => s.work_id === 550);
    expect(movie?.providers).toEqual({
      flatrate: [8],
      rent: [],
      buy: [],
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("미러 miss → TMDB 호출 후 snapshot UPSERT", async () => {
    state.savedItems = [{ tmdb_id: 100, type: "movie" }];
    state.mirror = [];

    const fakeJson = {
      results: {
        KR: {
          flatrate: [{ provider_id: 8, provider_name: "Netflix" }],
          rent: [],
          buy: [],
        },
      },
    };
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => fakeJson,
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { GET } = await import("../route");
    const res = await GET(authedReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.saved_works).toBe(1);
    expect(body.mirror_hits).toBe(0);
    expect(body.tmdb_calls).toBe(1);
    expect(body.snapshots_inserted).toBe(1);
    expect(state.upsertedSnapshots[0]?.providers).toEqual({
      flatrate: [8],
      rent: [],
      buy: [],
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("TMDB 호출 실패 시 해당 row 만 errors, 나머지는 정상 진행", async () => {
    state.savedItems = [
      { tmdb_id: 1, type: "movie" }, // 실패
      { tmdb_id: 2, type: "movie" }, // 성공
    ];
    state.mirror = [];

    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/movie/1/")) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ results: { KR: { flatrate: [], rent: [], buy: [] } } }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { GET } = await import("../route");
    const res = await GET(authedReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.saved_works).toBe(2);
    expect(body.tmdb_calls).toBe(1); // 성공한 1건만
    expect(body.snapshots_inserted).toBe(1);
    expect(body.errors_total).toBe(1);
    expect(body.errors[0]?.tmdb_id).toBe(1);
    expect(state.upsertedSnapshots).toHaveLength(1);
    expect(state.upsertedSnapshots[0]?.work_id).toBe(2);
  });

  it("DISTINCT 처리 — 동일 (tmdb_id, type) 중복은 1회만 처리", async () => {
    state.savedItems = [
      { tmdb_id: 7, type: "movie" },
      { tmdb_id: 7, type: "movie" },
      { tmdb_id: 7, type: "tv" }, // 다른 media_type → 별도
    ];
    const recent = new Date().toISOString();
    state.mirror = [
      {
        tmdb_id: 7,
        media_type: "movie",
        providers: null,
        providers_fetched_at: recent,
      },
      {
        tmdb_id: 7,
        media_type: "tv",
        providers: null,
        providers_fetched_at: recent,
      },
    ];

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { GET } = await import("../route");
    const res = await GET(authedReq());
    const body = await res.json();
    expect(body.saved_works).toBe(2); // movie + tv
    expect(state.upsertedSnapshots).toHaveLength(2);
  });

  it("prune step 호출 시 7일 이전 cutoff 전달", async () => {
    state.savedItems = [];
    const { GET } = await import("../route");
    const res = await GET(authedReq());
    expect(res.status).toBe(200);
    // saved 비어있으면 prune 스텝 자체가 skip 됨 (early return)
    expect(state.deletedBefore).toBeNull();
  });

  it("prune cutoff = today - 7d 형식 (YYYY-MM-DD)", async () => {
    state.savedItems = [{ tmdb_id: 1, type: "movie" }];
    state.mirror = [
      {
        tmdb_id: 1,
        media_type: "movie",
        providers: [],
        providers_fetched_at: new Date().toISOString(),
      },
    ];
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { GET } = await import("../route");
    await GET(authedReq());
    expect(state.deletedBefore).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // today - 7d <= deletedBefore <= today - 6d (timezone slack)
    const today = new Date();
    const expected = new Date(today.getTime() - 7 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    expect(state.deletedBefore).toBe(expected);
  });
});
