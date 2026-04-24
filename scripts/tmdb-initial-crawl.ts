/**
 * TMDB Initial Crawl — popularity 상위 N개 1회성 bulk metadata 채움.
 *
 * 스펙: _workspace/tmdb-mirror-spec.md 섹션 5.1
 * 결정: _workspace/open-questions-decision.md (GitHub Actions workflow_dispatch, 132분 예상)
 *
 * 실행:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TMDB_API_KEY=... \
 *   MOVIE_LIMIT=50000 TV_LIMIT=30000 \
 *   npx tsx scripts/tmdb-initial-crawl.ts
 *
 * 처리 흐름:
 *   1. tmdb_catalog에서 popularity 상위 MOVIE_LIMIT개 movie + TV_LIMIT개 tv select
 *   2. 이미 tmdb_metadata에 있는 것 제외 (idempotent: 중단 시 재실행 안전)
 *   3. TMDB detail + credits + providers 병렬 호출 (30 req/s)
 *   4. tmdb_metadata upsert (배치 500건)
 *   5. 진행 상황은 10분마다 stdout에 로그 (Actions logs에 누적)
 *
 * 예상 소요: 80,000 × 3 req ÷ 30 req/s ≈ 2.2시간
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const MOVIE_LIMIT = Number(process.env.MOVIE_LIMIT ?? "50000");
const TV_LIMIT = Number(process.env.TV_LIMIT ?? "30000");
const RATE_LIMIT_RPS = Number(process.env.TMDB_RATE_LIMIT_RPS ?? "30");

if (!SUPABASE_URL || !SERVICE_KEY || !TMDB_API_KEY) {
  console.error(
    "[tmdb-initial-crawl] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / TMDB_API_KEY 누락",
  );
  process.exit(1);
}

type MediaType = "movie" | "tv";

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
  providers: Array<{ name: string; logoUrl: string | null }> | null;
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
    `[tmdb-initial-crawl] 시작 ${startedAt.toISOString()} movie=${MOVIE_LIMIT} tv=${TV_LIMIT} rps=${RATE_LIMIT_RPS}`,
  );

  const movieIds = await pickTopFromCatalog(admin, "movie", MOVIE_LIMIT);
  const tvIds = await pickTopFromCatalog(admin, "tv", TV_LIMIT);
  const targets: Array<{ tmdb_id: number; media_type: MediaType }> = [
    ...movieIds.map((id) => ({ tmdb_id: id, media_type: "movie" as const })),
    ...tvIds.map((id) => ({ tmdb_id: id, media_type: "tv" as const })),
  ];

  console.log(
    `[tmdb-initial-crawl] 선정 ${targets.length}건 (movie ${movieIds.length} + tv ${tvIds.length})`,
  );

  // 이미 metadata에 있는 것 제외 (idempotent)
  const pending = await filterNotInMetadata(admin, targets);
  console.log(
    `[tmdb-initial-crawl] 이미 채워진 ${targets.length - pending.length}건 제외, 처리 대상 ${pending.length}건`,
  );

  const limiter = new RateLimiter(RATE_LIMIT_RPS);
  const CONCURRENCY = 10;
  let success = 0;
  let failed = 0;
  let metadataBatch: MetadataRow[] = [];
  let lastLogAt = Date.now();

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const chunk = pending.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (row) => {
        const now = new Date().toISOString();
        try {
          return await fetchMetadata(row, limiter, now);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            `[tmdb-initial-crawl] 실패 ${row.media_type}/${row.tmdb_id}: ${msg}`,
          );
          return null;
        }
      }),
    );

    for (const r of results) {
      if (r) {
        metadataBatch.push(r);
        success += 1;
      } else {
        failed += 1;
      }
    }

    if (metadataBatch.length >= 500) {
      await flushMetadata(admin, metadataBatch);
      metadataBatch = [];
    }

    // 10분마다 진행률 로그
    const nowMs = Date.now();
    if (nowMs - lastLogAt >= 10 * 60 * 1000) {
      const pctDone = ((i + chunk.length) / pending.length) * 100;
      const elapsedS = (nowMs - startedAt.getTime()) / 1000;
      const eta = Math.round((elapsedS / (i + chunk.length)) * (pending.length - i - chunk.length));
      console.log(
        `[tmdb-initial-crawl] 진행 ${(i + chunk.length).toLocaleString()}/${pending.length.toLocaleString()} (${pctDone.toFixed(1)}%) 성공=${success} 실패=${failed} ETA=${Math.round(eta / 60)}분`,
      );
      lastLogAt = nowMs;
    }
  }

  if (metadataBatch.length > 0) {
    await flushMetadata(admin, metadataBatch);
  }

  const durationMs = Date.now() - startedAt.getTime();
  console.log(
    `[tmdb-initial-crawl] 완료 duration=${Math.round(durationMs / 1000)}s 성공=${success} 실패=${failed}`,
  );
}

async function pickTopFromCatalog(
  admin: SupabaseClient,
  mediaType: MediaType,
  limit: number,
): Promise<number[]> {
  const { data, error } = await admin
    .from("tmdb_catalog")
    .select("tmdb_id")
    .eq("media_type", mediaType)
    .eq("deleted", false)
    .eq("adult", false)
    .order("popularity", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`catalog select 실패 (${mediaType}): ${error.message}`);
  return (data ?? []).map((r) => r.tmdb_id as number);
}

async function filterNotInMetadata(
  admin: SupabaseClient,
  targets: Array<{ tmdb_id: number; media_type: MediaType }>,
): Promise<Array<{ tmdb_id: number; media_type: MediaType }>> {
  // Supabase의 .in() 최대 2000개 단위로 청크
  const CHUNK = 2000;
  const existing = new Set<string>();

  for (const mediaType of ["movie", "tv"] as const) {
    const ids = targets.filter((t) => t.media_type === mediaType).map((t) => t.tmdb_id);
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data, error } = await admin
        .from("tmdb_metadata")
        .select("tmdb_id")
        .eq("media_type", mediaType)
        .in("tmdb_id", slice);
      if (error) throw new Error(`metadata 조회 실패: ${error.message}`);
      for (const r of data ?? []) existing.add(`${mediaType}:${r.tmdb_id}`);
    }
  }

  return targets.filter((t) => !existing.has(`${t.media_type}:${t.tmdb_id}`));
}

async function fetchMetadata(
  row: { tmdb_id: number; media_type: MediaType },
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
  row: { tmdb_id: number; media_type: MediaType },
  path: string,
  limiter: RateLimiter,
): Promise<Record<string, unknown>> {
  await limiter.acquire();
  const url = `https://api.themoviedb.org/3/${row.media_type}/${row.tmdb_id}${path}?api_key=${TMDB_API_KEY}&language=ko-KR`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 429) {
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
 * recommend.ts 호환성 반영 — bulk-crawl의 mapToMetadataRow와 동일.
 * 채택 시 scripts/lib/tmdb-fetch.ts로 공통 모듈 추출 권장.
 */
