/**
 * GET /api/cron/tmdb-providers-snapshot
 *
 * 매일 18:00 UTC (= 03:00 KST) — 전체 saved_items 의 TMDB watch/providers 스냅샷.
 * 7일치만 보관 (오래된 row 제거). 어제 vs 오늘 비교는 ott-expiry cron 에서 수행.
 *
 * P0-4: 골격 (인증 + flag 가드 + JSON 응답).
 * P0-5 TODO: spec _workspace/onboarding-v2-spec.md §3 / notification-triggers-detail.md §3.2 구현.
 *   1. 활성 사용자 saved_items 의 (tmdb_id, type) 모음
 *   2. 각 작품마다 TMDB watch/providers 호출 (KR region)
 *   3. tmdb_provider_snapshots upsert (work_id + media_type + snapshot_date)
 *   4. 7일 이전 row 삭제 (snapshot_date < CURRENT_DATE - 7)
 *
 * vercel.json: "0 18 * * *"
 */

import { NextResponse } from "next/server";
import { isNotificationsEnabled } from "@/lib/env";
import { isAuthorizedCron } from "@/lib/notifications/cron-auth";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isNotificationsEnabled()) {
    return NextResponse.json({ ok: true, disabled: true, processed: 0 });
  }

  // TODO(P0-5): provider snapshot 비즈니스 로직
  return NextResponse.json({
    ok: true,
    processed: 0,
    note: "skeleton — implement in P0-5",
  });
}
