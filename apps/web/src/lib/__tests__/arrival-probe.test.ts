import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { arrivalKey, hasNotified, markNotified } from "../arrival-probe";

/**
 * 입고 알림 프로브 — 로컬 dedup + flag 게이팅 단위 테스트.
 * 설계: james-vpn-instore-country-availability-design (Approach A).
 */

describe("arrival-probe 로컬 dedup 저장", () => {
  beforeEach(() => localStorage.clear());

  it("markNotified 후 hasNotified 가 true (재탭 dedup 근거)", () => {
    expect(hasNotified(603, "movie")).toBe(false);
    markNotified(603, "movie");
    expect(hasNotified(603, "movie")).toBe(true);
  });

  it("PK=(tmdb_id, media_type) — 같은 id 라도 type 다르면 별개", () => {
    markNotified(1399, "series");
    expect(hasNotified(1399, "series")).toBe(true);
    expect(hasNotified(1399, "movie")).toBe(false);
  });

  it("variety 는 series 키로 정규화 (mirror media_type 정합)", () => {
    expect(arrivalKey(100, "variety")).toBe("series:100");
    markNotified(100, "variety");
    expect(hasNotified(100, "series")).toBe(true);
  });

  it("markNotified 는 누적 (기존 항목 보존)", () => {
    markNotified(1, "movie");
    markNotified(2, "movie");
    expect(hasNotified(1, "movie")).toBe(true);
    expect(hasNotified(2, "movie")).toBe(true);
  });

  it("손상된 저장값이면 빈 상태로 degrade (throw 안 함)", () => {
    localStorage.setItem("neq_arrival_notify", "{not json");
    expect(hasNotified(1, "movie")).toBe(false);
    markNotified(1, "movie");
    expect(hasNotified(1, "movie")).toBe(true);
  });
});

describe("isArrivalProbeEnabled flag 게이팅 (기본 OFF)", () => {
  const prev = process.env.NEXT_PUBLIC_ARRIVAL_PROBE_ENABLED;
  afterEach(() => {
    process.env.NEXT_PUBLIC_ARRIVAL_PROBE_ENABLED = prev;
  });

  it("env 미설정이면 false", async () => {
    delete process.env.NEXT_PUBLIC_ARRIVAL_PROBE_ENABLED;
    const { isArrivalProbeEnabled } = await import("../env");
    expect(isArrivalProbeEnabled()).toBe(false);
  });

  it("'true' 일 때만 활성", async () => {
    process.env.NEXT_PUBLIC_ARRIVAL_PROBE_ENABLED = "true";
    const { isArrivalProbeEnabled } = await import("../env");
    expect(isArrivalProbeEnabled()).toBe(true);
    process.env.NEXT_PUBLIC_ARRIVAL_PROBE_ENABLED = "1";
    expect(isArrivalProbeEnabled()).toBe(false);
  });
});
