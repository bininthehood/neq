import type { TMDBResult } from "./types";

const API_KEY = process.env.TMDB_API_KEY!;
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
  return data.results?.[0] ?? null;
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

export async function getKoreanProviders(
  id: number,
  type: "movie" | "series"
): Promise<string[]> {
  const mediaType = type === "series" ? "tv" : "movie";
  const res = await fetch(
    `${BASE}/${mediaType}/${id}/watch/providers?api_key=${API_KEY}`
  );
  const data = await res.json();
  const kr = data.results?.KR;
  if (!kr) return [];

  const providers: Array<{ provider_name: string }> = [
    ...(kr.flatrate ?? []),
    ...(kr.rent ?? []),
    ...(kr.buy ?? []),
  ];
  return [...new Set(providers.map((p) => p.provider_name))];
}

export function posterUrl(path: string | null, size = "w500"): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
