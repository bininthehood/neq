import { describe, expect, it, vi } from "vitest";
import {
  ensureSessionAnalyticsState,
  NEQ_SESSION_ID_KEY,
  NEQ_SESSION_STARTED_KEY,
} from "../activation-analytics";

function createStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    dump: () => Object.fromEntries(store.entries()),
  };
}

describe("ensureSessionAnalyticsState", () => {
  it("creates a session id and marks session_started as trackable once", () => {
    const storage = createStorage();

    const first = ensureSessionAnalyticsState(storage);
    const second = ensureSessionAnalyticsState(storage);

    expect(first.sessionId).toBeTruthy();
    expect(first.shouldTrackSessionStarted).toBe(true);
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.shouldTrackSessionStarted).toBe(false);
    expect(storage.dump()[NEQ_SESSION_STARTED_KEY]).toBe("1");
  });

  it("reuses an existing session id and does not retrack when already marked", () => {
    const storage = createStorage({
      [NEQ_SESSION_ID_KEY]: "sess_existing",
      [NEQ_SESSION_STARTED_KEY]: "1",
    });

    const state = ensureSessionAnalyticsState(storage);

    expect(state).toEqual({
      sessionId: "sess_existing",
      shouldTrackSessionStarted: false,
    });
  });
});
