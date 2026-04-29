/**
 * new-release helper.
 *
 * notification-triggers-detail.md §2 의 4 가지 트리거 후보 추출 + 매력도 통합 로직.
 *
 *  Trigger A — saved 시리즈 새 시즌 (TMDB tv/{id})
 *  Trigger B — favorites 감독 신작 (person/{id}/movie_credits + tv_credits)
 *  Trigger C — favorites 배우 신작 (B 와 동일 endpoint, role='actor')
 *  Trigger D — 구독 OTT 신작 (discover/{movie|tv})
 *
 * 책임 분리:
 *  - 본 모듈 = 순수 함수 (mapper / fetch wrapper / 매력도 계산). DB I/O 없음.
 *  - cron route = orchestration (Supabase 조회/저장, 동시성, 응답).
 *
 * 사용자 결정 (Q1, Q2):
 *  - 시즌 0 (스페셜/번외) 제외
 *  - 매력도 = 0.5 * vote_average/10 + 0.5 * popularity_norm
 *    (popularity_norm = log10(popularity + 1) / 3, 1.0 cap)
 *
 * 통합 우선순위 (동률 시): A > B > C > D
 */

import {
  RateLimiter,
  mapWithConcurrency,
  sleep,
  type MediaType,
} from "./providers-helpers";

export { RateLimiter, mapWithConcurrency };
export type { MediaType };

export type TriggerKind = "A_season" | "B_director" | "C_actor" | "D_provider";

/** 통합 비교용 후보 — 작품 1편을 가리킴. */
export interface NewReleaseCandidate {
  trigger: TriggerKind;
  /** payload tmdb_id (작품) */
  tmdbId: number;
  mediaType: MediaType;
  /** 알림 텍스트 + URL 구성용 */
  title: string;
  /** 포스터 (TMDB poster_path 풀 URL 또는 null) */
  posterUrl: string | null;
  /** TMDB vote_average (0~10). 모르면 0. */
  voteAverage: number;
  /** TMDB popularity (long-tail). 모르면 0. */
  popularity: number;
  /** ISO date — release_date | first_air_date | air_date */
  releaseDate: string | null;
  /** B/C 트리거에서 person_id cooldown 키로 사용 */
  personId?: number;
  personName?: string;
  /** A 트리거 시즌 번호 — 알림 텍스트용 */
  seasonNumber?: number;
}

/**
 * popularity 정규화. TMDB popularity 는 0~수백 범위 (long-tail).
 *  log10(p+1)/3 → p=10 ≈ 0.34, p=100 ≈ 0.67, p=1000 ≈ 1.0
 *  1.0 초과는 cap.
 */
export function normalizePopularity(p: number): number {
  if (!Number.isFinite(p) || p <= 0) return 0;
  const v = Math.log10(p + 1) / 3;
  return Math.min(Math.max(v, 0), 1);
}

/**
 * 매력도 점수 — 사용자 결정 (Q2): 0.5 * vote_average/10 + 0.5 * popularity_norm.
 * 두 신호 다 0 이면 0 반환 (후보 자체는 살아있음).
 */
export function attractivenessScore(c: NewReleaseCandidate): number {
  const va = Math.max(0, Math.min(c.voteAverage, 10)) / 10;
  const pn = normalizePopularity(c.popularity);
  return 0.5 * va + 0.5 * pn;
}

/**
 * 사용자별 후보들 중 "최종 1건" 선택.
 *  1) trigger 우선순위: A > B > C > D
 *  2) 동일 우선순위 내 매력도 점수 desc
 *  3) 추가 동률 시 release_date desc (최신 우선)
 */
const TRIGGER_PRIORITY: Record<TriggerKind, number> = {
  A_season: 0,
  B_director: 1,
  C_actor: 2,
  D_provider: 3,
};

export function pickTopCandidate(
  candidates: NewReleaseCandidate[],
): NewReleaseCandidate | null {
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestScore = attractivenessScore(best);
  for (let i = 1; i < candidates.length; i += 1) {
    const c = candidates[i];
    const cScore = attractivenessScore(c);
    if (compareCandidate(c, cScore, best, bestScore) < 0) {
      best = c;
      bestScore = cScore;
    }
  }
  return best;
}

function compareCandidate(
  a: NewReleaseCandidate,
  aScore: number,
  b: NewReleaseCandidate,
  bScore: number,
): number {
  const ap = TRIGGER_PRIORITY[a.trigger];
  const bp = TRIGGER_PRIORITY[b.trigger];
  if (ap !== bp) return ap - bp;
  if (aScore !== bScore) return bScore - aScore;
  // release_date desc (최신 우선). null 은 가장 낮음.
  const ad = a.releaseDate ?? "";
  const bd = b.releaseDate ?? "";
  if (ad !== bd) return bd.localeCompare(ad);
  return 0;
}

// ─────────────────────────────────────────────────────────────────
// TMDB fetch wrappers — 패턴은 providers-helpers.tmdbWatchProviders 동일
// ─────────────────────────────────────────────────────────────────

