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
    .filter((r: any) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, 6)
    .map((r: any) => ({
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
    country: data.production_countries?.map((c: any) => c.iso_3166_1) ?? data.origin_country ?? [],
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

  const director =
    (data.crew ?? []).find((c: any) => c.job === "Director")?.name ??
    (data.crew ?? []).find((c: any) => c.department === "Directing")?.name ??
    null;

  const cast = (data.cast ?? [])
    .slice(0, 4)
    .map((c: any) => c.name as string);

  return { director, cast };
}

export function posterUrl(path: string | null, size = "w500"): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
