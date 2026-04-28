/**
 * GET /api/cron/notifications/refresh-persons
 *
 * 매주 토요일 17:00 UTC (= 일요일 02:00 KST) — favorites/saved_items 에서 감독·배우 추출.
 * 이후 new-release cron 이 이 person 의 신작을 매일 체크.
 *
 * P0-4: 골격.
 * P0-5 TODO: spec _workspace/onboarding-v2-spec.md §3 / notification-triggers-detail.md §6 구현.
 *   1. 활성 사용자 (지난 30일 활동) 조회
 *   2. 각 사용자의 favorites + saved_items 작품 ID 모음
 *   3. TMDB credits 호출 (movie/{id}/credits, tv/{id}/credits)
 *   4. 감독 (job=Director) + 주연 배우 top 3 추출
 *   5. notification_followed_persons upsert (profile_id, person_id, role)
 *
 * vercel.json: "0 17 * * 6"
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

  // TODO(P0-5): person id 추출 + upsert
  return NextResponse.json({
    ok: true,
    processed: 0,
    note: "skeleton — implement in P0-5",
  });
}
