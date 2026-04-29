/**
 * weekly-rec route 단위 테스트
 *
 * 검증 범위:
 *  - 401 (인증 실패)
 *  - flag OFF (disabled)
 *  - 사용자 0 (early return)
 *  - favorites 0 → skip(no-favorites)
 *  - 정상 흐름: getRecommendations → top 3 → sendPush 호출
 *  - sendPush 실패 → reasons 누적 (다른 사용자 영향 없음)
 *
 * 모킹:
 *  - supabaseAdmin: 인메모리 fake (chainable)
 *  - getRecommendations: vi.mock
 *  - sendPush: vi.mock (delivered 플래그 제어)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Recommendation } from "@/lib/types";

interface ProfileRow { id: string; account_prefs: unknown; onboarding_picks?: Array<{ title: string }> }
interface SavedRow { profile_id: string; title: string; saved_at?: string }

interface FakeState {
  profiles: ProfileRow[];
  saved: SavedRow[];
  pushes: Array<{ profileId: string; payload: { type: string; title: string; body: string; url: string } }>;
}

const state: FakeState = {
  profiles: [],
  saved: [],
  pushes: [],
};

function resetState() {
  state.profiles = [];
  state.saved = [];
  state.pushes = [];
}

function makeFakeAdmin() {
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select(_cols: string) {
            void _cols;
            const builder = {
              _filter: null as null | { col: string; val: string },
              _id: null as null | string,
              eq(col: string, val: string) {
                if (col === "id") {
                  this._id = val;
                  return {
                    maybeSingle: () => {
                      const p = state.profiles.find((x) => x.id === this._id);
                      return Promise.resolve({
                        data: p ? { onboarding_picks: p.onboarding_picks ?? null } : null,
                        error: null,
                      });
                    },
                  };
                }
                this._filter = { col, val };
                // weeklyRec=true 필터
                const filtered = state.profiles.filter((p) => {
                  const ap = p.account_prefs as Record<string, Record<string, unknown>> | null;
                  return ap?.notificationPrefs?.weeklyRec === true;
                });
                return Promise.resolve({ data: filtered, error: null });
              },
            };
            return builder;
          },
        };
      }
      if (table === "saved_items") {
        return {
          select(_cols: string) {
            void _cols;
            return {
              _profileId: null as null | string,
              _orderBy: null as null | string,
              _limit: null as null | number,
              eq(col: string, val: string) {
                this._profileId = val;
                void col;
                const result = (limit?: number, order?: boolean) => {
                  let rows = state.saved.filter((s) => s.profile_id === this._profileId);
                  if (order) {
                    rows = [...rows].sort((a, b) => (b.saved_at ?? "").localeCompare(a.saved_at ?? ""));
                  }
                  if (limit) rows = rows.slice(0, limit);
                  return Promise.resolve({ data: rows, error: null });
                };
                const next = {
                  order: (_col: string, _opts: { ascending: boolean }) => {
                    void _col;
                    void _opts;
                    return {
                      limit: (n: number) => result(n, true),
                    };
                  },
                  // raw access — 모든 row
                  then: (resolve: (v: { data: SavedRow[]; error: null }) => void) =>
                    result().then(resolve),
                };
                return next;
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

vi.mock("@/lib/recommend", () => ({
  getRecommendations: vi.fn(async () => ({
    recommendations: [
      { title: "기생충" } as Recommendation,
      { title: "헤어질 결심" } as Recommendation,
      { title: "올드보이" } as Recommendation,
    ],
    timings: {},
  })),
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
  return new Request("https://example.com/api/cron/notifications/weekly-rec", {
    headers: { Authorization: "Bearer test-secret" },
  });
}

describe("GET /api/cron/notifications/weekly-rec", () => {
  it("인증 실패 시 401", async () => {
    const { GET } = await import("../route");
    const res = await GET(
      new Request("https://example.com/x", { headers: { Authorization: "Bearer wrong" } }),
    );
    expect(res.status).toBe(401);
  });

  it("flag OFF → disabled 응답", async () => {
    vi.stubEnv("NEXT_PUBLIC_NOTIFICATIONS_ENABLED", "false");
    const { GET } = await import("../route");
    const res = await GET(authedReq());
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, disabled: true });
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it("weeklyRec=true 사용자 0 → 0 발송", async () => {
    state.profiles = [];
    const { GET } = await import("../route");
    const res = await GET(authedReq());
    const body = await res.json();
    expect(body.candidates).toBe(0);
    expect(body.sent).toBe(0);
  });

  it("favorites 0 (onboarding_picks=null + saved=0) → skip(no-favorites)", async () => {
    state.profiles = [
      {
        id: "p1",
        account_prefs: { notificationPrefs: { weeklyRec: true } },
        onboarding_picks: null as unknown as Array<{ title: string }>,
      },
    ];
    state.saved = [];
    const { GET } = await import("../route");
    const res = await GET(authedReq());
    const body = await res.json();
    expect(body.candidates).toBe(1);
    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
    expect(body.reasons).toMatchObject({ "no-favorites": 1 });
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it("정상 흐름: favorites 있으면 sendPush 호출 + sent=1", async () => {
    state.profiles = [
      {
        id: "p1",
        account_prefs: { notificationPrefs: { weeklyRec: true } },
        onboarding_picks: [{ title: "기생충" }, { title: "헤어질 결심" }],
      },
    ];
    state.saved = [
      { profile_id: "p1", title: "올드보이", saved_at: "2026-04-20" },
    ];

    const { GET } = await import("../route");
    const res = await GET(authedReq());
    const body = await res.json();
    expect(body.sent).toBe(1);
    expect(body.failed).toBe(0);
    expect(sendPushMock).toHaveBeenCalledTimes(1);
    const [profileId, payload] = sendPushMock.mock.calls[0];
    expect(profileId).toBe("p1");
    expect(payload.type).toBe("rec_weekly");
    expect(payload.title).toBe("이번 주 큐레이션");
    expect(payload.body).toContain("기생충");
    expect(payload.url).toBe("/discover");
  });

  it("sendPush cooldown → skipped 누적, 다른 사용자 정상 처리", async () => {
    state.profiles = [
      {
        id: "p1",
        account_prefs: { notificationPrefs: { weeklyRec: true } },
        onboarding_picks: [{ title: "기생충" }],
      },
      {
        id: "p2",
        account_prefs: { notificationPrefs: { weeklyRec: true } },
        onboarding_picks: [{ title: "올드보이" }],
      },
    ];
    sendPushMock
      .mockResolvedValueOnce({ delivered: false, reason: "cooldown" })
      .mockResolvedValueOnce({ delivered: true });

    const { GET } = await import("../route");
    const res = await GET(authedReq());
    const body = await res.json();
    expect(body.sent).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.failed).toBe(0);
    expect(body.reasons).toMatchObject({ cooldown: 1 });
  });
});
