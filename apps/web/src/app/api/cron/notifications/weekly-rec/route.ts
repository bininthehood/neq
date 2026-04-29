/**
 * GET /api/cron/notifications/weekly-rec
 *
 * 매주 토요일 00:00 UTC (= 토요일 09:00 KST) — 주간 추천 알림.
 * P0-5b 풀구현 (Day 23).
 *
 * 시퀀스 (notification-triggers-detail.md §1):
 *   1. profiles where account_prefs.notificationPrefs.weeklyRec=true
 *   2. 각 사용자별:
 *      a. 활성 페르소나 favorites + tasteGenres + subscribedOtt 로드
 *         (현재 V2 store 가 active persona favorites 를 별도 테이블로 분리하지 않으므로
 *          saved_items + onboarding_picks 를 favorites 신호로 활용)
 *      b. getRecommendations() 직접 호출 (HTTP fetch 보다 함수 import 가 효율적)
 *      c. 상위 3개 작품 추출
 *      d. payload 구성 + sendPush('rec_weekly', ...)
 *   3. cooldown 7d: sendPush 가 자동 처리
 *
 * 비활성 사용자 (favorites/saved 0건) 는 cold start path 로 추천 가능 — 하지만
 * 활동 0 인 사용자에게 매주 알림 보내는 건 노이즈 → favorites 또는 saved 가 둘 다 비면 skip.
 *
 * vercel.json: "0 0 * * 6"
 */

import { NextResponse } from "next/server";
import { isNotificationsEnabled } from "@/lib/env";
import { isAuthorizedCron } from "@/lib/notifications/cron-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  sendPush,
  generateTrackingId,
  type NotificationPayload,
} from "@/lib/notifications/send";
import { getRecommendations } from "@/lib/recommend";
import type { AccountPrefs, Recommendation } from "@/lib/types";

interface ProfileRow {
  id: string;
  account_prefs: AccountPrefs | null;
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isNotificationsEnabled()) {
    return NextResponse.json({
      ok: true,
      disabled: true,
      sent: 0,
      failed: 0,
      skipped: 0,
    });
  }

  const startedAt = Date.now();
  const admin = supabaseAdmin();

  // STEP 1 — weeklyRec=true 사용자 조회
  const { data: profiles, error: profilesErr } = await admin
    .from("profiles")
    .select("id, account_prefs")
    .eq("account_prefs->notificationPrefs->>weeklyRec", "true");

  if (profilesErr) {
    console.error(
      "[cron/weekly-rec] profiles query failed:",
      profilesErr.message,
    );
    return NextResponse.json(
      { error: "profiles-query-failed", detail: profilesErr.message },
      { status: 500 },
    );
  }
  const candidates: ProfileRow[] = (profiles ?? []) as ProfileRow[];
  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      candidates: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      duration_ms: Date.now() - startedAt,
    });
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const reasons: Record<string, number> = {};

  // STEP 2 — 사용자 단위 추천 생성 + 발송 (직렬 — LLM 호출이라 동시성 X)
  for (const p of candidates) {
    try {
      const favorites = await loadFavoriteTitles(admin, p.id);
      // 활동 0 사용자 skip (cold start 알림은 노이즈)
      if (favorites.length === 0) {
        skipped += 1;
        reasons["no-favorites"] = (reasons["no-favorites"] ?? 0) + 1;
        continue;
      }

      const prefs = p.account_prefs ?? null;
      const tasteGenres = prefs?.tasteGenres ?? [];
      const subscribedOtt = prefs?.subscribedOtt ?? [];

      // saved/seen titles → exclude (이미 본 작품 제외)
      const excludeTitles = await loadSavedTitles(admin, p.id);

      const result = await getRecommendations(
        favorites,
        {}, // filter — weekly-rec 은 전체 카탈로그
        undefined, // feedback
        excludeTitles,
        undefined, // excludeIds
        excludeTitles.length, // savedCount (개인화 모드 임계 신호)
        favorites.length, // onboardingCount
        true, // useMirror — 미러 우선 (5분 한도 안전 + TMDB rate)
        tasteGenres,
        subscribedOtt,
      );

      const top3 = (result.recommendations ?? []).slice(0, 3);
      if (top3.length === 0) {
        skipped += 1;
        reasons["no-recommendations"] = (reasons["no-recommendations"] ?? 0) + 1;
        continue;
      }

      const trackingId = generateTrackingId();
      const payload: NotificationPayload = {
        type: "rec_weekly",
        title: "이번 주 큐레이션",
        body: buildBody(top3),
        url: "/discover",
        trackingId,
      };

      const sendResult = await sendPush(p.id, payload);
      if (sendResult.delivered) {
        sent += 1;
      } else {
        const reasonKey = sendResult.reason ?? "unknown";
        reasons[reasonKey] = (reasons[reasonKey] ?? 0) + 1;
        if (
          reasonKey === "cooldown" ||
          reasonKey === "no-subscription" ||
          reasonKey === "type-toggle-off" ||
          reasonKey === "vapid-missing" ||
          reasonKey === "subscription-gone"
        ) {
          skipped += 1;
        } else {
          failed += 1;
        }
      }
    } catch (err) {
      console.error("[cron/weekly-rec] profile error:", p.id, err);
      failed += 1;
      reasons["exception"] = (reasons["exception"] ?? 0) + 1;
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    sent,
    failed,
    skipped,
    reasons,
    duration_ms: Date.now() - startedAt,
  });
}

