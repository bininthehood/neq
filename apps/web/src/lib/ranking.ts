/**
 * Phase B-2 (2026-06-06) — Ranking.
 *
 * Tier 3 리팩토링 §1 Phase B 의 두 번째 단계. B-1 (`candidate-generation.ts`)
 * 가 만든 후보 풀 (`TmdbCandidate[]`, totalScore desc) 를 받아 picks 를 선정.
 *
 * 본 모듈은 **선정만** 담당:
 *   1. `rankCandidatesLLM` — gpt-4o-mini 호출. Phase A 다양성 정책 (axis/temperature/seed) 동일 적용.
 *   2. `rankCandidatesScore` — score-based fallback. LLM 없는 경로 (cold start / quota / 에러).
 *
 * 메인 흐름 통합 (`recommend.ts` 의 enrich + 조립) 은 B-3 책임. 본 모듈은
 * 순수 ranker 로 고립.
 *
 * **변경 금지 (B-2 영역 외):**
 *   - `candidate-generation.ts` / `recommend.ts` / `recommend/prompt.ts` /
 *     `recommend/match.ts` / `recommend/enrich.ts` / `recommend/types.ts` /
 *     `app/api/recommend/route.ts`
 *
 * **IRON RULE:**
 *   - `recommend/prompt.ts` 의 export 절대 추가/변경 금지 (system prefix caching 보호).
 *   - prompt.ts 의 미export 헬퍼 (`normalizeReason` / `formatSubscribedOtt` /
 *     `buildFeedbackPrompt` / `buildModeGuide` / `buildDiversityHint`) 는 본 모듈에
 *     **동일 로직 복사** 사용. system prompt 와는 별도 user prompt 만 새로 빌드.
 *
 * 산출 spec: `_workspace/08_refactor-handoff-2026-06-06.md` §2 Phase B-2.
 */
import OpenAI from "openai";
import type { TmdbCandidate } from "./candidate-generation";
import type { WatchFeedback } from "./types";
import {
  CURATION_SYSTEM_PROMPT,
  DIVERSITY_AXES,
  dynamicTemperature,
  generateSeed,
  pickDiversityAxis,
  type DiversityAxis,
} from "./recommend/prompt";
import type {
  CuratedPick,
  CurationMeta,
  TokenUsage,
} from "./recommend/types";

const openai = new OpenAI();

// ---------- public 타입 ----------

/**
 * Ranker 입력. B-3 통합 시 `recommend.ts` 가 빌드해 넘김.
 *
 * `candidates` 는 B-1 `generateCandidates()` 출력 (totalScore desc 정렬됨).
 * 다른 필드는 user prompt 구성 + Phase A 측정용.
 */
export interface RankerInput {
  candidates: TmdbCandidate[];
  /** 페르소나 favorites 작품명 — LLM 컨텍스트 + 톤 유지용 */
  favorites: string[];
  /** 기존 prompt.ts:buildFeedbackPrompt 호환 — 시청 반응 4종 */
  feedback?: WatchFeedback;
  /** 모드 결정용 (buildModeGuide 호환) */
  savedCount: number;
  onboardingCount: number;
  /** 한글 라벨 ("스릴러", "코미디" 등) */
  tasteGenres: string[];
  /** raw provider id 배열 — LLM prompt 에 한글 라벨로 변환 */
  subscribedOttIds: number[];
  /** 페르소나 v2 — 3-5문장 한국어 요약. 정의되면 prompt prepend */
  tasteSummary?: string;
  /** dynamicTemperature 입력 (excludeIds 누적량) */
  excludeCount: number;
  /** 반환할 pick 개수 (default 20) */
  count?: number;
}

/**
 * Ranker 출력. B-3 가 picks 의 id 로 후보 lookup → enrich → Recommendation 조립.
 *
 * `meta` 는 A-3/A-4 흐름 호환 (PostHog `srv_diversity_axis/temperature/seed`).
 */
export interface RankerOutput {
  picks: CuratedPick[];
  usage: TokenUsage | null;
  meta: CurationMeta;
}

// ---------- prompt.ts 미export 헬퍼 복사 (IRON RULE — system prefix 변경 금지) ----------

/**
 * `prompt.ts:25` 의 `normalizeReason` 동일 로직 복사. trim 후 15자 미만은
 * null, 30자 초과는 자연 경계 (마침표/공백) 에서 truncate.
 */
function normalizeReason(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 15) return null;
  if (trimmed.length <= 30) return trimmed;
  const slice = trimmed.slice(0, 30);
  const punct = Math.max(
    slice.lastIndexOf("."),
    slice.lastIndexOf("?"),
    slice.lastIndexOf("!"),
  );
  if (punct >= 22) return slice.slice(0, punct + 1).trim();
  const space = slice.lastIndexOf(" ");
  if (space >= 22) return slice.slice(0, space).trim();
  return slice;
}

