/**
 * GET /api/cron/notifications/weekly-rec
 *
 * 매주 토요일 00:00 UTC (= 토요일 09:00 KST) — 주간 추천 알림.
 *
 * P0-4: 골격.
 * P0-5 TODO: spec notification-triggers-detail.md §1 구현.
 *   1. 활성 사용자의 weeklyRec=true 조회
 *   2. 각 사용자별 추천 1~3개 미리 생성 (recommend.ts 재사용 또는 캐싱)
 *      → 비용 큰 케이스 — saved_items + favorites 기반 가벼운 매칭으로 시작
 *   3. payload 구성 ("이번 주 추천 N편") + sendPush('rec_weekly', ...)
 *      - cooldown 7일은 sendPush 가 자동 처리
 *
 * vercel.json: "0 0 * * 6"
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

  // TODO(P0-5): 주간 추천 생성 + 발송
  return NextResponse.json({
    ok: true,
    sent: 0,
    skipped: 0,
    note: "skeleton — implement in P0-5",
  });
}
