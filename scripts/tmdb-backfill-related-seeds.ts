/**
 * TMDB related seeds 백필 — 기존 tmdb_metadata 행에 collection_id / director_tmdb_id 채움 (P1, additive).
 *
 * 배경: /api/tmdb/related seeds 미러화(왕복 2→1). 신규/refresh 행은 크롤(tmdb-fetch.ts)이 자동
 *   채우지만, 기존 ~113K 행은 1회 백필 필요. 서빙 무영향 — 컬럼만 채운다.
 *   설계: _workspace/03_content_related-mirror-p1-2026-07-15.md
 *
 * 적용 순서(인프라/사용자 영역):
 *   (1) supabase/migrations/20260715_tmdb_related_seeds.sql  ← 컬럼 추가
 *   (2) 이 스크립트 백필 (로컬 또는 GH dispatch)
 *   (3) apps/web related 라우트 배포 (mirror hit 경로 활성화)
 *
 * 대상: related_seeds_fetched_at IS NULL (미백필). 처리 후 마커 SET → 멱등·재개가능.
 *   중단 후 재실행해도 이미 처리된 행은 필터에서 자동 제외.
 *   --providers-only: providers IS NOT NULL (KR 스트리밍 모집단 ~17K) 우선 처리.
 *
 * 실행:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TMDB_API_KEY=... \
 *     npx tsx scripts/tmdb-backfill-related-seeds.ts [--limit N] [--dry-run] [--providers-only]
 *
 * 옵션:
 *   --limit N         최대 N 행 처리 후 종료 (기본 무제한)
 *   --dry-run         TMDB 만 호출, DB 쓰기 없음 (소량 검증용: --dry-run --limit 5)
 *   --providers-only  providers IS NOT NULL 행만 (추천 모집단 우선 백필)
 *   --rps N           TMDB rate limit (기본 30, 한도 40 대비 여유)
 *   --page N          DB pull 페이지 크기 (기본 500)
 *
 * TMDB 호출: 행당 detail + credits 2콜 (providers/watch 는 건너뜀 — seeds 만 필요).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  RateLimiter,
  extractRelatedSeeds,
  tmdbGet,
  type MediaType,
} from "./lib/tmdb-fetch";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !TMDB_API_KEY) {
  console.error(
    "[backfill-related-seeds] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / TMDB_API_KEY 누락",
  );
  process.exit(1);
}

function argVal(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(name);
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  return undefined;
}
function argFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

const LIMIT = argVal("--limit") ? Number(argVal("--limit")) : Infinity;
const DRY_RUN = argFlag("--dry-run");
const PROVIDERS_ONLY = argFlag("--providers-only");
const RPS = Number(argVal("--rps") ?? "30");
const PULL_PAGE = Number(argVal("--page") ?? "500");

type MetaRow = { tmdb_id: number; media_type: MediaType };
type SeedUpdate = {
  tmdb_id: number;
  media_type: MediaType;
  collection_id: number | null;
  director_tmdb_id: number | null;
  related_seeds_fetched_at: string;
};

/** upsert 1회 재시도 (일시적 네트워크/타임아웃 흡수). */
async function upsertWithRetry(
  admin: SupabaseClient,
  batch: SeedUpdate[],
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await admin
      .from("tmdb_metadata")
      .upsert(batch, { onConflict: "tmdb_id,media_type" });
    if (!error) return;
    if (attempt === 0) {
      console.warn(`[backfill] upsert 실패, 2s 후 재시도: ${error.message}`);
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    throw new Error(`[backfill] upsert 최종 실패: ${error.message}`);
  }
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const limiter = new RateLimiter(RPS);

  console.log(
    `[backfill-related-seeds] 시작 limit=${LIMIT} dryRun=${DRY_RUN} providersOnly=${PROVIDERS_ONLY} rps=${RPS}`,
  );

  let processed = 0;
  let failed = 0;
  const now = new Date().toISOString();

  // keyset 페이지네이션: deep OFFSET 은 offset 커질수록 statement timeout → tmdb_id 커서(.gt).
  // related_seeds_fetched_at IS NULL 필터가 처리분을 자동 제외하므로 재실행/중단 안전.
  // 경계에서 같은 tmdb_id 의 다른 media_type 이 드물게 누락될 수 있으나 멱등 재실행으로 회수.
  let cursorId = -1;
  while (processed < LIMIT) {
    let query = admin
      .from("tmdb_metadata")
      .select("tmdb_id, media_type")
      .is("related_seeds_fetched_at", null)
      .gt("tmdb_id", cursorId)
      .order("tmdb_id", { ascending: true })
      .order("media_type", { ascending: true })
      .limit(PULL_PAGE);
    if (PROVIDERS_ONLY) query = query.not("providers", "is", null);

    const { data, error } = await query;
    if (error) throw new Error(`[backfill] pull 실패: ${error.message}`);
    const page = (data ?? []) as MetaRow[];
    if (page.length === 0) break;
    cursorId = page[page.length - 1].tmdb_id;

    const batch: SeedUpdate[] = [];
    for (const r of page) {
      if (processed >= LIMIT) break;
      try {
        const [detail, credits] = await Promise.all([
          tmdbGet(r, "", limiter, TMDB_API_KEY!),
          tmdbGet(r, "/credits", limiter, TMDB_API_KEY!),
        ]);
        const seeds = extractRelatedSeeds(r, detail, credits);
        batch.push({
          tmdb_id: r.tmdb_id,
          media_type: r.media_type,
          ...seeds,
          related_seeds_fetched_at: now,
        });
        processed += 1;
        if (DRY_RUN) {
          console.log(
            `[dry-run] ${r.media_type}/${r.tmdb_id} → collection=${seeds.collection_id} director=${seeds.director_tmdb_id}`,
          );
        }
      } catch (err) {
        // TMDB 영구 실패(삭제된 id 등) → 마커 SET 안 함 = 다음 재실행에서 재시도.
        // 반복 실패 id 는 소수라 무한루프 위험 낮음(재실행 시 커서로 지나침).
        failed += 1;
        console.warn(
          `[backfill] ${r.media_type}/${r.tmdb_id} fetch 실패: ${(err as Error).message}`,
        );
      }
    }

    if (batch.length > 0 && !DRY_RUN) {
      await upsertWithRetry(admin, batch);
    }

    console.log(
      `[backfill] processed=${processed} failed=${failed} cursor=${cursorId} (${Math.round(
        (Date.now() - startedAt) / 1000,
      )}s)`,
    );
    if (page.length < PULL_PAGE) break; // 마지막 페이지
  }

  console.log(
    `[backfill-related-seeds] 완료 processed=${processed} failed=${failed} ${Math.round(
      (Date.now() - startedAt) / 1000,
    )}s`,
  );
}

main().catch((err) => {
  console.error("[backfill-related-seeds] 치명적 오류:", err);
  process.exit(1);
});