/** `prompt.ts:268` PROVIDER_ID_TO_KR_NAME 복사. KR 시장 주요 OTT만. */
const PROVIDER_ID_TO_KR_NAME: Record<number, string> = {
  8: "넷플릭스",
  337: "디즈니플러스",
  356: "웨이브",
  1881: "티빙",
  97: "왓챠",
  2: "애플TV",
  350: "애플TV플러스",
  119: "아마존프라임비디오",
  1796: "쿠팡플레이",
  3: "구글플레이",
};

/** `prompt.ts:282` formatSubscribedOtt 동일 로직 복사. id → 한글 콤마 리스트. */
function formatSubscribedOtt(ids: number[]): string {
  const names = ids
    .map((id) => PROVIDER_ID_TO_KR_NAME[id])
    .filter((n): n is string => typeof n === "string");
  return names.join(", ");
}

/**
 * Phase B-3 (2026-06-06) — provider id 배열을 한글 OTT name 배열로 변환.
 * LLM prompt (한글 UI 친화) 등에서 사용.
 *
 * **주의:** `candidate-generation.ts` 의 SQL/DB 매칭 (tmdb_metadata.providers JSONB
 * 의 name) 은 TMDB 원본인 **영문** 표기 ("Netflix", "TVING", "wavve", ...) 라
 * 한글 이름으로는 매칭이 0건. SQL 매칭에는 `providerIdsToTmdbNames` 를 사용하라.
 */
export function providerIdsToNames(ids: number[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const name = PROVIDER_ID_TO_KR_NAME[id];
    if (name) out.push(name);
  }
  return out;
}

/**
 * Phase B-3.1 (2026-06-06) — provider id 배열을 **TMDB 원본 영문** name 배열로 변환.
 * `candidate-generation.ts` 의 `PersonaProfile.subscribedOtt` (string[]) 빌드용 —
 * DB providers JSONB 의 name 필드와 그대로 매칭된다.
 *
 * 표기 출처: 1차 측정 (2026-06-06) 시 `tmdb_metadata.providers` sample
 *   ("Netflix", "TVING", "wavve", "Watcha", "Apple TV"). JustWatch 매핑 기준.
 *
 * 매핑 없는 id 는 silent skip.
 */
export function providerIdsToTmdbNames(ids: number[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const name = PROVIDER_ID_TO_TMDB_NAME[id];
    if (name) out.push(name);
  }
  return out;
}

/**
 * Phase B-3.1 (2026-06-06) — TMDB watch providers API 원본 영문 표기.
 * tmdb_metadata.providers JSONB.name 과 일치한다. case sensitive.
 */
const PROVIDER_ID_TO_TMDB_NAME: Record<number, string> = {
  8: "Netflix",
  337: "Disney Plus",
  356: "wavve",
  1881: "TVING",
  97: "Watcha",
  2: "Apple TV",
  350: "Apple TV Plus",
  119: "Amazon Prime Video",
  1796: "Coupang Play",
  3: "Google Play Movies",
};

/** `prompt.ts:289` buildFeedbackPrompt 동일 로직 복사. */
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

/** `prompt.ts:320` buildModeGuide 동일 로직 복사. totalSignal cutoff 4/9. */
function buildModeGuide(totalSignal: number): string {
  if (totalSignal <= 4) {
    return `[큐레이션 모드: 탐색]
이 사용자는 아직 탐색 초기입니다. 폭넓게 다양한 장르와 스타일의 작품을 추천하세요.
유명하지만 숨겨진 면이 있는 작품, 장르 교차 작품, 예상 밖의 선택을 우선하세요.
취향 기반 작품은 30% 이하로 제한하고, 70%는 새로운 발견 위주로 구성하세요.`;
  } else if (totalSignal <= 9) {
    return `[큐레이션 모드: 혼합]
취향 데이터가 어느 정도 쌓였습니다. 취향에 맞는 작품 50% + 새로운 장르/스타일 탐색 50%로 균형 잡으세요.
사용자가 좋아한 작품과 비슷한 결도 좋지만, 아직 안 접해본 장르도 반드시 포함하세요.`;
  } else {
    return `[큐레이션 모드: 개인화]
사용자의 취향 데이터가 풍부합니다. 취향을 깊이 반영하되, 반드시 30% 이상은 사용자가 아직 안 접해본 장르나 스타일로 구성하세요.
"이런 것도 좋아할 수 있어요" 같은 의외의 추천이 반드시 포함되어야 합니다.
필터 버블에 갇히지 않게 하세요.`;
  }
}

