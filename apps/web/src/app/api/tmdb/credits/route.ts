import { NextRequest, NextResponse } from "next/server";
import { getCredits } from "@/lib/tmdb";

/**
 * GET /api/tmdb/credits?id=123&type=movie|series
 *
 * 위임 P #3 (2026-05-02) — DetailSheet Cast 사진 안 보임 회귀 수정.
 *
 * Discover 추천은 mirror cache (tmdb_metadata 테이블) 기반 enrich 경로를 타는데
 * mirror 는 person id / profile_path 미보유 → directorMember/castMembers 가 null/빈 배열.
 * DetailSheet 가 마운트 시 이 라이트 엔드포인트로 1회 fetch 해서 cast 사진을 채운다.
 *
 * 무거운 hydrate (/api/tmdb/hydrate) 와 달리 credits 만 호출 — getDetails/providers 호출 X.
 * 응답 사이즈도 작아 첫 paint 영향 미미.
 */
export async function GET(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get("id");
  const typeParam = req.nextUrl.searchParams.get("type");

  const id = Number(idParam);
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: "id 필수" }, { status: 400 });
  }
  const type: "movie" | "series" =
    typeParam === "series" ? "series" : "movie";

  try {
    const credits = await getCredits(id, type);
    return NextResponse.json({
      directorMember: credits.directorMember,
      castMembers: credits.castMembers,
    });
  } catch {
    return NextResponse.json(
      { directorMember: null, castMembers: [] },
      { status: 200 },
    );
  }
}
