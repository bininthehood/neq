/**
 * Push 발송 헬퍼 (서버 전용).
 *
 * - feature flag (NEXT_PUBLIC_NOTIFICATIONS_ENABLED) 가드
 * - VAPID 미설정 시 dry-run
 * - cooldown 체크 (notification_log)
 * - 사용자별 notificationPrefs 토글 확인
 * - 410 Gone → pushSubscription = null 자동 정리
 * - notification_log insert (delivered + reason 기록)
 *
 * 스펙: _workspace/onboarding-v2-spec.md §3
 *      _workspace/notification-triggers-detail.md §1~5
 */

import webpush from "web-push";
import {
  isNotificationsEnabled,
  isVapidConfigured,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  getVapidPrivateKey,
  getVapidSubject,
} from "../env";
import { supabaseAdmin } from "../supabase-admin";
import type { AccountPrefs, NekoPushSubscriptionJSON } from "../types";

export type NotificationType =
  | "rec_weekly"
  | "new_release"
  | "ott_expiry"
  | "monthly_report"
  | "ad";

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  url: string;
  imageUrl?: string;
  trackingId: string;
  category?: string; // type=ad 일 때만
}

/**
 * 알림 종류별 cooldown (시간 단위).
 * spec §3 / notification-triggers-detail.md §1.3, §2.3, §3.4, §4.3, §5.3
 */
const COOLDOWN_HOURS: Record<NotificationType, number> = {
  rec_weekly: 24 * 7, // 주 1건
  new_release: 24, // 24시간 내 동일 작품 1건
  ott_expiry: 24 * 7, // 주 1건
  monthly_report: 24 * 30, // 월 1건 (자연 충족)
  ad: 24 * 7, // 주 1건 cap
};

/**
 * type → notificationPrefs key 매핑.
 * 'ad' 는 future — pref 토글이 아직 없으면 false 처리.
 */
const PREF_KEY: Record<NotificationType, keyof import("../types").NotificationPrefs | "ad"> = {
  rec_weekly: "weeklyRec",
  new_release: "newRelease",
  ott_expiry: "ottExpiry",
  monthly_report: "monthlyReport",
  ad: "ad", // future: NotificationPrefs 에 ad: boolean 추가 시 동작
};

export interface SendResult {
  delivered: boolean;
  reason?: string;
}

/**
 * payload.url 끝에 `?via=push&trackingId=<id>` 또는 `&via=push&trackingId=<id>` 부착.
 *
 * sw.ts 의 notificationclick 은 url 그대로 openWindow → 페이지 진입 시
 * `?via=push` 쿼리를 보고 PostHog `notification_clicked` 트래킹.
 *
 * 이미 `via=push` 가 붙어 있으면 중복 부착하지 않는다. trackingId 만 갱신.
 * 스펙: notification-triggers-detail.md §7.5
 */
export function appendPushTracking(rawUrl: string, trackingId: string): string {
  if (!rawUrl) return `/?via=push&trackingId=${encodeURIComponent(trackingId)}`;

  // Hash fragment 보존
  const hashIdx = rawUrl.indexOf("#");
  const hash = hashIdx >= 0 ? rawUrl.slice(hashIdx) : "";
  const base = hashIdx >= 0 ? rawUrl.slice(0, hashIdx) : rawUrl;

  const hasQuery = base.includes("?");
  const hasViaPush = /[?&]via=push(&|$)/.test(base);
  const hasTrackingId = /[?&]trackingId=/.test(base);

  // 이미 via=push + trackingId 둘 다 있으면 그대로 (호출자가 직접 부착한 케이스)
  if (hasViaPush && hasTrackingId) return rawUrl;

  const sep = hasQuery ? "&" : "?";
  const parts: string[] = [];
  if (!hasViaPush) parts.push("via=push");
  if (!hasTrackingId) parts.push(`trackingId=${encodeURIComponent(trackingId)}`);

  return `${base}${sep}${parts.join("&")}${hash}`;
}

/**
 * profileId 에게 push 알림 발송.
 *
 * 흐름:
 *   1. flag/vapid 가드
 *   2. cooldown 체크 (notification_log)
 *   3. profile.account_prefs.pushSubscription + 토글 조회
 *   4. webpush.sendNotification
 *   5. notification_log insert (delivered + payload)
 *
 * 항상 reason 을 반환해 cron 결과 로그에 활용.
 */
