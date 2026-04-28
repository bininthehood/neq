/**
 * TMDB Bulk Crawl — 큐에서 작품 메타데이터를 채워 tmdb_metadata에 upsert.
 *
 * 스펙: _workspace/tmdb-mirror-spec.md 섹션 4, 5.2
 * 결정: _workspace/open-questions-decision.md (GitHub Actions 1시간 간격, 배치 2000건)
 *
 * 실행:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TMDB_API_KEY=... npx tsx scripts/tmdb-bulk-crawl.ts
 *
 * 처리 흐름:
 *   1. tmdb_crawl_queue에서 (priority DESC, failed_count ASC, attempted_at NULLS FIRST) 순 N건 select
 *   2. 각 (id, media_type)에 대해 TMDB detail + credits + providers 병렬 호출
 *   3. Rate limit: 30 req/s (TMDB 한도 40 req/s 대비 여유)
 *   4. tmdb_metadata upsert (providers_fetched_at = NOW)
 *   5. 성공 → 큐에서 삭제. 실패 → failed_count++, error_last 갱신
 *   6. failed_count >= MAX_FAILURES(5) 이면 큐에서 삭제 (dead letter는 향후)
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
const BATCH_SIZE = Number(process.env.TMDB_BULK_BATCH ?? "2000");
const RATE_LIMIT_RPS = Number(process.env.TMDB_RATE_LIMIT_RPS ?? "30");
const MAX_FAILURES = 5;

if (!SUPABASE_URL || !SERVICE_KEY || !TMDB_API_KEY) {
  console.error(
    "[tmdb-bulk-crawl] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / TMDB_API_KEY 누락",
  );
  process.exit(1);
}

type QueueRow = {
  tmdb_id: number;
  media_type: MediaType;
  failed_count: number;
};

async function main(): Promise<void> {
  const startedAt = new Date();
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(
    `[tmdb-bulk-crawl] 시작 ${startedAt.toISOString()} batch=${BATCH_SIZE} rps=${RATE_LIMIT_RPS}`,
  );

  const queueRows = await pullQueue(admin, BATCH_SIZE);
  console.log(`[tmdb-bulk-crawl] 큐에서 ${queueRows.length}건 pull`);
  if (queueRows.length === 0) {
    console.log("[tmdb-bulk-crawl] 처리할 항목 없음, 종료");
    return;
  }

  const limiter = new RateLimiter(RATE_LIMIT_RPS);
  const metadataBatch: MetadataRow[] = [];
  const successIds: Array<[number, MediaType]> = [];
  const failures: Array<{ row: QueueRow; error: string }> = [];

  const now = new Date().toISOString();
  const CONCURRENCY = 10;

  for (let i = 0; i < queueRows.length; i += CONCURRENCY) {
    const chunk = queueRows.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (row) => {
        try {
          const metadata = await fetchMetadata(row, limiter, TMDB_API_KEY!, now);
          return { row, metadata, error: null as string | null };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { row, metadata: null, error: msg };
        }
      }),
    );

    for (const r of results) {
      if (r.metadata) {
        metadataBatch.push(r.metadata);
        successIds.push([r.row.tmdb_id, r.row.media_type]);
      } else {
        failures.push({ row: r.row, error: r.error ?? "unknown" });
      }
    }

    if (metadataBatch.length >= 500) {
      await flushMetadata(admin, metadataBatch.splice(0));
    }
    if ((i / CONCURRENCY) % 20 === 0) {
      console.log(
        `[tmdb-bulk-crawl] 진행 ${i + chunk.length}/${queueRows.length} (성공 ${successIds.length}, 실패 ${failures.length})`,
      );
    }
  }

  if (metadataBatch.length > 0) {
    await flushMetadata(admin, metadataBatch);
  }

  await clearQueueSuccess(admin, successIds);
  await markQueueFailures(admin, failures);

  const durationMs = Date.now() - startedAt.getTime();
  console.log(
    `[tmdb-bulk-crawl] 완료 duration=${durationMs}ms 성공=${successIds.length} 실패=${failures.length}`,
  );
}

async function pullQueue(
  admin: SupabaseClient,
  limit: number,
): Promise<QueueRow[]> {
  // Supabase PostgREST 기본 max-rows 1000 회피: range로 페이징
  const PAGE = 1000;
  const rows: QueueRow[] = [];
  let offset = 0;
  while (offset < limit) {
    const end = Math.min(offset + PAGE, limit) - 1;
    const { data, error } = await admin
      .from("tmdb_crawl_queue")
      .select("tmdb_id, media_type, failed_count")
      .lt("failed_count", MAX_FAILURES)
      .order("priority", { ascending: false })
      .order("failed_count", { ascending: true })
      .order("attempted_at", { ascending: true, nullsFirst: true })
      .range(offset, end);
    if (error) throw new Error(`큐 pull 실패: ${error.message}`);
    const page = (data ?? []) as QueueRow[];
    if (page.length === 0) break;
    rows.push(...page);
    if (page.length < end - offset + 1) break;
    offset += PAGE;
  }
  return rows;
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
    console.error(`[tmdb-bulk-crawl] metadata upsert 실패:`, error.message);
    throw error;
  }
}

async function clearQueueSuccess(
  admin: SupabaseClient,
  ids: Array<[number, MediaType]>,
): Promise<void> {
  if (ids.length === 0) return;
  // (tmdb_id, media_type) 튜플 삭제를 위해 media_type별로 분리
  for (const mediaType of ["movie", "tv"] as const) {
    const typeIds = ids.filter(([, t]) => t === mediaType).map(([id]) => id);
    if (typeIds.length === 0) continue;
    const { error } = await admin
      .from("tmdb_crawl_queue")
      .delete()
      .eq("media_type", mediaType)
      .in("tmdb_id", typeIds);
    if (error) {
      console.error(`[tmdb-bulk-crawl] 큐 삭제 실패 (${mediaType}):`, error.message);
    }
  }
}

async function markQueueFailures(
  admin: SupabaseClient,
  failures: Array<{ row: QueueRow; error: string }>,
): Promise<void> {
  if (failures.length === 0) return;
  const now = new Date().toISOString();
  for (const { row, error } of failures) {
    const newCount = row.failed_count + 1;
    if (newCount >= MAX_FAILURES) {
      // 영구 실패 → 큐에서 삭제 (로그만)
      await admin
        .from("tmdb_crawl_queue")
        .delete()
        .eq("tmdb_id", row.tmdb_id)
        .eq("media_type", row.media_type);
      console.warn(
        `[tmdb-bulk-crawl] 영구 실패 제거: ${row.media_type}/${row.tmdb_id} (${error})`,
      );
    } else {
      await admin
        .from("tmdb_crawl_queue")
        .update({
          failed_count: newCount,
          attempted_at: now,
          error_last: error.slice(0, 500),
        })
        .eq("tmdb_id", row.tmdb_id)
        .eq("media_type", row.media_type);
    }
  }
}


main().catch((err) => {
  console.error("[tmdb-bulk-crawl] 치명적 오류:", err);
  process.exit(1);
});
