import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { RelatedWork } from "@neq/core";

/**
 * 장르 대표작 top-N (mirror) — native Seeded Queue(장르 큐) 하이브리드 후보용.
 *
 * GET /api/tmdb/genre-top?genre=878&limit=30
 *  → RelatedWork[] { id, title, posterUrl, year, mediaType } (native 큐 파이프라인
 *    RelatedWork 큐 + lazy hydrate 그대로 재사용 — packages/core 수정 0)
 *
 * 조회 (tmdb_metadata mirror — TMDB API 호출 0):
 *  - genre_ids 포함 (GIN idx_metadata_genres) + movie/tv 양쪽 (장르 id 는 리스트가
 *    분리지만 겹치는 id(드라마 18 등) 존재 — media_type 별 각각 매칭 후 병합)
 *  - KR **subscription** 가용만 — providers JSONB @> [{"category":"subscription"}]
 *    (isSubscriptionProvider 정합: rent/buy 제외. mirror providers 는 category 항상 명시)
 *  - poster 필수 + rating >= 6.5 잡음 컷
 *  - popularity desc — popularity 는 tmdb_catalog 에만 있으므로 (metadata 미보유)
 *    후보 id 를 catalog 에서 2차 조회 후 서버 측 정렬.
 *
 * ponytail: 후보 preselect 는 rating desc 상한 PRESELECT_CAP/type — KR 구독 가능
 * universe 가 ~17K 라 장르 subset 은 수천 이하, 캡이 대표작을 자를 위험 낮음.
 * 대표작 누락 관측 시 캡 상향 또는 popularity 컬럼 mirror 승격.
 */
const IMG_BASE = "https://image.tmdb.org/t/p/w185";
const PRESELECT_CAP = 1000;
const CHUNK = 400;

interface MetaRow {
  tmdb_id: number;
  title: string | null;
  poster_path: string | null;
  release_date: string | null;
  media_type: "movie" | "tv";
}

export async function GET(req: NextRequest) {
  const genreId = Number(req.nextUrl.searchParams.get("genre"));
  if (!Number.isInteger(genreId) || genreId <= 0) {
    return NextResponse.json({ error: "genre 필수" }, { status: 400 });
  }
  const limitRaw = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Math.min(Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : 30, 50);

  let admin: ReturnType<typeof supabaseAdmin>;
  try {
    admin = supabaseAdmin();
  } catch {
    return NextResponse.json({ error: "server unavailable" }, { status: 503 });
  }

  async function fetchByType(mt: "movie" | "tv"): Promise<MetaRow[]> {
    const { data, error } = await admin
      .from("tmdb_metadata")
      .select("tmdb_id, title, poster_path, release_date, media_type")
      .eq("media_type", mt)
      .contains("genre_ids", [genreId])
      .contains("providers", JSON.stringify([{ category: "subscription" }]))
      .not("poster_path", "is", null)
      .gte("rating", 6.5)
      .order("rating", { ascending: false })
      .limit(PRESELECT_CAP);
    if (error) {
      console.error(`[genre-top] mirror 조회 실패 (${mt}):`, error);
      return [];
    }
    return (data ?? []) as unknown as MetaRow[];
  }

  const rows = (await Promise.all([fetchByType("movie"), fetchByType("tv")])).flat();
  if (rows.length === 0) return NextResponse.json([]);

  // popularity 2차 조회 — catalog (media_type, tmdb_id) 청크 병렬.
  const popByKey = new Map<string, number>();
  await Promise.all(
    (["movie", "tv"] as const).flatMap((mt) => {
      const ids = rows.filter((r) => r.media_type === mt).map((r) => r.tmdb_id);
      const chunks: Promise<void>[] = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        // supabase-js 빌더는 PromiseLike — Promise<void>[] 에 담기 위해 async 래핑.
        chunks.push(
          (async () => {
            const { data } = await admin
              .from("tmdb_catalog")
              .select("tmdb_id, popularity")
              .eq("media_type", mt)
              .in("tmdb_id", slice);
            for (const row of (data ?? []) as { tmdb_id: number; popularity: number | null }[]) {
              popByKey.set(`${mt}:${row.tmdb_id}`, Number(row.popularity ?? 0));
            }
          })(),
        );
      }
      return chunks;
    }),
  );

  const works: RelatedWork[] = rows
    .sort(
      (a, b) =>
        (popByKey.get(`${b.media_type}:${b.tmdb_id}`) ?? 0) -
        (popByKey.get(`${a.media_type}:${a.tmdb_id}`) ?? 0),
    )
    .slice(0, limit)
    .map((r) => ({
      id: r.tmdb_id,
      title: r.title ?? "",
      posterUrl: r.poster_path ? `${IMG_BASE}${r.poster_path}` : null,
      year: (r.release_date ?? "").slice(0, 4),
      mediaType: r.media_type,
    }));

  return NextResponse.json(works);
}
