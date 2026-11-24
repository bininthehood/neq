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
import { checkDbGuard } from "./lib/db-guard";
import { resolveBatchTarget } from "./lib/batch-target";
import { queueKey, selectQueueForGuard, type CrawlQueueRow as QueueRow } from "./lib/crawl-queue";
import {
  TmdbNotFoundError,
  RateLimiter,
  fetchMetadata,
  type MediaType,
  type MetadataRow,
} from "./lib/tmdb-fetch";

// 2026-08-18 미러 분리 — tmdb_* 는 별도 Supabase 프로젝트.
// TMDB_BATCH_TARGET과 MIRROR_* 자격 정보를 명시해야 실행한다.
const { url: SUPABASE_URL, key: SERVICE_KEY } = resolveBatchTarget(process.env);
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BATCH_SIZE = Number(process.env.TMDB_BULK_BATCH ?? "2000");
const RATE_LIMIT_RPS = Number(process.env.TMDB_RATE_LIMIT_RPS ?? "30");
const MAX_FAILURES = 5;

if (!TMDB_API_KEY) {
  console.error(
    "[tmdb-bulk-crawl] TMDB_API_KEY 누락",
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(
    `[tmdb-bulk-crawl] 시작 ${startedAt.toISOString()} batch=${BATCH_SIZE} rps=${RATE_LIMIT_RPS}`,
  );

  const guard = await checkDbGuard(admin, "tmdb-bulk-crawl");
  console.log(`[tmdb-bulk-crawl] db-guard: ${guard.summary}`);
  if (guard.level === "halt") {
    console.warn("[tmdb-bulk-crawl] DB 크기 전면 중단선 초과 — 종료");
    return;
  }

  const pulledRows = await pullQueue(admin, BATCH_SIZE);
  const existing = await loadExistingQueueKeys(admin, pulledRows);
  const queueRows = selectQueueForGuard(pulledRows, existing, guard.level);
  if (queueRows.length !== pulledRows.length) {
    console.warn(`[tmdb-bulk-crawl] 신규 유입 ${pulledRows.length - queueRows.length}건 보류`);
  }
  console.log(`[tmdb-bulk-crawl] 큐에서 ${queueRows.length}건 pull`);
  if (queueRows.length === 0) {
    console.log("[tmdb-bulk-crawl] 처리할 항목 없음, 종료");
    return;
  }

  const limiter = new RateLimiter(RATE_LIMIT_RPS);
  const metadataBatch: MetadataRow[] = [];
  const successIds: Array<[number, MediaType]> = [];
  const failures: Array<{ row: QueueRow; error: string }> = [];
  const notFound: QueueRow[] = [];

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
          if (err instanceof TmdbNotFoundError) {
            notFound.push(row);
            return { row, metadata: null, error: null };
          }
          const msg = err instanceof Error ? err.message : String(err);
          return { row, metadata: null, error: msg };
        }
      }),
    );

    for (const r of results) {
      if (r.metadata) {
        metadataBatch.push(r.metadata);
      } else if (r.error !== null) {
        failures.push({ row: r.row, error: r.error ?? "unknown" });
      }
    }

    if (metadataBatch.length >= 100) {
      const continued = await flushAllowed(admin, metadataBatch.splice(0), existing, successIds);
      if (!continued) {
        await clearQueueSuccess(admin, successIds);
        await purgeNotFound(admin, notFound);
        return;
      }
    }
    if ((i / CONCURRENCY) % 20 === 0) {
      console.log(
        `[tmdb-bulk-crawl] 진행 ${i + chunk.length}/${queueRows.length} (성공 ${successIds.length}, 실패 ${failures.length})`,
      );
    }
  }

  if (metadataBatch.length > 0) {
    const continued = await flushAllowed(admin, metadataBatch, existing, successIds);
    if (!continued) {
      await clearQueueSuccess(admin, successIds);
      return;
    }
  }

  await clearQueueSuccess(admin, successIds);
  await purgeNotFound(admin, notFound);
  await markQueueFailures(admin, failures);

  const durationMs = Date.now() - startedAt.getTime();
  console.log(
    `[tmdb-bulk-crawl] 완료 duration=${durationMs}ms 성공=${successIds.length} 실패=${failures.length} 404제거=${notFound.length}`,
  );
}

async function loadExistingQueueKeys(admin: SupabaseClient, rows: QueueRow[]): Promise<Set<string>> {
  const existing = new Set<string>();
  for (const mediaType of ["movie", "tv"] as const) {
    const ids = rows.filter((row) => row.media_type === mediaType).map((row) => row.tmdb_id);
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await admin
        .from("tmdb_metadata")
        .select("tmdb_id, media_type")
        .eq("media_type", mediaType)
        .in("tmdb_id", ids.slice(i, i + 100));
      if (error) throw new Error(`기존 metadata 조회 실패: ${error.message}`);
      for (const row of data ?? []) existing.add(queueKey(row as QueueRow));
    }
  }
  return existing;
}

async function flushAllowed(
  admin: SupabaseClient,
  batch: MetadataRow[],
  existing: Set<string>,
  successIds: Array<[number, MediaType]>,
): Promise<boolean> {
  const guard = await checkDbGuard(admin, "tmdb-bulk-crawl");
  if (guard.level === "halt") return false;
  const allowed = guard.level === "refreshOnly"
    ? batch.filter((row) => existing.has(queueKey(row)))
    : batch;
  await flushMetadata(admin, allowed);
  successIds.push(...allowed.map((row): [number, MediaType] => [row.tmdb_id, row.media_type]));
  return true;
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

/**
 * TMDB 404 는 삭제된 작품이다. 큐에서만 지우면 metadata 의 fetched_at 이 그대로라
 * refresh-stale 이 매일 다시 넣는 무한 루프가 된다. 미러에서 함께 제거한다.
 * catalog 는 일일 export(삭제 작품 미포함)에서만 채워지므로 재유입되지 않는다.
 * ponytail: tmdb_provider_snapshots(로컬 이력) 는 남긴다.
 */
async function purgeNotFound(admin: SupabaseClient, rows: QueueRow[]): Promise<void> {
  if (rows.length === 0) return;
  for (const mediaType of ["movie", "tv"] as const) {
    const ids = rows.filter((row) => row.media_type === mediaType).map((row) => row.tmdb_id);
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      for (const table of ["tmdb_metadata", "tmdb_catalog", "tmdb_crawl_queue"]) {
        const { error } = await admin.from(table).delete().eq("media_type", mediaType).in("tmdb_id", chunk);
        if (error) console.error(`[tmdb-bulk-crawl] 404 제거 실패 (${table}/${mediaType}):`, error.message);
      }
    }
  }
  console.warn(`[tmdb-bulk-crawl] TMDB 404 ${rows.length}건 미러에서 제거`);
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
