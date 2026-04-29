/**
 * GET /api/cron/tmdb-providers-snapshot
 *
 * 매일 18:00 UTC (= 03:00 KST) — 전체 saved_items 의 TMDB watch/providers 스냅샷.
 * 7일치만 보관. 어제 vs 오늘 비교는 ott-expiry cron 에서 수행.
 *
 * P0-5a 풀구현:
 *   1. saved_items 의 (tmdb_id, type) DISTINCT 추출 (페이징 1000)
 *   2. tmdb_metadata 미러 join (24h fresh 우선)
 *      - fresh : 미러 그대로 사용 (이름→id 역매핑)
 *      - stale/miss : TMDB watch/providers KR 호출
 *   3. tmdb_provider_snapshots UPSERT (work_id + media_type + snapshot_date=오늘)
 *   4. snapshot_date < CURRENT_DATE - 7 row DELETE
 *
 * 결정 사항 (_workspace/p0-5a-design.md §5):
 *   - 활성/비활성 구분 없이 전체 saved_items 사용 (단순화)
 *   - movie + tv 모두 포함
 *
 * vercel.json: "0 18 * * *"
 */

import { NextResponse } from "next/server";
import { isNotificationsEnabled } from "@/lib/env";
import { isAuthorizedCron } from "@/lib/notifications/cron-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  classifyCache,
  extractKrProviderIds,
  mapWithConcurrency,
  mirrorProvidersToCompact,
  RateLimiter,
  tmdbWatchProviders,
  type CompactProviders,
  type MediaType,
} from "@/lib/notifications/providers-helpers";

/** TMDB 호출 동시성 (rate limit 30 rps 안전 영역). */
const TMDB_CONCURRENCY = 8;

/** Supabase REST 1000 row cap 회피 — saved_items 페이징 사이즈. */
const PAGE_SIZE = 1000;

/** snapshot UPSERT 한 번에 보낼 row 수. */
const UPSERT_BATCH = 500;

interface TargetWork {
  tmdb_id: number;
  media_type: MediaType;
}

interface JoinedWork extends TargetWork {
  cacheStatus: "fresh" | "stale" | "miss";
  mirrorProviders: CompactProviders | null;
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isNotificationsEnabled()) {
    return NextResponse.json({ ok: true, disabled: true, processed: 0 });
  }

  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (!tmdbApiKey) {
    return NextResponse.json(
      { error: "TMDB_API_KEY missing" },
      { status: 500 },
    );
  }

  const startedAt = Date.now();
  const admin = supabaseAdmin();
  const now = new Date();
  const today = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

  // STEP 1 — saved_items DISTINCT (tmdb_id, type) 페이징
  let targets: TargetWork[];
  try {
    targets = await fetchDistinctSavedWorks(admin);
  } catch (err) {
    console.error("[cron/providers-snapshot] step1 failed:", err);
    return NextResponse.json(
      { error: "saved-items-fetch-failed", detail: String(err) },
      { status: 500 },
    );
  }

  if (targets.length === 0) {
    return NextResponse.json({
      ok: true,
      saved_works: 0,
      mirror_hits: 0,
      tmdb_calls: 0,
      snapshots_inserted: 0,
      pruned_old: 0,
      duration_ms: Date.now() - startedAt,
      errors: [],
    });
  }

  // STEP 2 — tmdb_metadata 미러 join (24h fresh 분류)
  const joined = await joinMirror(admin, targets, now);
  const mirrorHits = joined.filter((j) => j.cacheStatus === "fresh").length;

  // STEP 3 — TMDB 호출 (stale/miss 만)
  const limiter = new RateLimiter(30);
  const errors: Array<{ tmdb_id: number; media_type: MediaType; error: string }> = [];
  let tmdbCalls = 0;

  const computed = await mapWithConcurrency(
    joined,
    TMDB_CONCURRENCY,
    async (j) => {
      if (j.cacheStatus === "fresh" && j.mirrorProviders) {
        return { work: j, providers: j.mirrorProviders };
      }
      try {
        const raw = await tmdbWatchProviders(
          j.tmdb_id,
          j.media_type,
          tmdbApiKey,
          limiter,
        );
        tmdbCalls += 1;
        return { work: j, providers: extractKrProviderIds(raw) };
      } catch (err) {
        errors.push({
          tmdb_id: j.tmdb_id,
          media_type: j.media_type,
          error: String(err),
        });
        return null;
      }
    },
  );

  // STEP 4 — UPSERT batch
  const rowsToUpsert = computed
    .filter((r): r is { work: JoinedWork; providers: CompactProviders } => r !== null)
    .map((r) => ({
      work_id: r.work.tmdb_id,
      media_type: r.work.media_type,
      snapshot_date: today,
      providers: r.providers,
    }));

  let snapshotsInserted = 0;
  for (let i = 0; i < rowsToUpsert.length; i += UPSERT_BATCH) {
    const batch = rowsToUpsert.slice(i, i + UPSERT_BATCH);
    const { error: upErr } = await admin
      .from("tmdb_provider_snapshots")
      .upsert(batch, {
        onConflict: "work_id,media_type,snapshot_date",
      });
    if (upErr) {
      console.error("[cron/providers-snapshot] upsert batch failed:", upErr);
      return NextResponse.json(
        { error: "upsert-failed", detail: upErr.message },
        { status: 500 },
      );
    }
    snapshotsInserted += batch.length;
  }

  // STEP 5 — 7일 이전 prune
  let prunedOld = 0;
  try {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    const { count, error: pruneErr } = await admin
      .from("tmdb_provider_snapshots")
      .delete({ count: "exact" })
      .lt("snapshot_date", sevenDaysAgo);
    if (pruneErr) {
      console.error("[cron/providers-snapshot] prune failed:", pruneErr);
    } else {
      prunedOld = count ?? 0;
    }
  } catch (err) {
    console.error("[cron/providers-snapshot] prune exception:", err);
  }

  return NextResponse.json({
    ok: true,
    saved_works: targets.length,
    mirror_hits: mirrorHits,
    tmdb_calls: tmdbCalls,
    snapshots_inserted: snapshotsInserted,
    pruned_old: prunedOld,
    duration_ms: Date.now() - startedAt,
    errors: errors.slice(0, 50), // 응답 크기 제한
    errors_total: errors.length,
  });
}

