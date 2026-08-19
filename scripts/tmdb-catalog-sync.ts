/**
 * TMDB Daily ID Export → popularity 갱신 + 신규 유입 큐 적재.
 *
 * 2026-08-18 재작성 (P1 — 유입 정책).
 *
 * 이전 동작: export 의 popularity>=1.0 전량(약 140만 행)을 tmdb_catalog 에 적재.
 * 이 테이블이 270MB 를 차지해 2026-08-17 Free 500MB 초과 사고의 주원인이 됐다.
 * 요청 경로에서 catalog 를 읽는 곳은 `genre-top` / `related` 두 라우트뿐이고,
 * 그것도 **이미 미러에 있는 작품의 popularity** 만 조회한다. 즉 우주 전체를
 * 테이블로 들고 있을 이유가 없었다.
 *
 * 새 동작 — export 를 테이블이 아니라 **스트림**으로 다룬다:
 *   1. tmdb_catalog(= 미러 보유/예약 작품) 키를 메모리에 적재
 *   2. export 스트림을 1회 통과하며
 *      - 보유 작품  → popularity 갱신 대상으로 수집
 *      - 미보유 작품 → popularity 상위 K개만 후보로 유지 (bounded, 정렬 없이 1-pass)
 *   3. 보유분 popularity 일괄 upsert
 *   4. 상위 K개 신규만 catalog upsert + crawl_queue 적재 (K = TMDB_DAILY_INGEST, 기본 1000)
 *
 * 우주 전체는 저장하지 않는다 — TMDB 가 매일 새로 주므로 보관할 이유가 없다.
 * soft delete(markStale) 도 제거했다. 보관하지 않는 것을 지울 필요가 없다.
 *
 * 실행:
 *   MIRROR_SUPABASE_URL=... MIRROR_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/tmdb-catalog-sync.ts
 *
 * 운영: GitHub Actions `.github/workflows/tmdb-catalog-sync.yml` (매일 08:00 UTC)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { shouldSkipIngest } from "./lib/db-guard";
import {
  scanExportStream,
  type Candidate,
  type MediaType,
  type ScanResult,
} from "./lib/catalog-scan";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";

// 2026-08-18 미러 분리 — tmdb_* 는 별도 Supabase 프로젝트.
// MIRROR_* 미설정 시 기존 프로젝트로 fallback (분리 전/롤백 호환).
const SUPABASE_URL =
  process.env.MIRROR_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY =
  process.env.MIRROR_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;

/** 신규 후보 하한. 이 아래는 KR 미가용 비율이 89%(2026-05 감사) 라 긁을 값이 없다. */
const POPULARITY_MIN = Number(process.env.TMDB_POPULARITY_MIN ?? "1.0");
/** 하루 신규 유입 상한. 상한 도달 후에는 방출(P2)과 균형을 이뤄야 한다. */
const DAILY_INGEST = Number(process.env.TMDB_DAILY_INGEST ?? "1000");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "[tmdb-catalog-sync] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락",
  );
  process.exit(1);
}


async function main(): Promise<void> {
  const startedAt = new Date();
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const dateStr = tmdbExportDate(startedAt);

  console.log(
    `[tmdb-catalog-sync] 시작 ${startedAt.toISOString()} (date=${dateStr}, popularity>=${POPULARITY_MIN}, daily_ingest=${DAILY_INGEST})`,
  );

  // 2026-08-18 — 신규 유입 가드. popularity 갱신까지 함께 멈추지만,
  // 임계에 닿았다는 건 방출/정리가 먼저라는 뜻이라 전체를 skip 한다.
  if (await shouldSkipIngest(admin, "tmdb-catalog-sync")) return;

  const owned = await loadOwnedKeys(admin);
  console.log(`[tmdb-catalog-sync] 보유 작품 ${owned.size.toLocaleString()}건 적재`);

  const popUpdates: Candidate[] = [];
  const newCandidates: Candidate[] = [];

  const movie = await scanType(admin, "movie", dateStr, owned, popUpdates, newCandidates);
  console.log(`[tmdb-catalog-sync] movie:`, movie);

  const tv = await scanType(admin, "tv", dateStr, owned, popUpdates, newCandidates);
  console.log(`[tmdb-catalog-sync] tv:`, tv);

  // 보유분 popularity 갱신 — 행 수가 늘지 않는다.
  const updated = await upsertCatalog(admin, popUpdates, "popularity 갱신");

  // 신규는 popularity 상위 DAILY_INGEST 개만. movie/tv 를 합쳐 전역 상위로 자른다.
  newCandidates.sort((a, b) => b.popularity - a.popularity);
  const admitted = newCandidates.slice(0, DAILY_INGEST);
  const dropped = newCandidates.length - admitted.length;

  const inserted = await upsertCatalog(admin, admitted, "신규 유입");
  const queued = await enqueue(admin, admitted);

  const durationMs = Date.now() - startedAt.getTime();
  console.log(
    `[tmdb-catalog-sync] 완료 duration=${durationMs}ms ` +
      `popularity_updated=${updated} 신규_유입=${inserted} 큐_적재=${queued} ` +
      `상한초과_제외=${dropped}`,
  );
  if (dropped > 0) {
    console.log(
      `[tmdb-catalog-sync] 상한(${DAILY_INGEST}) 으로 ${dropped}건 제외 — ` +
        `내일 다시 후보에 오른다 (누락 아님).`,
    );
  }
}