/** `prompt.ts:121` buildDiversityHint 동일 로직 복사. */
function buildDiversityHint(axis: DiversityAxis): string {
  switch (axis) {
    case "tone":
      return "이번 추천은 분위기 다양성을 특히 강조하세요. 같은 톤(어둡고 무거운 작품만, 또는 밝고 가벼운 작품만) 편중을 피하고, 무거운 작품과 가벼운 작품을 의도적으로 섞으세요.";
    case "pace":
      return "이번 추천은 호흡 다양성을 특히 강조하세요. 느리고 잔잔한 작품과 빠르고 격렬한 작품이 한 batch 에 모두 포함되도록 의식적으로 분배하세요.";
    case "era":
      return "이번 추천은 시대 다양성을 특히 강조하세요. 최근 3년 신작에만 머물지 말고, 10년+ 된 클래식과 2010년대 작품도 적극 포함하세요.";
    case "scale":
      return "이번 추천은 규모 다양성을 특히 강조하세요. 인물 중심 소품과 대규모 스케일 작품을 함께 배치해 사용자에게 두 결을 동시에 노출하세요.";
    case "origin":
      return "이번 추천은 국가 다양성을 특히 강조하세요. 한국·미국 편중에서 의도적으로 벗어나, 일본·대만·태국·유럽 등 비주류 국가의 우수 작품을 적극 포함하세요.";
  }
}

/** `prompt.ts:409` truncateTasteSummary 동일 로직 복사. 800자 sanity guard. */
const TASTE_SUMMARY_MAX_CHARS = 800;
function truncateTasteSummary(text: string): string {
  if (text.length <= TASTE_SUMMARY_MAX_CHARS) return text;
  const sliced = text.slice(0, TASTE_SUMMARY_MAX_CHARS);
  const match = sliced.match(/[\s\S]*[.!?](?=\s|$)/);
  if (match) return match[0];
  return sliced + "...";
}

// ---------- ranking 전용 user prompt builder ----------

/**
 * B-2 전용 user prompt. `buildCurationUserPrompt` 와 구조는 동일하지만 후보
 * listing 만 `TmdbCandidate` 기반으로 새로 직렬화. (EnrichedCandidate 강제 변환
 * 은 의미 없는 reverse-engineering 이라 회피.)
 *
 * 섹션:
 *   1. 모드 가이드 (buildModeGuide)
 *   2. 사용자 취향 (favorites + tasteGenres + 구독 OTT + feedback)
 *   3. 페르소나 취향 요약 (tasteSummary, optional)
 *   4. 다양성 강조 (diversityAxis, axis 별 hint)
 *   5. 후보 list (TmdbCandidate → ID/type/title/year/rating/providers/overview)
 *   6. 출력 지시 — JSON `{selected: [{id, reason}]}`
 *
 * **system prompt (`CURATION_SYSTEM_PROMPT`) 는 그대로 재사용** — caching prefix
 * 안정성 유지 (1024+ 토큰 동일 prefix).
 */