// ─────────────────────────────────────────────────────────────────
// helpers (route 내부 — orchestration)
// ─────────────────────────────────────────────────────────────────

async function fetchDistinctSavedWorks(
  admin: ReturnType<typeof supabaseAdmin>,
): Promise<TargetWork[]> {
  const seen = new Set<string>();
  const out: TargetWork[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await admin
      .from("saved_items")
      .select("tmdb_id, type")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      const tmdbId = row.tmdb_id as number;
      const type = row.type as MediaType;
      if (typeof tmdbId !== "number" || (type !== "movie" && type !== "tv")) {
        continue;
      }
      const key = `${tmdbId}|${type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ tmdb_id: tmdbId, media_type: type });
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

/**
 * tmdb_metadata 의 providers / providers_fetched_at 으로 cache 분류.
 *
 * Supabase REST 의 `.in()` 은 arr 길이 제한 (~1000)이 있어 페이지네이션 필요.
 * tmdb_id 단독으로 in() 하면 다른 media_type 의 row 도 섞일 수 있어
 * tmdb_id 만 in() 으로 가져온 뒤 (tmdb_id, media_type) 로 매칭한다.
 */
async function joinMirror(
  admin: ReturnType<typeof supabaseAdmin>,
  targets: TargetWork[],
  now: Date,
): Promise<JoinedWork[]> {
  // 미러 row 적재
  const lookup = new Map<
    string,
    { providers: unknown; providers_fetched_at: string | null }
  >();

  const ids = Array.from(new Set(targets.map((t) => t.tmdb_id)));
  const IN_PAGE = 500;
  for (let i = 0; i < ids.length; i += IN_PAGE) {
    const slice = ids.slice(i, i + IN_PAGE);
    const { data, error } = await admin
      .from("tmdb_metadata")
      .select("tmdb_id, media_type, providers, providers_fetched_at")
      .in("tmdb_id", slice);
    if (error) {
      // 미러 join 실패는 치명적이지 않다 (모두 miss 로 처리되어 TMDB 호출만 늘어남)
      console.warn("[cron/providers-snapshot] mirror join page failed:", error);
      continue;
    }
    for (const row of data ?? []) {
      const k = `${row.tmdb_id}|${row.media_type}`;
      lookup.set(k, {
        providers: row.providers,
        providers_fetched_at: row.providers_fetched_at as string | null,
      });
    }
  }

  return targets.map((t) => {
    const k = `${t.tmdb_id}|${t.media_type}`;
    const hit = lookup.get(k);
    const cacheStatus = classifyCache(hit?.providers_fetched_at ?? null, now);
    const mirrorProviders =
      cacheStatus === "fresh"
        ? mirrorProvidersToCompact(
            hit?.providers as Array<{
              name?: string;
              category?: "subscription" | "rent" | "buy";
            }> | null | undefined,
          )
        : null;
    return { ...t, cacheStatus, mirrorProviders };
  });
}
