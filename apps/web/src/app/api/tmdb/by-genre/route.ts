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
 * GET /api/tmdb/by-genre?genre=<tmdbMovieGenreId>&page=<N>
 *
 * Onboarding Taste 단계에서 선택된 장르별 인기 영화를 가져온다.
 * - sort: vote_count desc, vote_average >= 6.5
 * - filter: 포스터 있고 vote_count > 100 (안정성)
 * - page: TMDB discover page 직패스 (1..). 기본 1
 *
 * 2026-05-29 — 온보딩 무한 스크롤 지원.
 *  - page 미지정 시 (legacy 호출): 기존 12개 배열 그대로 (PWA 호환 유지)
 *  - page 명시 시: { items, page, hasMore } 객체 반환 (최대 10페이지 = 200개)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const genreParam = searchParams.get("genre");
  const pageParam = searchParams.get("page");
  const genreId = genreParam ? parseInt(genreParam, 10) : NaN;
  if (!Number.isFinite(genreId)) {
    return NextResponse.json({ error: "invalid genre" }, { status: 400 });
  }
  const wantsPaged = pageParam !== null;
  const page = wantsPaged ? Math.max(1, parseInt(pageParam!, 10) || 1) : 1;

  try {
    const res = await fetch(
      `${BASE}/discover/movie?api_key=${TMDB_API_KEY}&language=ko-KR&sort_by=vote_count.desc&vote_average.gte=6.5&with_genres=${genreId}&page=${page}`,
    );
    if (!res.ok) {
      return NextResponse.json(wantsPaged ? { items: [], page, hasMore: false } : []);
    }
    const data = (await res.json()) as {
      results?: TmdbMovieRow[];
      total_pages?: number;
    };
    const items = (data.results ?? [])
      .filter((r) => r.poster_path && (r.vote_count ?? 0) > 100)
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        title: r.title ?? r.name ?? "",
        posterUrl: posterUrl(r.poster_path, "w200"),
        year: (r.release_date ?? r.first_air_date ?? "").slice(0, 4),
      }));
    if (wantsPaged) {
      const totalPages = Math.min(data.total_pages ?? 1, 10);
      return NextResponse.json({ items, page, hasMore: page < totalPages });
    }
    return NextResponse.json(items.slice(0, 12));
  } catch {
    return NextResponse.json(wantsPaged ? { items: [], page, hasMore: false } : []);
  }
}
