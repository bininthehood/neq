import { NextRequest, NextResponse } from "next/server";
import { searchMulti, searchMultiGrouped, posterUrl, type TMDBPersonRaw } from "@/lib/tmdb";
import type { PersonResult, GroupedSearchResponse } from "@/lib/types";

/**
 * 인물 1명을 PersonResult 로 매핑.
 *
 * - profileUrl: profile_path 가 null 이면 null. posterUrl 헬퍼 재사용 (path 형식 동일).
 * - knownFor: known_for 배열 top 3. title 우선 → name, year 는 release_date → first_air_date 순 첫 4글자.
 *   배열 자체가 비어있으면 빈 배열 반환 (UI 가 빈 배열 처리).
 * - knownForDept: 미정의 시 빈 문자열 (라우트 레이어에서 미리 필터하므로 실질 도달 안 함).
 */
function toPersonResult(p: TMDBPersonRaw): PersonResult {
  const knownFor = (p.known_for ?? [])
    .slice(0, 3)
    .map((k) => ({
      title: (k.title ?? k.name ?? "") as string,
      year: ((k.release_date ?? k.first_air_date ?? "") as string).slice(0, 4),
    }));

  return {
    id: p.id,
    name: p.name,
    profileUrl: posterUrl(p.profile_path, "w200"),
    knownFor,
    knownForDept: p.known_for_department ?? "",
  };
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  const grouped = req.nextUrl.searchParams.get("grouped") === "1";

  if (!query || query.length < 1) {
    if (grouped) {
      const empty: GroupedSearchResponse = { works: [], directors: [], actors: [] };
      return NextResponse.json(empty);
    }
    return NextResponse.json([]);
  }

  if (!grouped) {
    // V1 응답 (회귀 0): 기존 호출자 영향 X
    const results = await searchMulti(query);
    return NextResponse.json(
      results.map((r) => ({
        id: r.id,
        title: r.title ?? r.name,
        posterUrl: posterUrl(r.poster_path, "w200"),
        year: (r.release_date ?? r.first_air_date ?? "").slice(0, 4),
        rating: r.vote_average,
        mediaType: (r as unknown as { media_type?: string }).media_type === "tv" ? "tv" : "movie",
      }))
    );
  }

  // grouped=1: works + directors + actors 분리 응답
  const { works: workResults, persons } = await searchMultiGrouped(query);

  const works = workResults.map((r) => ({
    id: r.id,
    title: r.title ?? r.name ?? "",
    posterUrl: posterUrl(r.poster_path, "w200"),
    year: (r.release_date ?? r.first_air_date ?? "").slice(0, 4),
    rating: r.vote_average,
    mediaType: (r as unknown as { media_type?: string }).media_type === "tv" ? "tv" as const : "movie" as const,
  }));

  // Directing/Acting 만 노출 (그 외 부서는 검색 UX에 노이즈). 각 6개 cap 으로 응답 크기 안정화.
  const directors = persons
    .filter((p) => p.known_for_department === "Directing")
    .slice(0, 6)
    .map(toPersonResult);

  const actors = persons
    .filter((p) => p.known_for_department === "Acting")
    .slice(0, 6)
    .map(toPersonResult);

  const body: GroupedSearchResponse = { works, directors, actors };
  return NextResponse.json(body);
}
