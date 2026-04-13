import { NextRequest, NextResponse } from "next/server";
import { getRecommendations } from "@/lib/recommend";
import { checkRateLimit } from "@/lib/rate-limit";

/** 다양한 플랫폼/프록시 환경에서 클라이언트 IP를 안정적으로 추출 */
function getClientIp(req: NextRequest): string {
  // Vercel 전용 헤더 (가장 신뢰할 수 있음)
  const vercelIp = req.headers.get("x-real-ip");
  if (vercelIp) return vercelIp;

  // CF 같은 다른 CDN
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;

  // x-forwarded-for는 첫 번째 IP가 원본 클라이언트
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "unknown";

  return "unknown";
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { allowed, remaining } = checkRateLimit(ip);

  if (!allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 1분 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": "60", "X-RateLimit-Remaining": "0" } }
    );
  }

  const { favorites, filter, feedback, exclude: rawExclude, excludeIds: rawExcludeIds } = await req.json();

  // exclude 검증: 문자열 배열, 각 항목 50자 제한, 특수문자 제거, 최대 150개
  const exclude = Array.isArray(rawExclude)
    ? rawExclude
        .filter((x: unknown): x is string => typeof x === "string")
        .map((s: string) => s.replace(/[^\p{L}\p{N}\s:,\-().!?]/gu, "").slice(0, 50))
        .slice(0, 150)
    : undefined;

  // excludeIds 검증: 숫자 배열, 최대 300개
  const excludeIds = Array.isArray(rawExcludeIds)
    ? rawExcludeIds.filter((x: unknown): x is number => typeof x === "number").slice(0, 300)
    : undefined;

  if (!Array.isArray(favorites)) {
    return NextResponse.json(
      { error: "잘못된 요청입니다" },
      { status: 400 }
    );
  }

  try {
    const recommendations = await getRecommendations(favorites, filter ?? {}, feedback, exclude, excludeIds);
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
