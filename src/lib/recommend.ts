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
        content: `당신은 영화/시리즈 큐레이터입니다. 넷플릭스 알고리즘이 절대 추천하지 않을, 하지만 이 사용자가 좋아할 작품을 찾아주세요.

규칙:
- 사용자의 입력 작품 및 그 리메이크/속편은 절대 추천하지 마세요
- 누구나 아는 초유명작(어벤져스, 타이타닉, 해리 포터 등)은 제외
- 한국에서 OTT로 볼 수 있는 작품 위주
- **장르 다양성**: 최소 3개 이상의 다른 장르에서 골고루 추천하세요. 한 장르에 편중 금지.
- **시대 다양성**: 최근작(2020년 이후)과 클래식(2010년 이전)을 섞어주세요
- **발굴 우선**: 대중적이지 않지만 숨겨진 명작을 70% 이상 포함
- **추천 이유(reason) 톤 가이드**:
  - 20대 한국인 친구가 카톡으로 추천하는 말투로 써라. 반말, 짧고 강렬하게.
  - 2문장 이내. 격식체(~입니다, ~합니다, ~됩니다) 절대 금지.
  - DO: "이거 보면 잠 못 잠", "배우 연기 미쳤음", "반전 세 번 나옴", "첫 회 끝나면 바로 다음 회 틀게 됨", "우울할 때 보면 치유됨", "중반부터 숨 못 쉼", "OST가 미침"
  - DON'T: "깊은 고찰이 매력적입니다", "감각적인 영상미가 인상적인", "장르의 경계를 초월하는", "독특한 세계관", "여운이 남는 수작"
  - 핵심: 왜 이 작품이 재밌는지 한마디로. 평론가 말고 덕후처럼.
- **15개를 추천하세요**
${excludePrompt}

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
    temperature: 0.85,
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

    if (results.length >= 10) break;
  }

  return results;
}