function mapToMetadataRow(
  row: { tmdb_id: number; media_type: MediaType },
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
    providers: extractKoreanProviders(providers),
    watch_link: extractWatchLink(providers),
    providers_fetched_at: now,
    fetched_at: now,
  };
}

function extractKoreanProviders(
  providers: Record<string, unknown>,
): Array<{ name: string; logoUrl: string | null }> | null {
  const kr = (providers.results as Record<string, unknown> | undefined)?.KR as
    | Record<string, unknown>
    | undefined;
  if (!kr) return null;
  const raw: Array<{ provider_name?: string; logo_path?: string | null }> = [
    ...((kr.flatrate as Array<unknown>) ?? []),
    ...((kr.rent as Array<unknown>) ?? []),
    ...((kr.buy as Array<unknown>) ?? []),
  ] as Array<{ provider_name?: string; logo_path?: string | null }>;
  const seen = new Set<string>();
  const result: Array<{ name: string; logoUrl: string | null }> = [];
  for (const p of raw) {
    if (!p.provider_name || seen.has(p.provider_name)) continue;
    seen.add(p.provider_name);
    result.push({
      name: p.provider_name,
      logoUrl: p.logo_path
        ? `https://image.tmdb.org/t/p/w92${p.logo_path}`
        : null,
    });
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
    console.error(`[tmdb-initial-crawl] metadata upsert 실패:`, error.message);
    throw error;
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
  console.error("[tmdb-initial-crawl] 치명적 오류:", err);
  process.exit(1);
});
