import { NextRequest, NextResponse } from "next/server";
import { getBestTrailer } from "@/lib/tmdb";

/**
 * GET /api/tmdb/videos?id=123&type=movie|series
 *
 * 2026-07-12 — DetailSheet 트레일러 lazy fetch (credits 패턴 동일).
 *
 * mirror (tmdb_metadata) 는 videos 미보유 → 시트 오픈 시 이 라이트 엔드포인트로
 * 1회 fetch. 대표 트레일러 1개 (YouTube key) 만 반환, 없으면 trailer: null.
 * 트레일러는 사실상 불변 데이터 → CDN 1일 캐시로 TMDB quota 절약.
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

  const headers = {
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
  };
  try {
    const trailer = await getBestTrailer(id, type);
    return NextResponse.json({ trailer }, { headers });
  } catch {
    return NextResponse.json({ trailer: null }, { status: 200, headers });
  }
}
