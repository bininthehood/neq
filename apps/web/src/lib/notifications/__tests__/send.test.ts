/**
 * notifications/send.ts 단위 테스트
 *
 * P0-4 범위:
 *  - appendPushTracking : url 에 `?via=push&trackingId=...` 자동 부착
 *
 * sendPush() 자체는 webpush + supabase 모킹이 큰 작업이라 P0-5 cron 비즈니스
 * 로직 구현 시 함께 통합 테스트로 추가 예정.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

beforeEach(() => {
  // env.ts top-level 의 server-only require 통과용
  vi.stubEnv("TMDB_API_KEY", "test-tmdb-key");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
});

describe("appendPushTracking", () => {
  it("query 가 없는 url 에 ?via=push&trackingId= 부착", async () => {
    const { appendPushTracking } = await import("../send");
    const out = appendPushTracking("/profile/report/2026-04", "tr_123");
    expect(out).toBe("/profile/report/2026-04?via=push&trackingId=tr_123");
  });

  it("이미 query 가 있는 url 에 &via=push&trackingId= 부착", async () => {
    const { appendPushTracking } = await import("../send");
    const out = appendPushTracking("/recommend?type=tv", "tr_456");
    expect(out).toBe("/recommend?type=tv&via=push&trackingId=tr_456");
  });

  it("이미 via=push + trackingId 둘 다 있으면 그대로 반환", async () => {
    const { appendPushTracking } = await import("../send");
    const out = appendPushTracking(
      "/x?via=push&trackingId=existing",
      "tr_new",
    );
    expect(out).toBe("/x?via=push&trackingId=existing");
  });

  it("via=push 만 있고 trackingId 없으면 trackingId 만 추가", async () => {
    const { appendPushTracking } = await import("../send");
    const out = appendPushTracking("/x?via=push", "tr_999");
    expect(out).toBe("/x?via=push&trackingId=tr_999");
  });

  it("trackingId encoding (특수문자 안전)", async () => {
    const { appendPushTracking } = await import("../send");
    const out = appendPushTracking("/x", "id with space");
    expect(out).toBe("/x?via=push&trackingId=id%20with%20space");
  });

  it("hash fragment 보존", async () => {
    const { appendPushTracking } = await import("../send");
    const out = appendPushTracking("/x?a=1#section", "tr_h");
    expect(out).toBe("/x?a=1&via=push&trackingId=tr_h#section");
  });

  it("빈 url 은 / 로 fallback", async () => {
    const { appendPushTracking } = await import("../send");
    const out = appendPushTracking("", "tr_e");
    expect(out).toBe("/?via=push&trackingId=tr_e");
  });
});
