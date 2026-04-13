import OpenAI from "openai";
import "./env"; // validate env vars at startup
import {
  searchTMDB,
  getKoreanProviders,
  getCredits,
  getDetails,
  posterUrl,
  getTMDBRecommendations,
  getTrending,
  discoverByGenres,
  type TMDBSimilarItem,
} from "./tmdb";
import { VARIETY_GENRE_IDS } from "./discover-types";
import type { Recommendation } from "./types";

const openai = new OpenAI();

export interface RecommendFilter {
  type?: "movie" | "series" | "variety"; // variety = 예능 (TV + Reality/Talk 장르)
  origin?: "kr" | "foreign"; // undefined = 둘 다
  year?: "recent" | "2010s" | "classic"; // undefined = 전체
}

export interface WatchFeedback {
  loved: string[];   // 인생작이라고 한 작품들
  good: string[];    // 재밌었다고 한 작품들
  meh: string[];     // 그저 그랬다고 한 작품들
  dropped: string[]; // 포기한 작품들
}

function buildFeedbackPrompt(feedback?: WatchFeedback): string {
  if (!feedback) return "";
  const parts: string[] = [];
  if (feedback.loved.length > 0) {
    parts.push(`인생작: ${feedback.loved.join(", ")} — 이 결의 작품을 우선.`);
  }
  if (feedback.good.length > 0) {
    parts.push(`재밌게 본 작품: ${feedback.good.join(", ")} — 이 방향 참고.`);
  }
  if (feedback.meh.length > 0) {
    parts.push(`별로였던 작품: ${feedback.meh.join(", ")} — 이런 류는 피하기.`);
  }
  if (feedback.dropped.length > 0) {
    parts.push(`포기한 작품: ${feedback.dropped.join(", ")} — 이런 류는 제외.`);
  }
  return parts.join("\n");
}

// ---------- 내부 타입 ----------

/** 취향 작품 → TMDB 매칭 결과 */
interface MatchedFavorite {
  id: number;
  type: "movie" | "series";
  title: string;
  genreIds: number[];
}

/** 병합/랭킹 후 후보 */
interface Candidate {
  id: number;
  type: "movie" | "series";
  item: TMDBSimilarItem;
  frequency: number; // 몇 개의 favorite에서 추천됐나
  score: number;     // frequency × vote_average
}

/** 풍부화 완료된 후보 (OTT, credits, details 포함) */
interface EnrichedCandidate extends Candidate {
  providers: Array<{ name: string; logoUrl: string | null }>;
  watchLink: string | null;
  credits: { director: string | null; cast: string[] };
  details: {
    runtime: number | null;
    seasons: number | null;
    country: string[];
    backdrop: string | null;
  };
}

// ---------- Step 1: favorites → TMDB 매칭 ----------

async function matchFavoritesToTMDB(favorites: string[]): Promise<MatchedFavorite[]> {
  const results = await Promise.all(
    favorites.map(async (title) => {
      let result = await searchTMDB(title, "movie");
      let type: "movie" | "series" = "movie";
      if (!result) {
        result = await searchTMDB(title, "series");
        type = "series";
      }
      if (!result) return null;
      return { id: result.id, type, title, genreIds: result.genre_ids ?? [] };
    })
  );
  return results.filter((r): r is MatchedFavorite => r !== null);
}

// ---------- Step 2-3: 후보 수집 + 병합 + 랭킹 ----------

