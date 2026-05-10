/**
 * GET /api/warmup
 *
 * Vercel function instance + Supabase admin client connection 을 warm 유지.
 *
 * 배경 (2026-05-10 측정):
 * - cold /api/recommend 호출 시 enrich 3164ms (Supabase 첫 connection 비용 포함)
 * - warm 호출 시 enrich 607ms — 80% 단축
 * - Vercel function idle timeout (~5분) 후 cold 재발
 *
 * 동작:
 *   1. CRON_SECRET 검증 (다른 cron route 패턴과 동일)
 *   2. supabaseAdmin().from("tmdb_metadata").select("tmdb_id").limit(1)
 *      — connection pool 살리기 + mirror 테이블 query path 검증
 *   3. 200 + timings 반환 (모니터링용)
 *
 * 운영: GitHub Actions `.github/workflows/api-warmup.yml` (5분 cron)
 */

import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/notifications/cron-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const timings: Record<string, number> = {};
  const mark = (key: string, t0: number) => {
    timings[key] = Date.now() - t0;
  };

  // Supabase admin client 초기화 + lightweight query.
  // - mirror 경로 (/api/recommend enrich 단계) 와 동일 supabaseAdmin 인스턴스 활용
  // - tmdb_metadata limit 1 — index hit 로 ms 단위 응답
  let dbOk = false;
  try {
    const tDb = Date.now();
    const admin = supabaseAdmin();
    const { error } = await admin
      .from("tmdb_metadata")
      .select("tmdb_id")
      .limit(1);
    mark("db_ms", tDb);
    if (error) {
      console.error("[warmup] db ping failed:", error.message);
    } else {
      dbOk = true;
    }
  } catch (err) {
    console.error("[warmup] supabaseAdmin init failed:", err);
  }

  return NextResponse.json({
    ok: dbOk,
    timings,
    total_ms: Date.now() - startedAt,
  });
}