function buildRankingUserPrompt(
  input: RankerInput,
  axis: DiversityAxis,
): string {
  const {
    candidates,
    favorites,
    feedback,
    savedCount,
    onboardingCount,
    tasteGenres,
    subscribedOttIds,
    tasteSummary,
    count = 20,
  } = input;

  const feedbackText = buildFeedbackPrompt(feedback);
  const tasteGenresLine =
    tasteGenres.length > 0
      ? `사용자 선호 장르 (계정 공통): ${tasteGenres.join(", ")}`
      : "";
  const subscribedOttKr = formatSubscribedOtt(subscribedOttIds);
  const subscribedOttLine =
    subscribedOttKr.length > 0
      ? `구독 OTT (참고용 가중치, 강한 필터 X): ${subscribedOttKr}`
      : "";
  const v2Lines = [tasteGenresLine, subscribedOttLine].filter(Boolean).join("\n");
  const v2Block = v2Lines ? `\n${v2Lines}` : "";
  const favoritesLabel =
    tasteGenresLine || subscribedOttLine
      ? "이 페르소나의 좋아한 작품"
      : "좋아하는 작품";

  const totalFeedback = feedback
    ? feedback.loved.length +
      feedback.good.length +
      feedback.meh.length +
      feedback.dropped.length
    : 0;
  const totalSignal = totalFeedback + savedCount + onboardingCount;
  const modeGuide = buildModeGuide(totalSignal);

  const tasteSummaryBlock =
    tasteSummary && tasteSummary.trim().length > 0
      ? `\n\n[페르소나 취향]\n${truncateTasteSummary(tasteSummary.trim())}`
      : "";

  const diversityBlock = `\n\n[다양성 강조 (이번 호출)]\n${buildDiversityHint(axis)}`;

  // 후보 listing — B-1 TmdbCandidate 기반 한 줄 포맷.
  // ID + type + title + 연도 + 평점 + providers (최대 3개) + overview (120자 자름).
  const candidateList = candidates
    .map((c) => {
      const year = c.releaseDate?.slice(0, 4) ?? "?";
      const kind = c.type === "series" ? "시리즈" : "영화";
      const rating = (c.rating ?? 0).toFixed(1);
      const providersStr = c.providers
        .map((p) => p.name)
        .slice(0, 3)
        .join("/");
      const overview = (c.overview ?? "")
        .replace(/\s+/g, " ")
        .slice(0, 120);
      const providersPart = providersStr ? `, ${providersStr}` : "";
      return `[ID:${c.tmdbId}] ${c.title} (${kind}, ${year}, 평점 ${rating}${providersPart}) — ${overview}`;
    })
    .join("\n");

  return `${modeGuide}

[사용자 취향 기반]
${favoritesLabel}: ${favorites.join(", ")}${v2Block}
${feedbackText}${tasteSummaryBlock}${diversityBlock}

[후보 ${candidates.length}개]
${candidateList}

위 후보에서 ${count}개를 골라 JSON 으로 응답하세요. 형식: {"selected":[{"id":<숫자>,"reason":"<한 줄 문구>"}, ...]}. reason 은 시스템 규칙 (20~30자, 해요체, 작품 특정성) 을 반드시 따르세요.`;
}

// ---------- 메인: rankCandidatesLLM ----------

/**
 * Phase B-2 LLM ranker. `curateWithLLM` (prompt.ts:497) 의 골격 패턴 답습:
 *
 *   1. candidates 0 → 빈 picks + meta(none/0/0). LLM 호출 skip.
 *   2. axis/temperature/seed 호출별 결정 (Phase A-1/A-2/A-3).
 *   3. user prompt 빌드 + openai.chat.completions.create.
 *   4. selected/recommendations/fallback 폴백 파싱 + normalizeReason.
 *   5. count slice (default 20). catch → 빈 picks + usage null + meta 살림.
 *
 * **에러 시 meta 는 보존** — PostHog 측정 노이즈 회피. B-3 의 fallback ladder 가
 * picks=[] 만 보고 rankCandidatesScore 로 재시도하면 됨.
 */
export async function rankCandidatesLLM(
  input: RankerInput,
): Promise<RankerOutput> {
  const { candidates, count = 20, excludeCount } = input;

  // Phase A — 호출별 다양성 축 + 동적 temperature + 랜덤 seed.
  const axis = pickDiversityAxis();
  const temperature = dynamicTemperature(excludeCount);
  const seed = generateSeed();
  const meta: CurationMeta = {
    diversity_axis: axis,
    temperature,
    seed,
  };

  if (candidates.length === 0) {
    return {
      picks: [],
      usage: null,
      meta: { diversity_axis: "none", temperature: 0, seed: 0 },
    };
  }

  const userPrompt = buildRankingUserPrompt(input, axis);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: CURATION_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature,
      seed,
    });

    const usage: TokenUsage = {
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
      cached_tokens: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    };

    const content = response.choices[0]?.message?.content;
    if (!content) return { picks: [], usage, meta };

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch (parseErr) {
      console.error("LLM ranking JSON parse failed:", parseErr);
      return { picks: [], usage, meta };
    }

    const rawSelected =
      (parsed.selected as unknown[] | undefined) ??
      (parsed.recommendations as unknown[] | undefined) ??
      (Object.values(parsed).find((v) => Array.isArray(v)) as
        | unknown[]
        | undefined) ??
      [];

    const candidateIds = new Set(candidates.map((c) => c.tmdbId));
    const picks: CuratedPick[] = [];
    for (const s of rawSelected) {
      if (
        typeof s !== "object" ||
        s === null ||
        typeof (s as Record<string, unknown>).id !== "number" ||
        typeof (s as Record<string, unknown>).reason !== "string"
      ) {
        continue;
      }
      const item = s as { id: number; reason: string };
      // 후보에 없는 ID 차단 (system prompt 가 강제하지만 LLM 변동성 대비 안전망).
      if (!candidateIds.has(item.id)) continue;
      const normalized = normalizeReason(item.reason);
      if (normalized === null) continue;
      picks.push({ id: item.id, reason: normalized });
      if (picks.length >= count) break;
    }
    return { picks, usage, meta };
  } catch (err) {
    console.error("LLM ranking failed:", err);
    return { picks: [], usage: null, meta };
  }
}

