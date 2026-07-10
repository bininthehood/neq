import { NextRequest, NextResponse } from "next/server";
import { getKoreanProviders, filterWatchProviders } from "@/lib/tmdb";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const type = req.nextUrl.searchParams.get("type") as "movie" | "series" | null;

  if (!id || !type) {
    return NextResponse.json({ providers: [] });
  }

  const { providers } = await getKoreanProviders(Number(id), type);
  // 2026-07-10 — 표시 필터 누락 봉합. 본 라우트만 TMDB KR 원본(36종)을 그대로
  // 반환해 Crunchyroll 류 미지원 provider 가 검색 상세로 샜다 (실기기 보고 — 이
  // 경로로 저장된 스냅샷에 박제). recommend/hydrate 와 동일하게 allowlist +
  // subscription 필터 적용.
  return NextResponse.json({ providers: filterWatchProviders(providers) });
}