async function gatherCandidates(
  matched: MatchedFavorite[],
  excludeIds: Set<number>,
  excludeTitles: Set<string>
): Promise<Candidate[]> {
  // 각 취향 작품마다 movie + series 양쪽 /recommendations 호출
  // (영화 ID로 tv 호출 시 빈 결과 → 안전하게 무시됨)
  const allRecs = await Promise.all(
    matched.flatMap((fav) => [
      getTMDBRecommendations(fav.id, "movie"),
      getTMDBRecommendations(fav.id, "series"),
    ])
  );

  const freqMap = new Map<number, Candidate>();
  for (const recs of allRecs) {
    for (const item of recs) {
      if (excludeIds.has(item.id)) continue;
      if (excludeTitles.has(item.title)) continue;
      const existing = freqMap.get(item.id);
      if (existing) {
        existing.frequency++;
        existing.score = existing.frequency * (existing.item.vote_average || 1);
      } else {
        freqMap.set(item.id, {
          id: item.id,
          type: item.media_type === "tv" ? "series" : "movie",
          item,
          frequency: 1,
          score: item.vote_average || 1,
        });
      }
    }
  }

  return Array.from(freqMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
}

// ---------- Step 4: 메타데이터 풍부화 ----------

async function enrichCandidates(candidates: Candidate[]): Promise<EnrichedCandidate[]> {
  const results: EnrichedCandidate[] = [];
  const BATCH = 10;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const enriched = await Promise.all(
      batch.map(async (c) => {
        const [{ providers, watchLink }, credits, details] = await Promise.all([
          getKoreanProviders(c.id, c.type),
          getCredits(c.id, c.type),
          getDetails(c.id, c.type),
        ]);
        return { ...c, providers, watchLink, credits, details };
      })
    );
    results.push(...enriched);
    // 충분한 OTT 가용 결과가 모이면 조기 종료 (필터 후 25개 목표)
    const withOTT = results.filter((r) => r.providers.length > 0);
    if (withOTT.length >= 25) break;
  }
  return results;
}

// ---------- Step 5: 필터링 ----------

function applyFilters(
  enriched: EnrichedCandidate[],
  filter: RecommendFilter
): EnrichedCandidate[] {
  return enriched.filter((c) => {
    // 한국 OTT 가용성 필수
    if (c.providers.length === 0) return false;

    // type 필터
    if (filter.type === "movie" && c.type !== "movie") return false;
    if (filter.type === "series" && c.type !== "series") return false;

    // 예능(variety) 필터: TV이면서 genre_ids에 Reality(10764) 또는 Talk(10767) 포함
    if (filter.type === "variety") {
      if (c.type !== "series") return false;
      const hasVarietyGenre = (c.item.genre_ids ?? []).some(
        (gid) => VARIETY_GENRE_IDS.includes(gid),
      );
      if (!hasVarietyGenre) return false;
    }

    // origin 필터 (production_countries 기준)
    const isKR = c.details.country.includes("KR");
    if (filter.origin === "kr" && !isKR) return false;
    if (filter.origin === "foreign" && isKR) return false;

    // 년도 필터
    if (filter.year) {
      const dateStr = c.item.release_date ?? c.item.first_air_date ?? "";
      const year = parseInt(dateStr.slice(0, 4));
      if (isNaN(year)) return false;
      if (filter.year === "recent" && year < 2020) return false;
      if (filter.year === "2010s" && (year < 2010 || year > 2019)) return false;
      if (filter.year === "classic" && year > 2009) return false;
    }

    return true;
  });
}

// ---------- Step 6: LLM 큐레이션 (gpt-4o-mini, 1회 호출) ----------

interface CuratedPick {
  id: number;
  reason: string;
}

