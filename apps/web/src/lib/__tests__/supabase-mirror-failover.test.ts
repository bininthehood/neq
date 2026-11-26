import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 집 미러(MIRROR_POSTGREST_*)가 죽었을 때 호스팅(메인 프로젝트)으로 넘어가는지.
 * Mac 꺼짐/로그인 대기 = Cloudflare 530, 터널만 살아 있음 = 502, 무응답, 연결 거부.
 */
const HOME = "https://home.example.co";
const MAIN = "https://main.example.co";

type Call = { url: string; auth: string | null; apikey: string | null };

function fakeFetch(home: "ok" | "hang" | "refuse" | number) {
  const calls: Call[] = [];
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const h = new Headers(init?.headers);
    calls.push({ url, auth: h.get("Authorization"), apikey: h.get("apikey") });
    if (url.startsWith(MAIN)) return Promise.resolve(Response.json([{ from: "main" }]));
    if (home === "ok") return Promise.resolve(Response.json([{ from: "home" }]));
    if (home === "refuse") return Promise.reject(new TypeError("fetch failed"));
    if (home === "hang") {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      });
    }
    return Promise.resolve(new Response("<html>error code: 1033</html>", { status: home }));
  });
  return { fn, calls };
}

describe("supabaseMirror 집 미러 장애 시 호스팅 우회", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", MAIN);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "main-key");
    vi.stubEnv("MIRROR_POSTGREST_URL", HOME);
    vi.stubEnv("MIRROR_POSTGREST_TOKEN", "home-token");
    vi.stubEnv("MIRROR_SUPABASE_URL", "");
    vi.stubEnv("MIRROR_SUPABASE_SERVICE_ROLE_KEY", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function select() {
    const { supabaseMirror } = await import("../supabase-admin");
    return supabaseMirror().from("tmdb_metadata").select("tmdb_id").limit(1);
  }

  it("정상이면 집 미러만 쓴다", async () => {
    const { fn, calls } = fakeFetch("ok");
    vi.stubGlobal("fetch", fn);
    const { data, error } = await select();
    expect(error).toBeNull();
    expect(data).toEqual([{ from: "home" }]);
    expect(calls.map((c) => c.url)).toEqual([`${HOME}/tmdb_metadata?select=tmdb_id&limit=1`]);
  });

  it.each([530, 502, 500])("집 미러 %i → 같은 요청을 호스팅 키로 다시 보낸다", async (status) => {
    const { fn, calls } = fakeFetch(status);
    vi.stubGlobal("fetch", fn);
    const { data, error } = await select();
    expect(error).toBeNull();
    expect(data).toEqual([{ from: "main" }]);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({
      url: `${MAIN}/rest/v1/tmdb_metadata?select=tmdb_id&limit=1`,
      auth: "Bearer main-key",
      apikey: "main-key",
    });
  });

  it("연결 거부 → 재시도 대기 없이 호스팅으로 넘어간다", async () => {
    const { fn, calls } = fakeFetch("refuse");
    vi.stubGlobal("fetch", fn);
    const { data } = await select();
    expect(data).toEqual([{ from: "main" }]);
    expect(calls.map((c) => c.url.startsWith(MAIN))).toEqual([false, true]);
  });

  it("무응답 → 응답 헤더 3초 제한 후 호스팅으로 넘어간다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { fn, calls } = fakeFetch("hang");
    vi.stubGlobal("fetch", fn);
    const p = select();
    await vi.advanceTimersByTimeAsync(2999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    const { data } = await p;
    expect(data).toEqual([{ from: "main" }]);
    expect(calls).toHaveLength(2);
  });

  it("한 번 실패하면 60초 동안 집 미러를 건너뛰고, 그 뒤 다시 시도한다", async () => {
    const { fn, calls } = fakeFetch(530);
    vi.stubGlobal("fetch", fn);
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const { supabaseMirror } = await import("../supabase-admin");
    const q = () => supabaseMirror().from("tmdb_metadata").select("tmdb_id");
    await q();
    await q();
    expect(calls.map((c) => c.url.startsWith(HOME))).toEqual([true, false, false]);
    now.mockReturnValue(1_000_000 + 60_001);
    await q();
    expect(calls.map((c) => c.url.startsWith(HOME))).toEqual([true, false, false, true, false]);
  });

  it("벡터 RPC 는 호스팅으로 넘기지 않고 바로 실패한다 (호스팅에 인덱스 없음)", async () => {
    const { fn, calls } = fakeFetch(530);
    vi.stubGlobal("fetch", fn);
    const { supabaseMirror } = await import("../supabase-admin");
    const first = await supabaseMirror().rpc("match_tmdb_by_embedding", {});
    expect(first.error).not.toBeNull();
    expect(calls.map((c) => c.url)).toEqual([`${HOME}/rpc/match_tmdb_by_embedding`]);
    // 건너뛰는 동안에도 네트워크 호출 없이 바로 실패
    const second = await supabaseMirror().rpc("match_tmdb_by_embedding", {});
    expect(second.error).not.toBeNull();
    expect(calls).toHaveLength(1);
    // 일반 조회는 호스팅으로
    const { data } = await supabaseMirror().from("tmdb_metadata").select("tmdb_id");
    expect(data).toEqual([{ from: "main" }]);
  });

  it("4xx(토큰·권한 오류)는 숨기지 않고 그대로 돌려준다", async () => {
    const { fn, calls } = fakeFetch(403);
    vi.stubGlobal("fetch", fn);
    const { error } = await select();
    expect(error).not.toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("호출자가 취소하면 호스팅으로 넘기지 않는다", async () => {
    const { fn, calls } = fakeFetch("hang");
    vi.stubGlobal("fetch", fn);
    const { supabaseMirror } = await import("../supabase-admin");
    const ac = new AbortController();
    const p = supabaseMirror().from("tmdb_metadata").select("tmdb_id").abortSignal(ac.signal);
    setTimeout(() => ac.abort(), 10);
    const { error } = await p;
    expect(error).not.toBeNull();
    expect(calls).toHaveLength(1);
  });
});
