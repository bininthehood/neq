/**
 * GET /api/cron/notifications/ott-expiry
 *
 * 매일 02:00 UTC (= 11:00 KST) — saved 작품 OTT 만료 proxy 알림.
 * tmdb-providers-snapshot 의 어제/오늘 비교로 사라진 provider 검출.
 *
 * P0-4: 골격.
 * P0-5 TODO: spec notification-triggers-detail.md §3.3 구현.
 *   1. 활성 사용자의 ottExpiry=true 조회
 *   2. 사용자별 saved_items 의 (work_id, media_type) 추출
 *   3. tmdb_provider_snapshots 어제 vs 오늘 비교
 *      - 어제 flatrate 에 있던 provider 가 오늘 빠졌으면 = 후보
 *   4. 사용자 subscribedOtt 와 매칭되는 케이스만 발송 (예: 넷플릭스 구독자에게 넷플릭스 빠진 것만)
 *   5. payload 구성 (약한 톤: "곧 내려갈 수 있어요") + sendPush('ott_expiry', ...)
 *
 * vercel.json: "0 2 * * *"
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

  // TODO(P0-5): provider diff + 발송
  return NextResponse.json({
    ok: true,
    sent: 0,
    skipped: 0,
    note: "skeleton — implement in P0-5",
  });
}
