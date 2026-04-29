import { getTmdbApiKey } from "./env";

// 모듈 평가 시 1회만 평가. tmdb.ts 사용처는 모두 server-side
// (API routes / Server Components) 라 안전.
const API_KEY = getTmdbApiKey();
import type { TMDBResult } from "./types";

const BASE = "https://api.themoviedb.org/3";

export async function searchTMDB(
  title: string,
  type: "movie" | "series"
): Promise<TMDBResult | null> {
  const mediaType = type === "series" ? "tv" : "movie";

  // 한글 검색
  let res = await fetch(
    `${BASE}/search/${mediaType}?api_key=${API_KEY}&query=${encodeURIComponent(title)}&language=ko-KR`
  );
  let data = await res.json();
  if (data.results?.length > 0) return data.results[0];

  // 영문 폴백
  res = await fetch(
    `${BASE}/search/${mediaType}?api_key=${API_KEY}&query=${encodeURIComponent(title)}&language=en-US`
  );
  data = await res.json();
  if (data.results?.length > 0) {
    const enResult = data.results[0];
    // 영문으로 찾은 경우 한글 제목을 다시 가져옴
    const krRes = await fetch(
      `${BASE}/${mediaType}/${enResult.id}?api_key=${API_KEY}&language=ko-KR`
    );
    const krData = await krRes.json();
    return {
      ...enResult,
      title: krData.title ?? krData.name ?? enResult.title ?? enResult.name,
      name: krData.name ?? krData.title ?? enResult.name ?? enResult.title,
      overview: krData.overview || enResult.overview,
    };
  }
  return null;
}

export async function searchMulti(query: string): Promise<TMDBResult[]> {
  const res = await fetch(
    `${BASE}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=ko-KR`
  );
  const data = await res.json();
  return (data.results ?? [])
    .filter((r: TMDBResult & { media_type?: string }) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, 6)
    .map((r: TMDBResult) => ({
      ...r,
      title: r.title ?? r.name,
    }));
}

/**
 * search/multi 의 person 결과 raw shape. known_for 는 movie/tv 작품 배열.
 * TMDB 가 자동으로 채워주므로 추가 API 호출 불필요.
 */
export interface TMDBPersonRaw {
  id: number;
  name: string;
  media_type: "person";
  profile_path: string | null;
  known_for_department?: string;
  known_for?: Array<{
    id: number;
    media_type: "movie" | "tv";
    title?: string;
    name?: string;
    release_date?: string;
    first_air_date?: string;
    poster_path: string | null;
  }>;
}

export interface TMDBMultiGroupedRaw {
  works: TMDBResult[];                 // movie + tv (검색 순서 보존)
  persons: TMDBPersonRaw[];            // 모든 person (Directing/Acting 분리는 라우트 레이어 책임)
}

/**
 * search/multi 1회 호출로 작품 + 인물을 함께 가져온다 (grouped=1 응답용).
 *
 * - 작품(movie/tv): 기존 searchMulti 와 동일한 6개 cap 적용.
 * - 인물(person): 모든 결과 반환 (라우트에서 Directing/Acting 분류 후 cap).
 *
 * 추가 API 호출 0 — known_for / known_for_department / profile_path 모두 search/multi 응답에 포함.
 */
export async function searchMultiGrouped(query: string): Promise<TMDBMultiGroupedRaw> {
  const res = await fetch(
    `${BASE}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=ko-KR`
  );
  if (!res.ok) return { works: [], persons: [] };
  const data = await res.json();
  const all: Array<TMDBResult & { media_type?: string } | TMDBPersonRaw> = data.results ?? [];

  const works = all
    .filter((r): r is TMDBResult & { media_type?: string } =>
      (r as { media_type?: string }).media_type === "movie" ||
      (r as { media_type?: string }).media_type === "tv"
    )
    .slice(0, 6)
    .map((r) => ({ ...r, title: r.title ?? r.name }));

  const persons = all.filter((r): r is TMDBPersonRaw =>
    (r as { media_type?: string }).media_type === "person"
  );

  return { works, persons };
}

export interface ProviderInfo {
  name: string;
  type: "flatrate" | "rent" | "buy";
}

