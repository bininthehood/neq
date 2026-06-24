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
// Phase B-3 (2026-06-06) — 2-stage 통합 (Tier 3 §1 Phase B).
//   B-1: candidate pool retrieval (TMDB mirror SQL)
//   B-2: ranking (LLM + score fallback)
// 본 파일은 wiring 만 — 두 모듈 출력을 enrich-호환 객체로 변환해 buildRecommendationObject 에 흘림.
import {
  generateCandidates,
  stratifiedSample,
  type PersonaProfile,
  type TmdbCandidate,
} from "./candidate-generation";

// LLM rerank 입력 캡 — retrieval→rerank 정공법: 비싼 LLM 은 *소수*만 재정렬.
//   후보 전량(ANN 150 / SQL 최대 500)을 직렬화하면 prompt ~20K~40K 토큰 → first-token
//   지연(rank 단계가 전체 latency 병목). count(20) pick 보다 넉넉히 위인 50 으로 캡하되,
//   stratifiedSample(상위 deterministic + 가중 random tail)로 골라 관련성 + 다양성 보존.
//   Phase 2(나머지 30 채움)는 전체 풀을 그대로 사용 → 50건 출력 불변.
//   완성형 다양성 선별은 P3(DPP)가 이 자리를 대체. count 변경 시 INPUT > count 유지.
const LLM_RERANK_INPUT = 35;
const LLM_RERANK_TOPK = 18;
import {
  rankCandidatesLLM,
  rankCandidatesLLMStreaming,
  rankCandidatesScore,
  providerIdsToTmdbNames,
} from "./ranking";
import type { TMDBSimilarItem } from "./tmdb";
// Phase C (2026-06-06) — diversity reorder (장르/연도/OTT cap).
// 기존 interleaveByGenre (type 연속만 차단) 의 superset → 교체.
import { applyDiversityReorder } from "./diversity";

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

  // ─────────────────────────────────────────────────────────────────────
  // Phase B-3 (2026-06-06): 2-stage 통합.
  //   Stage 1 (B-1): generateCandidates — TMDB mirror SQL 로 KR universe 후보 풀 retrieve
  //   Stage 2 (B-2): rankCandidatesLLM / rankCandidatesScore — picks 선정
  //
  // fallback ladder:
  //   throws / 0 후보 → 기존 gather/enrich/filter/curateWithLLM 경로 (inline 보존)
  //   LLM picks=0       → score fallback (안전망)
  //
  // streaming 변형 (`getRecommendationsStreaming`) 는 본 PR 변경 0.
  // ─────────────────────────────────────────────────────────────────────

  // PersonaProfile 빌드 — favorites 의 장르 빈도 + tasteGenres + 구독 OTT
  const favoriteGenreIdFreq = new Map<number, number>();
  for (const fav of matched) {
    for (const gid of fav.genreIds) {
      favoriteGenreIdFreq.set(gid, (favoriteGenreIdFreq.get(gid) ?? 0) + 1);
    }
  }
  const profile: PersonaProfile = {
    favoriteGenreIds: Array.from(favoriteGenreIdFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id),
    favoriteTmdbIds: matched.map((m) => m.id),
    tasteGenres,
    // B-3.1: DB providers JSONB.name 이 영문 (Netflix/TVING/wavve) 이라
    // 한글 (providerIdsToNames) 로는 매칭 0건 → 영문 변환 사용
    subscribedOtt: providerIdsToTmdbNames(subscribedOtt),
    // match.ts 가 release_year 미반환 — favoriteDecades 는 Phase B 후속 트랙.
    favoriteDecades: [],
  };

  // Stage 1: candidate pool retrieval
  let tmdbCandidates: TmdbCandidate[] = [];
  let usedFallback = false;
  const tCands = performance.now();
  try {
    tmdbCandidates = await generateCandidates(
      profile,
      filter,
      Array.from(matchedIdsSet),
      500, // poolSize — B-3.1: 인덱스 정착 후 200 → 500 복귀. 다양성 확보 (Phase 2 셔플과 결합)
    );
  } catch (err) {
    console.error("[B-3] generateCandidates failed, falling back:", err);
    usedFallback = true;
  }
  mark("candidates", tCands);

  // ── Fallback ladder: 0 후보 OR throws → 기존 gather/enrich/filter/curateWithLLM ──
  if (usedFallback || tmdbCandidates.length === 0) {
    const tFallback = performance.now();

    // Step 2-3: gather
    const tGather = performance.now();
    const candidates = await gatherCandidates(matched, matchedIdsSet, excludeTitlesSet);
    mark("gather", tGather);
    if (candidates.length === 0) {
      mark("fallback", tFallback);
      return { recommendations: [], timings };
    }

    // Step 4: enrich
    const tEnrich = performance.now();
    const enriched = await enrichWithMode(candidates, useMirror);
    mark("enrich", tEnrich);

    // Step 5: filter
    const tFilter = performance.now();
    let filtered = applyFilters(enriched, filter).slice(0, 50);
    mark("filter", tFilter);

    // Step 5.5: 크로스타입 보충 — 필터 적용 후 결과가 부족하면 discover로 보충
    if (filtered.length < 15 && (filter.type === "movie" || filter.type === "series" || filter.type === "variety")) {
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

    // Step 5.6: 년도 보충
    if (filtered.length < 15 && filter.year) {
      const dateRange: { gte?: string; lte?: string } = {};
      if (filter.year === "recent") dateRange.gte = "2020-01-01";
      if (filter.year === "2010s") { dateRange.gte = "2010-01-01"; dateRange.lte = "2019-12-31"; }
      if (filter.year === "classic") dateRange.lte = "2009-12-31";

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

    if (filtered.length === 0) {
      mark("fallback", tFallback);
      return { recommendations: [], timings };
    }

    // Step 6: curateWithLLM (기존 경로)
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
      matchedIdsSet.size,
    );
    mark("llm", tLlm);

    // Step 7: 조립
    const results: Recommendation[] = [];
    const usedIds = new Set<number>();
    const usedTitles = new Set<string>();

    for (const { id, reason } of curated.picks) {
      if (results.length >= 20) break;
      const c = filtered.find((f) => f.id === id);
      if (!c || usedIds.has(c.id) || usedTitles.has(c.item.title)) continue;
      results.push(buildRecommendationObject(c, reason));
      usedIds.add(c.id);
      usedTitles.add(c.item.title);
    }

    for (const c of filtered) {
      if (results.length >= 50) break;
      if (usedIds.has(c.id) || usedTitles.has(c.item.title)) continue;
      results.push(buildRecommendationObject(c, templateReason(c)));
      usedIds.add(c.id);
      usedTitles.add(c.item.title);
    }

    mark("fallback", tFallback);

    return {
      recommendations: applyDiversityReorder(results),
      timings,
      ...(curated.usage ? { usage: curated.usage } : {}),
      meta: curated.meta,
    };
  }

  // ── 정상 경로 (2-stage) — Stage 2: rank ──
  const tRank = performance.now();
  // LLM rerank 입력만 ~50 으로 캡 (Phase 2 는 아래에서 전체 tmdbCandidates 사용).
  const rankPool = stratifiedSample(
    tmdbCandidates,
    LLM_RERANK_INPUT,
    LLM_RERANK_TOPK,
  );
  let ranked = await rankCandidatesLLM({
    candidates: rankPool,
    favorites,
    feedback,
    savedCount,
    onboardingCount,
    tasteGenres,
    subscribedOttIds: subscribedOtt,
    tasteSummary,
    excludeCount: matchedIdsSet.size,
    count: 20,
  });
  mark("rank", tRank);

  // LLM picks=0 → score fallback (안전망 — 외부 호출 실패 / JSON 파싱 실패 / 0 normalize 등)
  if (ranked.picks.length === 0) {
    ranked = rankCandidatesScore({
      candidates: tmdbCandidates,
      favorites,
      feedback,
      savedCount,
      onboardingCount,
      tasteGenres,
      subscribedOttIds: subscribedOtt,
      tasteSummary,
      excludeCount: matchedIdsSet.size,
      count: 20,
    });
  }

  // 조립 — picks 의 id 로 tmdbCandidates lookup → EnrichedCandidate 변환 → buildRecommendationObject
  const results: Recommendation[] = [];
  const usedIds = new Set<number>();
  const usedTitles = new Set<string>();

  const candidateById = new Map(tmdbCandidates.map((c) => [c.tmdbId, c]));

  // Phase 1: LLM picks 20개 (개인화 reason)
  for (const { id, reason } of ranked.picks) {
    if (results.length >= 20) break;
    const tc = candidateById.get(id);
    if (!tc || usedIds.has(tc.tmdbId) || usedTitles.has(tc.title)) continue;
    const enriched = tmdbCandidateToEnriched(tc);
    results.push(buildRecommendationObject(enriched, reason));
    usedIds.add(tc.tmdbId);
    usedTitles.add(tc.title);
  }

  // Phase 2: 나머지 후보에서 30개 (templateReason)
  //   B-3.1 (2026-06-06): 기존 totalScore desc 순서 유지 → 매 batch 동일한 top 30
  //   반환 → Jaccard floor ~60% 강제. match.ts:gatherCandidates 패턴 차용 —
  //   top 20 (개인화 강한 신호) 는 desc 유지, 나머지는 호출별 셔플로 다양성 확보.
  const phase2Pool = tmdbCandidates.filter(
    (tc) => !usedIds.has(tc.tmdbId) && !usedTitles.has(tc.title),
  );
  const phase2Top = phase2Pool.slice(0, 20);
  const phase2Rest = phase2Pool.slice(20).sort(() => Math.random() - 0.5);
  for (const tc of [...phase2Top, ...phase2Rest]) {
    if (results.length >= 50) break;
    const enriched = tmdbCandidateToEnriched(tc);
    results.push(buildRecommendationObject(enriched, templateReason(enriched)));
    usedIds.add(tc.tmdbId);
    usedTitles.add(tc.title);
  }

  return {
    recommendations: applyDiversityReorder(results),
    timings,
    ...(ranked.usage ? { usage: ranked.usage } : {}),
    // Phase A-3/A-4 (2026-06-06) — LLM 호출 메타데이터. score fallback 경로에서는
    // diversity_axis="score-fallback", temperature=0, seed=0 으로 흐름. PostHog
    // 에서 LLM 미사용 케이스 구분 가능.
    meta: ranked.meta,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Phase B-3 (2026-06-06) — TmdbCandidate → EnrichedCandidate 변환.
//
// buildRecommendationObject (prompt.ts:719) 가 실제로 읽는 필드만 채움:
//   - candidate.item.{title, original_title|original_name, poster_path,
//                     vote_average, release_date|first_air_date, overview,
//                     genre_ids, media_type}
//   - candidate.type / candidate.id
//   - candidate.providers / candidate.watchLink
//   - candidate.credits.{director, cast, directorMember, castMembers}
//   - candidate.details.{runtime, seasons, country, backdrop}
//
// mirror 한계: directorMember / castMembers (id+profile photo) 미보유 — DetailSheet
// 의 lazy hydrate 가 채움. 그 동안은 (null / []) 로 둠 — enrich.ts:rowToEnrichedFields
// 와 동일 패턴.
// ─────────────────────────────────────────────────────────────────────
function tmdbCandidateToEnriched(c: TmdbCandidate): EnrichedCandidate {
  const item: TMDBSimilarItem = {
    id: c.tmdbId,
    title: c.title,
    original_title: c.titleEn ?? undefined,
    original_name: c.titleEn ?? undefined,
    media_type: c.type === "series" ? "tv" : "movie",
    poster_path: c.posterPath,
    vote_average: c.rating ?? 0,
    overview: c.overview ?? "",
    release_date: c.type === "movie" ? (c.releaseDate ?? undefined) : undefined,
    first_air_date: c.type === "series" ? (c.releaseDate ?? undefined) : undefined,
    genre_ids: c.genreIds,
    popularity: c.popularity,
  };

  return {
    id: c.tmdbId,
    type: c.type,
    item,
    frequency: 1,
    score: c.totalScore,
    providers: c.providers.map((p) => ({ name: p.name, logoUrl: p.logoUrl })),
    watchLink: c.watchLink,
    credits: {
      director: c.director,
      cast: c.castNames,
      directorMember: null,
      castMembers: [],
    },
    details: {
      runtime: c.runtime,
      seasons: c.seasons,
      country: c.country.length > 0 ? c.country : c.originCountry,
      backdrop: c.backdropPath
        ? `https://image.tmdb.org/t/p/w780${c.backdropPath}`
        : null,
    },
  };
}

// Phase C (2026-06-06) — interleaveByGenre / primaryGenre 제거.
// applyDiversityReorder (lib/diversity.ts) 가 superset 으로 교체.

// ---------- Streaming 변형 (옵션 1, Day 19 PoC → Phase D-2 2-stage 통합 2026-06-07) ----------

/**
 * getRecommendations 의 streaming 변형. 2-stage 통합 후 (Phase D-2):
 *
 *   ┌─ favorites === 0 → coldStartReason (변경 0)
 *   └─ favorites > 0 (정상 경로):
 *       1. match  — matchFavoritesToTMDB
 *       2. PersonaProfile build  (non-streaming 과 동일)
 *       3. generateCandidates (B-1, poolSize 500, topK 30)
 *          throws / 0 → fallback ladder 진입 (기존 gather/enrich/filter/curateWithLLMStreaming)
 *       4. Phase 1: rankCandidatesLLMStreaming (B-2 streaming 변형)
 *          stream chunk → onPick → 후보 lookup → 즉시 callbacks.onCard
 *          (phase 1 picks 는 buffer 금지 — streaming UX 핵심)
 *       5. LLM picks 0 안전망 → rankCandidatesScore (안전망)
 *       6. Phase 2: 잔여 후보 30개 score-fill (top 20 유지 + 나머지 셔플) →
 *          applyDiversityReorder 는 **phase 2 만** 적용 → 순차 emit
 *          (phase 1 stream 순서 보존 — 이미 emit 된 카드 재정렬 불가)
 *
 * Phase D 측정 결과 (2026-06-06): prod 사용자 83% 가 streaming 분기 호출 → 본
 * 통합 후 2-stage 효과 (Jaccard 하락 / 다양성 증가) 가 prod 사용자 전체에 적용.
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

  // Cold start (변경 0)
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

  // PersonaProfile 빌드 — non-streaming 경로 §262~280 와 동일.
  const favoriteGenreIdFreq = new Map<number, number>();
  for (const fav of matched) {
    for (const gid of fav.genreIds) {
      favoriteGenreIdFreq.set(gid, (favoriteGenreIdFreq.get(gid) ?? 0) + 1);
    }
  }
  const profile: PersonaProfile = {
    favoriteGenreIds: Array.from(favoriteGenreIdFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id),
    favoriteTmdbIds: matched.map((m) => m.id),
    tasteGenres,
    subscribedOtt: providerIdsToTmdbNames(subscribedOtt),
    favoriteDecades: [],
  };

  // Stage 1: candidate pool retrieval (B-1, B-3.2 stochasticity)
  let tmdbCandidates: TmdbCandidate[] = [];
  let usedFallback = false;
  const tCands = performance.now();
  try {
    tmdbCandidates = await generateCandidates(
      profile,
      filter,
      Array.from(matchedIdsSet),
      500, // poolSize — non-streaming 과 동일 (B-3.1)
      // topK default 30 (B-3.2)
    );
  } catch (err) {
    console.error(
      "[B-3 streaming] generateCandidates failed, falling back:",
      err,
    );
    usedFallback = true;
  }
  mark("candidates", tCands);

  // ── Fallback ladder: 0 후보 OR throws → 기존 gather/enrich/filter/curateWithLLMStreaming ──
  if (usedFallback || tmdbCandidates.length === 0) {
    const tFallback = performance.now();

    const tGather = performance.now();
    const candidates = await gatherCandidates(
      matched,
      matchedIdsSet,
      excludeTitlesSet,
    );
    mark("gather", tGather);
    if (candidates.length === 0) {
      mark("fallback", tFallback);
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
      mark("fallback", tFallback);
      callbacks.onTimings(timings);
      return;
    }

    const tLlm = performance.now();
    const usedIds = new Set<number>();
    const usedTitles = new Set<string>();
    let phase1Count = 0;

    const usage = await curateWithLLMStreaming(
      filtered,
      favorites,
      feedback,
      savedCount,
      onboardingCount,
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
      matchedIdsSet.size,
      (meta) => callbacks.onMeta?.(meta),
    );
    mark("llm", tLlm);

    if (usage) callbacks.onUsage(usage);

    for (const c of filtered) {
      if (usedIds.size >= 50) break;
      if (usedIds.has(c.id) || usedTitles.has(c.item.title)) continue;
      usedIds.add(c.id);
      usedTitles.add(c.item.title);
      callbacks.onCard(buildRecommendationObject(c, templateReason(c)));
    }

    mark("fallback", tFallback);
    callbacks.onTimings(timings);
    return;
  }

  // ── 정상 경로 (2-stage streaming) ──
  const candidateById = new Map(
    tmdbCandidates.map((c) => [c.tmdbId, c]),
  );
  const usedIds = new Set<number>();
  const usedTitles = new Set<string>();
  let phase1Count = 0;

  // Phase 1: rankCandidatesLLMStreaming — stream pick → 즉시 onCard (buffer 금지)
  const tRank = performance.now();
  // LLM rerank 입력만 ~50 으로 캡 (Phase 2 는 아래에서 전체 tmdbCandidates 사용).
  const rankPool = stratifiedSample(
    tmdbCandidates,
    LLM_RERANK_INPUT,
    LLM_RERANK_TOPK,
  );
  const usage = await rankCandidatesLLMStreaming(
    {
      candidates: rankPool,
      favorites,
      feedback,
      savedCount,
      onboardingCount,
      tasteGenres,
      subscribedOttIds: subscribedOtt,
      tasteSummary,
      excludeCount: matchedIdsSet.size,
      count: 20,
    },
    (pick) => {
      if (phase1Count >= 20) return;
      const tc = candidateById.get(pick.id);
      if (!tc) return;
      if (usedIds.has(tc.tmdbId) || usedTitles.has(tc.title)) return;
      const enriched = tmdbCandidateToEnriched(tc);
      usedIds.add(tc.tmdbId);
      usedTitles.add(tc.title);
      phase1Count += 1;
      callbacks.onCard(buildRecommendationObject(enriched, pick.reason));
    },
    (meta) => callbacks.onMeta?.(meta),
  );
  mark("rank", tRank);

  if (usage) callbacks.onUsage(usage);

  // LLM picks 0 안전망 — rankCandidatesScore 로 phase 1 자리 채움.
  // (외부 호출 실패 / JSON 파싱 실패 / normalize 0 통과 등)
  if (phase1Count === 0) {
    const ranked = rankCandidatesScore({
      candidates: tmdbCandidates,
      favorites,
      feedback,
      savedCount,
      onboardingCount,
      tasteGenres,
      subscribedOttIds: subscribedOtt,
      tasteSummary,
      excludeCount: matchedIdsSet.size,
      count: 20,
    });
    for (const { id, reason } of ranked.picks) {
      if (phase1Count >= 20) break;
      const tc = candidateById.get(id);
      if (!tc || usedIds.has(tc.tmdbId) || usedTitles.has(tc.title)) continue;
      const enriched = tmdbCandidateToEnriched(tc);
      usedIds.add(tc.tmdbId);
      usedTitles.add(tc.title);
      phase1Count += 1;
      callbacks.onCard(buildRecommendationObject(enriched, reason));
    }
  }

  // Phase 2: score-fill 30 + diversity reorder.
  //   - top 20 유지 + 나머지 셔플 (B-3.1 패턴)
  //   - **phase 2 만** applyDiversityReorder 적용. phase 1 의 stream 순서는
  //     이미 사용자에게 emit 되어 재정렬 불가 (50개 합쳐 reorder 하면 phase 1
  //     카드 위치가 변동 → UX 손상). 본 정책은 협상 불가.
  const tPhase2 = performance.now();
  const phase2Pool = tmdbCandidates.filter(
    (tc) => !usedIds.has(tc.tmdbId) && !usedTitles.has(tc.title),
  );
  const phase2Top = phase2Pool.slice(0, 20);
  const phase2Rest = phase2Pool.slice(20).sort(() => Math.random() - 0.5);
  const phase2Slots = Math.max(0, 50 - phase1Count);
  const phase2Recs: Recommendation[] = [];
  for (const tc of [...phase2Top, ...phase2Rest]) {
    if (phase2Recs.length >= phase2Slots) break;
    const enriched = tmdbCandidateToEnriched(tc);
    phase2Recs.push(
      buildRecommendationObject(enriched, templateReason(enriched)),
    );
  }

  mark("phase2", tPhase2);
  const reordered = applyDiversityReorder(phase2Recs);
  for (const rec of reordered) callbacks.onCard(rec);

  callbacks.onTimings(timings);
}
