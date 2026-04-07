import OpenAI from "openai";
import { searchTMDB, getKoreanProviders, posterUrl } from "./tmdb";
import type { Recommendation } from "./types";

const openai = new OpenAI();

interface LLMRec {
  title: string;
  title_en: string;
  type: "movie" | "series";
  reason: string;
}

export interface RecommendFilter {
  type?: "movie" | "series"; // undefined = 둘 다
  origin?: "kr" | "foreign"; // undefined = 둘 다
}

export interface WatchFeedback {
  loved: string[];   // 인생작이라고 한 작품들
  dropped: string[]; // 포기한 작품들
}

function buildFilterPrompt(filter: RecommendFilter): string {
  const parts: string[] = [];

  if (filter.type === "movie") parts.push("영화만 추천하세요. 시리즈/드라마는 제외.");
  else if (filter.type === "series") parts.push("시리즈/드라마만 추천하세요. 영화는 제외.");
  else parts.push("영화와 시리즈를 섞어서 추천하세요.");

  if (filter.origin === "kr") parts.push("한국 작품만 추천하세요. 외국 작품은 제외.");
  else if (filter.origin === "foreign") parts.push("외국 작품만 추천하세요. 한국 작품은 제외.");

  return parts.join("\n");
}

function buildFeedbackPrompt(feedback?: WatchFeedback): string {
  if (!feedback) return "";
  const parts: string[] = [];
  if (feedback.loved.length > 0) {
    parts.push(`사용자가 최근 추천 중 인생작이라고 한 작품: ${feedback.loved.join(", ")}. 이 작품들과 비슷한 결의 작품을 더 추천하세요.`);
  }
  if (feedback.dropped.length > 0) {
    parts.push(`사용자가 중간에 포기한 작품: ${feedback.dropped.join(", ")}. 이런 류의 작품은 피하세요.`);
  }
  return parts.join("\n");
}

export async function getRecommendations(
  favorites: string[],
  filter: RecommendFilter = {},
  feedback?: WatchFeedback
): Promise<Recommendation[]> {
  const filterPrompt = buildFilterPrompt(filter);
  const feedbackPrompt = buildFeedbackPrompt(feedback);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `당신은 영화/시리즈 추천 전문가입니다.
사용자가 좋아하는 작품 목록을 주면, 그 취향을 분석하고 비슷한 결이면서도 뻔하지 않은 작품을 추천합니다.

규칙:
- 사용자의 입력 작품 및 그 리메이크/속편은 절대 추천하지 마세요
- 누구나 아는 초유명작(예: 어벤져스, 타이타닉, 해리 포터)은 제외
- 한국에서 OTT로 볼 수 있는 작품 위주
- 대중적이지 않지만 숨겨진 명작을 우선적으로 추천하세요
- 각 추천에 대해 왜 이 사용자에게 맞는지 한 줄 이유를 포함
- **15개를 추천하세요**

${filterPrompt}
${feedbackPrompt}

반드시 아래 정확한 JSON 형식으로 응답하세요:
{"recommendations": [{"title": "한글 제목", "title_en": "English Title", "type": "movie 또는 series", "reason": "추천 이유"}, ...]}`,
      },
      {
        role: "user",
        content: `내가 좋아하는 작품들: ${favorites.join(", ")}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.9,
  });

  const content = response.choices[0].message.content;
  if (!content) return [];

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error("LLM returned invalid JSON:", content.slice(0, 200));
    return [];
  }
  const recs: LLMRec[] =
    parsed.recommendations ??
    parsed.results ??
    (Object.values(parsed).find((v: any) => Array.isArray(v)) as LLMRec[]) ??
    [];

  const results: Recommendation[] = [];

  for (const rec of recs) {
    let tmdb = await searchTMDB(rec.title, rec.type);
    if (!tmdb) tmdb = await searchTMDB(rec.title_en, rec.type);
    if (!tmdb) continue;

    const { providers, watchLink } = await getKoreanProviders(tmdb.id, rec.type);
    if (providers.length === 0) continue;

    const originCountry = (tmdb as any).origin_country ?? [];

    // 서버 측 origin 필터 검증 (LLM이 잘못 추천한 경우 방어)
    if (filter.origin === "kr" && !originCountry.includes("KR")) continue;
    if (filter.origin === "foreign" && originCountry.includes("KR")) continue;

    results.push({
      title: rec.title,
      titleEn: rec.title_en,
      type: rec.type,
      reason: rec.reason,
      tmdbId: tmdb.id,
      posterUrl: posterUrl(tmdb.poster_path),
      rating: tmdb.vote_average,
      date: tmdb.release_date ?? tmdb.first_air_date ?? "",
      overview: tmdb.overview ?? "",
      providers,
      watchLink,
      originCountry,
    });

    if (results.length >= 10) break;
  }

  return results;
}