async function curateWithLLM(
  candidates: EnrichedCandidate[],
  favorites: string[],
  feedback?: WatchFeedback
): Promise<CuratedPick[]> {
  if (candidates.length === 0) return [];

  const candidateList = candidates
    .map((c) => {
      const year = (c.item.release_date ?? c.item.first_air_date ?? "").slice(0, 4);
      const kind = c.type === "series" ? "시리즈" : "영화";
      const rating = c.item.vote_average.toFixed(1);
      const overview = (c.item.overview ?? "").replace(/\s+/g, " ").slice(0, 150);
      return `[ID:${c.id}] ${c.item.title} (${kind}${year ? ", " + year : ""}, 평점 ${rating}) — ${overview}`;
    })
    .join("\n");

  const feedbackText = buildFeedbackPrompt(feedback);

  // 피드백 누적량에 따라 큐레이션 모드 결정
  const totalFeedback = feedback
    ? feedback.loved.length + feedback.good.length + feedback.meh.length + feedback.dropped.length
    : 0;

  let modeGuide: string;
  if (totalFeedback <= 5) {
    modeGuide = `[큐레이션 모드: 탐색]
이 사용자는 아직 탐색 초기입니다. 폭넓게 다양한 장르와 스타일의 작품을 추천하세요.
유명하지만 숨겨진 면이 있는 작품, 장르 교차 작품, 예상 밖의 선택을 우선하세요.
취향 기반 작품은 30% 이하로 제한하고, 70%는 새로운 발견 위주로 구성하세요.`;
  } else if (totalFeedback <= 20) {
    modeGuide = `[큐레이션 모드: 혼합]
취향 데이터가 어느 정도 쌓였습니다. 취향에 맞는 작품 50% + 새로운 장르/스타일 탐색 50%로 균형 잡으세요.
사용자가 좋아한 작품과 비슷한 결도 좋지만, 아직 안 접해본 장르도 반드시 포함하세요.`;
  } else {
    modeGuide = `[큐레이션 모드: 개인화]
사용자의 취향 데이터가 풍부합니다. 취향을 깊이 반영하되, 반드시 30% 이상은 사용자가 아직 안 접해본 장르나 스타일로 구성하세요.
"이런 것도 좋아할 수 있어요" 같은 의외의 추천이 반드시 포함되어야 합니다.
필터 버블에 갇히지 않게 하세요.`;
  }

  const systemPrompt = `당신은 OTT 큐레이터입니다. 아래 후보 중에서 20개를 골라 reason을 작성하세요.

${modeGuide}

[사용자 취향 기반 (참고용)]
좋아하는 작품: ${favorites.join(", ")}
${feedbackText}

[작성 규칙]
- 후보 중 20개 선택 (후보가 적으면 전부)
- 장르 다양성: 같은 장르 연속 3개 금지
- reason: 반드시 20자 이상 30자 이하, 해요체 (~해요/~이에요)
- 왜 이 사용자에게 맞는지 구체적으로 써야 함
- 좋은 예 (20-30자, 반드시 이 길이를 따라하세요):
  "중반부터 숨 못 쉬어요. 반전이 미쳤어요" (20자)
  "기생충 좋아하면 꼭 봐야 해요. 사회풍자극" (22자)
  "첫 회 끝나면 바로 다음 회 재생하게 돼요" (21자)
  "실화 기반이라 몰입감 장난 아니에요. 꼭 보세요" (24자)
- 나쁜 예 (너무 짧음, 절대 이러면 안 됨):
  "심리적 깊이가 매력" (10자) ← 너무 짧음
  "OST가 좋아요" (7자) ← 너무 짧음
  "깊은 고찰이 매력적입니다" (격식체, 추상적) ← 격식체 금지

[출력 형식 (JSON)]
{"selected": [{"id": 숫자, "reason": "문구"}, ...]}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `[후보 ${candidates.length}개]\n${candidateList}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
    });

    const content = response.choices[0].message.content;
    if (!content) return [];

    const parsed = JSON.parse(content) as Record<string, unknown>;
    const rawSelected =
      (parsed.selected as unknown[] | undefined) ??
      (parsed.recommendations as unknown[] | undefined) ??
      (Object.values(parsed).find((v) => Array.isArray(v)) as unknown[] | undefined) ??
      [];

    return rawSelected
      .filter(
        (s): s is { id: number; reason: string } =>
          typeof s === "object" &&
          s !== null &&
          typeof (s as Record<string, unknown>).id === "number" &&
          typeof (s as Record<string, unknown>).reason === "string"
      )
      .map((s) => ({ id: s.id, reason: s.reason.slice(0, 60) }));
  } catch (err) {
    console.error("LLM curation failed:", err);
    return [];
  }
}

