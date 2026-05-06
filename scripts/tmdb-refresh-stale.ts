/**
 * TMDB Refresh Stale — tmdb_metadata 의 두 가지 미커버 카테고리를 큐에 추가.
 *
 * 1) fetched_at < NOW() - 180 days  — 180일 TTL 만료 (스펙 원본)
 * 2) providers IS NULL              — initial-crawl 시점 providers fetch 누락분 보충
 *    (180일 미만이라 (1) 트리거에 안 잡혔다면 이쪽에서 enqueue)
 *
 * 처리 흐름:
 *   1. 두 카테고리에서 각각 BATCH_SIZE 건 추출 (오래된 순)
 *   2. dedupe (tmdb_id + media_type) 후 합치기
 *   3. tmdb_crawl_queue 에 (priority=0) UPSERT — onConflict DO NOTHING
 *   4. bulk-crawl 이 큐에서 pull 해서 실제 갱신 수행
 *
 * 환경 변수:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (필수)
 *   STALE_DAYS (기본 180)
 *   BATCH_SIZE (기본 1000) — 카테고리당 limit
 *
 * 운영: GitHub Actions `.github/workflows/tmdb-refresh-stale.yml` (매일 08:30 UTC).
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

  const [staleRows, missingProvidersRows] = await Promise.all([
    fetchStale(admin, cutoff, BATCH_SIZE),
    fetchMissingProviders(admin, BATCH_SIZE),
  ]);
  console.log(
    `[tmdb-refresh-stale] stale=${staleRows.length} missing_providers=${missingProvidersRows.length}`,
  );

  // 두 카테고리는 일반적으로 disjoint 지만 (180일 stale 인데 providers 도 null) 안전하게 dedupe.
  const seen = new Set<string>();
  const combined: StaleRow[] = [];
  for (const r of [...staleRows, ...missingProvidersRows]) {
    const key = `${r.media_type}:${r.tmdb_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(r);
  }

  if (combined.length === 0) {
    console.log("[tmdb-refresh-stale] 갱신 대상 없음, 종료");
    return;
  }

  const inserted = await enqueue(admin, combined);

  const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  console.log(
    `[tmdb-refresh-stale] 완료 inserted=${inserted}/${combined.length} elapsed=${elapsed}s`,
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

async function fetchMissingProviders(
  admin: SupabaseClient,
  limit: number,
): Promise<StaleRow[]> {
  const { data, error } = await admin
    .from("tmdb_metadata")
    .select("tmdb_id, media_type")
    .is("providers", null)
    .order("fetched_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error(
      "[tmdb-refresh-stale] missing providers 조회 실패:",
      error.message,
    );
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
