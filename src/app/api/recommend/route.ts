import { NextRequest, NextResponse } from "next/server";
import { getRecommendations } from "@/lib/recommend";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed, remaining } = checkRateLimit(ip);

  if (!allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 1분 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": "60", "X-RateLimit-Remaining": "0" } }
    );
  }

  const { favorites, filter, feedback, exclude: rawExclude } = await req.json();

  // exclude 검증: 문자열 배열, 각 항목 50자 제한, 특수문자 제거
  const exclude = Array.isArray(rawExclude)
    ? rawExclude
        .filter((x: unknown): x is string => typeof x === "string")
        .map((s: string) => s.replace(/[^\p{L}\p{N}\s:,\-().!?]/gu, "").slice(0, 50))
        .slice(0, 50)
    : undefined;

  if (!Array.isArray(favorites) || favorites.length < 3) {
    return NextResponse.json(
      { error: "최소 3개의 작품을 선택해주세요" },
      { status: 400 }
    );
  }

  try {
    const recommendations = await getRecommendations(favorites, filter ?? {}, feedback, exclude);
    return NextResponse.json({ recommendations }, {
      headers: { "X-RateLimit-Remaining": String(remaining) },
    });
  } catch (error) {
    console.error("Recommendation error:", error);
    return NextResponse.json(
      { error: "추천 생성에 실패했습니다. 다시 시도해주세요.", recommendations: [] },
      { status: 500 }
    );
  }
}
