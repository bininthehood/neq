/**
 * TMDB Refresh Stale — 180일 지난 tmdb_metadata 를 큐에 추가해 다시 크롤링.
 *
 * 스펙: _workspace/tmdb-mirror-spec.md §4 (Cron 설계)
 *   "/api/cron/tmdb-refresh-stale | 매일 08:30 UTC | tmdb_metadata.fetched_at < NOW() - 180 days
 *    인 것 1000건 추출 → tmdb_crawl_queue 에 priority=0 추가"
 *
 * 실행:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/tmdb-refresh-stale.ts
 *
 * 처리 흐름:
 *   1. tmdb_metadata 에서 fetched_at < NOW() - 180 days 인 row 1000건 추출 (오래된 순)
 *   2. tmdb_crawl_queue 에 (tmdb_id, media_type, priority=0) UPSERT
 *      - onConflict DO NOTHING — 이미 큐에 있으면 (사용자 트리거 priority>0 가능) 덮지 않음
 *   3. bulk-crawl 이 큐에서 pull 해서 실제 갱신 수행
 *
 * 환경 변수:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (필수)
 *   STALE_DAYS (기본 180)
 *   BATCH_SIZE (기본 1000)
 *
 * 운영: GitHub Actions `.github/workflows/tmdb-refresh-stale.yml` (매일 08:30 UTC)
 *   bulk-crawl 1h cron 이 큐를 비워주는 메커니즘 활성화 시점에 의미 있어짐.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STALE_DAYS = Number(process.env.STALE_DAYS ?? "180");
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? "1000");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "[tmdb-refresh-stale] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락",
  );
  process.exit(1);
}

type StaleRow = {
  tmdb_id: number;
  media_type: "movie" | "tv";
};

async function main(): Promise<void> {
  const startedAt = new Date();
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(
    `[tmdb-refresh-stale] 시작 ${startedAt.toISOString()} stale_days=${STALE_DAYS} batch=${BATCH_SIZE}`,
  );

  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
  console.log(`[tmdb-refresh-stale] cutoff = ${cutoff.toISOString()}`);

  const staleRows = await fetchStale(admin, cutoff, BATCH_SIZE);
  console.log(`[tmdb-refresh-stale] stale row ${staleRows.length}건 발견`);

  if (staleRows.length === 0) {
    console.log("[tmdb-refresh-stale] 갱신 대상 없음, 종료");
    return;
  }

  const inserted = await enqueue(admin, staleRows);

  const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  console.log(
    `[tmdb-refresh-stale] 완료 inserted=${inserted}/${staleRows.length} elapsed=${elapsed}s`,
  );
}

async function fetchStale(
  admin: SupabaseClient,
  cutoff: Date,
  limit: number,
): Promise<StaleRow[]> {
  const { data, error } = await admin
    .from("tmdb_metadata")
    .select("tmdb_id, media_type")
    .lt("fetched_at", cutoff.toISOString())
    .order("fetched_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[tmdb-refresh-stale] tmdb_metadata 조회 실패:", error.message);
    process.exit(2);
  }

  return (data ?? []) as StaleRow[];
}

async function enqueue(
  admin: SupabaseClient,
  rows: StaleRow[],
): Promise<number> {
  const queueRows = rows.map((r) => ({
    tmdb_id: r.tmdb_id,
    media_type: r.media_type,
    priority: 0,
    failed_count: 0,
  }));

  // onConflict DO NOTHING — 이미 큐에 있으면 (사용자 트리거 priority>0 가능) 덮지 않음.
  // Supabase 의 upsert + ignoreDuplicates 가 PostgreSQL 의 ON CONFLICT DO NOTHING 에 매핑됨.
  const { data, error } = await admin
    .from("tmdb_crawl_queue")
    .upsert(queueRows, {
      onConflict: "tmdb_id,media_type",
      ignoreDuplicates: true,
    })
    .select("tmdb_id");

  if (error) {
    console.error("[tmdb-refresh-stale] 큐 UPSERT 실패:", error.message);
    process.exit(3);
  }

  return data?.length ?? 0;
}

main().catch((err) => {
  console.error("[tmdb-refresh-stale] 예외 발생:", err);
  process.exit(1);
});