// ─────────────────────────────────────────────────────────────────
// helpers (내부 — DB I/O)
// ─────────────────────────────────────────────────────────────────

/**
 * favorites 신호: profiles.onboarding_picks (V1 + V2 공통) → 없으면 saved_items.title 상위 5개.
 * Persona.favorites 는 client-only LocalStorage 라 서버에서 직접 접근 불가.
 * onboarding_picks (V1 마이그레이션 컬럼) 가 가장 신뢰 가능한 favorites 시그널.
 */
async function loadFavoriteTitles(
  admin: ReturnType<typeof supabaseAdmin>,
  profileId: string,
): Promise<string[]> {
  // 1차: onboarding_picks
  const { data: profile } = await admin
    .from("profiles")
    .select("onboarding_picks")
    .eq("id", profileId)
    .maybeSingle();
  const picks =
    (profile?.onboarding_picks as Array<{ title?: string }> | null) ?? null;
  const fromPicks: string[] = Array.isArray(picks)
    ? picks
        .map((p) => (typeof p?.title === "string" ? p.title.trim() : ""))
        .filter((t) => t.length > 0)
    : [];

  if (fromPicks.length > 0) return fromPicks.slice(0, 5);

  // 2차: saved_items 최근 5개 title
  const { data: saved } = await admin
    .from("saved_items")
    .select("title")
    .eq("profile_id", profileId)
    .order("saved_at", { ascending: false })
    .limit(5);
  const fromSaved = (saved ?? [])
    .map((r) => (typeof r.title === "string" ? r.title.trim() : ""))
    .filter((t) => t.length > 0);
  return fromSaved;
}

/**
 * saved_items.title 전체 → 추천 exclude 리스트.
 * archived_items 도 포함하면 더 정확하지만 V2 단계에서는 saved_items 만 사용 (보수).
 */
async function loadSavedTitles(
  admin: ReturnType<typeof supabaseAdmin>,
  profileId: string,
): Promise<string[]> {
  const { data } = await admin
    .from("saved_items")
    .select("title")
    .eq("profile_id", profileId);
  return (data ?? [])
    .map((r) => (typeof r.title === "string" ? r.title.trim() : ""))
    .filter((t) => t.length > 0);
}

function buildBody(top3: Recommendation[]): string {
  const titles = top3.map((r) => r.title).filter((t) => t && t.length > 0);
  if (titles.length === 0) return "이번 주 추천 작품을 골랐어요";
  if (titles.length === 1) return `${titles[0]} 추천드려요`;
  if (titles.length === 2) return `${titles[0]}, ${titles[1]} 추천드려요`;
  return `${titles[0]}, ${titles[1]} 외 1편을 골랐어요`;
}
