import OpenAI from "openai";
import "./env"; // validate env vars at startup
import { searchTMDB, getKoreanProviders, getCredits, getDetails, posterUrl } from "./tmdb";
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
  good: string[];    // 재밌었다고 한 작품들
  meh: string[];     // 그저 그랬다고 한 작품들
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
    parts.push(`사용자가 인생작이라고 한 작품: ${feedback.loved.join(", ")}. 이 작품들과 비슷한 결의 작품을 적극적으로 추천하세요.`);
  }
  if (feedback.good.length > 0) {
    parts.push(`사용자가 재밌게 본 작품: ${feedback.good.join(", ")}. 이런 방향도 좋아하니 참고하세요.`);
  }
  if (feedback.meh.length > 0) {
    parts.push(`사용자가 그저 그랬다고 한 작품: ${feedback.meh.join(", ")}. 이런 류보다는 더 흥미로운 작품을 추천하세요.`);
  }
  if (feedback.dropped.length > 0) {
    parts.push(`사용자가 중간에 포기한 작품: ${feedback.dropped.join(", ")}. 이런 류의 작품은 피하세요.`);
  }
  return parts.join("\n");
}

export async function getRecommendations(
  favorites: string[],
  filter: RecommendFilter = {},
  feedback?: WatchFeedback,
  exclude?: string[]
): Promise<Recommendation[]> {
  const filterPrompt = buildFilterPrompt(filter);
  const feedbackPrompt = buildFeedbackPrompt(feedback);
  const excludePrompt = exclude && exclude.length > 0
    ? `\n절대 추천하지 말 작품 (이미 본 작품들): ${exclude.slice(0, 50).join(", ")}`
    : "";

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `당신은 OTT 콘텐츠 큐레이터입니다.

[역할]
사용자의 취향을 분석해서, 대형 OTT 알고리즘이 절대 노출하지 않을 숨겨진 명작을 찾아주세요.

[선정 기준]
- 한국에서 OTT로 볼 수 있는 작품 위주
- 숨겨진 명작 70% 이상. 누구나 아는 블록버스터 제외.
- 장르 최소 3개 이상 섞기. 같은 장르 연속 3개 금지.
- 최근작(2020~)과 클래식(~2010) 섞기.
- 20개 추천.

[제외]
- 사용자가 입력한 작품 및 리메이크/속편
- 초유명작 (어벤져스, 타이타닉, 해리포터 등)
${excludePrompt}

[추천 이유 작성법]
reason 필드는 반드시 아래 규칙을 따르세요:
- 1문장, 15~25자
- 해요체 (~해요, ~이에요, ~돼요)
- 이 작품이 왜 재밌는지 구체적으로 한마디
- 좋은 예: "중반부터 숨 못 쉬어요", "OST가 너무 좋아요", "반전이 세 번 나와요"
- 나쁜 예: "깊은 고찰이 매력적입니다", "감각적인 영상미", "독특한 세계관"

${filterPrompt}
${feedbackPrompt}

[출력 형식]
반드시 아래 JSON으로만 응답하세요:
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

  // 1단계: 모든 추천을 병렬로 TMDB 검색
  const searchResults = await Promise.all(
    recs.map(async (rec) => {
      let tmdb = await searchTMDB(rec.title, rec.type);
      if (!tmdb) tmdb = await searchTMDB(rec.title_en, rec.type);
      return { rec, tmdb };
    })
  );

  // 2단계: 검색 성공한 것들을 병렬로 메타데이터 조회
  const matched = searchResults.filter((r) => r.tmdb !== null);
  const enriched = await Promise.all(
    matched.map(async ({ rec, tmdb }) => {
      const [{ providers, watchLink }, credits, details] = await Promise.all([
        getKoreanProviders(tmdb!.id, rec.type),
        getCredits(tmdb!.id, rec.type),
        getDetails(tmdb!.id, rec.type),
      ]);
      return { rec, tmdb: tmdb!, providers, watchLink, credits, details };
    })
  );

  // 3단계: 필터링 + 결과 조립
  const results: Recommendation[] = [];
  for (const { rec, tmdb, providers, watchLink, credits, details } of enriched) {
    if (providers.length === 0) continue;

    const originCountry = details.country.length > 0 ? details.country : ((tmdb as any).origin_country ?? []);
    if (filter.origin === "kr" && !originCountry.includes("KR")) continue;
    if (filter.origin === "foreign" && originCountry.includes("KR")) continue;

    const officialTitle = (tmdb as any).title ?? (tmdb as any).name ?? rec.title;

    results.push({
      title: officialTitle,
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
      director: credits.director,
      cast: credits.cast,
      runtime: details.runtime,
      seasons: details.seasons,
      country: details.country,
      backdrop: details.backdrop,
      originCountry,
    });

    if (results.length >= 8) break;
  }

  return results;
}
