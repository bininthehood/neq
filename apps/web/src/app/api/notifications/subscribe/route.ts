/**
 * POST /api/notifications/subscribe
 *
 * 클라이언트가 Web Push subscription 등록 시 호출.
 * profiles.account_prefs.notificationPrefs.pushSubscription 필드 갱신.
 *
 * 인증: Authorization: Bearer <supabase access token>
 *      (anonymous 세션 토큰도 동일하게 사용 가능)
 *
 * flag NEXT_PUBLIC_NOTIFICATIONS_ENABLED OFF 시 200 + no-op (frontend 호출 호환).
 *
 * 스펙: _workspace/onboarding-v2-spec.md §3.1
 */

import { NextRequest, NextResponse } from "next/server";
import { isNotificationsEnabled } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AccountPrefs, NekoPushSubscriptionJSON } from "@/lib/types";
import { defaultAccountPrefs } from "@/lib/account-prefs";

interface SubscribeBody {
  subscription?: NekoPushSubscriptionJSON | null;
}

function isValidSubscription(sub: unknown): sub is NekoPushSubscriptionJSON {
  if (!sub || typeof sub !== "object") return false;
  const s = sub as Record<string, unknown>;
  if (typeof s.endpoint !== "string" || s.endpoint.length === 0) return false;
  if (s.keys !== undefined) {
    if (!s.keys || typeof s.keys !== "object") return false;
    const k = s.keys as Record<string, unknown>;
    if (typeof k.p256dh !== "string" || typeof k.auth !== "string") return false;
  }
  return true;
}

export async function POST(req: NextRequest) {
  // flag OFF — no-op
  if (!isNotificationsEnabled()) {
    return NextResponse.json({ ok: true, disabled: true });
  }

  // 1. body 검증
  let body: SubscribeBody;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const sub = body.subscription ?? null;
  if (sub !== null && !isValidSubscription(sub)) {
    return NextResponse.json({ error: "invalid-subscription" }, { status: 400 });
  }

  // 2. 인증 — Authorization: Bearer <jwt>
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();

  // service role client 의 auth.getUser(token) 으로 JWT 검증
  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userRes?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const uid = userRes.user.id;

  // 3. profile_id lookup (user_id 기준)
  const { data: profile } = await admin
    .from("profiles")
    .select("id, account_prefs")
    .eq("user_id", uid)
    .maybeSingle();

  if (!profile) {
    // 클라이언트 sync 가 먼저 호출되어야 — 명확한 에러
    return NextResponse.json({ error: "profile-not-found" }, { status: 404 });
  }

  // 4. account_prefs.notificationPrefs.pushSubscription 갱신
  const prev = (profile.account_prefs ?? null) as AccountPrefs | null;
  const next: AccountPrefs = {
    tasteGenres: prev?.tasteGenres ?? defaultAccountPrefs().tasteGenres,
    subscribedOtt: prev?.subscribedOtt ?? defaultAccountPrefs().subscribedOtt,
    notificationPrefs: {
      weeklyRec:
        prev?.notificationPrefs?.weeklyRec ??
        defaultAccountPrefs().notificationPrefs.weeklyRec,
      newRelease:
        prev?.notificationPrefs?.newRelease ??
        defaultAccountPrefs().notificationPrefs.newRelease,
      ottExpiry:
        prev?.notificationPrefs?.ottExpiry ??
        defaultAccountPrefs().notificationPrefs.ottExpiry,
      monthlyReport:
        prev?.notificationPrefs?.monthlyReport ??
        defaultAccountPrefs().notificationPrefs.monthlyReport,
      pushSubscription: sub,
    },
  };

  const { error: updateErr } = await admin
    .from("profiles")
    .update({ account_prefs: next })
    .eq("id", profile.id);

  if (updateErr) {
    console.error("[notifications/subscribe] update failed:", updateErr.message);
    return NextResponse.json(
      { error: "update-failed", code: updateErr.code },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, subscribed: sub !== null });
}
