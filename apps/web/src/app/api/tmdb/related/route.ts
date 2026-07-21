import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCollection,
  getPersonCredits,
  getRelatedSeeds,
  getTMDBRecommendations,
  posterUrl,
} from "@/lib/tmdb";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseEmbedding } from "@/lib/candidate-generation";
import type { RelatedWork, RelatedWorksResponse } from "@neq/core";

type MediaType = "movie" | "tv";

type Seeds = {
  collectionId: number | null;
  directorId: number | null;
  directorName: string | null;
};

/**
 * directorWorks / recommendations 의 dedup·정렬 전 공통 후보 shape.
 * 미러 경로와 TMDB fallback 경로가 같은 배열 형태를 산출 → Step 4/5 로직 불변.
 * `sortKey` = 정렬 기준값 (director: popularity, recs: similarity).
 */
type WorkCandidate = {
  id: number;
  title: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  sortKey: number;
};

/** RPC match_tmdb_by_embedding 반환 row 중 본 라우트가 쓰는 필드만. */
interface MatchRow {
  tmdb_id: number;
  title: string | null;
  title_en: string | null;
  poster_path: string | null;
  release_date: string | null;
  similarity: number | string;
}

/**
 * seeds 확보 — 미러(tmdb_metadata) 우선, miss/에러 시 TMDB 직접(getRelatedSeeds) fallback.
 *
 * 미러 hit 조건: 행 존재 AND related_seeds_fetched_at IS NOT NULL (백필/크롤 완료 마커).
 *   마커가 있으면 collection_id/director_tmdb_id 가 NULL 이어도 "확정된 값"으로 신뢰 —
 *   TV 감독 미상 등 정상 NULL 을 miss 로 오인해 불필요한 fallback 하지 않도록.
 * fallback: admin 없음(env 누락) / 행 없음 / 마커 NULL(미백필) / 조회 오류.
 */
async function resolveSeeds(
  admin: SupabaseClient | null,
  id: number,
  mediaType: MediaType,
  type: "movie" | "series",
): Promise<Seeds> {
  if (admin) {
    try {
      const { data, error } = await admin
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
      // WARN-1: silent fallback 관찰가능성 — Vercel 로그에서 미러 hit vs fallback 구분용
      console.warn(
        `[related] seeds fallback→TMDB id=${id} ${mediaType} 사유=${error ? `조회오류:${error.message}` : !data ? "row miss" : "마커 없음(미백필)"}`,
      );
    } catch (e) {
      console.warn(`[related] seeds fallback→TMDB id=${id} ${mediaType} 사유=catch:${e}`);
    }
  }
  return getRelatedSeeds(id, type);
}

/**
 * Track 1 — 감독 다른 작품 후보. 미러(director_tmdb_id 매칭) 우선, miss/에러 시
 * getPersonCredits(TMDB) fallback. dedup·정렬·slice 는 호출처(Step 4)가 담당.
 *
 * media_type 처리: 현재 TMDB 경로가 요청 type 쪽 credits(movie_credits|tv_credits)만
 *   조회하므로 미러도 요청 mediaType 만 매칭 → 동등 동작. (감독 필모가 movie+tv 에 걸쳐도
 *   기존 UI 는 요청 type 만 노출 — parity 보존)
 * 정렬 parity: metadata 에 popularity 컬럼이 없어 genre-top 패턴대로 catalog 에서
 *   popularity 2차 조회. catalog miss 시 metadata.rating 으로 degrade.
 */
