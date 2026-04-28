/**
 * Account-level preferences store.
 *
 * 페르소나 외부의 "계정 전체" 단위 설정을 LocalStorage에 단일 JSON 키로 저장한다.
 * - tasteGenres   : 장르 칩 멀티 선택 (LLM 강한 신호로 사용)
 * - subscribedOtt : 구독 OTT provider id (LLM 약한 신호 — 가중치)
 * - notificationPrefs : 4종 알림 토글 + Web Push subscription
 *
 * 스펙: _workspace/onboarding-v2-spec.md §1.2
 * 마이그레이션: supabase/migrations/20260428_onboarding_v2.sql §1
 *
 * 모든 함수는 SSR 안전 — typeof window === "undefined" 시 default 반환 또는 no-op.
 */

import type {
  AccountPrefs,
  NotificationPrefs,
  NekoPushSubscriptionJSON,
} from "./types";

const ACCOUNT_PREFS_KEY = "neq_account_prefs";

// ─── default ───

export function defaultNotificationPrefs(): NotificationPrefs {
  return {
    weeklyRec: false,
    newRelease: false,
    ottExpiry: false,
    monthlyReport: false,
    pushSubscription: null,
  };
}

export function defaultAccountPrefs(): AccountPrefs {
  return {
    tasteGenres: [],
    subscribedOtt: [],
    notificationPrefs: defaultNotificationPrefs(),
  };
}

// ─── parse ───

/**
 * LocalStorage 의 raw 문자열을 AccountPrefs 로 안전 복원.
 * - JSON 파싱 실패 → default
 * - 누락된 필드 → default 로 채움 (forward-compat)
 * - 타입 불일치 → default 필드로 fallback
 */
function parseAccountPrefs(raw: string | null): AccountPrefs {
  if (!raw) return defaultAccountPrefs();
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return defaultAccountPrefs();
  }
  if (!obj || typeof obj !== "object") return defaultAccountPrefs();
  const o = obj as Record<string, unknown>;

  const tasteGenres = Array.isArray(o.tasteGenres)
    ? o.tasteGenres.filter((x): x is string => typeof x === "string")
    : [];
  const subscribedOtt = Array.isArray(o.subscribedOtt)
    ? o.subscribedOtt.filter((x): x is number => typeof x === "number")
    : [];

  const np = (o.notificationPrefs ?? {}) as Record<string, unknown>;
  const notificationPrefs: NotificationPrefs = {
    weeklyRec: typeof np.weeklyRec === "boolean" ? np.weeklyRec : false,
    newRelease: typeof np.newRelease === "boolean" ? np.newRelease : false,
    ottExpiry: typeof np.ottExpiry === "boolean" ? np.ottExpiry : false,
    monthlyReport:
      typeof np.monthlyReport === "boolean" ? np.monthlyReport : false,
    pushSubscription:
      np.pushSubscription && typeof np.pushSubscription === "object"
        ? (np.pushSubscription as NekoPushSubscriptionJSON)
        : null,
  };

  return { tasteGenres, subscribedOtt, notificationPrefs };
}

// ─── core CRUD ───

export function getAccountPrefs(): AccountPrefs {
  if (typeof window === "undefined") return defaultAccountPrefs();
  return parseAccountPrefs(localStorage.getItem(ACCOUNT_PREFS_KEY));
}

export function setAccountPrefs(prefs: AccountPrefs): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCOUNT_PREFS_KEY, JSON.stringify(prefs));
}

export function updateAccountPrefs(
  updater: (prev: AccountPrefs) => AccountPrefs,
): void {
  if (typeof window === "undefined") return;
  const next = updater(getAccountPrefs());
  setAccountPrefs(next);
}

// ─── convenience setters ───

export function setTasteGenres(genres: string[]): void {
  updateAccountPrefs((prev) => ({ ...prev, tasteGenres: genres }));
}

export function setSubscribedOtt(providers: number[]): void {
  updateAccountPrefs((prev) => ({ ...prev, subscribedOtt: providers }));
}

export function updateNotificationPrefs(
  updater: (prev: NotificationPrefs) => NotificationPrefs,
): void {
  updateAccountPrefs((prev) => ({
    ...prev,
    notificationPrefs: updater(prev.notificationPrefs),
  }));
}

export function setPushSubscription(
  sub: NekoPushSubscriptionJSON | null,
): void {
  updateNotificationPrefs((prev) => ({ ...prev, pushSubscription: sub }));
}

// ─── reset (테스트 + clearAllUserData 용) ───

export function clearAccountPrefs(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCOUNT_PREFS_KEY);
}
