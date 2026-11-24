import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** 응답하지 않는 서버 — signal 이 abort 될 때만 끝난다. */
function hangingFetch() {
  return vi.fn(
    (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      }),
  );
}

describe("supabaseMirror timeout", () => {
  const realTimeout = AbortSignal.timeout.bind(AbortSignal);

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://main.example.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "main-key");
    for (const k of ["MIRROR_POSTGREST_URL", "MIRROR_POSTGREST_TOKEN", "MIRROR_SUPABASE_URL", "MIRROR_SUPABASE_SERVICE_ROLE_KEY"]) {
      vi.stubEnv(k, "");
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ["메인 프로젝트 fallback", {}, "https://main.example.co/rest/v1/rpc/match_tmdb_by_embedding"],
    [
      "별도 미러 프로젝트",
      { MIRROR_SUPABASE_URL: "https://mirror.example.co", MIRROR_SUPABASE_SERVICE_ROLE_KEY: "k" },
      "https://mirror.example.co/rest/v1/rpc/match_tmdb_by_embedding",
    ],
    [
      "로컬 PostgREST",
      { MIRROR_POSTGREST_URL: "https://home.example.co", MIRROR_POSTGREST_TOKEN: "t" },
      "https://home.example.co/rpc/match_tmdb_by_embedding",
    ],
  ])("벡터 RPC 는 3초 제한 후 error 반환 — %s", async (_name, env, expectedUrl) => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);
    const spy = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => realTimeout(20));

    const { supabaseMirror } = await import("../supabase-admin");
    const { data, error } = await supabaseMirror().rpc("match_tmdb_by_embedding", {});

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(spy).toHaveBeenCalledWith(3000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 재시도 없음
    expect(String(fetchMock.mock.calls[0][0])).toBe(expectedUrl);
  });

  it("메인 프로젝트 fallback 의 일반 조회에는 제한을 걸지 않는다 (대체 SQL 이 2.9s 걸림)", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json([]));
    vi.stubGlobal("fetch", fetchMock);
    const { supabaseMirror } = await import("../supabase-admin");
    await supabaseMirror().from("tmdb_metadata").select("tmdb_id");
    expect(fetchMock.mock.calls[0][1]?.signal ?? null).toBeNull();
  });

  it("env 누락이면 throw (호출처 fallback 계약)", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { supabaseMirror } = await import("../supabase-admin");
    expect(() => supabaseMirror()).toThrow();
  });
});
