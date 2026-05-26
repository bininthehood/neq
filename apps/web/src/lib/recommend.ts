import "./env"; // validate env vars at startup
import { discoverByGenres } from "./tmdb";
import { VARIETY_GENRE_IDS } from "./discover-types";
import type { Recommendation, RecommendFilter, WatchFeedback } from "./types";
import { matchFavoritesToTMDB, gatherCandidates } from "./recommend/match";
import { enrichCandidates, enrichWithMode } from "./recommend/enrich";
import { applyFilters } from "./recommend/filter";
import {
  buildRecommendationObject,
  curateWithLLM,
  curateWithLLMStreaming,
  templateReason,
} from "./recommend/prompt";
import type {
  Candidate,
  EnrichedCandidate,
  RecommendResult,
  StreamingCallbacks,
  TokenUsage,
} from "./recommend/types";

// 외부 호환을 위해 타입 re-export (route.ts 등 호출처가 직접 참조 가능).
export type { RecommendResult, StreamingCallbacks, TokenUsage };

// ---------- Cold Start ----------

/**
 * Cold start reason — favorites 없을 때(LLM 미호출) 카드의 추천 이유.
 *
 * 의도: 추천 "이유" 설명 (왜 이 작품이 후보인지). 사용자에게 평가를 요청하는 톤(폐기됨)이 아니라,
 * `templateReason`과 동일한 톤(작품의 매력 한 가지를 짚는 해요체)으로 통일한다.
 *
 * 과거 안: 온보딩 페이지 배제 + 최초 10개 메가 히트작으로 취향 수집.
 *   → "봤다면 하트, 안 봤다면 넘겨주세요" / "이 작품 좋아하세요? 알려주세요" 등 평가 요청형 카피
 *   → 온보딩 V2 도입(welcome/hello/taste/ott/notify)으로 폐기. 취향 수집은 onboarding step에서 담당.
 *
 * 현재: cold start도 일반 추천과 동일한 "추천 이유 설명" 톤. `templateReason`을 그대로 재사용.
 */
function coldStartReason(c: EnrichedCandidate): string {
  return templateReason(c);
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

export async function getColdStartRecommendations(
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
    results.push(buildRecommendationObject(c, coldStartReason(c)));
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
 *
 * 반환값의 timings는 각 단계 소요 ms (match/gather/enrich/filter/llm/cold).
 * enrich와 filter는 보충 경로가 탔을 때 누적.
 */
export async function getRecommendations(
  favorites: string[],
  filter: RecommendFilter = {},
  feedback?: WatchFeedback,
  exclude?: string[],
  excludeIds?: number[],
  savedCount: number = 0,
  onboardingCount: number = 0,
  useMirror: boolean = false,
  // V2 (Day 22, P0-2): 둘 다 optional + default empty array → flag OFF / 미전송 시 V1 동작 그대로.
  // tasteGenres: 강한 신호 (계정 공통 장르). subscribedOtt: 약한 신호 (provider id 배열).
  tasteGenres: string[] = [],
  subscribedOtt: number[] = [],
  /**
   * 페르소나 v2 — LLM 동적 취향 설문 결과 (3-5문장 한국어). undefined 면
   * 기존 동작 (IRON RULE REGRESSION). 정의되면 LLM 큐레이션 prompt 에 prepend.
   */
  tasteSummary?: string,
): Promise<RecommendResult> {
  const timings: Record<string, number> = {};
  const mark = (key: string, t0: number) => {
    timings[key] = (timings[key] ?? 0) + Math.round(performance.now() - t0);
  };

  // Cold start: favorites 없으면 TMDB trending으로 빠르게 반환 (LLM 스킵)
  if (favorites.length === 0) {
    const t = performance.now();
    const recommendations = await getColdStartRecommendations(filter, exclude);
    mark("cold", t);
    return { recommendations, timings };
  }

  // Step 1: favorites 매칭
  const tMatch = performance.now();
  const matched = await matchFavoritesToTMDB(favorites);
  mark("match", tMatch);
  if (matched.length === 0) return { recommendations: [], timings };

  const matchedIdsSet = new Set([
    ...matched.map((m) => m.id),
    ...(excludeIds ?? []),
  ]);
  const excludeTitlesSet = new Set(exclude ?? []);

  // Step 2-3
  const tGather = performance.now();
  const candidates = await gatherCandidates(matched, matchedIdsSet, excludeTitlesSet);
  mark("gather", tGather);
  if (candidates.length === 0) return { recommendations: [], timings };

  // Step 4
  const tEnrich = performance.now();
  const enriched = await enrichWithMode(candidates, useMirror);
  mark("enrich", tEnrich);

  // Step 5
  const tFilter = performance.now();
  let filtered = applyFilters(enriched, filter).slice(0, 50);
  mark("filter", tFilter);

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
        const tSupE = performance.now();
        const supplementEnriched = await enrichWithMode(supplementCandidates, useMirror);
        mark("enrich", tSupE);
        const tSupF = performance.now();
        const supplementFiltered = applyFilters(supplementEnriched, filter);
        mark("filter", tSupF);
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
        const tYearE = performance.now();
        const yearEnriched = await enrichWithMode(yearCandidates, useMirror);
        mark("enrich", tYearE);
        const tYearF = performance.now();
        const yearFiltered = applyFilters(yearEnriched, filter);
        mark("filter", tYearF);
        filtered = [...filtered, ...yearFiltered].slice(0, 50);
      }
    }
  }

  if (filtered.length === 0) return { recommendations: [], timings };

  // Step 6
  const tLlm = performance.now();
  const curated = await curateWithLLM(
    filtered,
    favorites,
    feedback,
    savedCount,
    onboardingCount,
    tasteGenres,
    subscribedOtt,
    tasteSummary,
  );
  mark("llm", tLlm);

  // Step 7: 조립 — LLM 선택 20개 + 나머지 30개 (템플릿 reason)
  const results: Recommendation[] = [];
  const usedIds = new Set<number>();
  const usedTitles = new Set<string>();

  // Phase 1: LLM이 선택한 20개 (개인화 reason)
  for (const { id, reason } of curated.picks) {
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

  // Step 8: 장르 인터리빙 — 같은 주요 장르가 3연속 나오지 않도록 재배치
  return {
    recommendations: interleaveByGenre(results),
    timings,
    ...(curated.usage ? { usage: curated.usage } : {}),
  };
}

