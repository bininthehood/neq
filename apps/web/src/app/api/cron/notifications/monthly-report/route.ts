/**
 * GET /api/cron/notifications/monthly-report
 *
 * 매월 1일 00:00 UTC (= 1일 09:00 KST) — 지난 달 시청 리포트 알림.
 *
 * P0-4: PoC 풀구현 (단순 집계 + 발송).
 *   - 시청 작품 수 (지난 달 watch_reports)
 *   - 저장 작품 수 (지난 달 saved_items)
 *   - 즐겨본 장르 1개 (saved_items.metadata 기준 — 장르 정보 없을 시 생략)
 *
 * 페이로드 예시 (notification-triggers-detail.md §4.4):
 *   { title: "4월 리포트", body: "12편 시청 · 즐겨본 장르: 드라마" }
 *
 * P0-5 TODO:
 *   - 장르 집계 정확도 향상 (metadata.genres 보강 — 현재 saved_items 에 genres 컬럼 없음)
 *   - 총 시청 분 계산 (runtime 합산)
 *   - PostHog notification_sent 이벤트 분리 (현재는 notification_log 만 기록)
 *
 * vercel.json: "0 0 1 * *"
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

interface ReportStats {
  profileId: string;
  watchedCount: number;
  savedCount: number;
  topGenre: string | null;
  monthLabel: string; // "4월"
  yearMonth: string; // "2026-04"
}

/** 지난 달 1일 00:00 KST (= 지난 달 1일 -09:00 시 UTC) ~ 이번 달 1일 00:00 KST 의 UTC 범위 */
function getLastMonthRangeUtc(now = new Date()): {
  startIso: string;
  endIso: string;
  monthLabel: string;
  yearMonth: string;
} {
  // KST 기준 이번 달 1일 = UTC 기준 전날 15:00
  // 단순화: UTC 월의 1일 기준으로 집계 (cron 이 매월 1일 00:00 UTC 에 돌므로 동일)
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed — 이번 달
  // 지난 달의 1일 00:00 UTC
  const startUtc = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const endUtc = new Date(Date.UTC(y, m, 1, 0, 0, 0));

  const lastMonth = startUtc.getUTCMonth() + 1; // 1-12
  const lastYear = startUtc.getUTCFullYear();
  return {
    startIso: startUtc.toISOString(),
    endIso: endUtc.toISOString(),
    monthLabel: `${lastMonth}월`,
    yearMonth: `${lastYear}-${String(lastMonth).padStart(2, "0")}`,
  };
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

  const admin = supabaseAdmin();
  const range = getLastMonthRangeUtc();

  // 1. monthlyReport=true 사용자 조회
  //    JSONB ->> 는 텍스트 비교 — 'true' 문자열로 매칭
  const { data: profiles, error: profilesErr } = await admin
    .from("profiles")
    .select("id, account_prefs")
    .eq("account_prefs->notificationPrefs->>monthlyReport", "true");

  if (profilesErr) {
    console.error(
      "[cron/monthly-report] profiles query failed:",
      profilesErr.message,
    );
    return NextResponse.json(
      { error: "query-failed", code: profilesErr.code },
      { status: 500 },
    );
  }

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, failed: 0, skipped: 0 });
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const reasons: Record<string, number> = {};

  for (const p of profiles) {
    const profileId = p.id as string;

    // 2. 사용자별 집계
    const stats = await aggregateForProfile(profileId, range);
    if (!stats) {
      skipped++;
      reasons["aggregate-failed"] = (reasons["aggregate-failed"] ?? 0) + 1;
      continue;
    }

    // 활동 0 인 경우 — 알림 의미 없음, skip
    if (stats.watchedCount === 0 && stats.savedCount === 0) {
      skipped++;
      reasons["no-activity"] = (reasons["no-activity"] ?? 0) + 1;
      continue;
    }

    // 3. 페이로드 구성
    const bodyParts: string[] = [];
    if (stats.watchedCount > 0) bodyParts.push(`${stats.watchedCount}편 시청`);
    if (stats.savedCount > 0) bodyParts.push(`${stats.savedCount}편 저장`);
    if (stats.topGenre) bodyParts.push(`즐겨본 장르: ${stats.topGenre}`);

    const trackingId = generateTrackingId();
    // url 의 query 부착(?via=push&trackingId=...)은 sendPush 내부에서 처리.
    const payload: NotificationPayload = {
      type: "monthly_report",
      title: `${stats.monthLabel} 리포트`,
      body: bodyParts.join(" · "),
      url: `/profile/report/${stats.yearMonth}`,
      trackingId,
    };

    // 4. 발송
    const result = await sendPush(profileId, payload);
    if (result.delivered) {
      sent++;
    } else {
      const reasonKey = result.reason ?? "unknown";
      reasons[reasonKey] = (reasons[reasonKey] ?? 0) + 1;
      // cooldown / no-subscription / type-toggle-off 는 정상 skip
      if (reasonKey === "cooldown" || reasonKey === "no-subscription" || reasonKey === "type-toggle-off") {
        skipped++;
      } else {
        failed++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    range: { startIso: range.startIso, endIso: range.endIso },
    candidates: profiles.length,
    sent,
    failed,
    skipped,
    reasons,
  });
}

async function aggregateForProfile(
  profileId: string,
  range: { startIso: string; endIso: string; monthLabel: string; yearMonth: string },
): Promise<ReportStats | null> {
  const admin = supabaseAdmin();

  // a. watch_reports — count
  const { count: watchedCount, error: wErr } = await admin
    .from("watch_reports")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .gte("reported_at", range.startIso)
    .lt("reported_at", range.endIso);

  if (wErr) {
    console.error("[cron/monthly-report] watch_reports failed:", wErr.message);
    return null;
  }

  // b. saved_items — count + metadata 수집 (장르용)
  const { data: saved, error: sErr } = await admin
    .from("saved_items")
    .select("metadata, type")
    .eq("profile_id", profileId)
    .gte("saved_at", range.startIso)
    .lt("saved_at", range.endIso);

  if (sErr) {
    console.error("[cron/monthly-report] saved_items failed:", sErr.message);
    return null;
  }

  const savedCount = saved?.length ?? 0;

  // c. 장르 top 1 — saved_items.metadata 에 genres 가 있을 경우만 (현재 metadata 스키마에는 없음)
  //    PoC: country 정보가 있다면 보조 시그널로 사용 (없으면 null)
  const topGenre = pickTopGenre(saved ?? []);

  return {
    profileId,
    watchedCount: watchedCount ?? 0,
    savedCount,
    topGenre,
    monthLabel: range.monthLabel,
    yearMonth: range.yearMonth,
  };
}

/**
 * saved_items.metadata 에서 장르 추출.
 *
 * 현재 sync.ts 가 metadata 에 director/cast/runtime/seasons/country/overview/backdrop 만 저장.
 * genres 는 schema 에 없으므로 항상 null 반환 — 후속 P0-5 에서 metadata 확장 예정.
 *
 * 임시 fallback: type=movie 가 많으면 "영화", tv 가 많으면 "드라마" — 장르 아님, 일종의 카테고리.
 */
function pickTopGenre(saved: Array<{ metadata: unknown; type: string }>): string | null {
  if (saved.length === 0) return null;

  // 향후 metadata.genres 가 추가되면 이 로직 교체.
  // 현재는 movie/tv 카테고리 카운트만.
  let movie = 0;
  let tv = 0;
  for (const s of saved) {
    if (s.type === "movie") movie++;
    else if (s.type === "tv") tv++;
  }

  if (movie === 0 && tv === 0) return null;
  return movie >= tv ? "영화" : "드라마";
}
