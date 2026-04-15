import { NextRequest, NextResponse } from "next/server";
import { getKoreanProviders } from "@/lib/tmdb";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const type = req.nextUrl.searchParams.get("type") as "movie" | "series" | null;

  if (!id || !type) {
    return NextResponse.json({ providers: [] });
  }

  const { providers } = await getKoreanProviders(Number(id), type);
  return NextResponse.json({ providers });
}
