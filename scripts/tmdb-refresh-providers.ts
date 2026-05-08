/**
 * TMDB Refresh Providers — providers TTL (30일) 트리거.
 *
 * 배경:
 *   tmdb_metadata 는 detail/credits 가 안정적이지만 providers (KR OTT 가용성) 는
 *   카탈로그 변동 (Netflix add, wavve drop 등) 에 민감. 별도 30일 TTL 로 빈번 리프레시.
 *   상위 metadata TTL 180일 (`tmdb-refresh-stale.ts`) 과 분리 운영.
 *
 *   parity 측정 (2026-05-08): 11일 staleness 에서 3% divergence.
 *   30일 TTL 적용 시 ~8% 이내 유지 가능 (선형 추정).
 *
 * 처리 흐름:
 *   1. tmdb_metadata 에서 providers_fetched_at < NOW() - 30 days 인 row 추출 (오래된 순)
 *      - providers_fetched_at IS NULL 도 포함 (구버전 적재로 미세팅된 경우)
 *   2. tmdb_crawl_queue 에 (tmdb_id, media_type, priority=0) UPSERT — DO NOTHING on conflict
 *   3. bulk-crawl (6시간 cron) 이 큐에서 pull 해서 갱신. 갱신 시 providers_fetched_at 도 NOW 로 update.
 *
 * 주의:
 *   bulk-crawl 은 detail+credits+providers 통째로 refetch — providers 단독 endpoint 분기 없음.
 *   따라서 본 스크립트가 큐에 추가하면 metadata 전체가 refresh 됨 (providers 외 필드도 freshness 향상).
 *
 * 환경 변수:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (필수)
 *   PROVIDERS_TTL_DAYS (기본 30)
 *   BATCH_SIZE (기본 1000)
 *   DRY_RUN (기본 false) — true 시 큐 적재 없이 후보 수만 보고. 운영 검증용.
 *
 * 운영:
 *   GitHub Actions `.github/workflows/tmdb-refresh-providers.yml` (매일 09:00 UTC)
 *   refresh-stale (08:30) 직후, bulk-crawl (XX:15 6시간) 가 비우는 패턴.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROVIDERS_TTL_DAYS = Number(process.env.PROVIDERS_TTL_DAYS ?? "30");
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? "1000");
const DRY_RUN = process.env.DRY_RUN === "true";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "[tmdb-refresh-providers] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락",
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
    `[tmdb-refresh-providers] 시작 ${startedAt.toISOString()} ttl_days=${PROVIDERS_TTL_DAYS} batch=${BATCH_SIZE}${DRY_RUN ? " [DRY_RUN]" : ""}`,
  );

  const cutoff = new Date(Date.now() - PROVIDERS_TTL_DAYS * 24 * 60 * 60 * 1000);
  console.log(`[tmdb-refresh-providers] cutoff = ${cutoff.toISOString()}`);

  const staleRows = await fetchStaleProviders(admin, cutoff, BATCH_SIZE);
  console.log(`[tmdb-refresh-providers] stale row ${staleRows.length}건 발견`);

  if (staleRows.length === 0) {
    console.log("[tmdb-refresh-providers] 갱신 대상 없음, 종료");
    return;
  }

  if (DRY_RUN) {
    console.log(
      `[tmdb-refresh-providers] [DRY_RUN] 큐 적재 없이 종료. 실제 실행 시 ${staleRows.length}건 적재 예정.`,
    );
    console.log(
      `[tmdb-refresh-providers] [DRY_RUN] 샘플: ${staleRows
        .slice(0, 3)
        .map((r) => `${r.media_type}/${r.tmdb_id}`)
        .join(", ")}`,
    );
    return;
  }

  const inserted = await enqueue(admin, staleRows);

  const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  console.log(
    `[tmdb-refresh-providers] 완료 inserted=${inserted}/${staleRows.length} elapsed=${elapsed}s`,
  );
}

async function fetchStaleProviders(
  admin: SupabaseClient,
  cutoff: Date,
  limit: number,
): Promise<StaleRow[]> {
  // providers_fetched_at < cutoff OR providers_fetched_at IS NULL
  // 정렬: NULL 우선 → 오래된 순. NULL 은 fetched_at 가 cutoff 보다 오래됐을 때만 안전 후보.
  // 단순화: NULL OR < cutoff 모두 후보. fetched_at 도 cutoff 미만일 때만 (이중 안전 — 최근 적재 행 재큐 방지)
  const { data, error } = await admin
    .from("tmdb_metadata")
    .select("tmdb_id, media_type")
    .or(
      `providers_fetched_at.is.null,providers_fetched_at.lt.${cutoff.toISOString()}`,
    )
    .lt("fetched_at", cutoff.toISOString())
    .order("providers_fetched_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    console.error(
      "[tmdb-refresh-providers] tmdb_metadata 조회 실패:",
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
  const { data, error } = await admin
    .from("tmdb_crawl_queue")
    .upsert(queueRows, {
      onConflict: "tmdb_id,media_type",
      ignoreDuplicates: true,
    })
    .select("tmdb_id");

  if (error) {
    console.error(
      "[tmdb-refresh-providers] 큐 UPSERT 실패:",
      error.message,
    );
    process.exit(3);
  }

  return data?.length ?? 0;
}

main().catch((err) => {
  console.error("[tmdb-refresh-providers] 예외 발생:", err);
  process.exit(1);
});
