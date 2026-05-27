import { NextResponse } from "next/server";
import { posterUrl } from "@/lib/tmdb";

const TMDB_API_KEY = process.env.TMDB_API_KEY!;
const BASE = "https://api.themoviedb.org/3";

interface TMDBItem {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  vote_count?: number;
  release_date?: string;
  first_air_date?: string;
}

// 장르 ID → 다양한 취향 커버
const GENRE_POOLS = [
  { type: "movie", genre: 28, label: "액션" },
  { type: "movie", genre: 35, label: "코미디" },
  { type: "movie", genre: 18, label: "드라마" },
  { type: "movie", genre: 878, label: "SF" },
  { type: "movie", genre: 16, label: "애니메이션" },
  { type: "movie", genre: 53, label: "스릴러" },
  { type: "movie", genre: 10749, label: "로맨스" },
  { type: "movie", genre: 99, label: "다큐멘터리" },
  { type: "tv", genre: 18, label: "TV드라마" },
  { type: "tv", genre: 16, label: "TV애니" },
  { type: "tv", genre: 80, label: "범죄" },
  { type: "tv", genre: 10765, label: "SF&판타지" },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function GET() {
  // 랜덤으로 6개 장르 풀 선택
  const pools = shuffle(GENRE_POOLS).slice(0, 6);

  // 각 장르에서 랜덤 페이지의 인기작 2개씩 가져오기
  const fetches = pools.map(async (pool) => {
    const page = Math.floor(Math.random() * 5) + 1; // 1-5 페이지 랜덤
    const endpoint = pool.type === "tv" ? "discover/tv" : "discover/movie";
    const res = await fetch(
      `${BASE}/${endpoint}?api_key=${TMDB_API_KEY}&language=ko-KR&sort_by=vote_count.desc&vote_average.gte=6.5&with_genres=${pool.genre}&page=${page}`
    );
    const data = await res.json();
    const results: TMDBItem[] = (data.results ?? []).filter(
      (r: TMDBItem) => r.poster_path && (r.vote_count ?? 0) > 100
    );
    // 이 장르에서 랜덤 2개
    return shuffle(results).slice(0, 2).map((r: TMDBItem) => ({
      id: r.id,
      title: r.title ?? r.name,
      posterUrl: posterUrl(r.poster_path ?? null, "w200"),
      year: (r.release_date ?? r.first_air_date ?? "").slice(0, 4),
    }));
  });

  const allResults = await Promise.all(fetches);
  const items = shuffle(allResults.flat()).slice(0, 12);

  // 중복 제거
  const seen = new Set<number>();
  const unique = items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return NextResponse.json(unique);
}
