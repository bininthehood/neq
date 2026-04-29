/**
 * new-release route 단위 테스트
 *
 * 검증 범위:
 *  - 401 / disabled
 *  - 사용자 0 → 0 발송
 *  - Trigger A (saved tv 새 시즌) → 1건 발송
 *  - Trigger D (구독 OTT 신작) → 1건 발송
 *  - 우선순위: A + D 동시 후보 → A 선택
 *  - TMDB 호출 실패 격리: 일부 실패 → 다른 사용자 정상
 *  - sendPush cooldown → skipped
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

interface ProfileRow { id: string; account_prefs: unknown }
interface SavedRow { profile_id: string; tmdb_id: number; type: "movie" | "tv" }
interface FollowedPersonRow { profile_id: string; person_id: number; person_name: string | null; role: "director" | "actor" }
interface MirrorRow {
  tmdb_id: number;
  media_type: "movie" | "tv";
  name: string | null;
  poster_path: string | null;
  vote_average: number | null;
  popularity: number | null;
  seasons: Array<{ season_number?: number; air_date?: string | null }> | null;
}

interface FakeState {
  profiles: ProfileRow[];
  saved: SavedRow[];
  followed: FollowedPersonRow[];
  mirror: MirrorRow[];
}

const state: FakeState = {
  profiles: [],
  saved: [],
  followed: [],
  mirror: [],
};

function resetState() {
  state.profiles = [];
  state.saved = [];
  state.followed = [];
  state.mirror = [];
}

function makeFakeAdmin() {
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select(_cols: string) {
            void _cols;
            return {
              eq: (_col: string, _val: string) => {
                void _col;
                void _val;
                return Promise.resolve({
                  data: state.profiles.filter((p) => {
                    const ap = p.account_prefs as Record<string, Record<string, unknown>> | null;
                    return ap?.notificationPrefs?.newRelease === true;
                  }),
                  error: null,
                });
              },
            };
          },
        };
      }
      if (table === "saved_items") {
        return {
          select(_cols: string) {
            void _cols;
            const builder = {
              _profileIds: null as null | string[],
              _type: null as null | string,
              in(_col: string, ids: string[]) {
                this._profileIds = ids;
                return builder;
              },
              eq(col: string, val: string) {
                if (col === "type") this._type = val;
                return builder;
              },
              range(from: number, to: number) {
                let rows = state.saved;
                if (builder._profileIds) {
                  const idSet = new Set(builder._profileIds);
                  rows = rows.filter((r) => idSet.has(r.profile_id));
                }
                if (builder._type) {
                  rows = rows.filter((r) => r.type === builder._type);
                }
                return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
              },
            };
            return builder;
          },
        };
      }
      if (table === "notification_followed_persons") {
        return {
          select(_cols: string) {
            void _cols;
            const builder = {
              _profileIds: null as null | string[],
              in(_col: string, ids: string[]) {
                this._profileIds = ids;
                return builder;
              },
              range(from: number, to: number) {
                let rows = state.followed;
                if (builder._profileIds) {
                  const idSet = new Set(builder._profileIds);
                  rows = rows.filter((r) => idSet.has(r.profile_id));
                }
                return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
              },
            };
            return builder;
          },
        };
      }
      if (table === "tmdb_metadata") {
        return {
          select(_cols: string) {
            void _cols;
            const builder = {
              _mediaType: null as null | string,
              _ids: null as null | number[],
              eq(col: string, val: string) {
                if (col === "media_type") builder._mediaType = val;
                return builder;
              },
              in(col: string, ids: number[]) {
                if (col === "tmdb_id") builder._ids = ids;
                let data = state.mirror;
                if (builder._mediaType) {
                  data = data.filter((r) => r.media_type === builder._mediaType);
                }
                if (builder._ids) {
                  const idSet = new Set(builder._ids);
                  data = data.filter((r) => idSet.has(r.tmdb_id));
                }
                return Promise.resolve({ data, error: null });
              },
            };
            return builder;
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

const sendPushMock = vi.fn();
vi.mock("@/lib/notifications/send", async () => {
  const actual = await vi.importActual<typeof import("@/lib/notifications/send")>(
    "@/lib/notifications/send",
  );
  return {
    ...actual,
    sendPush: (...args: Parameters<typeof actual.sendPush>) => sendPushMock(...args),
  };
});

beforeEach(() => {
  resetState();
  sendPushMock.mockReset();
  sendPushMock.mockResolvedValue({ delivered: true });
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.stubEnv("NEXT_PUBLIC_NOTIFICATIONS_ENABLED", "true");
  vi.stubEnv("TMDB_API_KEY", "test-tmdb-key");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
  vi.unstubAllGlobals();
});

function authedReq(): Request {
  return new Request("https://example.com/api/cron/notifications/new-release", {
    headers: { Authorization: "Bearer test-secret" },
  });
}

function tomorrowIso(): string {
  return new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
}

describe("GET /api/cron/notifications/new-release", () => {
  it("인증 실패 → 401", async () => {
    const { GET } = await import("../route");
    const res = await GET(
      new Request("https://example.com/x", { headers: { Authorization: "Bearer wrong" } }),
    );
    expect(res.status).toBe(401);
  });

  it("flag OFF → disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_NOTIFICATIONS_ENABLED", "false");
    const { GET } = await import("../route");
    const body = await (await GET(authedReq())).json();
    expect(body.disabled).toBe(true);
  });

  it("newRelease=true 사용자 0 → 0 발송", async () => {
    state.profiles = [];
    const { GET } = await import("../route");
    const body = await (await GET(authedReq())).json();
    expect(body.candidates).toBe(0);
    expect(body.sent).toBe(0);
  });

  it("Trigger A — saved tv 새 시즌 (미러 hit, fetch 0회) → 1건 발송", async () => {
    state.profiles = [
      { id: "p1", account_prefs: { notificationPrefs: { newRelease: true }, subscribedOtt: [] } },
    ];
    state.saved = [{ profile_id: "p1", tmdb_id: 1399, type: "tv" }];
    state.mirror = [
      {
        tmdb_id: 1399,
        media_type: "tv",
        name: "왕좌의 게임",
        poster_path: "/got.jpg",
        vote_average: 9,
        popularity: 200,
        seasons: [
          { season_number: 0, air_date: tomorrowIso() }, // Q1: 시즌 0 제외
          { season_number: 8, air_date: tomorrowIso() }, // 통과 (어제 이후)
        ],
      },
    ];
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { GET } = await import("../route");
    const body = await (await GET(authedReq())).json();
    expect(body.sent).toBe(1);
    expect(body.tmdb_calls.tv).toBe(0); // 미러 hit
    expect(sendPushMock).toHaveBeenCalledTimes(1);
    const [, payload] = sendPushMock.mock.calls[0];
    expect(payload.type).toBe("new_release");
    expect(payload.title).toContain("왕좌의 게임");
    expect(payload.body).toContain("시즌 8");
    expect(payload.url).toBe("/work/1399?type=tv");
    expect(payload.imageUrl).toContain("/got.jpg");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Trigger D — 구독 OTT 신작 → 1건 발송 (provider 이름 포함)", async () => {
    state.profiles = [
      { id: "p1", account_prefs: { notificationPrefs: { newRelease: true }, subscribedOtt: [8] } },
    ];
    state.saved = [];
    state.followed = [];

    // discover/movie?with_watch_providers=8 → 1건 결과
    const fakeFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/discover/movie")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                id: 999,
                title: "신작영화",
                release_date: tomorrowIso(),
                vote_average: 8,
                popularity: 100,
                poster_path: "/x.jpg",
              },
            ],
          }),
        });
      }
      // discover/tv → 빈 결과
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      });
    });
    vi.stubGlobal("fetch", fakeFetch);

    const { GET } = await import("../route");
    const body = await (await GET(authedReq())).json();
    expect(body.sent).toBe(1);
    expect(body.tmdb_calls.discover).toBeGreaterThanOrEqual(1);
    expect(sendPushMock).toHaveBeenCalledTimes(1);
    const [, payload] = sendPushMock.mock.calls[0];
    expect(payload.title).toBe("넷플릭스 신작");
    expect(payload.body).toContain("신작영화");
  });

  it("우선순위: A + D 동시 후보 → A_season 선택 (Q2 우선순위)", async () => {
    state.profiles = [
      { id: "p1", account_prefs: { notificationPrefs: { newRelease: true }, subscribedOtt: [8] } },
    ];
    state.saved = [{ profile_id: "p1", tmdb_id: 1399, type: "tv" }];
    state.mirror = [
      {
        tmdb_id: 1399,
        media_type: "tv",
        name: "왕좌의 게임",
        poster_path: null,
        vote_average: 5, // 낮은 점수
        popularity: 5,
        seasons: [{ season_number: 8, air_date: tomorrowIso() }],
      },
    ];
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            id: 999,
            title: "엄청난 인기작",
            release_date: tomorrowIso(),
            vote_average: 10,
            popularity: 5000,
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fakeFetch);

    const { GET } = await import("../route");
    await GET(authedReq());
    const [, payload] = sendPushMock.mock.calls[0];
    // A 우선 → 왕좌의 게임 시즌
    expect(payload.title).toContain("왕좌의 게임");
  });

  it("후보 0 → skip(no-candidates)", async () => {
    state.profiles = [
      { id: "p1", account_prefs: { notificationPrefs: { newRelease: true }, subscribedOtt: [] } },
    ];
    state.saved = [];
    state.followed = [];
    const fakeFetch = vi.fn();
    vi.stubGlobal("fetch", fakeFetch);

    const { GET } = await import("../route");
    const body = await (await GET(authedReq())).json();
    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
    expect(body.reasons).toMatchObject({ "no-candidates": 1 });
  });

  it("TMDB 호출 실패 격리: discover 404 → errors 누적, 다른 사용자 영향 없음", async () => {
    state.profiles = [
      { id: "p1", account_prefs: { notificationPrefs: { newRelease: true }, subscribedOtt: [8] } },
      { id: "p2", account_prefs: { notificationPrefs: { newRelease: true }, subscribedOtt: [] } },
    ];
    state.saved = [{ profile_id: "p2", tmdb_id: 1399, type: "tv" }];
    state.mirror = [
      {
        tmdb_id: 1399,
        media_type: "tv",
        name: "Got",
        poster_path: null,
        vote_average: 9,
        popularity: 200,
        seasons: [{ season_number: 8, air_date: tomorrowIso() }],
      },
    ];
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fakeFetch);

    const { GET } = await import("../route");
    const body = await (await GET(authedReq())).json();
    // p2 는 미러로 hit → 1 발송. p1 은 discover 404 라 후보 0 → skip
    expect(body.sent).toBe(1);
    expect(body.errors_total).toBeGreaterThanOrEqual(1);
    expect(body.skipped).toBeGreaterThanOrEqual(1);
  });

  it("sendPush cooldown → skipped 누적", async () => {
    state.profiles = [
      { id: "p1", account_prefs: { notificationPrefs: { newRelease: true }, subscribedOtt: [] } },
    ];
    state.saved = [{ profile_id: "p1", tmdb_id: 1399, type: "tv" }];
    state.mirror = [
      {
        tmdb_id: 1399,
        media_type: "tv",
        name: "x",
        poster_path: null,
        vote_average: 9,
        popularity: 200,
        seasons: [{ season_number: 1, air_date: tomorrowIso() }],
      },
    ];
    sendPushMock.mockResolvedValue({ delivered: false, reason: "cooldown" });
    vi.stubGlobal("fetch", vi.fn());

    const { GET } = await import("../route");
    const body = await (await GET(authedReq())).json();
    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
    expect(body.reasons).toMatchObject({ cooldown: 1 });
  });
});
