import { NextRequest, NextResponse } from "next/server";
import { searchMulti, posterUrl } from "@/lib/tmdb";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  if (!query || query.length < 1) {
    return NextResponse.json([]);
  }

  const results = await searchMulti(query);
  return NextResponse.json(
    results.map((r) => ({
      id: r.id,
      title: r.title ?? r.name,
      posterUrl: posterUrl(r.poster_path, "w200"),
      year: (r.release_date ?? r.first_air_date ?? "").slice(0, 4),
      rating: r.vote_average,
    }))
  );
}
