import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * TMDB id 배열 → genre_ids 매핑. Saved 장르 백필 전용 (mirror-only, TMDB 재호출 없음).
 *
 * GET /api/tmdb/genres?movie=496243,603&tv=93405
 *  → { "496243": [35,18,53], "603": [28,878], "93405": [10759,9648] }
 *
 * genres 가 없는 기존 저장분(SavedItem.recommendation.genres === undefined)을
 * 1회 백필하는 데 쓴다. 네이티브 Saved 최초 로드 시 미보유 id 만 모아 호출 → 결과를
 * AsyncStorage 저장분에 병합 persist. 이후엔 스킵 (backfillSavedGenres 헬퍼 참조).
 *
 * media_type 분리 조회 — `tmdb_metadata` PK 는 (tmdb_id, media_type) 복합키이고 TMDB 는
 * movie/tv id 를 독립 할당한다 (같은 정수가 영화·TV 양쪽에 존재 가능). `.in('tmdb_id', ids)`
 * 만 쓰면 충돌 시 두 행이 반환되어 비결정적으로 엉뚱한 장르가 붙는다. 그래서 movie 배치는
 * media_type='movie', tv 배치는 media_type='tv' 로 각각 조회 후 병합한다.
 *
 * 레거시 `?ids=` 파라미터도 계속 받는다 (media_type 미지정 fallback — 옛 호출자 호환).
 * 이 경로만 첫 매칭 우선 방식으로 남는다.
 */
function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 200); // ponytail: 저장분 상한 방어. 초과 시 클라가 분할 호출.
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const movieIds = parseIds(sp.get("movie"));
  const tvIds = parseIds(sp.get("tv"));
  const legacyIds = parseIds(sp.get("ids")); // media_type 미지정 fallback

  if (movieIds.length === 0 && tvIds.length === 0 && legacyIds.length === 0) {
    // 어떤 파라미터도 없으면 400 (기존 계약 유지). 빈 배치 요청은 클라가 애초에 호출 안 함.
    if (!sp.has("movie") && !sp.has("tv") && !sp.has("ids")) {
      return NextResponse.json({ error: "movie/tv/ids 중 하나 필수" }, { status: 400 });
    }
    return NextResponse.json({}, { status: 200 });
  }

  let admin: ReturnType<typeof supabaseAdmin>;
  try {
    admin = supabaseAdmin();
  } catch {
    return NextResponse.json({ error: "server unavailable" }, { status: 503 });
  }

  const out: Record<number, number[]> = {};

  // media_type 분리 조회 — 각 배치를 해당 media_type 으로만 필터. 병합.
  async function fetchByType(ids: number[], mediaType: "movie" | "tv"): Promise<boolean> {
    if (ids.length === 0) return true;
    const { data, error } = await admin
      .from("tmdb_metadata")
      .select("tmdb_id, genre_ids")
      .eq("media_type", mediaType)
      .in("tmdb_id", ids);
    if (error) {
      console.error(`[genres] mirror 조회 실패 (${mediaType}):`, error);
      return false;
    }
    for (const row of (data ?? []) as { tmdb_id: number; genre_ids: number[] | null }[]) {
      out[row.tmdb_id] = row.genre_ids ?? [];
    }
    return true;
  }

  const [okMovie, okTv] = await Promise.all([
    fetchByType(movieIds, "movie"),
    fetchByType(tvIds, "tv"),
  ]);
  if (!okMovie || !okTv) {
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }

  // 레거시 ?ids= — media_type 미지정. 첫 매칭 우선 (movie/tv 충돌 시 비결정 가능성 잔존,
  // 옛 호출자 호환용). 신규 native 클라는 movie/tv 를 쓰므로 이 경로 미사용.
  if (legacyIds.length > 0) {
    const { data, error } = await admin
      .from("tmdb_metadata")
      .select("tmdb_id, genre_ids")
      .in("tmdb_id", legacyIds);
    if (error) {
      console.error("[genres] mirror 조회 실패 (legacy ids):", error);
      return NextResponse.json({ error: "query failed" }, { status: 500 });
    }
    for (const row of (data ?? []) as { tmdb_id: number; genre_ids: number[] | null }[]) {
      if (out[row.tmdb_id] === undefined) out[row.tmdb_id] = row.genre_ids ?? [];
    }
  }

  return NextResponse.json(out);
}
