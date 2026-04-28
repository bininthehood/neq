/**
 * GET /api/cron/notifications/new-release
 *
 * 매일 01:00 UTC (= 10:00 KST) — 추적 중인 person 의 신작 알림.
 * 4가지 트리거 통합:
 *   - 감독 신작
 *   - 배우 출연작
 *   - 시리즈 시즌2/속편
 *   - 비슷한 작품 (similar - 보수적)
 *
 * P0-4: 골격.
 * P0-5 TODO: spec notification-triggers-detail.md §2 구현.
 *   1. notification_followed_persons 의 person_id 모음
 *   2. 각 person 의 movie_credits + tv_credits 호출
 *   3. last_known_release 보다 새로운 작품 검출 (release_date > last_known_release)
 *   4. cooldown 체크 (24h, 동일 작품 1건) — sendPush 가 처리
 *   5. payload 구성 + sendPush('new_release', ...)
 *
 * vercel.json: "0 1 * * *"
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

  // TODO(P0-5): 신작 검출 + 발송
  return NextResponse.json({
    ok: true,
    sent: 0,
    skipped: 0,
    note: "skeleton — implement in P0-5",
  });
}
