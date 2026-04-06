import { NextRequest, NextResponse } from "next/server";
import { getRecommendations } from "@/lib/recommend";

export async function POST(req: NextRequest) {
  const { favorites } = await req.json();

  if (!Array.isArray(favorites) || favorites.length < 3) {
    return NextResponse.json(
      { error: "최소 3개의 작품을 선택해주세요" },
      { status: 400 }
    );
  }

  const recommendations = await getRecommendations(favorites);
  return NextResponse.json({ recommendations });
}
