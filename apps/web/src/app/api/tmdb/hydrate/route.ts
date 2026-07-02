import { NextRequest, NextResponse } from "next/server";
import {
  getDetails,
  getCredits,
  getKoreanProviders,
  filterWatchProviders,
  posterUrl,
} from "@/lib/tmdb";
import type { Recommendation } from "@/lib/types";
import { VARIETY_GENRE_IDS } from "@/lib/discover-types";

/**
 * TMDB ID로 전체 Recommendation 객체 복원.
 * RecHistoryEntry (tmdbId/title/posterUrl만 있음) → Detail/Save용 풀 메타.
 *
 * GET /api/tmdb/hydrate?id=123&type=movie|series|variety
 *  - variety 는 TMDB 에서 TV 로 fetch (TMDB media_type 미지원). genre_ids 가
 *    Reality(10764)/Talk(10767) 이면 응답에 variety 보존.
 *  - type 없으면 movie 시도 → 실패 시 series 폴백.
 */
export async function GET(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get("id");
  const rawType = req.nextUrl.searchParams.get("type");

  const id = Number(idParam);
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: "id 필수" }, { status: 400 });
  }

  const requestedType: "movie" | "series" | "variety" | null =
    rawType === "movie" || rawType === "series" || rawType === "variety"
      ? rawType
      : null;

  const result = await hydrate(id, requestedType);
  if (!result) {
    return NextResponse.json({ error: "작품을 찾지 못했어요" }, { status: 404 });
  }
  return NextResponse.json(result);
}

async function hydrate(
  id: number,
  requestedDisplayType: "movie" | "series" | "variety" | null,
): Promise<Recommendation | null> {
  const TMDB = "https://api.themoviedb.org/3";
  const key = process.env.TMDB_API_KEY;

  // tmdbType: TMDB API 호출용 ('movie' | 'series'). variety 는 TV 로 fetch.
  const tryType = async (
    tmdbType: "movie" | "series",
  ): Promise<Recommendation | null> => {
    const mediaType = tmdbType === "series" ? "tv" : "movie";
    try {
      const base = await fetch(
        `${TMDB}/${mediaType}/${id}?api_key=${key}&language=ko-KR`,
      );
      if (!base.ok) return null;
      const data = await base.json();
      if (!data?.id) return null;

      const [details, credits, providersRes] = await Promise.all([
        getDetails(id, tmdbType),
        getCredits(id, tmdbType),
        getKoreanProviders(id, tmdbType),
      ]);

      const title = tmdbType === "movie" ? data.title : data.name;
      const titleEn =
        tmdbType === "movie" ? data.original_title : data.original_name;
      const date =
        tmdbType === "movie"
          ? (data.release_date ?? "")
          : (data.first_air_date ?? "");

      // variety 판정 — TV + Reality/Talk 장르. genres[].id (detail 응답) 또는
      // genre_ids (discover 응답) 둘 다 사용. detail base 응답은 genres 배열.
      const genreIds: number[] = Array.isArray(data.genres)
        ? data.genres.map((g: { id: number }) => g.id)
        : Array.isArray(data.genre_ids)
          ? data.genre_ids
          : [];
      const isVariety =
        tmdbType === "series" &&
        genreIds.some((g) => VARIETY_GENRE_IDS.includes(g));

      // 명시 요청이 variety 면 그대로, 아니면 genre 감지 결과 사용.
      const displayType: "movie" | "series" | "variety" =
        requestedDisplayType === "variety"
          ? "variety"
          : isVariety
            ? "variety"
            : tmdbType;

      return {
        title: title ?? "",
        titleEn: titleEn ?? "",
        type: displayType,
        reason: "",
        tmdbId: id,
        posterUrl: posterUrl(data.poster_path, "w500"),
        rating: data.vote_average ?? 0,
        date,
        overview: data.overview ?? "",
        providers: filterWatchProviders(providersRes.providers),
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

  if (requestedDisplayType) {
    // variety 명시 → TMDB 는 series 로 fetch. movie/series 는 그대로.
    const tmdbType: "movie" | "series" =
      requestedDisplayType === "movie" ? "movie" : "series";
    return tryType(tmdbType);
  }
  // type 미지정: movie → series 순서로 시도
  return (await tryType("movie")) ?? (await tryType("series"));
}
