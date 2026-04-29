import { NextRequest, NextResponse } from "next/server";
import {
  getCollection,
  getPersonCredits,
  getRelatedSeeds,
  posterUrl,
} from "@/lib/tmdb";
import type { RelatedWork, RelatedWorksResponse } from "@neq/core";

/**
 * TMDB 관련 작품 통합 endpoint — F3 DetailSheet 가로 카로셀용.
 *
 * GET /api/tmdb/related?work_id={id}&type={movie|series}
 *
 * 1) /movie/{id} 에서 belongs_to_collection.id 추출 + /credits 에서 감독 person id 추출 (병렬)
 * 2) collectionId 있으면 /collection/{id} 호출, directorId 있으면 /person/{id}/movie_credits|tv_credits 호출 (병렬)
 * 3) collection.parts 에서 자기 자신 제외
 * 4) directorWorks 는 crew[job=Director] 만 필터, 자기 자신 제외, popularity desc 정렬, top 12
 *
 * 응답 — RelatedWorksResponse:
 *   { collection: { id, name, works[] } | null, directorWorks: [...], directorName: string | null }
 *
 * 실패/빈 결과 graceful: 빈 응답 (200) 반환 → 클라이언트가 섹션 숨김.
 *
 * 옵션 A (직접 호출) 채택. 미러 보강(belongs_to_collection_id 컬럼)은 latency 모니터링 후 별도 결정.
 */
export async function GET(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get("work_id");
  const rawType = req.nextUrl.searchParams.get("type");

  const id = Number(idParam);
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: "work_id 필수" }, { status: 400 });
  }

  const type: "movie" | "series" =
    rawType === "series" ? "series" : "movie";

  // Step 1: 작품 메타에서 collectionId / directorId 동시 추출
  const seeds = await getRelatedSeeds(id, type);

  // Step 2: collection + person credits 병렬 호출
  const [collectionRes, creditsRes] = await Promise.all([
    seeds.collectionId ? getCollection(seeds.collectionId) : Promise.resolve(null),
    seeds.directorId ? getPersonCredits(seeds.directorId, type) : Promise.resolve(null),
  ]);

  // Step 3: collection.parts → RelatedWork[] 변환 + 자기 자신 제외
  let collection: RelatedWorksResponse["collection"] = null;
  if (collectionRes && collectionRes.parts.length > 0) {
    const works: RelatedWork[] = collectionRes.parts
      .filter((p) => p.id !== id)
      .map((p) => ({
        id: p.id,
        title: p.title,
        posterUrl: posterUrl(p.poster_path, "w185"),
        year: extractYear(p.release_date, p.first_air_date),
        // collection 은 movie 전용
        mediaType: "movie" as const,
      }));

    if (works.length > 0) {
      collection = {
        id: collectionRes.id,
        name: collectionRes.name,
        works,
      };
    }
  }

  // Step 4: 감독 작품 — crew 에서 job=Director 만, 자기 자신 제외, popularity desc, top 12
  let directorWorks: RelatedWork[] = [];
  if (creditsRes) {
    const directed = creditsRes.crew.filter(
      (c) => c.job === "Director" || c.department === "Directing",
    );
    const dedupMap = new Map<number, (typeof directed)[number]>();
    for (const w of directed) {
      if (w.id === id) continue;
      // 컬렉션에 이미 포함된 작품은 중복 회피
      if (collection?.works.some((cw) => cw.id === w.id)) continue;
      if (!dedupMap.has(w.id)) dedupMap.set(w.id, w);
    }
    directorWorks = Array.from(dedupMap.values())
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, 12)
      .map((w) => ({
        id: w.id,
        title: w.title,
        posterUrl: posterUrl(w.poster_path, "w185"),
        year: extractYear(w.release_date, w.first_air_date),
        mediaType: type === "series" ? ("tv" as const) : ("movie" as const),
      }));
  }

  const body: RelatedWorksResponse = {
    collection,
    directorWorks,
    directorName: seeds.directorName,
  };

  return NextResponse.json(body);
}

function extractYear(releaseDate?: string, firstAirDate?: string): string {
  const d = releaseDate || firstAirDate || "";
  return d.length >= 4 ? d.slice(0, 4) : "";
}