export async function getKoreanProviders(
  id: number,
  type: "movie" | "series"
): Promise<{ providers: { name: string; logoUrl: string | null; category?: 'subscription' | 'rent' | 'buy' }[]; watchLink: string | null }> {
  const mediaType = type === "series" ? "tv" : "movie";
  const res = await fetch(
    `${BASE}/${mediaType}/${id}/watch/providers?api_key=${API_KEY}`
  );
  const data = await res.json();
  const kr = data.results?.KR;
  if (!kr) return { providers: [], watchLink: null };

  // 구독(flatrate) > 대여(rent) > 구매(buy) 순서로 dedup. 같은 provider가 여러 카테고리에 있으면 가장 사용자 친화적인 것 채택
  type RawProv = { provider_name: string; logo_path: string | null };
  const buckets: Array<{ items: RawProv[]; category: 'subscription' | 'rent' | 'buy' }> = [
    { items: kr.flatrate ?? [], category: 'subscription' },
    { items: kr.rent ?? [], category: 'rent' },
    { items: kr.buy ?? [], category: 'buy' },
  ];
  const seen = new Set<string>();
  const providers: { name: string; logoUrl: string | null; category?: 'subscription' | 'rent' | 'buy' }[] = [];
  for (const { items, category } of buckets) {
    for (const p of items) {
      if (seen.has(p.provider_name)) continue;
      seen.add(p.provider_name);
      providers.push({
        name: p.provider_name,
        logoUrl: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
        category,
      });
    }
  }
  return { providers, watchLink: kr.link ?? null };
}

export async function getDetails(
  id: number,
  type: "movie" | "series"
): Promise<{ runtime: number | null; seasons: number | null; country: string[]; backdrop: string | null }> {
  const mediaType = type === "series" ? "tv" : "movie";
  const res = await fetch(
    `${BASE}/${mediaType}/${id}?api_key=${API_KEY}&language=ko-KR`
  );
  const data = await res.json();

  return {
    runtime: type === "movie" ? (data.runtime ?? null) : (data.episode_run_time?.[0] ?? null),
    seasons: type === "series" ? (data.number_of_seasons ?? null) : null,
    country: data.production_countries?.map((c: { iso_3166_1: string }) => c.iso_3166_1) ?? data.origin_country ?? [],
    backdrop: data.backdrop_path ? `https://image.tmdb.org/t/p/w780${data.backdrop_path}` : null,
  };
}

export async function getCredits(
  id: number,
  type: "movie" | "series"
): Promise<{ director: string | null; cast: string[] }> {
  const mediaType = type === "series" ? "tv" : "movie";
  const res = await fetch(
    `${BASE}/${mediaType}/${id}/credits?api_key=${API_KEY}&language=ko-KR`
  );
  const data = await res.json();

  interface CrewMember { name: string; job?: string; department?: string }
  interface CastMember { name: string }

  const director =
    (data.crew ?? []).find((c: CrewMember) => c.job === "Director")?.name ??
    (data.crew ?? []).find((c: CrewMember) => c.department === "Directing")?.name ??
    null;

  const cast = (data.cast ?? [])
    .slice(0, 4)
    .map((c: CastMember) => c.name);

  return { director, cast };
}

export function posterUrl(path: string | null, size = "w500"): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

/**
 * TMDB /recommendations — 특정 작품과 관련된 추천 작품 목록.
 * TMDB 자체의 평점/키워드/장르 기반 엔진 사용 (무료, 빠름).
 *
 * Hybrid 추천 아키텍처의 핵심: 사용자 취향 작품마다 호출해서 후보 풀을 만든 뒤
 * LLM으로 큐레이션한다. 매번 LLM 호출하던 기존 방식 대비 ~30배 빠름.
 */
export interface TMDBSimilarItem {
  id: number;
  title: string;
  original_title?: string;
  original_name?: string;
  media_type: "movie" | "tv";
  poster_path: string | null;
  vote_average: number;
  overview: string;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  popularity?: number;
}

/**
 * TMDB /discover — 장르 기반 작품 검색.
 * 크로스타입 추천 보충용 (영화 취향 → 시리즈 발견, 그 반대도).
 */