async function resolveDirectorWorks(
  admin: SupabaseClient | null,
  directorId: number | null,
  mediaType: MediaType,
  type: "movie" | "series",
): Promise<WorkCandidate[]> {
  if (!directorId) return [];

  if (admin) {
    try {
      const { data, error } = await admin
        .from("tmdb_metadata")
        .select("tmdb_id, title, poster_path, release_date, rating")
        .eq("media_type", mediaType)
        .eq("director_tmdb_id", directorId)
        // WARN-2: limit 전 안정 정렬 — 다작 감독(60+)에서 인기작이 컷 이전에 잘리지 않도록.
        // popularity 는 catalog 에만 있어 SQL 정렬 불가 → rating desc 로 근사(고평점 ≈ 대표작).
        .order("rating", { ascending: false, nullsFirst: false })
        .limit(60); // 감독 필모 상한 — 이후 top 12 컷, 넉넉한 헤드룸
      if (!error && Array.isArray(data) && data.length > 0) {
        const rows = data as Array<{
          tmdb_id: number;
          title: string | null;
          poster_path: string | null;
          release_date: string | null;
          rating: number | null;
        }>;
        // popularity 2차 조회 (catalog) — 정렬 parity. 실패 시 rating 으로 degrade.
        const popById = new Map<number, number>();
        try {
          const { data: cat } = await admin
            .from("tmdb_catalog")
            .select("tmdb_id, popularity")
            .eq("media_type", mediaType)
            .in("tmdb_id", rows.map((r) => r.tmdb_id));
          for (const c of (cat ?? []) as Array<{ tmdb_id: number; popularity: number | null }>) {
            popById.set(c.tmdb_id, Number(c.popularity ?? 0));
          }
        } catch {
          // catalog 조회 실패 → rating 정렬로 degrade
        }
        return rows.map((r) => ({
          id: r.tmdb_id,
          title: r.title ?? "",
          poster_path: r.poster_path,
          release_date: r.release_date ?? undefined,
          sortKey: popById.get(r.tmdb_id) ?? Number(r.rating ?? 0),
        }));
      }
      console.warn(
        `[related] directorWorks fallback→TMDB dir=${directorId} ${mediaType} 사유=${error ? `조회오류:${error.message}` : "매칭 0행"}`,
      );
    } catch (e) {
      console.warn(`[related] directorWorks fallback→TMDB dir=${directorId} ${mediaType} 사유=catch:${e}`);
    }
  }

  // TMDB fallback — crew job=Director 필터
  const credits = await getPersonCredits(directorId, type);
  if (!credits) return [];
  return credits.crew
    .filter((c) => c.job === "Director" || c.department === "Directing")
    .map((c) => ({
      id: c.id,
      title: c.title,
      poster_path: c.poster_path,
      release_date: c.release_date,
      first_air_date: c.first_air_date,
      sortKey: c.popularity ?? 0,
    }));
}

/**
 * Track 2 — 유사작 추천. 작품 자체 임베딩으로 pgvector NN(match_tmdb_by_embedding RPC),
 * 임베딩 없음/RPC 오류 시 getTMDBRecommendations(TMDB) fallback.
 *
 * RPC 재사용(신규 RPC 불필요): p_media_type=요청 type, p_exclude_ids=[self], 나머지 NULL.
 *   RPC 는 KR 가용(providers IS NOT NULL) + 임베딩 보유 모집단만 반환 = neq 가치와 정합.
 * 정렬: RPC 는 similarity DESC 반환 → sortKey=similarity 로 Step 5 재정렬이 순서 보존.
 */
