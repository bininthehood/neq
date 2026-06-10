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
import OpenAI from "openai";
import { isAuthorizedCron } from "@/lib/notifications/cron-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

// 2026-05-22 — PostHog capture REST 직접 호출 (posthog-node 의존 추가 회피).
// warmup ping 의 실제 실행 빈도 + db ping 성공률을 PostHog 에서 추적.
async function trackWarmup(props: Record<string, unknown>): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
  if (!key) return;
  try {
    await fetch(`${host.replace(/\/$/, "")}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event: "warmup_ping",
        distinct_id: "warmup-cron",
        properties: { ...props, source: "api/warmup" },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // capture 실패는 warmup 응답에 영향 주지 않음
  }
}

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
  let dbError: string | null = null;
  try {
    const tDb = Date.now();
    const admin = supabaseAdmin();
    const { error } = await admin
      .from("tmdb_metadata")
      .select("tmdb_id")
      .limit(1);
    mark("db_ms", tDb);
    if (error) {
      dbError = error.message;
      console.error("[warmup] db ping failed:", error.message);
    } else {
      dbOk = true;
    }
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
    console.error("[warmup] supabaseAdmin init failed:", err);
  }

  // OpenAI client TLS handshake + edge connection warm.
  // models.list() 는 단순 GET, quota / token 소비 없음.
  // 실패는 warmup 응답에 영향 주지 않음 (best-effort).
  let openaiOk = false;
  let openaiError: string | null = null;
  try {
    const tOpenai = Date.now();
    const openai = new OpenAI();
    await openai.models.list();
    mark("openai_ms", tOpenai);
    openaiOk = true;
  } catch (err) {
    openaiError = err instanceof Error ? err.message : String(err);
    console.error("[warmup] openai ping failed:", openaiError);
  }

  const total_ms = Date.now() - startedAt;

  // PostHog 측정 — cold start 빈도 + warmup 효과 추적용.
  // warmup_ping event 의 db_ms 가 500ms+ 면 connection 새로 만든 cold instance.
  // openai_ms 가 500ms+ 면 OpenAI SDK cold (TLS handshake / Edge cold).
  await trackWarmup({
    ok: dbOk,
    db_ms: timings.db_ms ?? null,
    total_ms,
    db_error: dbError,
    openai_ok: openaiOk,
    openai_ms: timings.openai_ms ?? null,
    openai_error: openaiError,
  });

  return NextResponse.json({
    ok: dbOk,
    openai_ok: openaiOk,
    timings,
    total_ms,
  });
}
