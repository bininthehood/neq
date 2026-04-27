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

type MediaType = "movie" | "tv";

type QueueRow = {
  tmdb_id: number;
  media_type: MediaType;
  failed_count: number;
};

type MetadataRow = {
  tmdb_id: number;
  media_type: MediaType;
  title: string | null;
  title_en: string | null;
  overview: string | null;
  rating: number | null;
  release_date: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  director: string | null;
  cast_names: string[] | null;
  runtime: number | null;
  seasons: number | null;
  country: string[] | null;
  origin_country: string[] | null;
  genre_ids: number[] | null;
  providers: Array<{ name: string; logoUrl: string | null; category: 'subscription' | 'rent' | 'buy' }> | null;
  watch_link: string | null;
  providers_fetched_at: string;
  fetched_at: string;
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
          const metadata = await fetchMetadata(row, limiter, now);
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

async function fetchMetadata(
  row: QueueRow,
  limiter: RateLimiter,
  now: string,
): Promise<MetadataRow> {
  const [detail, credits, providers] = await Promise.all([
    tmdbGet(row, "", limiter),
    tmdbGet(row, "/credits", limiter),
    tmdbGet(row, "/watch/providers", limiter),
  ]);

  return mapToMetadataRow(row, detail, credits, providers, now);
}

async function tmdbGet(
  row: QueueRow,
  path: string,
  limiter: RateLimiter,
): Promise<Record<string, unknown>> {
  await limiter.acquire();
  const url = `https://api.themoviedb.org/3/${row.media_type}/${row.tmdb_id}${path}?api_key=${TMDB_API_KEY}&language=ko-KR`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 429) {
      // 백오프 후 재시도 1회
      await sleep(2000);
      const retry = await fetch(url);
      if (!retry.ok) throw new Error(`TMDB ${path || "/detail"} ${retry.status}`);
      return retry.json();
    }
    throw new Error(`TMDB ${path || "/detail"} ${res.status}`);
  }
  return res.json();
}

/**
 * recommend.ts 호환성 반영 포인트:
 * - director: job="Director" → department="Directing" 폴백 (getCredits와 동일)
 * - runtime: 시리즈의 경우 episode_run_time[0] 사용 (getDetails와 동일)
 * - providers: TMDB 원본 KR 객체를 dedup + 평탄화 → Array<{name, logoUrl}>로 변환
 *              (enrichCandidates가 기대하는 구조. logoUrl은 w92 prefix 적용)
 * - poster_path/backdrop_path: 원본 path만 저장 (읽기 시 w500/w780/w1280 prefix 생성)
 */