function tmdbExportDate(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${mm}_${dd}_${yyyy}`;
}

/** 미러가 보유(또는 큐에 예약)한 작품 키. `media_type:tmdb_id` 형식. */
async function loadOwnedKeys(admin: SupabaseClient): Promise<Set<string>> {
  const PAGE = 1000;
  const keys = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await admin
      .from("tmdb_catalog")
      .select("tmdb_id, media_type")
      .order("tmdb_id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error("[tmdb-catalog-sync] catalog 조회 실패:", error.message);
      process.exit(2);
    }
    const rows = data ?? [];
    if (rows.length === 0) break;
    for (const r of rows) keys.add(`${r.media_type}:${r.tmdb_id}`);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return keys;
}

async function scanType(
  admin: SupabaseClient,
  mediaType: MediaType,
  dateStr: string,
  owned: Set<string>,
  popUpdates: Candidate[],
  newCandidates: Candidate[],
): Promise<ScanResult> {
  void admin;
  const fileKey = mediaType === "movie" ? "movie_ids" : "tv_series_ids";
  const primary = `https://files.tmdb.org/p/exports/${fileKey}_${dateStr}.json.gz`;

  let res = await fetch(primary);
  if (!res.ok) {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const fallbackDate = tmdbExportDate(yesterday);
    const fallbackUrl = `https://files.tmdb.org/p/exports/${fileKey}_${fallbackDate}.json.gz`;
    console.warn(
      `[tmdb-catalog-sync] ${mediaType}: 오늘(${dateStr}) 실패 (${res.status}) → 어제(${fallbackDate}) 폴백`,
    );
    res = await fetch(fallbackUrl);
    if (!res.ok) {
      throw new Error(
        `TMDB export 다운로드 실패: ${mediaType} (${res.status})`,
      );
    }
  }
  if (!res.body) throw new Error(`TMDB export 응답 body 없음: ${mediaType}`);

  const nodeStream = Readable.fromWeb(
    res.body as unknown as import("node:stream/web").ReadableStream,
  );
  const gunzip = nodeStream.pipe(createGunzip());
  return scanExportStream(gunzip, {
    mediaType,
    owned,
    popularityMin: POPULARITY_MIN,
    maxCandidates: DAILY_INGEST,
    popUpdates,
    newCandidates,
  });
}

async function upsertCatalog(
  admin: SupabaseClient,
  rows: Candidate[],
  label: string,
): Promise<number> {
  if (rows.length === 0) return 0;
  const BATCH = 1000;
  let ok = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await admin.from("tmdb_catalog").upsert(batch, {
      onConflict: "tmdb_id,media_type",
    });
    if (error) {
      console.error(
        `[tmdb-catalog-sync] catalog upsert 실패 (${label}):`,
        error.message,
      );
    } else {
      ok += batch.length;
    }
  }
  return ok;
}

async function enqueue(
  admin: SupabaseClient,
  rows: Candidate[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const BATCH = 1000;
  let queued = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => ({
      tmdb_id: r.tmdb_id,
      media_type: r.media_type,
      priority: 0, // 갱신(refresh-stale/providers)보다 낮게 — 라이선스 의무가 우선.
      failed_count: 0,
    }));
    // 이미 큐에 있으면 덮지 않는다 (사용자 트리거 priority>0 보존).
    const { data, error } = await admin
      .from("tmdb_crawl_queue")
      .upsert(batch, { onConflict: "tmdb_id,media_type", ignoreDuplicates: true })
      .select("tmdb_id");
    if (error) {
      console.error("[tmdb-catalog-sync] 큐 UPSERT 실패:", error.message);
    } else {
      queued += data?.length ?? 0;
    }
  }
  return queued;
}

main().catch((err) => {
  console.error("[tmdb-catalog-sync] 예외 발생:", err);
  process.exit(1);
});
