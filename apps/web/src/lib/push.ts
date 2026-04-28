/**
 * Web Push subscription helper (P0-4 클라이언트 측).
 *
 * 책임:
 *  - 권한 요청 + Service Worker `pushManager.subscribe()`
 *  - LocalStorage(account-prefs) + 서버 동기화
 *  - flag/지원 여부/권한 거부 등 케이스를 명시적 reason 으로 반환
 *
 * 스펙: _workspace/onboarding-v2-spec.md §3.5
 *      _workspace/notification-triggers-detail.md §7.3
 *
 * 서버 측(/api/notifications/subscribe, web-push send 헬퍼 등)은 content-manager 담당.
 */

import { setPushSubscription } from "./account-prefs";
import { isNotificationsEnabled } from "./env";
import { track } from "./analytics";
import { supabase, ensureAuth } from "./supabase";
import type { NekoPushSubscriptionJSON } from "./types";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type SubscribeReason =
  | "flag-off"
  | "no-vapid"
  | "unsupported"
  | "permission-denied"
  | "subscribe-failed"
  | "server-failed";

export interface SubscribeResult {
  ok: boolean;
  reason?: SubscribeReason;
  subscription?: NekoPushSubscriptionJSON;
}

/**
 * Push 구독을 시도한다.
 *
 * 성공 분기:
 *  - { ok: true } : 서버 동기화까지 성공
 *  - { ok: true, reason: "server-failed" } : 브라우저 구독 + LocalStorage 는 OK,
 *    서버 동기화만 실패 (다음 sync에서 재시도)
 *
 * 실패 분기:
 *  - flag-off / no-vapid / unsupported / permission-denied / subscribe-failed
 */
export async function subscribePush(): Promise<SubscribeResult> {
  // 0. flag + VAPID 키
  if (!isNotificationsEnabled()) return { ok: false, reason: "flag-off" };
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: "no-vapid" };

  // 1. 환경 지원 여부
  if (typeof window === "undefined") return { ok: false, reason: "unsupported" };
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return { ok: false, reason: "unsupported" };
  }

  // 2. 권한 요청
  let perm: NotificationPermission;
  try {
    perm = await Notification.requestPermission();
  } catch {
    return { ok: false, reason: "permission-denied" };
  }
  if (perm !== "granted") {
    track("notification_blocked", { timing: "subscribe-attempt" });
    return { ok: false, reason: "permission-denied" };
  }

  // 3. SW ready + pushManager.subscribe
  let subscription: PushSubscription;
  try {
    const reg = await navigator.serviceWorker.ready;
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // Uint8Array<ArrayBufferLike> ↔ BufferSource(ArrayBuffer) 타입 차이
      // 회피용 캐스트 — 런타임은 정상 동작.
      applicationServerKey: urlBase64ToUint8Array(
        VAPID_PUBLIC_KEY,
      ) as unknown as BufferSource,
    });
  } catch {
    return { ok: false, reason: "subscribe-failed" };
  }

  const subJson = subscription.toJSON() as NekoPushSubscriptionJSON;

  // 4. LocalStorage 우선 저장 (서버 실패해도 유지)
  setPushSubscription(subJson);

  // 5. 서버 동기화 시도
  try {
    // 익명 세션 포함 — sync.ts와 동일하게 ensureAuth로 토큰 보장
    await ensureAuth();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

    const res = await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers,
      body: JSON.stringify({ subscription: subJson }),
    });
    if (!res.ok) {
      track("notification_subscribed", { server_synced: false });
      return { ok: true, reason: "server-failed", subscription: subJson };
    }
  } catch {
    track("notification_subscribed", { server_synced: false });
    return { ok: true, reason: "server-failed", subscription: subJson };
  }

  track("notification_subscribed", { server_synced: true });
  return { ok: true, subscription: subJson };
}

/**
 * 현재 구독을 해제한다.
 *
 * - 브라우저 push subscription unsubscribe()
 * - LocalStorage 의 pushSubscription 을 null 로 셋
 *
 * 항상 LocalStorage 는 비운다 (브라우저 단계 실패해도).
 */
export async function unsubscribePush(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch {
    // ignore — LocalStorage 정리는 계속 진행
  }

  setPushSubscription(null);
  return true;
}

/**
 * 현재 브라우저에 등록된 push subscription 을 반환.
 * 없으면 null.
 */
export async function getCurrentPushSubscription(): Promise<NekoPushSubscriptionJSON | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? (sub.toJSON() as NekoPushSubscriptionJSON) : null;
  } catch {
    return null;
  }
}

/**
 * VAPID public key (base64url) → Uint8Array.
 * Web Push API 의 applicationServerKey 는 Uint8Array 만 받음.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