// ---------- Step 7: Recommendation 조립 ----------

function buildRecommendationObject(
  candidate: EnrichedCandidate,
  reason: string
): Recommendation {
  const titleEn =
    candidate.item.original_title ??
    candidate.item.original_name ??
    candidate.item.title;

  return {
    title: candidate.item.title,
    titleEn,
    type: candidate.type,
    reason,
    tmdbId: candidate.id,
    posterUrl: posterUrl(candidate.item.poster_path),
    rating: candidate.item.vote_average,
    date: candidate.item.release_date ?? candidate.item.first_air_date ?? "",
    overview: candidate.item.overview ?? "",
    providers: candidate.providers,
    watchLink: candidate.watchLink,
    director: candidate.credits.director,
    cast: candidate.credits.cast,
    runtime: candidate.details.runtime,
    seasons: candidate.details.seasons,
    country: candidate.details.country,
    backdrop: candidate.details.backdrop,
    originCountry: candidate.details.country,
  };
}

// ---------- Cold Start ----------

/** vote_average / media_type에 따라 reason을 다양하게 */
function coldStartReason(item: TMDBSimilarItem): string {
  if (item.vote_average >= 8.5) return "평점이 아주 높은 화제작이에요";
  if (item.vote_average >= 8.0) return "평점 높고 지금 많이 보는 작품이에요";
  if (item.media_type === "tv") return "요즘 많이 보는 시리즈예요";
  return "이번 주 인기 작품이에요";
}

/**
 * Cold start 빠른 경로: favorites 없을 때 TMDB trending API로 직접 반환.
 * LLM 큐레이션 스킵 → ~3-5초 (기존 ~16초).
 */
async function getColdStartRecommendations(
  filter: RecommendFilter,
  exclude?: string[]
): Promise<Recommendation[]> {
  const excludeSet = new Set(exclude ?? []);

  // Step 1: TMDB trending (~500ms)
  const trending = await getTrending("week");

  // Step 2: 타입 필터
  const candidates = trending.filter((item) => {
    if (excludeSet.has(item.title)) return false;
    if (filter.type === "movie" && item.media_type !== "movie") return false;
    if (filter.type === "series" && item.media_type !== "tv") return false;
    if (filter.type === "variety" && item.media_type !== "tv") return false;
    return true;
  });

  // Step 3: enrichment (배치 10, 조기 종료)
  const enriched = await enrichCandidates(
    candidates.slice(0, 25).map((item) => ({
      id: item.id,
      type: (item.media_type === "tv" ? "series" : "movie") as "movie" | "series",
      item,
      frequency: 1,
      score: item.vote_average || 1,
    }))
  );

  // Step 4: OTT + origin 필터
  const filtered = applyFilters(enriched, filter);

  // Step 5: Recommendation 조립 (LLM 없이 기본 reason)
  const results: Recommendation[] = [];
  const usedTitles = new Set<string>();

  for (const c of filtered) {
    if (results.length >= 20) break;
    if (usedTitles.has(c.item.title)) continue;
    usedTitles.add(c.item.title);
    results.push(buildRecommendationObject(c, coldStartReason(c.item)));
  }

  return results;
}

// ---------- Main ----------

/**
 * Hybrid 추천 파이프라인:
 *   TMDB 검색 → TMDB /recommendations 병합·랭킹 → 메타 풍부화 →
 *   필터링 → LLM 큐레이션(1회, gpt-4o-mini) → 조립
 *
 * Cold start (favorites 비어있음) → TMDB trending 빠른 경로 (LLM 스킵, ~3-5초).
 * 기존 매번 LLM 호출(gpt-4o) 방식 대비 ~10배 저렴, ~3배 빠름.
 */
