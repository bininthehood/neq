/**
 * @vitest-environment node
 *
 * (node 환경 고정: `recommend.ts` 는 모듈 로드 시 OpenAI 클라이언트를 생성하는데
 *  기본 jsdom 환경에서는 SDK 가 브라우저로 오인해 throw 한다.)
 *
 * rerank 픽 수 A/B (2026-08-07) — `pickRerankCap` 배정 규칙.
 *
 * 검증 핵심:
 *   - arm 은 10(variant) / 20(control) 둘 뿐. 그 외 값이 나오면 실험이 오염된다
 *   - 50/50 경계 (rng < 0.5 → variant)
 *   - 기본 인자(Math.random)로도 두 값 밖으로 새지 않음
 *
 * 실험 종료 시 이 파일도 함께 제거할 것 (승자를 상수로 굳히는 커밋).
 */
import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.TMDB_API_KEY = "test-tmdb-key";
  process.env.OPENAI_API_KEY = "sk-test-0123456789abcdef0123456789abcdef";
});

import { pickRerankCap } from "../../recommend";

describe("pickRerankCap — A/B 배정", () => {
  it("rng < 0.5 → variant(10)", () => {
    expect(pickRerankCap(() => 0)).toBe(10);
    expect(pickRerankCap(() => 0.4999)).toBe(10);
  });

  it("rng >= 0.5 → control(20)", () => {
    expect(pickRerankCap(() => 0.5)).toBe(20);
    expect(pickRerankCap(() => 0.9999)).toBe(20);
  });

  it("기본 rng 로도 10/20 밖의 값이 나오지 않음", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(pickRerankCap());
    expect([...seen].sort((a, b) => a - b)).toEqual([10, 20]);
  });
});
