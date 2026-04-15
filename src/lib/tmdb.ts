import { TMDB_API_KEY as API_KEY } from "./env";
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

export interface ProviderInfo {
  name: string;
  type: "flatrate" | "rent" | "buy";
}

export async function getKoreanProviders(
  id: number,
  type: "movie" | "series"
): Promise<{ providers: { name: string; logoUrl: string | null }[]; watchLink: string | null }> {
  const mediaType = type === "series" ? "tv" : "movie";
  const res = await fetch(
    `${BASE}/${mediaType}/${id}/watch/providers?api_key=${API_KEY}`
  );
  const data = await res.json();
  const kr = data.results?.KR;
  if (!kr) return { providers: [], watchLink: null };

  const raw: Array<{ provider_name: string; logo_path: string | null }> = [
    ...(kr.flatrate ?? []),
    ...(kr.rent ?? []),
    ...(kr.buy ?? []),
  ];
  const seen = new Set<string>();
  const providers: { name: string; logoUrl: string | null }[] = [];
  for (const p of raw) {
    if (seen.has(p.provider_name)) continue;
    seen.add(p.provider_name);
    providers.push({
      name: p.provider_name,
      logoUrl: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
    });
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
