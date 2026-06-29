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
 *   3. OpenAI models.list() — SDK TLS handshake warm
 *   4. match_tmdb_by_embedding RPC (match_count=1) — pgvector HNSW 인덱스/embedding
 *      페이지 hot 유지 (candidates 단계 cold 꼬리 방지)
 *   5. 200 + timings 반환 (모니터링용)
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

  // retrieval RPC (pgvector HNSW) warm — /api/recommend candidates 단계와 동일 경로.
  // 위 db ping(select limit 1)은 connection 만 데우고 HNSW 인덱스·embedding 페이지는
  // 안 데움 → cold 시 candidates ~1786ms (warm ~220ms) 꼬리. match_count=1 + 상수벡터로
  // 인덱스/페이지만 hot 유지(결과 무의미, 비용 최소). 실패는 응답 무영향 (best-effort).
  // ponytail: 1536 = OpenAI 임베딩 차원 하드코딩 — 모델 바뀌면 buildTasteVector 와 함께 갱신.
  let retrievalOk = false;
  let retrievalError: string | null = null;
  try {
    const tRet = Date.now();
    const admin = supabaseAdmin();
    const { error } = await admin.rpc("match_tmdb_by_embedding", {
      query_embedding: new Array(1536).fill(1), // 유효 방향벡터 (cosine 정의), 값 무의미
      match_count: 1,
      p_media_type: null,
      p_genre_ids: null,
      p_date_gte: null,
      p_date_lte: null,
      p_origin: null,
      p_exclude_ids: null,
    });
    mark("retrieval_ms", tRet);
    if (error) {
      retrievalError = error.message;
      console.error("[warmup] retrieval rpc failed:", error.message);
    } else {
      retrievalOk = true;
    }
  } catch (err) {
    retrievalError = err instanceof Error ? err.message : String(err);
    console.error("[warmup] retrieval rpc threw:", retrievalError);
  }

  const total_ms = Date.now() - startedAt;

  // PostHog 측정 — cold start 빈도 + warmup 효과 추적용.
  // warmup_ping event 의 db_ms 가 500ms+ 면 connection 새로 만든 cold instance.
  // openai_ms 가 500ms+ 면 OpenAI SDK cold (TLS handshake / Edge cold).
  // retrieval_ms 가 1000ms+ 면 HNSW/embedding 페이지 cold (candidates 꼬리 유발).
  await trackWarmup({
    ok: dbOk,
    db_ms: timings.db_ms ?? null,
    total_ms,
    db_error: dbError,
    openai_ok: openaiOk,
    openai_ms: timings.openai_ms ?? null,
    openai_error: openaiError,
    retrieval_ok: retrievalOk,
    retrieval_ms: timings.retrieval_ms ?? null,
    retrieval_error: retrievalError,
  });

  return NextResponse.json({
    ok: dbOk,
    openai_ok: openaiOk,
    retrieval_ok: retrievalOk,
    timings,
    total_ms,
  });
}
