import { NextResponse } from "next/server";
import { posterUrl } from "@/lib/tmdb";

const TMDB_API_KEY = process.env.TMDB_API_KEY!;

export async function GET() {
  const res = await fetch(
    `https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_API_KEY}&language=ko-KR`
  );
  const data = await res.json();

  const items = (data.results ?? [])
    .filter((r: any) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, 20)
    // 셔플
    .sort(() => Math.random() - 0.5)
    .slice(0, 12)
    .map((r: any) => ({
      id: r.id,
      title: r.title ?? r.name,
      posterUrl: posterUrl(r.poster_path, "w200"),
      year: (r.release_date ?? r.first_air_date ?? "").slice(0, 4),
    }));

  return NextResponse.json(items);
}
