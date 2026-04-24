/**
 * TMDB Daily ID Export → tmdb_catalog upsert.
 *
 * 스펙: _workspace/tmdb-mirror-spec.md 섹션 4
 * 결정: _workspace/open-questions-decision.md (Vercel Hobby 10초 한도로 route 대신 GitHub Actions 실행)
 *
 * 실행:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/tmdb-catalog-sync.ts
 *
 * 처리 흐름:
 *   1. movie + tv 각각 gzip 스트림 다운로드 (fallback: 어제 날짜)
 *   2. gunzip → 라인 단위 JSONL 파싱
 *   3. popularity >= TMDB_POPULARITY_MIN(기본 1.0)만 1000건 배치로 upsert
 *   4. 이번 사이클에 last_export가 갱신되지 않은 레코드는 soft delete
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POPULARITY_MIN = Number(process.env.TMDB_POPULARITY_MIN ?? "1.0");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "[tmdb-catalog-sync] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락",
  );
  process.exit(1);
}

type MediaType = "movie" | "tv";
type ExportRow = { id: number; popularity?: number; adult?: boolean };
type SyncResult = { upserted: number; skipped: number; failed: number };

async function main(): Promise<void> {
  const startedAt = new Date();
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const dateStr = tmdbExportDate(startedAt);

  console.log(`[tmdb-catalog-sync] 시작 ${startedAt.toISOString()} (date=${dateStr}, popularity>=${POPULARITY_MIN})`);

  const movie = await syncType(admin, "movie", dateStr);
  console.log(`[tmdb-catalog-sync] movie:`, movie);

  const tv = await syncType(admin, "tv", dateStr);
  console.log(`[tmdb-catalog-sync] tv:`, tv);

  const deleted = await markStale(admin, startedAt);
  console.log(`[tmdb-catalog-sync] soft deleted: ${deleted}`);

  const durationMs = Date.now() - startedAt.getTime();
  console.log(
    `[tmdb-catalog-sync] 완료 duration=${durationMs}ms total_upserted=${movie.upserted + tv.upserted}`,
  );
}

function tmdbExportDate(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${mm}_${dd}_${yyyy}`;
}

async function syncType(
  admin: SupabaseClient,
  mediaType: MediaType,
  dateStr: string,
): Promise<SyncResult> {
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
  return parseAndUpsert(admin, gunzip, mediaType);
}

async function parseAndUpsert(
  admin: SupabaseClient,
  stream: NodeJS.ReadableStream,
  mediaType: MediaType,
): Promise<SyncResult> {
  const BATCH_SIZE = 1000;
  let batch: Array<{
    tmdb_id: number;
    media_type: MediaType;
    popularity: number | null;
    adult: boolean;
    last_export: string;
    deleted: boolean;
  }> = [];
  let upserted = 0;
  let skipped = 0;
  let failed = 0;
  const now = new Date().toISOString();

  const flush = async () => {
    if (batch.length === 0) return;
    const { error } = await admin.from("tmdb_catalog").upsert(batch, {
      onConflict: "tmdb_id,media_type",
    });
    if (error) {
      failed += batch.length;
      console.error(
        `[tmdb-catalog-sync] upsert 실패 (${mediaType}):`,
        error.message,
      );
    } else {
      upserted += batch.length;
    }
    batch = [];
  };

  let buffer = "";
  for await (const chunk of stream) {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (!line) continue;
      const accepted = consumeLine(line, mediaType, now, batch);
      if (accepted === "upsert" && batch.length >= BATCH_SIZE) {
        await flush();
      } else if (accepted === "skip") {
        skipped += 1;
      } else if (accepted === "fail") {
        failed += 1;
      }
    }
  }
  const tail = buffer.trim();
  if (tail) {
    const accepted = consumeLine(tail, mediaType, now, batch);
    if (accepted === "skip") skipped += 1;
    else if (accepted === "fail") failed += 1;
  }
  await flush();
  return { upserted, skipped, failed };
}

function consumeLine(
  line: string,
  mediaType: MediaType,
  now: string,
  batch: Array<{
    tmdb_id: number;
    media_type: MediaType;
    popularity: number | null;
    adult: boolean;
    last_export: string;
    deleted: boolean;
  }>,
): "upsert" | "skip" | "fail" {
  let row: ExportRow;
  try {
    row = JSON.parse(line);
  } catch {
    return "fail";
  }
  if (typeof row.id !== "number") return "fail";
  const popularity = typeof row.popularity === "number" ? row.popularity : 0;
  if (popularity < POPULARITY_MIN) return "skip";
  batch.push({
    tmdb_id: row.id,
    media_type: mediaType,
    popularity,
    adult: Boolean(row.adult),
    last_export: now,
    deleted: false,
  });
  return "upsert";
}

async function markStale(
  admin: SupabaseClient,
  startedAt: Date,
): Promise<number> {
  const { data, error } = await admin
    .from("tmdb_catalog")
    .update({ deleted: true })
    .lt("last_export", startedAt.toISOString())
    .eq("deleted", false)
    .select("tmdb_id");
  if (error) {
    console.error("[tmdb-catalog-sync] soft delete 실패:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

main().catch((err) => {
  console.error("[tmdb-catalog-sync] 치명적 오류:", err);
  process.exit(1);
});
