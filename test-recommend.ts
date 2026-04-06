import OpenAI from "openai";

const TMDB_API_KEY = process.env.TMDB_API_KEY!;
const openai = new OpenAI();

// ─── 좋아하는 작품을 여기에 입력하세요 (영화/시리즈 모두 가능) ───
const MY_FAVORITES = [
  "기생충",
  "올드보이",
  "인터스텔라",
  "그랜드 부다페스트 호텔",
  "어바웃 타임",
];
// ────────────────────────────────────────────

interface TMDBResult {
  id: number;
  title?: string; // movie
  name?: string; // tv
  overview: string;
  vote_average: number;
  release_date?: string; // movie
  first_air_date?: string; // tv
  media_type?: string;
  poster_path: string | null;
}

interface WatchProvider {
  provider_name: string;
}

interface Recommendation {
  title: string;
  title_en: string;
  type: "movie" | "series";
  reason: string;
}

// TMDB multi search — 영화와 TV를 동시에 검색
async function searchTMDB(
  title: string,
  type: "movie" | "series"
): Promise<TMDBResult | null> {
  const mediaType = type === "series" ? "tv" : "movie";

  // 1차: 한글 검색
  let res = await fetch(
    `https://api.themoviedb.org/3/search/${mediaType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=ko-KR`
  );
  let data = await res.json();
  if (data.results?.length > 0) return data.results[0];

  // 2차: 영문 검색 (한글로 못 찾을 때)
  res = await fetch(
    `https://api.themoviedb.org/3/search/${mediaType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=en-US`
  );
  data = await res.json();
  return data.results?.[0] ?? null;
}

// 한국 OTT 가용성 조회 (영화/TV 모두 지원)
async function getKoreanProviders(
  id: number,
  type: "movie" | "series"
): Promise<string[]> {
  const mediaType = type === "series" ? "tv" : "movie";
  const res = await fetch(
    `https://api.themoviedb.org/3/${mediaType}/${id}/watch/providers?api_key=${TMDB_API_KEY}`
  );
  const data = await res.json();
  const kr = data.results?.KR;
  if (!kr) return [];

  const providers: WatchProvider[] = [
    ...(kr.flatrate ?? []),
    ...(kr.rent ?? []),
    ...(kr.buy ?? []),
  ];
  return [...new Set(providers.map((p) => p.provider_name))];
}

async function getRecommendations(
  favorites: string[]
): Promise<Recommendation[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `당신은 영화/시리즈 추천 전문가입니다.
사용자가 좋아하는 작품 목록을 주면, 그 취향을 분석하고 비슷한 결이면서도 뻔하지 않은 작품 5개를 추천합니다.

규칙:
- 사용자의 입력 작품 및 그 리메이크/속편은 절대 추천하지 마세요
- 누구나 아는 초유명작(예: 어벤져스, 타이타닉, 해리 포터)은 제외
- 한국에서 OTT로 볼 수 있는 작품 위주
- 영화와 시리즈를 섞어서 추천하세요 (비율은 자유)
- 대중적이지 않지만 숨겨진 명작을 우선적으로 추천하세요
- 각 추천에 대해 왜 이 사용자에게 맞는지 한 줄 이유를 포함
- **10개를 추천하세요** (이후 한국 OTT 가용성으로 필터링합니다)

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

  const parsed = JSON.parse(content);
  const arr =
    parsed.recommendations ??
    parsed.results ??
    (Object.values(parsed).find((v: any) => Array.isArray(v)) as any) ??
    [];
  return arr as Recommendation[];
}

async function main() {
  console.log("🐱 Neko 추천 품질 테스트 v2");
  console.log("═".repeat(50));
  console.log("\n📌 내가 좋아하는 작품:");
  MY_FAVORITES.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));

  console.log("\n⏳ AI 추천 생성 중...\n");
  const recs = await getRecommendations(MY_FAVORITES);

  // LLM 10개 추천 → TMDB OTT 필터링 → 상위 5개
  console.log(`⏳ ${recs.length}개 추천 중 한국 OTT 필터링...\n`);

  interface EnrichedRec {
    rec: Recommendation;
    result: TMDBResult;
    providers: string[];
  }

  const available: EnrichedRec[] = [];
  const unavailable: string[] = [];

  for (const rec of recs) {
    let result = await searchTMDB(rec.title, rec.type);
    if (!result) result = await searchTMDB(rec.title_en, rec.type);

    if (!result) {
      unavailable.push(`${rec.title} (TMDB 미발견)`);
      continue;
    }

    const providers = await getKoreanProviders(result.id, rec.type);
    if (providers.length > 0) {
      available.push({ rec, result, providers });
    } else {
      unavailable.push(`${rec.title} (한국 OTT 없음)`);
    }

    if (available.length >= 5) break;
  }

  console.log("═".repeat(50));
  console.log(`🎬 추천 결과 — ${available.length}개 (한국 OTT 시청 가능)`);
  console.log("═".repeat(50));

  for (const { rec, result, providers } of available) {
    const typeLabel = rec.type === "series" ? "📺 시리즈" : "🎬 영화";
    console.log(`\n${typeLabel}  ${rec.title} (${rec.title_en})`);
    console.log(`  💡 ${rec.reason}`);
    console.log(`  ⭐ 평점: ${result.vote_average}/10`);
    const date = result.release_date ?? result.first_air_date ?? "N/A";
    console.log(`  📅 ${rec.type === "series" ? "첫 방영" : "개봉"}: ${date}`);
    if (result.overview) {
      console.log(`  📝 ${result.overview.slice(0, 80)}...`);
    }
    console.log(`  📺 시청 가능: ${providers.join(", ")}`);
  }

  if (unavailable.length > 0) {
    console.log(`\n🚫 필터링됨 (${unavailable.length}개):`);
    unavailable.forEach((t) => console.log(`   - ${t}`));
  }

  console.log("\n" + "═".repeat(50));
  console.log(`📊 결과: ${available.length}/5개 한국 OTT 가능`);
  console.log("   평가 기준: 5개 중 3개 이상 '볼 만하다' → Week 1 진행");
  console.log("═".repeat(50));
}

main().catch(console.error);
