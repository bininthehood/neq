import { NextRequest, NextResponse } from "next/server";
import {
  getDetails,
  getCredits,
  getKoreanProviders,
  posterUrl,
} from "@/lib/tmdb";
import type { Recommendation } from "@/lib/types";

/**
 * TMDB ID로 전체 Recommendation 객체 복원.
 * RecHistoryEntry (tmdbId/title/posterUrl만 있음) → Detail/Save용 풀 메타.
 *
 * GET /api/tmdb/hydrate?id=123&type=movie
 * type 없으면 movie 시도 → 실패 시 series 폴백.
 */
export async function GET(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get("id");
  const rawType = req.nextUrl.searchParams.get("type");

  const id = Number(idParam);
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: "id 필수" }, { status: 400 });
  }

  const requestedType: "movie" | "series" | null =
    rawType === "movie" || rawType === "series" ? rawType : null;

  const result = await hydrate(id, requestedType);
  if (!result) {
    return NextResponse.json({ error: "작품을 찾지 못했어요" }, { status: 404 });
  }
  return NextResponse.json(result);
}

async function hydrate(
  id: number,
  type: "movie" | "series" | null,
): Promise<Recommendation | null> {
  const TMDB = "https://api.themoviedb.org/3";
  const key = process.env.TMDB_API_KEY;

  const tryType = async (t: "movie" | "series"): Promise<Recommendation | null> => {
    const mediaType = t === "series" ? "tv" : "movie";
    try {
      const base = await fetch(
        `${TMDB}/${mediaType}/${id}?api_key=${key}&language=ko-KR`,
      );
      if (!base.ok) return null;
      const data = await base.json();
      if (!data?.id) return null;

      const [details, credits, providersRes] = await Promise.all([
        getDetails(id, t),
        getCredits(id, t),
        getKoreanProviders(id, t),
      ]);

      const title = t === "movie" ? data.title : data.name;
      const titleEn = t === "movie" ? data.original_title : data.original_name;
      const date =
        t === "movie" ? (data.release_date ?? "") : (data.first_air_date ?? "");

      return {
        title: title ?? "",
        titleEn: titleEn ?? "",
        type: t,
        reason: "",
        tmdbId: id,
        posterUrl: posterUrl(data.poster_path, "w500"),
        rating: data.vote_average ?? 0,
        date,
        overview: data.overview ?? "",
        providers: providersRes.providers,
        watchLink: null,
        director: credits.director,
        cast: credits.cast,
        directorMember: credits.directorMember,
        castMembers: credits.castMembers,
        runtime: details.runtime,
        seasons: details.seasons,
        country: details.country,
        backdrop: details.backdrop,
      };
    } catch {
      return null;
    }
  };

  if (type) {
    return tryType(type);
  }
  // type 미지정: movie → series 순서로 시도
  return (await tryType("movie")) ?? (await tryType("series"));
}
