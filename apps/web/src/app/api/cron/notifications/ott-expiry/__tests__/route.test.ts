/**
 * ott-expiry route 단위 테스트
 *
 * 검증 범위:
 *  - 401 / disabled
 *  - 사용자 0 → 0 발송
 *  - 어제 snapshot 0건 → skipped 전체 + note
 *  - 정상 diff: 어제 [8] → 오늘 [] = 사라짐 + 사용자 구독 [8] → 1건 발송
 *  - subscribedOtt 비교: 사용자 [8], 사라짐 [97] → no-subscribed-match
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

interface ProfileRow { id: string; account_prefs: unknown }
interface SnapshotRow {
  work_id: number;
  media_type: "movie" | "tv";
  snapshot_date: string;
  providers: { flatrate: number[]; rent: number[]; buy: number[] };
}
interface SavedRow { profile_id: string; tmdb_id: number; type: "movie" | "tv"; title: string }

interface FakeState {
  profiles: ProfileRow[];
  snapshots: SnapshotRow[];
  saved: SavedRow[];
}

const state: FakeState = {
  profiles: [],
  snapshots: [],
  saved: [],
};

function resetState() {
  state.profiles = [];
  state.snapshots = [];
  state.saved = [];
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
                    return ap?.notificationPrefs?.ottExpiry === true;
                  }),
                  error: null,
                });
              },
            };
          },
        };
      }
      if (table === "tmdb_provider_snapshots") {
        return {
          select(_cols: string) {
            void _cols;
            return {
              eq: (_col: string, val: string) => ({
                range: (from: number, to: number) => {
                  const rows = state.snapshots.filter((s) => s.snapshot_date === val);
                  return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
                },
              }),
            };
          },
        };
      }
      if (table === "saved_items") {
        return {
          select(_cols: string) {
            void _cols;
            return {
              eq: (_col: string, val: string) => {
                const rows = state.saved.filter((s) => s.profile_id === val);
                return Promise.resolve({ data: rows, error: null });
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
});

function authedReq(): Request {
  return new Request("https://example.com/api/cron/notifications/ott-expiry", {
    headers: { Authorization: "Bearer test-secret" },
  });
}

function ydate(): string {
  return new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
}
function tdate(): string {
  return new Date().toISOString().slice(0, 10);
}

describe("GET /api/cron/notifications/ott-expiry", () => {
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

  it("ottExpiry=true 사용자 0 → 0 발송", async () => {
    state.profiles = [];
    const { GET } = await import("../route");
    const body = await (await GET(authedReq())).json();
    expect(body.candidates).toBe(0);
    expect(body.sent).toBe(0);
  });

  it("어제 snapshot 0건 → 모든 사용자 skipped + note", async () => {
    state.profiles = [
      { id: "p1", account_prefs: { notificationPrefs: { ottExpiry: true }, subscribedOtt: [8] } },
    ];
    // 오늘만 있고 어제 없음
    state.snapshots = [
      { work_id: 1, media_type: "movie", snapshot_date: tdate(), providers: { flatrate: [8], rent: [], buy: [] } },
    ];
    const { GET } = await import("../route");
    const body = await (await GET(authedReq())).json();
    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
    expect(body.reasons).toMatchObject({ "no-yesterday-snapshot": 1 });
    expect(body.note).toMatch(/snapshot/);
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it("정상: 어제 [8] → 오늘 [] + 사용자 [8] 구독 → sent=1", async () => {
    state.profiles = [
      { id: "p1", account_prefs: { notificationPrefs: { ottExpiry: true }, subscribedOtt: [8] } },
    ];
    state.saved = [{ profile_id: "p1", tmdb_id: 1, type: "movie", title: "기생충" }];
    state.snapshots = [
      {
        work_id: 1,
        media_type: "movie",
        snapshot_date: ydate(),
        providers: { flatrate: [8], rent: [], buy: [] },
      },
      {
        work_id: 1,
        media_type: "movie",
        snapshot_date: tdate(),
        providers: { flatrate: [], rent: [], buy: [] },
      },
    ];
    const { GET } = await import("../route");
    const body = await (await GET(authedReq())).json();
    expect(body.sent).toBe(1);
    expect(sendPushMock).toHaveBeenCalledTimes(1);
    const [profileId, payload] = sendPushMock.mock.calls[0];
    expect(profileId).toBe("p1");
    expect(payload.type).toBe("ott_expiry");
    expect(payload.body).toContain("기생충");
    expect(payload.body).toContain("넷플릭스");
  });

  it("subscribedOtt 미일치 → no-subscribed-match skip", async () => {
    state.profiles = [
      { id: "p1", account_prefs: { notificationPrefs: { ottExpiry: true }, subscribedOtt: [8] } }, // 넷플릭스
    ];
    state.saved = [{ profile_id: "p1", tmdb_id: 2, type: "movie", title: "x" }];
    state.snapshots = [
      {
        work_id: 2,
        media_type: "movie",
        snapshot_date: ydate(),
        providers: { flatrate: [97], rent: [], buy: [] }, // 왓챠 사라짐
      },
      {
        work_id: 2,
        media_type: "movie",
        snapshot_date: tdate(),
        providers: { flatrate: [], rent: [], buy: [] },
      },
    ];
    const { GET } = await import("../route");
    const body = await (await GET(authedReq())).json();
    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
    expect(body.reasons).toMatchObject({ "no-subscribed-match": 1 });
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it("어제와 오늘 동일 → no-diff skip", async () => {
    state.profiles = [
      { id: "p1", account_prefs: { notificationPrefs: { ottExpiry: true }, subscribedOtt: [8] } },
    ];
    state.saved = [{ profile_id: "p1", tmdb_id: 3, type: "movie", title: "x" }];
    state.snapshots = [
      {
        work_id: 3,
        media_type: "movie",
        snapshot_date: ydate(),
        providers: { flatrate: [8], rent: [], buy: [] },
      },
      {
        work_id: 3,
        media_type: "movie",
        snapshot_date: tdate(),
        providers: { flatrate: [8], rent: [], buy: [] },
      },
    ];
    const { GET } = await import("../route");
    const body = await (await GET(authedReq())).json();
    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
    expect(body.reasons).toMatchObject({ "no-diff": 1 });
  });
});