async function tmdbGetJson(
  url: string,
  limiter: RateLimiter,
  fetchImpl: typeof fetch,
  label: string,
): Promise<Record<string, unknown>> {
  await limiter.acquire();
  const res = await fetchImpl(url);
  if (!res.ok) {
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000);
      const retry = await fetchImpl(url);
      if (!retry.ok) {
        throw new Error(`TMDB ${label}: ${retry.status}`);
      }
      return retry.json() as Promise<Record<string, unknown>>;
    }
    throw new Error(`TMDB ${label}: ${res.status}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

/**
 * GET tv/{id} — seasons 정보 포함. 미러에 seasons 가 없을 때 fallback.
 *  language=ko-KR (공식 한글 제목 우선)
 */
export async function tmdbTvDetails(
  tmdbId: number,
  apiKey: string,
  limiter: RateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const url = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${apiKey}&language=ko-KR`;
  return tmdbGetJson(url, limiter, fetchImpl, `tv/${tmdbId}`);
}

/**
 * GET person/{id}/{movie|tv}_credits — 작품 리스트.
 *  language=ko-KR.
 */
export async function tmdbPersonCredits(
  personId: number,
  mediaType: MediaType,
  apiKey: string,
  limiter: RateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const endpoint = mediaType === "movie" ? "movie_credits" : "tv_credits";
  const url = `https://api.themoviedb.org/3/person/${personId}/${endpoint}?api_key=${apiKey}&language=ko-KR`;
  return tmdbGetJson(url, limiter, fetchImpl, `person/${personId}/${endpoint}`);
}

/**
 * GET discover/{movie|tv}?with_watch_providers=...&watch_region=KR&primary_release_date.gte=...
 *  Trigger D — provider 신작. 필터:
 *   - watch_region=KR
 *   - movie : primary_release_date.gte={dateGteIso}
 *   - tv    : first_air_date.gte={dateGteIso}
 *  page=1 만 사용 (popularity 상위만).
 */
export async function tmdbDiscoverByProvider(
  providerId: number,
  mediaType: MediaType,
  dateGteIso: string,
  apiKey: string,
  limiter: RateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const dateKey =
    mediaType === "movie" ? "primary_release_date.gte" : "first_air_date.gte";
  const url =
    `https://api.themoviedb.org/3/discover/${mediaType}?api_key=${apiKey}` +
    `&language=ko-KR&watch_region=KR&with_watch_providers=${providerId}` +
    `&${dateKey}=${dateGteIso}&sort_by=popularity.desc&page=1`;
  return tmdbGetJson(url, limiter, fetchImpl, `discover/${mediaType}/${providerId}`);
}

// ─────────────────────────────────────────────────────────────────
// Pure mappers — TMDB 응답 → NewReleaseCandidate 추출
// ─────────────────────────────────────────────────────────────────

/** poster_path → 풀 URL (없으면 null). w500 기본. */
export function posterUrlFromPath(path: string | null | undefined): string | null {
  if (!path || typeof path !== "string") return null;
  return `https://image.tmdb.org/t/p/w500${path}`;
}

/**
 * tv/{id} 응답 → 신규 시즌 후보.
 *  - season_number > 0 (시즌 0 = 스페셜 제외, Q1 결정)
 *  - air_date > sinceIso
 *  - air_date null 시 drop (정보 부족)
 *
 *  매력도는 시리즈 본체 vote_average / popularity 사용 (시즌별 점수 X).
 */
export function extractNewSeasonCandidates(
  tv: Record<string, unknown> | null | undefined,
  sinceIso: string,
): NewReleaseCandidate[] {
  if (!tv) return [];
  const tmdbId = (tv.id as number | undefined) ?? 0;
  if (!tmdbId) return [];

  const seasons = (tv.seasons ?? []) as Array<{
    season_number?: number;
    air_date?: string | null;
    name?: string;
  }>;
  if (!Array.isArray(seasons) || seasons.length === 0) return [];

  const title =
    (tv.name as string | undefined) ??
    (tv.original_name as string | undefined) ??
    "";
  const voteAverage = (tv.vote_average as number | undefined) ?? 0;
  const popularity = (tv.popularity as number | undefined) ?? 0;
  const posterPath = (tv.poster_path as string | null | undefined) ?? null;

  const out: NewReleaseCandidate[] = [];
  for (const s of seasons) {
    const sn = s.season_number;
    if (typeof sn !== "number" || sn <= 0) continue; // Q1: 시즌 0 제외
    if (!s.air_date || typeof s.air_date !== "string") continue;
    if (s.air_date <= sinceIso) continue;

    out.push({
      trigger: "A_season",
      tmdbId,
      mediaType: "tv",
      title: title.length > 0 ? title : `시리즈 ${tmdbId}`,
      posterUrl: posterUrlFromPath(posterPath),
      voteAverage,
      popularity,
      releaseDate: s.air_date,
      seasonNumber: sn,
    });
  }
  return out;
}

