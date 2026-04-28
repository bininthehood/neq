/**
 * TMDB metadata 수집 공통 모듈.
 *
 * tmdb-bulk-crawl.ts (1시간 cron) + tmdb-initial-crawl.ts (workflow_dispatch 1회) 양쪽이
 * 공유하는 fetch / mapping / rate-limit 로직 통합.
 *
 * 각 스크립트는 자기 고유의 작업 (큐 pull/update vs catalog top picking)만 담당하고
 * detail/credits/providers 가져오는 부분 + Metadata row 변환은 본 모듈을 호출.
 *
 * 작성: 2026-04-28 (Day 19) — recommend.ts와 동일 구조 보장 + 중복 제거
 */

export type MediaType = "movie" | "tv";

export type MetadataRow = {
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
  providers:
    | Array<{
        name: string;
        logoUrl: string | null;
        category: "subscription" | "rent" | "buy";
      }>
    | null;
  watch_link: string | null;
  providers_fetched_at: string;
  fetched_at: string;
};

/** 30 req/s 같은 일정 페이스로 fetch 호출 직전 acquire. 단순한 token bucket-like 게이트. */
export class RateLimiter {
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

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * TMDB API GET. rate limit acquire 후 fetch. 429 + 5xx는 백오프 2s 후 재시도 1회.
 * 영구 실패는 throw (호출 측이 실패 처리).
 */
export async function tmdbGet(
  row: { tmdb_id: number; media_type: MediaType },
  path: string,
  limiter: RateLimiter,
  apiKey: string,
): Promise<Record<string, unknown>> {
  await limiter.acquire();
  const url = `https://api.themoviedb.org/3/${row.media_type}/${row.tmdb_id}${path}?api_key=${apiKey}&language=ko-KR`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000);
      const retry = await fetch(url);
      if (!retry.ok) throw new Error(`TMDB ${path || "/detail"} ${retry.status}`);
      return retry.json();
    }
    throw new Error(`TMDB ${path || "/detail"} ${res.status}`);
  }
  return res.json();
}

/** detail + credits + providers 병렬 호출 + MetadataRow 조립. */
export async function fetchMetadata(
  row: { tmdb_id: number; media_type: MediaType },
  limiter: RateLimiter,
  apiKey: string,
  now: string,
): Promise<MetadataRow> {
  const [detail, credits, providers] = await Promise.all([
    tmdbGet(row, "", limiter, apiKey),
    tmdbGet(row, "/credits", limiter, apiKey),
    tmdbGet(row, "/watch/providers", limiter, apiKey),
  ]);
  return mapToMetadataRow(row, detail, credits, providers, now);
}

/**
 * recommend.ts 호환성:
 * - director: job="Director" → department="Directing" 폴백
 * - runtime 시리즈: episode_run_time[0]
 * - providers: KR 평탄화 + dedup + category (구독>대여>구매 우선)
 * - poster_path/backdrop_path: 원본 path만 저장 (읽기 시 prefix 생성)
 */
export function mapToMetadataRow(
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
    title_en:
      (detail[isMovie ? "original_title" : "original_name"] as string) ?? null,
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

/**
 * TMDB /watch/providers 응답 → recommend.ts 기대 구조로 변환.
 * 입력: { results: { KR: { flatrate: [...], rent: [...], buy: [...], link } } }
 * 출력: Array<{name, logoUrl, category}> (구독 > 대여 > 구매 우선 dedup)
 */
export function extractKoreanProviders(
  providers: Record<string, unknown>,
): Array<{
  name: string;
  logoUrl: string | null;
  category: "subscription" | "rent" | "buy";
}> | null {
  const kr = (providers.results as Record<string, unknown> | undefined)?.KR as
    | Record<string, unknown>
    | undefined;
  if (!kr) return null;

  type RawProv = { provider_name?: string; logo_path?: string | null };
  const buckets: Array<{
    items: RawProv[];
    category: "subscription" | "rent" | "buy";
  }> = [
    {
      items: (kr.flatrate as RawProv[] | undefined) ?? [],
      category: "subscription",
    },
    { items: (kr.rent as RawProv[] | undefined) ?? [], category: "rent" },
    { items: (kr.buy as RawProv[] | undefined) ?? [], category: "buy" },
  ];

  const seen = new Set<string>();
  const result: Array<{
    name: string;
    logoUrl: string | null;
    category: "subscription" | "rent" | "buy";
  }> = [];
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

export function extractWatchLink(
  providers: Record<string, unknown>,
): string | null {
  const kr = (providers.results as Record<string, unknown> | undefined)?.KR as
    | Record<string, unknown>
    | undefined;
  return typeof kr?.link === "string" ? (kr.link as string) : null;
}