/** 주요 장르 ID 추출 (첫 번째 장르 사용) */
function primaryGenre(rec: Recommendation): string {
  return rec.type; // movie vs series는 기본 구분
}

/** 같은 타입(movie/series)이 3연속 나오지 않도록 재배치 */
function interleaveByGenre(recs: Recommendation[]): Recommendation[] {
  if (recs.length <= 3) return recs;

  const result: Recommendation[] = [];
  const remaining = [...recs];

  // 첫 항목 추가
  result.push(remaining.shift()!);

  while (remaining.length > 0) {
    const lastTwo = result.slice(-2).map(primaryGenre);
    const allSame = lastTwo.length === 2 && lastTwo[0] === lastTwo[1];

    if (allSame) {
      // 다른 타입의 작품을 찾아서 끼워넣기
      const diffIdx = remaining.findIndex((r) => primaryGenre(r) !== lastTwo[0]);
      if (diffIdx >= 0) {
        result.push(remaining.splice(diffIdx, 1)[0]);
        continue;
      }
    }

    result.push(remaining.shift()!);
  }

  return result;
}

// ---------- Streaming 변형 (옵션 1, Day 19 PoC, streaming-poc-design.md) ----------

/**
 * getRecommendations의 streaming 변형. LLM 단계만 element 단위 emit.
 * Phase 2 템플릿 카드는 LLM 끝난 후 한 번에 emit.
 *
 * 1차 PoC 단순화: 보충 enrich/filter 로직 (기존 getRecommendations의 보충 경로) 미구현.
 * 필요 시 후속 PR로 복원. interleaveByGenre는 stream 순서 유지로 미적용.
 */
export async function getRecommendationsStreaming(
  favorites: string[],
  filter: RecommendFilter,
  feedback: WatchFeedback | undefined,
  exclude: string[] | undefined,
  excludeIds: number[] | undefined,
  savedCount: number,
  onboardingCount: number,
  callbacks: StreamingCallbacks,
  useMirror: boolean = false,
  // V2 (Day 22, P0-2): 비-streaming 변형과 동일. flag OFF/미전송 시 빈 배열 = V1 동작.
  tasteGenres: string[] = [],
  subscribedOtt: number[] = [],
  /** 페르소나 v2 — non-streaming 변형과 동일 정책. undefined 면 IRON RULE REGRESSION. */
  tasteSummary?: string,
): Promise<void> {
  const timings: Record<string, number> = {};
  const mark = (key: string, t0: number) => {
    timings[key] = (timings[key] ?? 0) + Math.round(performance.now() - t0);
  };

  // Cold start
  if (favorites.length === 0) {
    const t = performance.now();
    const recs = await getColdStartRecommendations(filter, exclude);
    mark("cold", t);
    for (const rec of recs) callbacks.onCard(rec);
    callbacks.onTimings(timings);
    return;
  }

  const tMatch = performance.now();
  const matched = await matchFavoritesToTMDB(favorites);
  mark("match", tMatch);
  if (matched.length === 0) {
    callbacks.onTimings(timings);
    return;
  }

  const matchedIdsSet = new Set([
    ...matched.map((m) => m.id),
    ...(excludeIds ?? []),
  ]);
  const excludeTitlesSet = new Set(exclude ?? []);

  const tGather = performance.now();
  const candidates = await gatherCandidates(matched, matchedIdsSet, excludeTitlesSet);
  mark("gather", tGather);
  if (candidates.length === 0) {
    callbacks.onTimings(timings);
    return;
  }

  const tEnrich = performance.now();
  const enriched = await enrichWithMode(candidates, useMirror);
  mark("enrich", tEnrich);

  const tFilter = performance.now();
  const filtered = applyFilters(enriched, filter);
  mark("filter", tFilter);

  if (filtered.length === 0) {
    callbacks.onTimings(timings);
    return;
  }

  const tLlm = performance.now();
  const usedIds = new Set<number>();
  const usedTitles = new Set<string>();
  let phase1Count = 0;

  const usage = await curateWithLLMStreaming(
    filtered, favorites, feedback, savedCount, onboardingCount,
    (pick) => {
      if (phase1Count >= 20) return;
      const c = filtered.find((f) => f.id === pick.id);
      if (!c || usedIds.has(c.id) || usedTitles.has(c.item.title)) return;
      usedIds.add(c.id);
      usedTitles.add(c.item.title);
      phase1Count += 1;
      callbacks.onCard(buildRecommendationObject(c, pick.reason));
    },
    tasteGenres,
    subscribedOtt,
    tasteSummary,
  );
  mark("llm", tLlm);

  if (usage) callbacks.onUsage(usage);

  // Phase 2: 템플릿 reason 30개 (LLM 끝난 후 한 번에 emit)
  for (const c of filtered) {
    if (usedIds.size >= 50) break;
    if (usedIds.has(c.id) || usedTitles.has(c.item.title)) continue;
    usedIds.add(c.id);
    usedTitles.add(c.item.title);
    callbacks.onCard(buildRecommendationObject(c, templateReason(c)));
  }

  callbacks.onTimings(timings);
}
