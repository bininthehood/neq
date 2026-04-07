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

  try {
    const recommendations = await getRecommendations(favorites);
    return NextResponse.json({ recommendations });
  } catch (error) {
    console.error("Recommendation error:", error);
    return NextResponse.json(
      { error: "추천 생성에 실패했습니다. 다시 시도해주세요.", recommendations: [] },
      { status: 500 }
    );
  }
}
