import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * TMDB id 배열 → genre_ids 매핑. Saved 장르 백필 전용 (mirror-only, TMDB 재호출 없음).
 *
 * GET /api/tmdb/genres?ids=496243,93405
 *  → { "496243": [35,18,53], "93405": [10759,9648] }
 *
 * genres 가 없는 기존 저장분(SavedItem.recommendation.genres === undefined)을
 * 1회 백필하는 데 쓴다. 네이티브 Saved 최초 로드 시 미보유 id 만 모아 호출 → 결과를
 * AsyncStorage 저장분에 병합 persist. 이후엔 스킵 (backfillSavedGenres 헬퍼 참조).
 *
 * media_type 무관 tmdb_id IN 조회 — movie/tv 간 id 충돌은 드물고, 충돌 시 먼저
 * 매칭된 row 를 사용 (장르 라벨 표시용이라 정밀도 요구 낮음). ponytail: id 충돌 무시.
 */
export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids");
  if (!idsParam) {
    return NextResponse.json({ error: "ids 필수" }, { status: 400 });
  }

  const ids = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 200); // ponytail: 저장분 상한 방어. 초과 시 클라가 분할 호출.

  if (ids.length === 0) {
    return NextResponse.json({}, { status: 200 });
  }

  let admin;
  try {
    admin = supabaseAdmin();
  } catch {
    return NextResponse.json({ error: "server unavailable" }, { status: 503 });
  }

  const { data, error } = await admin
    .from("tmdb_metadata")
    .select("tmdb_id, genre_ids")
    .in("tmdb_id", ids);

  if (error) {
    console.error("[genres] mirror 조회 실패:", error);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }

  const out: Record<number, number[]> = {};
  for (const row of (data ?? []) as { tmdb_id: number; genre_ids: number[] | null }[]) {
    // 이미 채워진 id 는 덮어쓰지 않음 (movie/tv 충돌 시 첫 매칭 우선).
    if (out[row.tmdb_id] === undefined) out[row.tmdb_id] = row.genre_ids ?? [];
  }
  return NextResponse.json(out);
}
