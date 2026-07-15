import { NextRequest, NextResponse } from "next/server";
import {
  getCollection,
  getPersonCredits,
  getRelatedSeeds,
  getTMDBRecommendations,
  posterUrl,
} from "@/lib/tmdb";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { RelatedWork, RelatedWorksResponse } from "@neq/core";

type Seeds = {
  collectionId: number | null;
  directorId: number | null;
  directorName: string | null;
};

/**
 * seeds 확보 — 미러(tmdb_metadata) 우선, miss/에러 시 TMDB 직접(getRelatedSeeds) fallback.
 *
 * 미러 hit 조건: 행 존재 AND related_seeds_fetched_at IS NOT NULL (백필/크롤 완료 마커).
 *   마커가 있으면 collection_id/director_tmdb_id 가 NULL 이어도 "확정된 값"으로 신뢰 —
 *   TV 감독 미상 등 정상 NULL 을 miss 로 오인해 불필요한 fallback 하지 않도록.
 * fallback: 행 없음 / 마커 NULL(미백필) / Supabase 환경변수 누락 / 조회 오류.
 *   → 백필 완료 전에도 배포 가능 (전 행 fallback = 기존 동작).
 */
async function resolveSeeds(id: number, type: "movie" | "series"): Promise<Seeds> {
  const mediaType = type === "series" ? "tv" : "movie";
  try {
    const { data, error } = await supabaseAdmin()
      .from("tmdb_metadata")
      .select("collection_id, director_tmdb_id, director, related_seeds_fetched_at")
      .eq("media_type", mediaType) // PK=(tmdb_id, media_type) — media_type 필수 (movie/TV id 공간 독립)
      .eq("tmdb_id", id)
      .maybeSingle();

    if (!error && data && data.related_seeds_fetched_at) {
      return {
        collectionId: (data.collection_id as number | null) ?? null,
        directorId: (data.director_tmdb_id as number | null) ?? null,
        directorName: (data.director as string | null) ?? null,
      };
    }
  } catch {
    // env 누락 / 조회 오류 → TMDB 직접 경로로 fallback
  }
  return getRelatedSeeds(id, type);
}

/**
 * TMDB 관련 작품 통합 endpoint — F3 DetailSheet 가로 카로셀용.
 *
 * GET /api/tmdb/related?work_id={id}&type={movie|series}
 *
 * 1) /movie/{id} 에서 belongs_to_collection.id 추출 + /credits 에서 감독 person id 추출 (병렬)
 * 2) collectionId 있으면 /collection/{id}, directorId 있으면 /person/{id}/movie_credits|tv_credits,
 *    /movie|tv/{id}/recommendations — 3건 모두 병렬 호출 (위 단계와는 직렬)
 * 3) collection.parts 에서 자기 자신 제외
 * 4) directorWorks 는 crew[job=Director] 만 필터, 자기 자신/collection 중복 제외, popularity desc 정렬, top 12
 * 5) recommendations 는 자기 자신/collection/directorWorks 중복 제외, popularity desc 정렬, top 8
 *
 * 응답 — RelatedWorksResponse:
 *   { collection, recommendations, directorWorks, directorName }
 *
 * 실패/빈 결과 graceful: 빈 응답 (200) 반환 → 클라이언트가 섹션 숨김.
 *
 * 사용자 직접 테스트 #4 — collection 없는 작품도 recommendations 가 채워주므로
 * "관련 작품 비어있음" 케이스가 거의 사라진다 (예: 반지의 제왕 → 호빗 시리즈 (collection),
 * 인터스텔라 → 그래비티/마션 (recommendations)).
 *
 * P1 미러 보강 (2026-07-15): Step 1 seeds 를 tmdb_metadata(collection_id/director_tmdb_id)
 *   미러 조회로 치환 → 왕복 2→1. 미러 miss(미백필/행없음/오류) 시 TMDB 직접(getRelatedSeeds) fallback.
 *   Step 2 (collection parts / person credits / recommendations) 는 여전히 TMDB 직접 (Phase 2 범위).
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

  // Step 1: 작품 메타에서 collectionId / directorId 동시 추출 (미러 우선, miss 시 TMDB fallback)
  const seeds = await resolveSeeds(id, type);

  // Step 2: collection + person credits + recommendations 병렬 호출
  // recommendations 는 seeds 와 무관 (work id 만 필요) 이지만 동일 단계에 묶어 latency 최소화.
  const [collectionRes, creditsRes, recsRes] = await Promise.all([
    seeds.collectionId ? getCollection(seeds.collectionId) : Promise.resolve(null),
    seeds.directorId ? getPersonCredits(seeds.directorId, type) : Promise.resolve(null),
    getTMDBRecommendations(id, type).catch(() => []),
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

  // Step 4: 감독 작품 — crew 에서 job=Director 만, 자기 자신/collection 중복 제외, popularity desc, top 12
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

  // Step 5: TMDB recommendations — 자기 자신 + collection + directorWorks 모두 중복 제외, popularity desc, top 8
  // posterUrl 없는 작품은 카로셀 fallback 으로 처리되지만, 가시 품질을 위해 우선순위 떨어뜨릴 수 있음.
  // 현재는 popularity desc 만 적용 (TMDB 가 이미 큐레이션된 결과를 반환).
  let recommendations: RelatedWork[] = [];
  if (Array.isArray(recsRes) && recsRes.length > 0) {
    const excluded = new Set<number>([id]);
    if (collection) {
      for (const w of collection.works) excluded.add(w.id);
    }
    for (const w of directorWorks) excluded.add(w.id);

    const dedupMap = new Map<number, (typeof recsRes)[number]>();
    for (const r of recsRes) {
      if (excluded.has(r.id)) continue;
      if (!dedupMap.has(r.id)) dedupMap.set(r.id, r);
    }

    recommendations = Array.from(dedupMap.values())
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, 8)
      .map((r) => ({
        id: r.id,
        title: r.title,
        posterUrl: posterUrl(r.poster_path, "w185"),
        year: extractYear(r.release_date, r.first_air_date),
        // /movie/.../recommendations 는 movie, /tv/.../recommendations 는 tv 만 반환.
        mediaType: type === "series" ? ("tv" as const) : ("movie" as const),
      }));
  }

  const body: RelatedWorksResponse = {
    collection,
    recommendations,
    directorWorks,
    directorName: seeds.directorName,
  };

  return NextResponse.json(body);
}

function extractYear(releaseDate?: string, firstAirDate?: string): string {
  const d = releaseDate || firstAirDate || "";
  return d.length >= 4 ? d.slice(0, 4) : "";
}