async function resolveRecommendations(
  admin: SupabaseClient | null,
  id: number,
  mediaType: MediaType,
  type: "movie" | "series",
): Promise<WorkCandidate[]> {
  if (admin) {
    try {
      const { data: metaRow } = await admin
        .from("tmdb_metadata")
        .select("embedding")
        .eq("media_type", mediaType)
        .eq("tmdb_id", id)
        .maybeSingle();
      const emb = parseEmbedding(
        (metaRow as { embedding?: number[] | string | null } | null)?.embedding,
      );
      if (emb) {
        const { data, error } = await admin.rpc("match_tmdb_by_embedding", {
          query_embedding: emb,
          match_count: 30,
          p_media_type: mediaType,
          p_genre_ids: null,
          p_date_gte: null,
          p_date_lte: null,
          p_origin: null,
          p_exclude_ids: [id],
        });
        if (!error && Array.isArray(data)) {
          return (data as MatchRow[]).map((r) => ({
            id: r.tmdb_id,
            title: r.title ?? r.title_en ?? "",
            poster_path: r.poster_path,
            release_date: r.release_date ?? undefined,
            sortKey: Number(r.similarity ?? 0),
          }));
        }
        console.warn(
          `[related] recommendations fallback→TMDB id=${id} ${mediaType} 사유=RPC 오류:${error?.message ?? "결과 형식 이상"}`,
        );
      } else {
        console.warn(
          `[related] recommendations fallback→TMDB id=${id} ${mediaType} 사유=임베딩 없음`,
        );
      }
    } catch (e) {
      console.warn(`[related] recommendations fallback→TMDB id=${id} ${mediaType} 사유=catch:${e}`);
    }
  }

  // TMDB fallback
  const recs = await getTMDBRecommendations(id, type).catch(() => []);
  return recs.map((r) => ({
    id: r.id,
    title: r.title,
    poster_path: r.poster_path,
    release_date: r.release_date,
    first_air_date: r.first_air_date,
    sortKey: r.popularity ?? 0,
  }));
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
 *
 * P2 미러 보강 (2026-07-21): Step 2 의 TMDB 직접 3콜 중 2건을 미러로 치환.
 *   - directorWorks: getPersonCredits(TMDB) → tmdb_metadata(director_tmdb_id 매칭) + catalog popularity
 *   - recommendations: getTMDBRecommendations(TMDB) → 작품 임베딩 pgvector NN(match_tmdb_by_embedding)
 *   - collection parts 는 그대로 TMDB 1콜(Phase 1 컬럼 기반). 각 트랙 미러 miss 시 개별 TMDB fallback.
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
  const mediaType: MediaType = type === "series" ? "tv" : "movie";

  // admin 1회 확보 — 미러 3트랙 공유. env 누락 시 null → 전 트랙 TMDB fallback(기존 동작).
  let admin: SupabaseClient | null = null;
  try {
    admin = supabaseAdmin();
  } catch {
    admin = null;
    console.warn(`[related] admin 확보 실패(env 누락) → 전 트랙 TMDB fallback id=${id}`);
  }

  // Step 1: 작품 메타에서 collectionId / directorId 동시 추출 (미러 우선, miss 시 TMDB fallback)
  const seeds = await resolveSeeds(admin, id, mediaType, type);

  // Step 2: collection(TMDB) + directorWorks(미러/TMDB) + recommendations(미러/TMDB) 병렬.
  const [collectionRes, directorCandidates, recsRes] = await Promise.all([
    seeds.collectionId ? getCollection(seeds.collectionId) : Promise.resolve(null),
    resolveDirectorWorks(admin, seeds.directorId, mediaType, type),
    resolveRecommendations(admin, id, mediaType, type),
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

  // Step 4: 감독 작품 — 자기 자신/collection 중복 제외, sortKey(popularity) desc, top 12
  // (job=Director 필터는 resolveDirectorWorks 가 미러/TMDB 각 경로에서 이미 적용)
  let directorWorks: RelatedWork[] = [];
  {
    const dedupMap = new Map<number, WorkCandidate>();
    for (const w of directorCandidates) {
      if (w.id === id) continue;
      // 컬렉션에 이미 포함된 작품은 중복 회피
      if (collection?.works.some((cw) => cw.id === w.id)) continue;
      if (!dedupMap.has(w.id)) dedupMap.set(w.id, w);
    }
    directorWorks = Array.from(dedupMap.values())
      .sort((a, b) => b.sortKey - a.sortKey)
      .slice(0, 12)
      .map((w) => ({
        id: w.id,
        title: w.title,
        posterUrl: posterUrl(w.poster_path, "w185"),
        year: extractYear(w.release_date, w.first_air_date),
        mediaType,
      }));
  }

  // Step 5: recommendations — 자기 자신 + collection + directorWorks 모두 중복 제외, sortKey desc, top 8
  // sortKey = 미러 경로 similarity(NN 순서) / TMDB fallback popularity. 어느 경우든 내림차순 보존.
  let recommendations: RelatedWork[] = [];
  if (recsRes.length > 0) {
    const excluded = new Set<number>([id]);
    if (collection) {
      for (const w of collection.works) excluded.add(w.id);
    }
    for (const w of directorWorks) excluded.add(w.id);

    const dedupMap = new Map<number, WorkCandidate>();
    for (const r of recsRes) {
      if (excluded.has(r.id)) continue;
      if (!dedupMap.has(r.id)) dedupMap.set(r.id, r);
    }

    recommendations = Array.from(dedupMap.values())
      .sort((a, b) => b.sortKey - a.sortKey)
      .slice(0, 8)
      .map((r) => ({
        id: r.id,
        title: r.title,
        posterUrl: posterUrl(r.poster_path, "w185"),
        year: extractYear(r.release_date, r.first_air_date),
        mediaType,
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
