/**
 * TMDB Initial Crawl — popularity 상위 N개 1회성 bulk metadata 채움.
 *
 * 스펙: _workspace/tmdb-mirror-spec.md 섹션 5.1
 * 결정: _workspace/open-questions-decision.md (GitHub Actions workflow_dispatch, 132분 예상)
 *
 * 실행:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TMDB_API_KEY=... \
 *   MOVIE_LIMIT=50000 TV_LIMIT=30000 \
 *   npx tsx scripts/tmdb-initial-crawl.ts
 *
 * 처리 흐름:
 *   1. tmdb_catalog에서 popularity 상위 MOVIE_LIMIT개 movie + TV_LIMIT개 tv select
 *   2. 이미 tmdb_metadata에 있는 것 제외 (idempotent: 중단 시 재실행 안전)
 *   3. TMDB detail + credits + providers 병렬 호출 (30 req/s)
 *   4. tmdb_metadata upsert (배치 500건)
 *   5. 진행 상황은 10분마다 stdout에 로그 (Actions logs에 누적)
 *
 * 예상 소요: 80,000 × 3 req ÷ 30 req/s ≈ 2.2시간
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  RateLimiter,
  fetchMetadata,
  type MediaType,
  type MetadataRow,
} from "./lib/tmdb-fetch";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const MOVIE_LIMIT = Number(process.env.MOVIE_LIMIT ?? "50000");
const TV_LIMIT = Number(process.env.TV_LIMIT ?? "30000");
const RATE_LIMIT_RPS = Number(process.env.TMDB_RATE_LIMIT_RPS ?? "30");

if (!SUPABASE_URL || !SERVICE_KEY || !TMDB_API_KEY) {
  console.error(
    "[tmdb-initial-crawl] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / TMDB_API_KEY 누락",
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(
    `[tmdb-initial-crawl] 시작 ${startedAt.toISOString()} movie=${MOVIE_LIMIT} tv=${TV_LIMIT} rps=${RATE_LIMIT_RPS}`,
  );

  const movieIds = await pickTopFromCatalog(admin, "movie", MOVIE_LIMIT);
  const tvIds = await pickTopFromCatalog(admin, "tv", TV_LIMIT);
  const targets: Array<{ tmdb_id: number; media_type: MediaType }> = [
    ...movieIds.map((id) => ({ tmdb_id: id, media_type: "movie" as const })),
    ...tvIds.map((id) => ({ tmdb_id: id, media_type: "tv" as const })),
  ];

  console.log(
    `[tmdb-initial-crawl] 선정 ${targets.length}건 (movie ${movieIds.length} + tv ${tvIds.length})`,
  );

  // 이미 metadata에 있는 것 제외 (idempotent)
  const pending = await filterNotInMetadata(admin, targets);
  console.log(
    `[tmdb-initial-crawl] 이미 채워진 ${targets.length - pending.length}건 제외, 처리 대상 ${pending.length}건`,
  );

  const limiter = new RateLimiter(RATE_LIMIT_RPS);
  const CONCURRENCY = 10;
  let success = 0;
  let failed = 0;
  let metadataBatch: MetadataRow[] = [];
  let lastLogAt = Date.now();

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const chunk = pending.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (row) => {
        const now = new Date().toISOString();
        try {
          return await fetchMetadata(row, limiter, TMDB_API_KEY!, now);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            `[tmdb-initial-crawl] 실패 ${row.media_type}/${row.tmdb_id}: ${msg}`,
          );
          return null;
        }
      }),
    );

    for (const r of results) {
      if (r) {
        metadataBatch.push(r);
        success += 1;
      } else {
        failed += 1;
      }
    }

    if (metadataBatch.length >= 500) {
      await flushMetadata(admin, metadataBatch);
      metadataBatch = [];
    }

    // 10분마다 진행률 로그
    const nowMs = Date.now();
    if (nowMs - lastLogAt >= 10 * 60 * 1000) {
      const pctDone = ((i + chunk.length) / pending.length) * 100;
      const elapsedS = (nowMs - startedAt.getTime()) / 1000;
      const eta = Math.round((elapsedS / (i + chunk.length)) * (pending.length - i - chunk.length));
      console.log(
        `[tmdb-initial-crawl] 진행 ${(i + chunk.length).toLocaleString()}/${pending.length.toLocaleString()} (${pctDone.toFixed(1)}%) 성공=${success} 실패=${failed} ETA=${Math.round(eta / 60)}분`,
      );
      lastLogAt = nowMs;
    }
  }

  if (metadataBatch.length > 0) {
    await flushMetadata(admin, metadataBatch);
  }

  const durationMs = Date.now() - startedAt.getTime();
  console.log(
    `[tmdb-initial-crawl] 완료 duration=${Math.round(durationMs / 1000)}s 성공=${success} 실패=${failed}`,
  );
}

async function pickTopFromCatalog(
  admin: SupabaseClient,
  mediaType: MediaType,
  limit: number,
): Promise<number[]> {
  // Supabase PostgREST 기본 max-rows 1000 회피: range로 페이징
  const PAGE = 1000;
  const ids: number[] = [];
  let offset = 0;
  while (offset < limit) {
    const end = Math.min(offset + PAGE, limit) - 1;
    const { data, error } = await admin
      .from("tmdb_catalog")
      .select("tmdb_id")
      .eq("media_type", mediaType)
      .eq("deleted", false)
      .eq("adult", false)
      .order("popularity", { ascending: false })
      .range(offset, end);
    if (error) throw new Error(`catalog select 실패 (${mediaType}): ${error.message}`);
    const rows = data ?? [];
    if (rows.length === 0) break;
    ids.push(...rows.map((r) => r.tmdb_id as number));
    if (rows.length < end - offset + 1) break;
    offset += PAGE;
  }
  return ids;
}

async function filterNotInMetadata(
  admin: SupabaseClient,
  targets: Array<{ tmdb_id: number; media_type: MediaType }>,
): Promise<Array<{ tmdb_id: number; media_type: MediaType }>> {
  // .in()으로 큰 ID 배열 전달 시 PostgREST URL 길이 한도 초과로 fetch fail.
  // metadata 전체를 작은 페이지로 가져와 Set 구축 후 JS에서 diff.
  const PAGE = 1000;
  const existing = new Set<string>();

  for (const mediaType of ["movie", "tv"] as const) {
    let offset = 0;
    while (true) {
      const { data, error } = await admin
        .from("tmdb_metadata")
        .select("tmdb_id")
        .eq("media_type", mediaType)
        .order("tmdb_id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(`metadata 조회 실패: ${error.message}`);
      const rows = data ?? [];
      if (rows.length === 0) break;
      for (const r of rows) existing.add(`${mediaType}:${r.tmdb_id}`);
      if (rows.length < PAGE) break;
      offset += PAGE;
    }
  }

  return targets.filter((t) => !existing.has(`${t.media_type}:${t.tmdb_id}`));
}


async function flushMetadata(
  admin: SupabaseClient,
  batch: MetadataRow[],
): Promise<void> {
  if (batch.length === 0) return;
  const { error } = await admin.from("tmdb_metadata").upsert(batch, {
    onConflict: "tmdb_id,media_type",
  });
  if (error) {
    console.error(`[tmdb-initial-crawl] metadata upsert 실패:`, error.message);
    throw error;
  }
}


main().catch((err) => {
  console.error("[tmdb-initial-crawl] 치명적 오류:", err);
  process.exit(1);
});