export async function sendPush(
  profileId: string,
  payload: NotificationPayload,
): Promise<SendResult> {
  // 0. flag 가드 — 미활성 시 완전 no-op (log 도 남기지 않음)
  if (!isNotificationsEnabled()) {
    return { delivered: false, reason: "notifications-disabled" };
  }

  const admin = supabaseAdmin();

  // 1. cooldown 체크
  const cooldownH = COOLDOWN_HOURS[payload.type];
  const since = new Date(Date.now() - cooldownH * 3600_000).toISOString();
  const { data: recent, error: recentErr } = await admin
    .from("notification_log")
    .select("id")
    .eq("profile_id", profileId)
    .eq("type", payload.type)
    .gte("sent_at", since)
    .limit(1);

  if (recentErr) {
    console.error("[notifications/send] cooldown query failed:", recentErr.message);
    return { delivered: false, reason: `cooldown-query-error:${recentErr.code ?? "unknown"}` };
  }
  if (recent && recent.length > 0) {
    return { delivered: false, reason: "cooldown" };
  }

  // 2. profile.account_prefs 조회
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("account_prefs")
    .eq("id", profileId)
    .single();

  if (profileErr || !profile) {
    return { delivered: false, reason: "profile-not-found" };
  }

  const prefs = (profile.account_prefs ?? null) as AccountPrefs | null;
  const sub = prefs?.notificationPrefs?.pushSubscription as
    | NekoPushSubscriptionJSON
    | null
    | undefined;

  if (!sub) {
    return { delivered: false, reason: "no-subscription" };
  }

  // 3. type 토글 확인
  const prefKey = PREF_KEY[payload.type];
  const npAny = (prefs?.notificationPrefs ?? {}) as Record<string, unknown>;
  if (!npAny[prefKey as string]) {
    return { delivered: false, reason: "type-toggle-off" };
  }

  // 4. VAPID 미설정 시 — 발송 skip 하되 log 는 남겨 cooldown/디버그에 활용
  if (!isVapidConfigured()) {
    await admin.from("notification_log").insert({
      profile_id: profileId,
      type: payload.type,
      payload,
      delivered: false,
    });
    return { delivered: false, reason: "vapid-missing" };
  }

  // 5. webpush 설정 + 발송
  webpush.setVapidDetails(
    getVapidSubject(),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    getVapidPrivateKey(),
  );

  // 5.1. payload.url 에 `?via=push&trackingId=...` 자동 부착.
  //      sw.ts → notificationclick → openWindow(url) 이후 페이지가
  //      notification_clicked 트래킹할 때 사용.
  const finalPayload: NotificationPayload = {
    ...payload,
    url: appendPushTracking(payload.url, payload.trackingId),
  };

  let delivered = false;
  let logReason: string | null = null;

  try {
    // NekoPushSubscriptionJSON 은 Web Push 표준 PushSubscriptionJSON 과 동등 shape.
    // web-push 의 PushSubscription 인자는 endpoint+keys 만 요구.
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: sub.keys ?? { p256dh: "", auth: "" },
      },
      JSON.stringify(finalPayload),
    );
    delivered = true;
  } catch (err: unknown) {
    const e = err as { statusCode?: number; body?: string; message?: string };
    if (e.statusCode === 410 || e.statusCode === 404) {
      // subscription 만료/제거 → null 로 정리
      const newPrefs: AccountPrefs = {
        tasteGenres: prefs?.tasteGenres ?? [],
        subscribedOtt: prefs?.subscribedOtt ?? [],
        notificationPrefs: {
          weeklyRec: prefs?.notificationPrefs?.weeklyRec ?? false,
          newRelease: prefs?.notificationPrefs?.newRelease ?? false,
          ottExpiry: prefs?.notificationPrefs?.ottExpiry ?? false,
          monthlyReport: prefs?.notificationPrefs?.monthlyReport ?? false,
          pushSubscription: null,
        },
      };
      await admin
        .from("profiles")
        .update({ account_prefs: newPrefs })
        .eq("id", profileId);
      logReason = "subscription-gone";
    } else {
      logReason = `error:${e.statusCode ?? "unknown"}`;
      console.error(
        "[notifications/send] push failed:",
        e.statusCode,
        e.message ?? e.body,
      );
    }
  }

  // 6. log insert (성공/실패 모두 — cooldown 도 이 row 로 결정됨)
  //    log 에는 실제 발송된 finalPayload (?via=push 부착 후) 저장.
  const { error: logErr } = await admin.from("notification_log").insert({
    profile_id: profileId,
    type: payload.type,
    payload: finalPayload,
    delivered,
  });
  if (logErr) {
    console.error("[notifications/send] log insert failed:", logErr.message);
  }

  return { delivered, reason: logReason ?? undefined };
}

/**
 * 외부 export — cron / admin 디버그에서 cooldown 룩업 시 사용 가능.
 * payload 구성 시 unique trackingId 만들 때 활용.
 */
export function generateTrackingId(): string {
  // Node 18+ globalThis.crypto.randomUUID
  return (
    globalThis.crypto?.randomUUID?.() ??
    `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  );
}