export async function discoverByGenres(
  genreIds: number[],
  type: "movie" | "series",
  page = 1,
  dateRange?: { gte?: string; lte?: string },
  sortBy: "vote_average.desc" | "vote_count.desc" | "popularity.desc" = "vote_average.desc"
): Promise<TMDBSimilarItem[]> {
  if (genreIds.length === 0) return [];
  const mediaType = type === "series" ? "tv" : "movie";
  const genres = genreIds.slice(0, 5).join("|"); // OR 조건 (,는 AND → 결과 0개 됨)
  const dateField = mediaType === "tv" ? "first_air_date" : "release_date";
  let dateParams = "";
  if (dateRange?.gte) dateParams += `&${dateField}.gte=${dateRange.gte}`;
  if (dateRange?.lte) dateParams += `&${dateField}.lte=${dateRange.lte}`;
  try {
    const res = await fetch(
      `${BASE}/discover/${mediaType}?api_key=${API_KEY}&language=ko-KR&with_genres=${genres}&sort_by=${sortBy}&vote_count.gte=100&page=${page}${dateParams}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as number,
      title: (r.title ?? r.name) as string,
      original_title: r.original_title as string | undefined,
      original_name: r.original_name as string | undefined,
      media_type: mediaType as "movie" | "tv",
      poster_path: (r.poster_path as string | null) ?? null,
      vote_average: (r.vote_average as number) ?? 0,
      overview: (r.overview as string) ?? "",
      release_date: r.release_date as string | undefined,
      first_air_date: r.first_air_date as string | undefined,
      genre_ids: (r.genre_ids as number[]) ?? [],
      popularity: r.popularity as number | undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * TMDB /trending — 이번 주 인기 작품 (movie + tv 혼합).
 * Cold start (favorites 없음) 시 LLM 스킵하고 즉시 카드 반환용.
 */
export async function getTrending(
  timeWindow: "day" | "week" = "week",
  page = 1
): Promise<TMDBSimilarItem[]> {
  try {
    const res = await fetch(
      `${BASE}/trending/all/${timeWindow}?api_key=${API_KEY}&language=ko-KR&page=${page}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results ?? [])
      .filter((r: Record<string, unknown>) => r.media_type === "movie" || r.media_type === "tv")
      .map((r: Record<string, unknown>) => ({
        id: r.id as number,
        title: (r.title ?? r.name) as string,
        original_title: r.original_title as string | undefined,
        original_name: r.original_name as string | undefined,
        media_type: r.media_type as "movie" | "tv",
        poster_path: (r.poster_path as string | null) ?? null,
        vote_average: (r.vote_average as number) ?? 0,
        overview: (r.overview as string) ?? "",
        release_date: r.release_date as string | undefined,
        first_air_date: r.first_air_date as string | undefined,
        genre_ids: (r.genre_ids as number[]) ?? [],
        popularity: r.popularity as number | undefined,
      }));
  } catch {
    return [];
  }
}

/**
 * TMDB /collection/{id} — 시리즈/프랜차이즈 (반지의 제왕, 스타워즈 등) 작품 묶음.
 *
 * /movie/{id} 응답의 `belongs_to_collection.id` 가 있을 때만 의미 있음.
 * series(tv) 의 경우 TMDB 가 collection 개념을 제공하지 않으므로 호출처에서 movie 만 사용.
 *
 * 빈 결과/실패 시 null 반환 → DetailSheet 가 섹션 숨김 처리.
 */
export interface TMDBCollectionResponse {
  id: number;
  name: string;
  parts: TMDBSimilarItem[];
}

export async function getCollection(
  collectionId: number,
): Promise<TMDBCollectionResponse | null> {
  if (!collectionId || Number.isNaN(collectionId)) return null;
  try {
    const res = await fetch(
      `${BASE}/collection/${collectionId}?api_key=${API_KEY}&language=ko-KR`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.id) return null;
    const parts: TMDBSimilarItem[] = (data.parts ?? []).map(
      (r: Record<string, unknown>) => ({
        id: r.id as number,
        title: (r.title ?? r.name) as string,
        original_title: r.original_title as string | undefined,
        original_name: r.original_name as string | undefined,
        // collection.parts 는 movie 전용
        media_type: 'movie' as const,
        poster_path: (r.poster_path as string | null) ?? null,
        vote_average: (r.vote_average as number) ?? 0,
        overview: (r.overview as string) ?? '',
        release_date: r.release_date as string | undefined,
        first_air_date: r.first_air_date as string | undefined,
        genre_ids: (r.genre_ids as number[]) ?? [],
        popularity: r.popularity as number | undefined,
      }),
    );
    return {
      id: data.id as number,
      name: (data.name as string) ?? '',
      parts,
    };
  } catch {
    return null;
  }
}

/**
 * TMDB /person/{id}/movie_credits 또는 /tv_credits — 인물의 출연·연출 작품.
 *
 * 감독 다른 작품을 얻기 위해 type='movie' 시 crew 에서 job==='Director' 만 필터링한다.
 * series 도 동일 패턴 가능하지만 본 사용처(F3)는 detail 의 director 와 매칭하므로 type 일치.
 *
 * popularity desc 정렬은 호출처에서 처리.
 */
export interface TMDBPersonCreditsResponse {
  id: number;
  cast: TMDBSimilarItem[];
  crew: (TMDBSimilarItem & { job?: string; department?: string })[];
}

