/**
 * /api/tmdb/foreign-availability route 단위 테스트
 *
 * 검증 범위:
 *  1) work_id 누락 → 400
 *  2) US/JP/GB flatrate 있는 나라만 반환 (KR/기타국 무시, rent/buy 무시)
 *  3) flatrate 전무 → 빈 배열
 *  4) TMDB 4xx → graceful 빈 배열 (200)
 *  5) series → /tv/{id} 경로 사용
 *
 * 설계: james-vpn-instore-country-availability-design (Approach A).
 * 모킹 패턴은 /api/search route 테스트와 동일.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

function makeReq(qs: string): NextRequest {
  return new NextRequest(`https://example.com/api/tmdb/foreign-availability?${qs}`);
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("TMDB_API_KEY", "test-tmdb-key");
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function tmdbRes(results: Record<string, unknown>) {
  return { ok: true, json: async () => ({ results }) };
}

describe("GET /api/tmdb/foreign-availability", () => {
  it("work_id 누락 → 400", async () => {
    const { GET } = await import("../route");
    const res = await GET(makeReq("type=movie"));
    expect(res.status).toBe(400);
  });

  it("flatrate 있는 US/JP 만 반환 (KR/rent/buy/기타국 무시)", async () => {
    fetchMock.mockResolvedValueOnce(
      tmdbRes({
        US: { flatrate: [{ provider_name: "Netflix" }] },
        JP: { flatrate: [{ provider_name: "U-NEXT" }] },
        GB: { rent: [{ provider_name: "Apple TV" }] }, // flatrate 없음 → 제외
        KR: { flatrate: [{ provider_name: "wavve" }] }, // 대상국 아님 → 제외
        FR: { flatrate: [{ provider_name: "Canal" }] }, // 대상국 아님 → 제외
      }),
    );
    const { GET } = await import("../route");
    const res = await GET(makeReq("work_id=603&type=movie"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.countries).toEqual([
      { code: "US", name: "미국" },
      { code: "JP", name: "일본" },
    ]);
  });

  it("타국 flatrate 전무 → 빈 배열", async () => {
    fetchMock.mockResolvedValueOnce(
      tmdbRes({ US: { rent: [{ provider_name: "Apple TV" }] } }),
    );
    const { GET } = await import("../route");
    const res = await GET(makeReq("work_id=1&type=movie"));
    const body = await res.json();
    expect(body.countries).toEqual([]);
  });

  it("TMDB 4xx → graceful 빈 배열 (200)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    const { GET } = await import("../route");
    const res = await GET(makeReq("work_id=1&type=movie"));
    expect(res.status).toBe(200);
    expect((await res.json()).countries).toEqual([]);
  });

  it("series → /tv/{id}/watch/providers 경로", async () => {
    fetchMock.mockResolvedValueOnce(tmdbRes({ GB: { flatrate: [{ provider_name: "Now" }] } }));
    const { GET } = await import("../route");
    await GET(makeReq("work_id=1399&type=series"));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/tv/1399/watch/providers"),
    );
  });
});