/**
 * person/{id}/{movie|tv}_credits 응답 → 신작 후보 (B/C).
 *  - release_date > sinceIso (movie: release_date, tv: first_air_date)
 *  - 본인 출연/연출 작품 모두 cast/crew 양쪽 사용
 *  - role='director' 인 경우 crew.job==='Director' 만, 그 외(actor) 는 cast 사용
 *  - release_date null 인 작품 (예정작) 은 drop
 */
export function extractPersonNewWorks(
  credits: Record<string, unknown> | null | undefined,
  personId: number,
  personName: string,
  mediaType: MediaType,
  role: "director" | "actor",
  sinceIso: string,
): NewReleaseCandidate[] {
  if (!credits) return [];

  const dateKey = mediaType === "movie" ? "release_date" : "first_air_date";
  const titleKey = mediaType === "movie" ? "title" : "name";

  const items: Array<Record<string, unknown>> =
    role === "director"
      ? ((credits.crew ?? []) as Array<Record<string, unknown>>).filter(
          (c) =>
            c.job === "Director" ||
            (typeof c.department === "string" && c.department === "Directing" && c.job !== "Editor"),
        )
      : ((credits.cast ?? []) as Array<Record<string, unknown>>);

  const seen = new Set<number>(); // 한 사람의 동일 작품 dedup
  const out: NewReleaseCandidate[] = [];
  for (const it of items) {
    const id = it.id as number | undefined;
    if (typeof id !== "number") continue;
    if (seen.has(id)) continue;
    seen.add(id);

    const date = it[dateKey] as string | null | undefined;
    if (!date || typeof date !== "string" || date <= sinceIso) continue;

    out.push({
      trigger: role === "director" ? "B_director" : "C_actor",
      tmdbId: id,
      mediaType,
      title: ((it[titleKey] as string | undefined) ?? "").trim() || `작품 ${id}`,
      posterUrl: posterUrlFromPath(it.poster_path as string | null | undefined),
      voteAverage: (it.vote_average as number | undefined) ?? 0,
      popularity: (it.popularity as number | undefined) ?? 0,
      releaseDate: date,
      personId,
      personName,
    });
  }
  return out;
}

/**
 * discover 응답 → provider 신작 후보 (Trigger D).
 *  results 배열 상위 N 만 사용 (popularity desc 이라 자연스러움).
 *  본 함수는 변환만, 사용자 매칭은 cron 측에서.
 */
export function extractDiscoverCandidates(
  raw: Record<string, unknown> | null | undefined,
  mediaType: MediaType,
  topN = 5,
): NewReleaseCandidate[] {
  if (!raw) return [];
  const results = (raw.results ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(results) || results.length === 0) return [];

  const titleKey = mediaType === "movie" ? "title" : "name";
  const dateKey = mediaType === "movie" ? "release_date" : "first_air_date";

  return results.slice(0, topN).flatMap((r) => {
    const id = r.id as number | undefined;
    if (typeof id !== "number") return [];
    const date = r[dateKey] as string | null | undefined;
    return [
      {
        trigger: "D_provider" as const,
        tmdbId: id,
        mediaType,
        title: ((r[titleKey] as string | undefined) ?? "").trim() || `작품 ${id}`,
        posterUrl: posterUrlFromPath(r.poster_path as string | null | undefined),
        voteAverage: (r.vote_average as number | undefined) ?? 0,
        popularity: (r.popularity as number | undefined) ?? 0,
        releaseDate: typeof date === "string" ? date : null,
      },
    ];
  });
}

/**
 * 후보 → 푸시 페이로드 텍스트 구성. trigger 별 다른 톤.
 *  - A_season: "OO 새 시즌"
 *  - B_director: "박찬욱 감독 신작"
 *  - C_actor: "송강호 출연작"
 *  - D_provider: "넷플릭스 신작"
 */
export function buildPayloadText(
  c: NewReleaseCandidate,
  providerNameKr?: string,
): { title: string; body: string } {
  switch (c.trigger) {
    case "A_season":
      return {
        title: `${c.title} 새 시즌`,
        body: c.seasonNumber
          ? `시즌 ${c.seasonNumber} 공개. 다시 만나볼까요?`
          : `새 시즌이 공개됐어요`,
      };
    case "B_director":
      return {
        title: `${c.personName ?? "감독"} 감독 신작`,
        body: `「${c.title}」 미리 저장하시겠어요?`,
      };
    case "C_actor":
      return {
        title: `${c.personName ?? "배우"} 출연작`,
        body: `「${c.title}」 새로 공개됐어요`,
      };
    case "D_provider":
      return {
        title: providerNameKr ? `${providerNameKr} 신작` : "구독 OTT 신작",
        body: `「${c.title}」 추천드려요`,
      };
  }
}

/** YYYY-MM-DD UTC. now=undefined 면 현재 시각 기준 어제. */
export function yesterdayIsoDate(now = new Date()): string {
  return new Date(now.getTime() - 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
}