function mapToMetadataRow(
  row: QueueRow,
  detail: Record<string, unknown>,
  credits: Record<string, unknown>,
  providers: Record<string, unknown>,
  now: string,
): MetadataRow {
  const isMovie = row.media_type === "movie";
  const crew = (credits.crew ?? []) as Array<{
    job?: string;
    department?: string;
    name?: string;
  }>;
  const cast = (credits.cast ?? []) as Array<{ name?: string }>;
  // recommend.ts getCredits와 동일한 폴백
  const director =
    crew.find((c) => c.job === "Director")?.name ??
    crew.find((c) => c.department === "Directing")?.name ??
    null;
  const castNames = cast
    .slice(0, 10)
    .map((c) => c.name)
    .filter((n): n is string => typeof n === "string");

  return {
    tmdb_id: row.tmdb_id,
    media_type: row.media_type,
    title: (detail[isMovie ? "title" : "name"] as string) ?? null,
    title_en: (detail[isMovie ? "original_title" : "original_name"] as string) ?? null,
    overview: (detail.overview as string) ?? null,
    rating: typeof detail.vote_average === "number" ? detail.vote_average : null,
    release_date:
      (detail[isMovie ? "release_date" : "first_air_date"] as string) ?? null,
    poster_path: (detail.poster_path as string) ?? null,
    backdrop_path: (detail.backdrop_path as string) ?? null,
    director,
    cast_names: castNames.length > 0 ? castNames : null,
    // 시리즈는 episode_run_time 첫 번째 값 사용 (getDetails와 동일)
    runtime: isMovie
      ? typeof detail.runtime === "number"
        ? detail.runtime
        : null
      : Array.isArray(detail.episode_run_time) &&
          typeof (detail.episode_run_time as number[])[0] === "number"
        ? (detail.episode_run_time as number[])[0]
        : null,
    seasons: !isMovie
      ? typeof detail.number_of_seasons === "number"
        ? detail.number_of_seasons
        : null
      : null,
    country: Array.isArray(detail.production_countries)
      ? (detail.production_countries as Array<{ iso_3166_1?: string }>)
          .map((c) => c.iso_3166_1)
          .filter((c): c is string => typeof c === "string")
      : null,
    origin_country: Array.isArray(detail.origin_country)
      ? (detail.origin_country as string[])
      : null,
    genre_ids: Array.isArray(detail.genres)
      ? (detail.genres as Array<{ id?: number }>)
          .map((g) => g.id)
          .filter((id): id is number => typeof id === "number")
      : null,
    // providers는 recommend.ts 기대 구조로 평탄화/dedup (getKoreanProviders와 동일)
    providers: extractKoreanProviders(providers),
    watch_link: extractWatchLink(providers),
    providers_fetched_at: now,
    fetched_at: now,
  };
}

/**
 * TMDB /watch/providers 응답 → recommend.ts 기대 구조로 변환.
 * 입력: { results: { KR: { flatrate: [...], rent: [...], buy: [...], link } } }
 * 출력: Array<{name, logoUrl, category}> (dedup, 같은 provider가 여러 카테고리면 구독 > 대여 > 구매 우선)
 */
function extractKoreanProviders(
  providers: Record<string, unknown>,
): Array<{ name: string; logoUrl: string | null; category: 'subscription' | 'rent' | 'buy' }> | null {
  const kr = (providers.results as Record<string, unknown> | undefined)?.KR as
    | Record<string, unknown>
    | undefined;
  if (!kr) return null;

  type RawProv = { provider_name?: string; logo_path?: string | null };
  const buckets: Array<{ items: RawProv[]; category: 'subscription' | 'rent' | 'buy' }> = [
    { items: (kr.flatrate as RawProv[] | undefined) ?? [], category: 'subscription' },
    { items: (kr.rent as RawProv[] | undefined) ?? [], category: 'rent' },
    { items: (kr.buy as RawProv[] | undefined) ?? [], category: 'buy' },
  ];

  const seen = new Set<string>();
  const result: Array<{ name: string; logoUrl: string | null; category: 'subscription' | 'rent' | 'buy' }> = [];
  for (const { items, category } of buckets) {
    for (const p of items) {
      if (!p.provider_name || seen.has(p.provider_name)) continue;
      seen.add(p.provider_name);
      result.push({
        name: p.provider_name,
        logoUrl: p.logo_path
          ? `https://image.tmdb.org/t/p/w92${p.logo_path}`
          : null,
        category,
      });
    }
  }
  return result.length > 0 ? result : null;
}

function extractWatchLink(providers: Record<string, unknown>): string | null {
  const kr = (providers.results as Record<string, unknown> | undefined)?.KR as
    | Record<string, unknown>
    | undefined;
  return typeof kr?.link === "string" ? (kr.link as string) : null;
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

class RateLimiter {
  private queue: Array<() => void> = [];
  private running = 0;
  private readonly intervalMs: number;

  constructor(rps: number) {
    this.intervalMs = 1000 / rps;
  }

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      const task = () => {
        this.running += 1;
        resolve();
        setTimeout(() => {
          this.running -= 1;
          const next = this.queue.shift();
          if (next) next();
        }, this.intervalMs);
      };
      if (this.running < 1) task();
      else this.queue.push(task);
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("[tmdb-bulk-crawl] 치명적 오류:", err);
  process.exit(1);
});
