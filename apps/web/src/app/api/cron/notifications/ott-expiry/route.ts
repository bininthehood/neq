/**
 * GET /api/cron/notifications/ott-expiry
 *
 * 매일 02:00 UTC (= 11:00 KST) — saved 작품 OTT 만료 proxy 알림.
 * tmdb-providers-snapshot 의 어제/오늘 비교로 사라진 provider 검출.
 *
 * P0-5b 풀구현 (Day 23).
 *
 * 시퀀스 (notification-triggers-detail.md §3.3):
 *   1. profiles where account_prefs.notificationPrefs.ottExpiry=true
 *   2. 사용자별 saved_items 의 (work_id, media_type) 추출
 *   3. tmdb_provider_snapshots 어제/오늘 flatrate 비교 (어제 데이터 없으면 skip)
 *   4. 사용자 subscribedOtt 와 매칭되는 provider 만 후보
 *   5. 후보 1~3개 통합 1건 알림 + sendPush('ott_expiry', ...)
 *
 *  cooldown: ott_expiry 7d (sendPush 가 자동 처리)
 *
 * vercel.json: "0 2 * * *"
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
import {
  buildExpiryPayloadText,
  diffFlatrate,
  intersectWithSubscribed,
  type ExpiringProviderHit,
} from "@/lib/notifications/ott-expiry-helpers";
import type {
  CompactProviders,
  MediaType,
} from "@/lib/notifications/providers-helpers";
import type { AccountPrefs } from "@/lib/types";

interface ProfileRow {
  id: string;
  account_prefs: AccountPrefs | null;
}

interface SnapshotRow {
  work_id: number;
  media_type: MediaType;
  snapshot_date: string;
  providers: CompactProviders;
}

const PAGE_SIZE = 1000;

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
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  // STEP 1 — ottExpiry=true 사용자
  const { data: profiles, error: profilesErr } = await admin
    .from("profiles")
    .select("id, account_prefs")
    .eq("account_prefs->notificationPrefs->>ottExpiry", "true");

  if (profilesErr) {
    console.error(
      "[cron/ott-expiry] profiles query failed:",
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
      yesterday,
      today,
      duration_ms: Date.now() - startedAt,
    });
  }

  // STEP 2 — 어제/오늘 snapshot 일괄 로드 (사용자 단위 반복 호출 회피)
  let snapshotsYesterday: SnapshotRow[];
  let snapshotsToday: SnapshotRow[];
  try {
    [snapshotsYesterday, snapshotsToday] = await Promise.all([
      fetchSnapshotsByDate(admin, yesterday),
      fetchSnapshotsByDate(admin, today),
    ]);
  } catch (err) {
    console.error("[cron/ott-expiry] snapshot load failed:", err);
    return NextResponse.json(
      { error: "snapshot-load-failed", detail: String(err) },
      { status: 500 },
    );
  }

  // 어제 데이터가 전혀 없으면 비교 불가 → 0 발송 응답 (snapshot 누적 7일 이전 정상 케이스)
  if (snapshotsYesterday.length === 0) {
    return NextResponse.json({
      ok: true,
      candidates: candidates.length,
      sent: 0,
      failed: 0,
      skipped: candidates.length,
      reasons: { "no-yesterday-snapshot": candidates.length },
      yesterday,
      today,
      note: "snapshot 누적 1일 미만 — 비교 불가",
      duration_ms: Date.now() - startedAt,
    });
  }

  const yMap = indexSnapshots(snapshotsYesterday);
  const tMap = indexSnapshots(snapshotsToday);

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const reasons: Record<string, number> = {};

  // STEP 3 — 사용자별 처리
  for (const p of candidates) {
    try {
      const subscribed = p.account_prefs?.subscribedOtt ?? [];

      // a. saved_items + title 로딩 (알림 본문에 작품명 필요)
      const saved = await loadSavedItems(admin, p.id);
      if (saved.length === 0) {
        skipped += 1;
        reasons["no-saved"] = (reasons["no-saved"] ?? 0) + 1;
        continue;
      }

      // b. work 단위 diff
      const hits: Array<ExpiringProviderHit & { title: string }> = [];
      for (const s of saved) {
        const key = workKey(s.tmdbId, s.mediaType);
        const yProv = yMap.get(key) ?? null;
        const tProv = tMap.get(key) ?? null;
        const gone = diffFlatrate(yProv, tProv);
        if (gone.length === 0) continue;
        hits.push({
          workId: s.tmdbId,
          mediaType: s.mediaType,
          goneProviderIds: gone,
          title: s.title,
        });
      }

      if (hits.length === 0) {
        skipped += 1;
        reasons["no-diff"] = (reasons["no-diff"] ?? 0) + 1;
        continue;
      }

      // c. subscribedOtt 교차 매칭
      const matched = intersectWithSubscribed(hits, subscribed);
      if (matched.length === 0) {
        skipped += 1;
        reasons["no-subscribed-match"] = (reasons["no-subscribed-match"] ?? 0) + 1;
        continue;
      }

      // hits 와 title 매핑 보존 (intersectWithSubscribed 가 ExpiringProviderHit 만 반환)
      const enrichedHits = matched
        .slice(0, 3)
        .map((m) => {
          const orig = hits.find(
            (h) => h.workId === m.workId && h.mediaType === m.mediaType,
          );
          return {
            ...m,
            title: orig?.title ?? "",
          };
        });

      // d. payload 구성
      const text = buildExpiryPayloadText(enrichedHits);
      const trackingId = generateTrackingId();
      const payload: NotificationPayload = {
        type: "ott_expiry",
        title: text.title,
        body: text.body,
        url: "/saved?filter=expiring",
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
      console.error("[cron/ott-expiry] profile error:", p.id, err);
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
    yesterday,
    today,
    duration_ms: Date.now() - startedAt,
  });
}

// ─────────────────────────────────────────────────────────────────
// helpers (내부 — DB I/O / index)
// ─────────────────────────────────────────────────────────────────

function workKey(tmdbId: number, mediaType: MediaType): string {
  return `${tmdbId}|${mediaType}`;
}

function indexSnapshots(rows: SnapshotRow[]): Map<string, CompactProviders> {
  const m = new Map<string, CompactProviders>();
  for (const r of rows) {
    if (!r.providers) continue;
    m.set(workKey(r.work_id, r.media_type), r.providers);
  }
  return m;
}

async function fetchSnapshotsByDate(
  admin: ReturnType<typeof supabaseAdmin>,
  date: string,
): Promise<SnapshotRow[]> {
  const out: SnapshotRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("tmdb_provider_snapshots")
      .select("work_id, media_type, snapshot_date, providers")
      .eq("snapshot_date", date)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      const wid = row.work_id as number;
      const mt = row.media_type as MediaType;
      const provs = row.providers as CompactProviders | null;
      if (typeof wid !== "number" || (mt !== "movie" && mt !== "tv")) continue;
      if (!provs) continue;
      out.push({
        work_id: wid,
        media_type: mt,
        snapshot_date: row.snapshot_date as string,
        providers: provs,
      });
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

async function loadSavedItems(
  admin: ReturnType<typeof supabaseAdmin>,
  profileId: string,
): Promise<Array<{ tmdbId: number; mediaType: MediaType; title: string }>> {
  const { data } = await admin
    .from("saved_items")
    .select("tmdb_id, type, title")
    .eq("profile_id", profileId);
  if (!data) return [];
  const out: Array<{ tmdbId: number; mediaType: MediaType; title: string }> = [];
  for (const row of data) {
    const tmdbId = row.tmdb_id as number;
    const type = row.type as MediaType;
    if (typeof tmdbId !== "number" || (type !== "movie" && type !== "tv")) {
      continue;
    }
    out.push({
      tmdbId,
      mediaType: type,
      title: typeof row.title === "string" ? row.title : "",
    });
  }
  return out;
}
