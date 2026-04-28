import { NextRequest, NextResponse } from "next/server";
import { getRecommendations, getRecommendationsStreaming } from "@/lib/recommend";
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

  const {
    favorites,
    filter,
    feedback,
    exclude: rawExclude,
    excludeIds: rawExcludeIds,
    savedCount: rawSavedCount,
    onboardingCount: rawOnboardingCount,
  } = await req.json();

  // savedCount / onboardingCount 검증: 음수/비정수 방어
  const savedCount =
    typeof rawSavedCount === "number" && rawSavedCount > 0
      ? Math.floor(rawSavedCount)
      : 0;
  const onboardingCount =
    typeof rawOnboardingCount === "number" && rawOnboardingCount > 0
      ? Math.floor(rawOnboardingCount)
      : 0;

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

  if (favorites !== undefined && !Array.isArray(favorites)) {
    return NextResponse.json(
      { error: "잘못된 요청입니다" },
      { status: 400 }
    );
  }

  // streaming opt-in: 클라이언트가 x-neko-streaming: 1 헤더 보낼 때만 NDJSON stream 응답.
  // 그 외에는 기존 non-streaming 동작 유지 (회귀 위험 0).
  const useStreaming = req.headers.get("x-neko-streaming") === "1";

  // Phase 3 mirror opt-in: env TMDB_MIRROR_ENABLED=true 또는 클라이언트 헤더 x-neko-mirror: 1.
  // default OFF → prod 영향 0. staging은 헤더로 admin 호출만 분기.
  const useMirror =
    process.env.TMDB_MIRROR_ENABLED === "true" ||
    req.headers.get("x-neko-mirror") === "1";

  if (useStreaming) {
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const emit = (line: object) =>
          controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
        try {
          await getRecommendationsStreaming(
            favorites ?? [],
            filter ?? {},
            feedback,
            exclude,
            excludeIds,
            savedCount,
            onboardingCount,
            {
              onCard: (rec) => emit({ type: "card", rec }),
              onTimings: (timings) => emit({ type: "timings", timings }),
              onUsage: (usage) => emit({ type: "usage", usage }),
            },
            useMirror,
          );
          emit({ type: "done" });
        } catch (err) {
          emit({
            type: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        "X-RateLimit-Remaining": String(remaining),
      },
    });
  }

  try {
    const { recommendations, timings, usage } = await getRecommendations(
      favorites ?? [],
      filter ?? {},
      feedback,
      exclude,
      excludeIds,
      savedCount,
      onboardingCount,
      useMirror,
    );
    // 단계별 ms는 응답 body에 포함. Server-Timing 헤더는 dev tools 호환용 보존
    // (Vercel/Next.js infra가 Server-Timing 헤더를 응답에서 strip하는 동작이 관측되어 body 경유)
    const serverTiming = Object.entries(timings)
      .map(([key, ms]) => `${key};dur=${ms}`)
      .join(", ");
    const headers: Record<string, string> = {
      "X-RateLimit-Remaining": String(remaining),
    };
    if (serverTiming) headers["Server-Timing"] = serverTiming;
    return NextResponse.json(
      usage ? { recommendations, timings, usage } : { recommendations, timings },
      { headers },
    );
  } catch (error) {
    console.error("Recommendation error:", error);
    return NextResponse.json(
      { error: "추천 생성에 실패했습니다. 다시 시도해주세요.", recommendations: [] },
      { status: 500 }
    );
  }
}
