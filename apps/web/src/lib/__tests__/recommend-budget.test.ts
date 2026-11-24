import { describe, expect, it } from "vitest";
import { reserveDailyBudget } from "../recommend-budget";

describe("reserveDailyBudget", () => {
  it("allows requests up to the daily cap and rejects the next one", async () => {
    let count = 0;
    const expirations: number[] = [];
    const store = {
      incr: async () => ++count,
      expire: async (_key: string, seconds: number) => { expirations.push(seconds); },
    };
    const now = new Date("2026-11-19T23:59:30Z");

    expect(await reserveDailyBudget(store, 2, now)).toBe(true);
    expect(await reserveDailyBudget(store, 2, now)).toBe(true);
    expect(await reserveDailyBudget(store, 2, now)).toBe(false);
    expect(expirations).toEqual([30, 30, 30]);
  });

  it("uses a new counter on the next UTC day", async () => {
    const keys: string[] = [];
    const store = {
      incr: async (key: string) => { keys.push(key); return 1; },
      expire: async () => {},
    };
    await reserveDailyBudget(store, 1, new Date("2026-11-19T12:00:00Z"));
    await reserveDailyBudget(store, 1, new Date("2026-11-20T00:00:00Z"));
    expect(keys).toEqual(["recommend:daily:2026-11-19", "recommend:daily:2026-11-20"]);
  });
});