// ---------- 메인: rankCandidatesScore (LLM 없는 fallback) ----------

/**
 * Score-based fallback ranker. LLM 없는 경로 — cold start / quota 초과 / 에러 시
 * B-3 의 fallback ladder 가 호출.
 *
 * 정책:
 *   1. candidates 는 이미 totalScore desc 정렬 (B-1 generateCandidates).
 *   2. count 만큼 slice — 다양성을 위해 top 5 는 고정, 6~count 는 가벼운 셔플.
 *   3. reason 은 한 줄 한국어 — rating/장르/연식 기반 템플릿.
 *   4. meta = { diversity_axis: "score-fallback", temperature: 0, seed: 0 }
 *      — PostHog 에서 LLM 미사용 케이스 구분.
 */
export function rankCandidatesScore(input: RankerInput): RankerOutput {
  const { candidates, count = 20 } = input;

  if (candidates.length === 0) {
    return {
      picks: [],
      usage: null,
      meta: { diversity_axis: "none", temperature: 0, seed: 0 },
    };
  }

  // 다양성 셔플: top 5 는 그대로, 6~count 는 totalScore 순서 유지하되 일부 swap.
  // match.ts:gatherCandidates §59-65 의 패턴 답습 — Math.random 기반 가벼운 셔플.
  const TOP_FIXED = 5;
  const head = candidates.slice(0, Math.min(TOP_FIXED, candidates.length));
  const tail = candidates.slice(TOP_FIXED);
  // tail 을 셔플 (Fisher-Yates 부분 셔플) — totalScore 기반 정렬은 깨지되 cluster
  // 안에서 동등한 후보들 사이의 노출 순서가 호출마다 다르게.
  for (let i = tail.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tail[i], tail[j]] = [tail[j], tail[i]];
  }
  const selected = [...head, ...tail].slice(0, count);

  const picks: CuratedPick[] = [];
  for (const c of selected) {
    const reason = buildScoreFallbackReason(c);
    const normalized = normalizeReason(reason);
    // normalizeReason 통과 못 하면 더 안전한 fallback 으로 교체.
    if (normalized !== null) {
      picks.push({ id: c.tmdbId, reason: normalized });
      continue;
    }
    const safeReason = c.type === "series"
      ? "한 번 시작하면 멈출 수 없는 시리즈예요"
      : "취향에 맞을 것 같은 작품이에요";
    const safeNorm = normalizeReason(safeReason);
    if (safeNorm !== null) {
      picks.push({ id: c.tmdbId, reason: safeNorm });
    }
  }

  return {
    picks,
    usage: null,
    meta: { diversity_axis: "score-fallback", temperature: 0, seed: 0 },
  };
}

// ---------- score fallback 의 reason 빌더 ----------

/**
 * TmdbCandidate → 한 줄 reason (15~30자 정도). normalizeReason 통과를 의식해
 * 15자 미만 케이스 회피. 정확한 정보 (rating/장르/연식) 만 사용해 LLM 환각 회피.
 */
function buildScoreFallbackReason(c: TmdbCandidate): string {
  const rating = c.rating ?? 0;
  const year = c.releaseDate ? parseInt(c.releaseDate.slice(0, 4), 10) : NaN;
  const kindKr = c.type === "series" ? "시리즈" : "영화";

  // rating 우선 — 7.5+ 면 평점 강조 (정량 신호 가장 강함)
  if (rating >= 7.5) {
    return `평점 ${rating.toFixed(1)} 의 인기 ${kindKr}예요`;
  }
  // 신작 (최근 3년) — 발견 가치 강조
  if (!Number.isNaN(year) && year >= new Date().getFullYear() - 2) {
    return `최근에 나온 ${kindKr}, 한 번 살펴봐요`;
  }
  // 클래식 (10년+) — 검증된 작품으로 포지셔닝
  if (!Number.isNaN(year) && year <= new Date().getFullYear() - 10) {
    return `세월이 지나도 회자되는 ${kindKr}예요`;
  }
  // 한국 작품 — 정체성 강조
  if (c.country.includes("KR") || c.originCountry.includes("KR")) {
    return `한국 ${kindKr}, 취향에 맞을 거예요`;
  }
  // 폴백 — 작품명 + 결 (작품명 길이에 따라 변동)
  return `${kindKr} ${c.title}, 한 번 살펴봐요`;
}

// ---------- DIVERSITY_AXES re-export (테스트 의존 회피용) ----------

export { DIVERSITY_AXES };
