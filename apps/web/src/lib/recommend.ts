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
import type { Recommendation, RecommendFilter, WatchFeedback } from "./types";

const openai = new OpenAI();

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

  const sorted = Array.from(freqMap.values())
    .sort((a, b) => b.score - a.score);
  // 상위 20개는 유지하고, 나머지는 셔플 → 매 호출마다 다른 조합
  const top = sorted.slice(0, 20);
  const rest = sorted.slice(20).sort(() => Math.random() - 0.5);
  return [...top, ...rest].slice(0, 100);
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
    // 충분한 OTT 가용 결과가 모이면 조기 종료 (필터 후 60개 목표)
    const withOTT = results.filter((r) => r.providers.length > 0);
    if (withOTT.length >= 60) break;
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

    // OTT 필터 (서버 사이드 — 클라이언트에서 부족할 때 전달됨)
    if (filter.ott && filter.ott.length > 0) {
      const ottSet = new Set(filter.ott);
      if (!c.providers.some((p) => ottSet.has(p.name))) return false;
    }

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
  feedback?: WatchFeedback,
  savedCount: number = 0
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

  // 취향 신호 누적량에 따라 큐레이션 모드 결정.
  // feedback(명시적 시청 반응) + savedCount(저장 = 암묵적 관심)를 합산.
  // saved만 쌓이고 watchReport 없으면 영영 "탐색" 모드에 머무는 문제 해결.
  const totalFeedback = feedback
    ? feedback.loved.length + feedback.good.length + feedback.meh.length + feedback.dropped.length
    : 0;
  const totalSignal = totalFeedback + savedCount;

  // 임계치: cold start 카드 50개 대비 사용자 반응률로 조정
  //  ≤4  탐색   — 초기 (1~8% 반응)
  //  5~9 혼합   — 어느 정도 쌓임 (10~18% 반응)
  //  ≥10 개인화 — 충분한 신호 (20%+ 반응)
  let modeGuide: string;
  if (totalSignal <= 4) {
    modeGuide = `[큐레이션 모드: 탐색]
이 사용자는 아직 탐색 초기입니다. 폭넓게 다양한 장르와 스타일의 작품을 추천하세요.
유명하지만 숨겨진 면이 있는 작품, 장르 교차 작품, 예상 밖의 선택을 우선하세요.
취향 기반 작품은 30% 이하로 제한하고, 70%는 새로운 발견 위주로 구성하세요.`;
  } else if (totalSignal <= 9) {
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

// ---------- 템플릿 reason (LLM 미선택 후보용) ----------

function templateReason(c: EnrichedCandidate): string {
  if (c.item.vote_average >= 8.5) return "평점이 아주 높은 작품이에요";
  if (c.item.vote_average >= 8.0) return "평점 높고 입소문 난 작품이에요";
  if (c.type === "series") return "한 번 시작하면 멈출 수 없는 시리즈예요";
  if (c.item.vote_average >= 7.0) return "숨겨진 명작이에요";
  return "취향에 맞을 것 같은 작품이에요";
}

// ---------- Cold Start ----------

/** 취향 수집용 reason — 사용자가 봤을 법한 메가 히트작 */
function coldStartReason(item: TMDBSimilarItem): string {
  if (item.vote_average >= 8.5) return "봤다면 하트, 안 봤다면 넘겨주세요";
  if (item.vote_average >= 8.0) return "이 작품 좋아하세요? 알려주세요";
  if (item.media_type === "tv") return "이 시리즈 본 적 있나요?";
  return "마음에 들면 하트를 눌러주세요";
}

/**
 * Cold start 빠른 경로: favorites 없을 때 TMDB trending API로 직접 반환.
 * LLM 큐레이션 스킵 → ~3-5초 (기존 ~16초).
 */
// 장르별 메가 히트작 수집용 장르 ID
const COLD_START_GENRES = {
  movie: [
    { id: 28, label: "액션" },
    { id: 35, label: "코미디" },
    { id: 18, label: "드라마" },
    { id: 878, label: "SF" },
    { id: 16, label: "애니메이션" },
    { id: 53, label: "스릴러" },
    { id: 10749, label: "로맨스" },
    { id: 80, label: "범죄" },
    { id: 27, label: "공포" },
    { id: 12, label: "모험" },
  ],
  tv: [
    { id: 18, label: "드라마" },
    { id: 80, label: "범죄" },
    { id: 10765, label: "SF/판타지" },
    { id: 16, label: "애니메이션" },
    { id: 35, label: "코미디" },
    { id: 9648, label: "미스터리" },
  ],
};

async function getColdStartRecommendations(
  filter: RecommendFilter,
  exclude?: string[]
): Promise<Recommendation[]> {
  const excludeSet = new Set(exclude ?? []);

  // Step 1: 장르별 메가 히트작 수집
  // variety(예능) 필터 → Reality/Talk 장르로 직접 호출 (솔로지옥 등 히트작)
  let allGenres: Array<{ id: number; label: string; type: "movie" | "series" }>;

  if (filter.type === "variety") {
    // Reality + Talk을 OR로 합쳐서 더 많은 결과 확보
    allGenres = [{
      id: VARIETY_GENRE_IDS[0], // OR 검색이므로 하나만 넣고 아래에서 두 장르 합침
      label: "예능",
      type: "series" as const,
    }];
  } else {
    const movieGenres = filter.type === "series" ? [] : COLD_START_GENRES.movie;
    const tvGenres = filter.type === "movie" ? [] : COLD_START_GENRES.tv;
    allGenres = [
      ...movieGenres.map((g) => ({ ...g, type: "movie" as const })),
      ...tvGenres.map((g) => ({ ...g, type: "series" as const })),
    ];
  }

  // 년도 필터 → date range 전달
  let dateRange: { gte?: string; lte?: string } | undefined;
  if (filter.year === "recent") dateRange = { gte: "2020-01-01" };
  if (filter.year === "2010s") dateRange = { gte: "2010-01-01", lte: "2019-12-31" };
  if (filter.year === "classic") dateRange = { lte: "2009-12-31" };

  // 장르별 병렬 호출 — 여러 페이지에서 수집해 결과 풀 확대
  const genreResults = await Promise.all(
    allGenres.flatMap((g) => {
      const genreIds = filter.type === "variety" ? VARIETY_GENRE_IDS : [g.id];
      const pages = filter.type === "variety" ? [1, 2, 3] : [1]; // 예능은 3페이지 수집
      return pages.map(async (page) => {
        const items = await discoverByGenres(genreIds, g.type, page, dateRange, "vote_count.desc");
        return items.slice(0, 10);
      });
    })
  );

  // 셔플
  const allItems = genreResults.flat().sort(() => Math.random() - 0.5);

  // 중복 제거 + exclude 필터
  const seen = new Set<number>();
  const candidates = allItems.filter((item) => {
    if (seen.has(item.id)) return false;
    if (excludeSet.has(item.title)) return false;
    seen.add(item.id);
    return true;
  });

  // Step 3: enrichment
  const enriched = await enrichCandidates(
    candidates.slice(0, 60).map((item) => ({
      id: item.id,
      type: (item.media_type === "tv" ? "series" : "movie") as "movie" | "series",
      item,
      frequency: 1,
      score: item.vote_average || 1,
    }))
  );

  // Step 4: 필터 적용
  let filtered = applyFilters(enriched, filter);

  // Step 4.5: 결과 부족 시 자동 폴백 — 필터를 단계적으로 넓힘
  if (filtered.length < 5) {
    // 1차: 년도 필터 해제
    if (filter.year) {
      const relaxed = applyFilters(enriched, { ...filter, year: undefined });
      if (relaxed.length > filtered.length) filtered = relaxed;
    }
    // 2차: origin 필터도 해제
    if (filtered.length < 5 && filter.origin) {
      const relaxed = applyFilters(enriched, { ...filter, year: undefined, origin: undefined });
      if (relaxed.length > filtered.length) filtered = relaxed;
    }
    // 3차: OTT 필터도 해제 (type만 유지)
    if (filtered.length < 5 && filter.ott && filter.ott.length > 0) {
      const relaxed = applyFilters(enriched, { type: filter.type });
      if (relaxed.length > filtered.length) filtered = relaxed;
    }
  }

  // Step 5: Recommendation 조립
  const results: Recommendation[] = [];
  const usedTitles = new Set<string>();

  for (const c of filtered) {
    if (results.length >= 50) break;
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
  exclude?: string[],
  excludeIds?: number[],
  savedCount: number = 0
): Promise<Recommendation[]> {
  // Cold start: favorites 없으면 TMDB trending으로 빠르게 반환 (LLM 스킵)
  if (favorites.length === 0) {
    return getColdStartRecommendations(filter, exclude);
  }

  // Step 1: favorites 매칭
  const matched = await matchFavoritesToTMDB(favorites);
  if (matched.length === 0) return [];

  const matchedIdsSet = new Set([
    ...matched.map((m) => m.id),
    ...(excludeIds ?? []),
  ]);
  const excludeTitlesSet = new Set(exclude ?? []);

  // Step 2-3
  const candidates = await gatherCandidates(matched, matchedIdsSet, excludeTitlesSet);
  if (candidates.length === 0) return [];

  // Step 4
  const enriched = await enrichCandidates(candidates);

  // Step 5
  let filtered = applyFilters(enriched, filter).slice(0, 50);

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
      const randomPage = Math.ceil(Math.random() * 3);
      const discoverResults = await discoverByGenres(topGenres, discoverType, randomPage);
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
        filtered = [...filtered, ...supplementFiltered].slice(0, 50);
      }
    }
  }

  // Step 5.6: 년도 보충 — 년도 필터 시 결과가 부족하면 discover로 보충
  if (filtered.length < 15 && filter.year) {
    const dateRange: { gte?: string; lte?: string } = {};
    if (filter.year === "recent") dateRange.gte = "2020-01-01";
    if (filter.year === "2010s") { dateRange.gte = "2010-01-01"; dateRange.lte = "2019-12-31"; }
    if (filter.year === "classic") dateRange.lte = "2009-12-31";

    // 취향 장르로 해당 년도 작품 검색
    const genreFreq = new Map<number, number>();
    for (const fav of matched) {
      for (const gid of fav.genreIds) {
        genreFreq.set(gid, (genreFreq.get(gid) ?? 0) + 1);
      }
    }
    const topGenres = Array.from(genreFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    if (topGenres.length > 0) {
      const yearPage = Math.ceil(Math.random() * 3);
      const movieResults = await discoverByGenres(topGenres, "movie", yearPage, dateRange);
      const tvResults = await discoverByGenres(topGenres, "series", yearPage, dateRange);
      const yearResults = [...movieResults, ...tvResults];

      const existingIds = new Set(filtered.map((c) => c.id));
      const yearCandidates: Candidate[] = yearResults
        .filter((item) =>
          !existingIds.has(item.id) &&
          !matchedIdsSet.has(item.id) &&
          !excludeTitlesSet.has(item.title)
        )
        .slice(0, 20)
        .map((item) => ({
          id: item.id,
          type: (item.media_type === "tv" ? "series" : "movie") as "movie" | "series",
          item,
          frequency: 1,
          score: item.vote_average || 1,
        }));

      if (yearCandidates.length > 0) {
        const yearEnriched = await enrichCandidates(yearCandidates);
        const yearFiltered = applyFilters(yearEnriched, filter);
        filtered = [...filtered, ...yearFiltered].slice(0, 50);
      }
    }
  }

  if (filtered.length === 0) return [];

  // Step 6
  const curated = await curateWithLLM(filtered, favorites, feedback, savedCount);

  // Step 7: 조립 — LLM 선택 20개 + 나머지 30개 (템플릿 reason)
  const results: Recommendation[] = [];
  const usedIds = new Set<number>();
  const usedTitles = new Set<string>();

  // Phase 1: LLM이 선택한 20개 (개인화 reason)
  for (const { id, reason } of curated) {
    if (results.length >= 20) break;
    const c = filtered.find((f) => f.id === id);
    if (!c || usedIds.has(c.id) || usedTitles.has(c.item.title)) continue;
    results.push(buildRecommendationObject(c, reason));
    usedIds.add(c.id);
    usedTitles.add(c.item.title);
  }

  // Phase 2: 나머지 후보에서 30개 추가 (템플릿 reason)
  for (const c of filtered) {
    if (results.length >= 50) break;
    if (usedIds.has(c.id) || usedTitles.has(c.item.title)) continue;
    results.push(buildRecommendationObject(c, templateReason(c)));
    usedIds.add(c.id);
    usedTitles.add(c.item.title);
  }

  return results;
}