export async function getRecommendations(
  favorites: string[],
  filter: RecommendFilter = {},
  feedback?: WatchFeedback,
  exclude?: string[]
): Promise<Recommendation[]> {
  // Cold start: favorites 없으면 TMDB trending으로 빠르게 반환 (LLM 스킵)
  if (favorites.length === 0) {
    return getColdStartRecommendations(filter, exclude);
  }

  // Step 1: favorites 매칭
  const matched = await matchFavoritesToTMDB(favorites);
  if (matched.length === 0) return [];

  const matchedIdsSet = new Set(matched.map((m) => m.id));
  const excludeTitlesSet = new Set(exclude ?? []);

  // Step 2-3
  const candidates = await gatherCandidates(matched, matchedIdsSet, excludeTitlesSet);
  if (candidates.length === 0) return [];

  // Step 4
  const enriched = await enrichCandidates(candidates);

  // Step 5
  let filtered = applyFilters(enriched, filter).slice(0, 25);

  // Step 5.5: 크로스타입 보충 — 필터 적용 후 결과가 부족하면 discover로 보충
  // (예: 영화만 취향에 넣고 시리즈 필터 → TMDB /recommendations는 영화만 반환 → 시리즈 부족)
  if (filtered.length < 15 && (filter.type === "movie" || filter.type === "series" || filter.type === "variety")) {
    // variety: Reality/Talk 장르로 discover, 일반: matched 작품의 장르 빈도순
    const discoverType: "movie" | "series" = filter.type === "variety" ? "series" : filter.type;
    let topGenres: number[];

    if (filter.type === "variety") {
      topGenres = VARIETY_GENRE_IDS;
    } else {
      const genreFreq = new Map<number, number>();
      for (const fav of matched) {
        for (const gid of fav.genreIds) {
          genreFreq.set(gid, (genreFreq.get(gid) ?? 0) + 1);
        }
      }
      topGenres = Array.from(genreFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => id);
    }

    if (topGenres.length > 0) {
      const discoverResults = await discoverByGenres(topGenres, discoverType);
      const existingIds = new Set(candidates.map((c) => c.id));
      const supplementCandidates: Candidate[] = discoverResults
        .filter(
          (item) =>
            !existingIds.has(item.id) &&
            !matchedIdsSet.has(item.id) &&
            !excludeTitlesSet.has(item.title)
        )
        .slice(0, 20)
        .map((item) => ({
          id: item.id,
          type: discoverType,
          item,
          frequency: 1,
          score: item.vote_average || 1,
        }));

      if (supplementCandidates.length > 0) {
        const supplementEnriched = await enrichCandidates(supplementCandidates);
        const supplementFiltered = applyFilters(supplementEnriched, filter);
        filtered = [...filtered, ...supplementFiltered].slice(0, 25);
      }
    }
  }

  if (filtered.length === 0) return [];

  // Step 6
  const curated = await curateWithLLM(filtered, favorites, feedback);

  // Step 7: 조립 (ID + title 기반 중복 제거)
  const results: Recommendation[] = [];
  const usedIds = new Set<number>();
  const usedTitles = new Set<string>();

  for (const { id, reason } of curated) {
    if (results.length >= 20) break;
    const c = filtered.find((f) => f.id === id);
    if (!c || usedIds.has(c.id) || usedTitles.has(c.item.title)) continue;
    results.push(buildRecommendationObject(c, reason));
    usedIds.add(c.id);
    usedTitles.add(c.item.title);
  }

  // Fallback: LLM 실패/부족 시 상위 후보를 기본 reason으로 채움
  if (results.length < 20) {
    for (const c of filtered) {
      if (results.length >= 20) break;
      if (usedIds.has(c.id) || usedTitles.has(c.item.title)) continue;
      results.push(
        buildRecommendationObject(c, "이 작품이 취향에 맞을 것 같아요")
      );
      usedIds.add(c.id);
    }
  }

  return results.slice(0, 20);
}