export async function getPersonCredits(
  personId: number,
  type: 'movie' | 'series',
): Promise<TMDBPersonCreditsResponse | null> {
  if (!personId || Number.isNaN(personId)) return null;
  const endpoint = type === 'series' ? 'tv_credits' : 'movie_credits';
  const mediaType = type === 'series' ? 'tv' : 'movie';
  try {
    const res = await fetch(
      `${BASE}/person/${personId}/${endpoint}?api_key=${API_KEY}&language=ko-KR`,
    );
    if (!res.ok) return null;
    const data = await res.json();

    const map = (r: Record<string, unknown>): TMDBSimilarItem => ({
      id: r.id as number,
      title: (r.title ?? r.name) as string,
      original_title: r.original_title as string | undefined,
      original_name: r.original_name as string | undefined,
      media_type: mediaType as 'movie' | 'tv',
      poster_path: (r.poster_path as string | null) ?? null,
      vote_average: (r.vote_average as number) ?? 0,
      overview: (r.overview as string) ?? '',
      release_date: r.release_date as string | undefined,
      first_air_date: r.first_air_date as string | undefined,
      genre_ids: (r.genre_ids as number[]) ?? [],
      popularity: r.popularity as number | undefined,
    });

    return {
      id: personId,
      cast: (data.cast ?? []).map(map),
      crew: (data.crew ?? []).map((r: Record<string, unknown>) => ({
        ...map(r),
        job: (r.job as string | undefined) ?? undefined,
        department: (r.department as string | undefined) ?? undefined,
      })),
    };
  } catch {
    return null;
  }
}

/**
 * 작품의 belongs_to_collection.id + 감독 person id 를 한 번에 가져온다.
 * /api/tmdb/related route 가 사용 — collection lookup 과 person credits 호출의 사전 단계.
 *
 * - movie 만 belongs_to_collection 지원 (TMDB 한계).
 * - 감독 식별: /credits 의 crew[job=Director] 또는 department=Directing 첫 번째.
 * - 결과 없으면 collectionId/personId 가 null 인 객체 반환.
 */
export async function getRelatedSeeds(
  tmdbId: number,
  type: 'movie' | 'series',
): Promise<{
  collectionId: number | null;
  directorId: number | null;
  directorName: string | null;
}> {
  const mediaType = type === 'series' ? 'tv' : 'movie';
  try {
    const [detailRes, creditsRes] = await Promise.all([
      fetch(`${BASE}/${mediaType}/${tmdbId}?api_key=${API_KEY}&language=ko-KR`),
      fetch(`${BASE}/${mediaType}/${tmdbId}/credits?api_key=${API_KEY}&language=ko-KR`),
    ]);
    if (!detailRes.ok && !creditsRes.ok) {
      return { collectionId: null, directorId: null, directorName: null };
    }
    const detailData = detailRes.ok ? await detailRes.json() : null;
    const creditsData = creditsRes.ok ? await creditsRes.json() : null;

    const collectionId =
      type === 'movie' ? (detailData?.belongs_to_collection?.id as number | undefined) ?? null : null;

    interface CrewMember { id: number; name: string; job?: string; department?: string }
    const crew: CrewMember[] = creditsData?.crew ?? [];
    const director =
      crew.find((c) => c.job === 'Director') ??
      crew.find((c) => c.department === 'Directing') ??
      null;

    return {
      collectionId: collectionId ?? null,
      directorId: director?.id ?? null,
      directorName: director?.name ?? null,
    };
  } catch {
    return { collectionId: null, directorId: null, directorName: null };
  }
}

export async function getTMDBRecommendations(
  tmdbId: number,
  type: "movie" | "series"
): Promise<TMDBSimilarItem[]> {
  const mediaType = type === "series" ? "tv" : "movie";
  try {
    const res = await fetch(
      `${BASE}/${mediaType}/${tmdbId}/recommendations?api_key=${API_KEY}&language=ko-KR&page=1`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const results = data.results ?? [];
    return results.map((r: Record<string, unknown>) => ({
      id: r.id as number,
      title: (r.title ?? r.name) as string,
      original_title: r.original_title as string | undefined,
      original_name: r.original_name as string | undefined,
      media_type: mediaType as "movie" | "tv",
      poster_path: (r.poster_path as string | null) ?? null,
      vote_average: (r.vote_average as number) ?? 0,
      overview: (r.overview as string) ?? "",
      release_date: r.release_date as string | undefined,
      first_air_date: r.first_air_date as string | undefined,
      genre_ids: (r.genre_ids as number[]) ?? [],
      popularity: r.popularity as number | undefined,
    }));
  } catch {
    return [];
  }
}
