"use client";

/**
 * Activation analytics helpers.
 *
 * Keep session-id generation and first-session-start gating outside React so it
 * can be tested without mounting the full app shell. This powers the startup
 * funnel: session_started → onboarding_started/completed → recommendation_loaded
 * → card_viewed/detail_opened/card_saved/card_shared.
 */

export const NEQ_SESSION_ID_KEY = "neq_session_id";
export const NEQ_SESSION_STARTED_KEY = "neq_session_started";

export type SessionAnalyticsState = {
  sessionId: string;
  shouldTrackSessionStarted: boolean;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Ensure a browser-session id exists and return whether `session_started`
 * should be emitted. Uses sessionStorage on purpose: a new browser/app session
 * should produce a new activation funnel row, while route changes should not.
 */
export function ensureSessionAnalyticsState(storage: StorageLike): SessionAnalyticsState {
  let sessionId = storage.getItem(NEQ_SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = createSessionId();
    storage.setItem(NEQ_SESSION_ID_KEY, sessionId);
  }

  const alreadyTracked = storage.getItem(NEQ_SESSION_STARTED_KEY) === "1";
  if (!alreadyTracked) {
    storage.setItem(NEQ_SESSION_STARTED_KEY, "1");
  }

  return {
    sessionId,
    shouldTrackSessionStarted: !alreadyTracked,
  };
}
