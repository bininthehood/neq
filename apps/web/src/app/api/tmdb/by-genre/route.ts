import { NextResponse } from "next/server";
import { posterUrl } from "@/lib/tmdb";

const TMDB_API_KEY = process.env.TMDB_API_KEY!;
const BASE = "https://api.themoviedb.org/3";

interface TmdbMovieRow {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_count?: number;
  vote_average?: number;
}

/**
 * GET /api/tmdb/by-genre?genre=<tmdbMovieGenreId>
 *
 * Onboarding Taste 단계에서 선택된 장르별 인기 영화를 가져온다.
 * - sort: vote_count desc, vote_average >= 6.5
 * - filter: 포스터 있고 vote_count > 100 (안정성)
 * - limit: 12 (장르당 카로셀 카드 수)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const genreParam = searchParams.get("genre");
  const genreId = genreParam ? parseInt(genreParam, 10) : NaN;
  if (!Number.isFinite(genreId)) {
    return NextResponse.json({ error: "invalid genre" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${BASE}/discover/movie?api_key=${TMDB_API_KEY}&language=ko-KR&sort_by=vote_count.desc&vote_average.gte=6.5&with_genres=${genreId}&page=1`,
    );
    if (!res.ok) {
      return NextResponse.json([]);
    }
    const data = (await res.json()) as { results?: TmdbMovieRow[] };
    const items = (data.results ?? [])
      .filter((r) => r.poster_path && (r.vote_count ?? 0) > 100)
      .slice(0, 12)
      .map((r) => ({
        id: r.id,
        title: r.title ?? r.name ?? "",
        posterUrl: posterUrl(r.poster_path, "w200"),
        year: (r.release_date ?? r.first_air_date ?? "").slice(0, 4),
      }));
    return NextResponse.json(items);
  } catch {
    return NextResponse.json([]);
  }
}
