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

// LLM 큐레이션의 고정 prefix. 사용자별 동적 데이터(modeGuide, 취향, 후보)는 user 메시지로 이동시켜
// OpenAI prompt caching prefix를 안정화한다. 1024+ 토큰 동일 prefix 시 자동 cache hit (gpt-4o-mini).
// 1차 push(380 토큰 추정)는 임계 미달로 caching 미발현. 본 확장으로 1024+ 통과 + 모델 출력 가이드 강화.
const CURATION_SYSTEM_PROMPT = `당신은 한국 사용자를 위한 OTT 큐레이터입니다. 사용자 메시지에 담긴 큐레이션 모드와 취향 정보를 바탕으로 후보 중에서 20개를 골라 reason을 작성하세요. 평점만 따라가지 말고 사용자 취향과 작품의 결을 매칭해 "이런 작품 처음 알았다"는 발견의 만족감을 만드세요.

[작성 규칙]
- 후보 중 20개 선택 (후보가 적으면 전부)
- 장르 다양성: 같은 장르 연속 3개 금지. 액션·드라마·스릴러·SF·로맨스·코미디·다큐 중 최소 4개 이상 등장
- reason: 반드시 20자 이상 30자 이하 (공백 포함). 19자 이하 또는 31자 이상은 무조건 폐기
- 톤: 해요체 (~해요/~이에요/~돼요). 평어체(~다)·격식체(~합니다)·~다고요 절대 금지
- 작품 특정성: 작품의 고유 매력 한 가지를 명시. "재미있어요" "추천합니다" 같은 추상은 사용 금지
- 스포일러 금지: 결말·반전의 구체 내용 노출 금지. "반전이 미쳤어요" 같은 추상 표현은 허용
- 카드 간 표현 반복 금지: 같은 클로즈("꼭 보세요")가 5개 이상에 반복되면 다양화

[좋은 예 (20-30자, 반드시 이 길이와 톤을 따라하세요)]
"중반부터 숨 못 쉬어요. 반전이 미쳤어요" (20자)
"기생충 좋아하면 꼭 봐야 해요. 사회풍자극" (22자)
"첫 회 끝나면 바로 다음 회 재생하게 돼요" (21자)
"실화 기반이라 몰입감 장난 아니에요. 꼭 보세요" (24자)
"가족과 보면 더 좋아요. 따뜻한 결말이 인상적" (23자)
"비주얼 압도적이에요. OTT 큰 화면으로 봐주세요" (24자)
"아침에 가볍게 보기 딱이에요. 12분 회차" (20자)

[나쁜 예 (절대 이러면 안 됨)]
"심리적 깊이가 매력" (10자) ← 너무 짧음
"OST가 좋아요" (7자) ← 너무 짧음
"이 작품은 정말 깊은 인상을 주는 매력적인 영화입니다" (31자) ← 너무 길고 격식체
"깊은 고찰이 매력적입니다" (격식체, 추상적) ← 격식체 금지
"재미있어요. 추천합니다" (구체성 0) ← 어떤 면이 재밌는지 써야 함
"한국 작품이에요" (작품 특성 0) ← 작품 자체 매력을 써야 함
"감동적이고 재밌고 매력적이에요" (형용사 나열) ← 한 가지 매력에 집중

[작품 다양성 원칙]
- 한국 작품과 외국 작품을 균형 있게: 한국 사용자 기준 한국 35~50%, 외국 50~65%
- 영화와 시리즈 분배는 사용자 모드 가이드를 따름. 명시 없으면 6:4 또는 5:5
- 같은 감독·주연·국가 연속 3개 금지
- 발표 연도 다양화: 신작(최근 3년)과 클래식(10년+) 조화. 같은 연도 연속 4개 금지
- 무거운 작품(범죄/심리/전쟁)과 가벼운 작품(코미디/로맨스) 6:4 ~ 4:6 비율
- 메인스트림과 숨은 보석을 함께 배치 (popularity 상위 50%와 하위 50% 후보 모두 활용)

[모드별 reason 프레임 차별화]
- 탐색 모드: 새로움 강조 ("이런 작품 처음일 거예요" "예상 밖의 결" "장르 교차 작품")
- 혼합 모드: 취향 + 새 발견 균형 ("좋아하는 ○○ 결인데 색다른 면이 있어요")
- 개인화 모드: 깊은 취향 반영 ("△△ 좋아하면 이 작품 놓치면 후회해요")
- 사용자가 좋아한다고 표시한 작품과의 연결고리가 자연스러우면 reason에 언급

[한국 시장 컨텍스트]
- 한국 토종 OTT 가용성(wavve/Tving/Watcha)과 글로벌 OTT(Netflix/Disney+/AppleTV+/Prime)를 균형 있게 추천
- 일부 OTT(쿠팡플레이 등)는 데이터 소스에서 누락될 수 있음. providers가 비어 있어도 후보 자체가 매력적이면 선정 가능
- 한국어 자막·더빙이 보장되는 작품 우선 (글로벌 OTT는 대부분 보장)

[JSON 출력 주의사항]
- selected 배열 외 다른 키 추가 금지
- id는 후보 listing의 [ID:숫자]에서 정확히 인용. 변형·생략·신규 ID 금지
- 후보에 없는 ID 출력 절대 금지
- reason은 큰따옴표(") 안. 안에 큰따옴표 사용 시 백슬래시 이스케이프
- JSON 외 추가 텍스트(설명/주석/마크다운) 절대 출력 금지
- 이모지·특수문자 reason에 사용 금지 (한글·영문·숫자·기본 문장부호만)

[출력 형식 (JSON)]
{"selected": [{"id": 숫자, "reason": "문구"}, ...]}`;

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
  savedCount: number = 0,
  onboardingCount: number = 0
): Promise<{ picks: CuratedPick[]; usage: TokenUsage | null }> {
  if (candidates.length === 0) return { picks: [], usage: null };

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
  // feedback(시청 반응) + savedCount(저장) + onboardingCount(초기 취향 선언) 모두 signal.
  //   - 온보딩 5개 선택 → 바로 혼합 모드 진입 (탐색 모드 건너뜀)
  //   - 저장/리포트 없이도 온보딩 signal 유지
  const totalFeedback = feedback
    ? feedback.loved.length + feedback.good.length + feedback.meh.length + feedback.dropped.length
    : 0;
  const totalSignal = totalFeedback + savedCount + onboardingCount;

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

  const userPrompt = `${modeGuide}

[사용자 취향 기반]
좋아하는 작품: ${favorites.join(", ")}
${feedbackText}

[후보 ${candidates.length}개]
${candidateList}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: CURATION_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
    });

    const usage: TokenUsage = {
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
      cached_tokens: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    };

    const content = response.choices[0].message.content;
    if (!content) return { picks: [], usage };

    const parsed = JSON.parse(content) as Record<string, unknown>;
    const rawSelected =
      (parsed.selected as unknown[] | undefined) ??
      (parsed.recommendations as unknown[] | undefined) ??
      (Object.values(parsed).find((v) => Array.isArray(v)) as unknown[] | undefined) ??
      [];

    const picks = rawSelected
      .filter(
        (s): s is { id: number; reason: string } =>
          typeof s === "object" &&
          s !== null &&
          typeof (s as Record<string, unknown>).id === "number" &&
          typeof (s as Record<string, unknown>).reason === "string"
      )
      .map((s) => ({ id: s.id, reason: s.reason.slice(0, 60) }));
    return { picks, usage };
  } catch (err) {
    console.error("LLM curation failed:", err);
    return { picks: [], usage: null };
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

const GENRE_REASONS: Record<number, string[]> = {
  28:    ["액션 시퀀스가 정말 시원해요", "손에 땀을 쥐게 하는 액션이에요"],
  12:    ["모험심을 자극하는 이야기예요", "스케일이 남다른 모험물이에요"],
  16:    ["작화가 정말 예술이에요", "애니메이션의 매력을 느껴보세요"],
  35:    ["웃음이 빵빵 터지는 작품이에요", "유쾌한 기분이 필요할 때 딱이에요"],
  80:    ["긴장감이 끝까지 놓이지 않아요", "범죄 스릴러를 좋아하면 딱이에요"],
  99:    ["실화라서 더 몰입돼요", "다큐멘터리인데 영화보다 재밌어요"],
  18:    ["감정이 깊이 남는 드라마예요", "여운이 오래 가는 작품이에요"],
  10751: ["온 가족이 함께 볼 수 있어요", "마음이 따뜻해지는 이야기예요"],
  14:    ["상상력이 폭발하는 판타지예요", "현실을 잊게 해주는 세계관이에요"],
  36:    ["역사 속에 숨겨진 이야기예요", "시대극의 묵직함이 매력이에요"],
  27:    ["심장이 쫄깃해지는 공포물이에요", "무서운데 계속 보게 돼요"],
  10402: ["음악이 영혼을 울리는 작품이에요", "OST만으로도 가치 있어요"],
  9648:  ["추리하는 재미가 쏠쏠해요", "미스터리 좋아하면 꼭 보세요"],
  10749: ["설렘이 가득한 로맨스예요", "심쿵 포인트가 한두 개가 아니에요"],
  878:   ["SF 세계관이 탄탄해요", "과학적 상상력이 돋보이는 작품이에요"],
  53:    ["손에 땀을 쥐는 긴장감이에요", "한순간도 긴장을 놓을 수 없어요"],
  10752: ["전쟁의 잔혹함과 인간애를 담았어요", "전쟁 영화의 정석이에요"],
  37:    ["서부극 특유의 건조한 매력이에요", "클래식 장르를 즐겨보세요"],
  10765: ["SF와 판타지가 절묘하게 섞여요", "세계관에 빠져들게 돼요"],
  10764: ["리얼리티의 재미가 중독적이에요", "예능 좋아하면 빠질 수밖에 없어요"],
  10767: ["토크가 재밌어서 시간 가는 줄 몰라요", "편하게 보기 좋은 프로그램이에요"],
};

const RATING_REASONS = [
  "평점이 말해주는 검증된 작품이에요",
  "수많은 관객이 인정한 작품이에요",
  "평점이 높은 데는 이유가 있어요",
];

const CLASSIC_REASONS = [
  "세월이 지나도 빛나는 고전이에요",
  "오래됐지만 지금 봐도 신선해요",
  "클래식에는 이유가 있어요",
];

const RECENT_REASONS = [
  "최근작인데 반응이 뜨거워요",
  "요즘 핫한 작품이에요",
  "신작 중 눈에 띄는 작품이에요",
];

const KR_REASONS = [
  "한국 콘텐츠의 저력을 느껴보세요",
  "K-콘텐츠 팬이라면 놓치지 마세요",
];

function templateReason(c: EnrichedCandidate): string {
  const genreIds = c.item.genre_ids ?? [];
  const year = parseInt((c.item.release_date ?? c.item.first_air_date ?? "").slice(0, 4));
  const isKR = c.details.country.includes("KR");
  const rating = c.item.vote_average;

  // 장르 기반 reason 후보 수집
  const candidates: string[] = [];
  for (const gid of genreIds) {
    const reasons = GENRE_REASONS[gid];
    if (reasons) candidates.push(...reasons);
  }

  // 평점 기반
  if (rating >= 8.0) candidates.push(...RATING_REASONS);

  // 년도 기반
  if (!isNaN(year)) {
    if (year <= 2005) candidates.push(...CLASSIC_REASONS);
    if (year >= 2024) candidates.push(...RECENT_REASONS);
  }

  // 한국 작품
  if (isKR) candidates.push(...KR_REASONS);

  // 후보가 있으면 랜덤 선택, 없으면 폴백
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // 폴백
  if (rating >= 8.5) return "평점이 아주 높은 작품이에요";
  if (c.type === "series") return "한 번 시작하면 멈출 수 없는 시리즈예요";
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

export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
};

export type RecommendResult = {
  recommendations: Recommendation[];
  timings: Record<string, number>;
  usage?: TokenUsage;
};

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
  onboardingCount: number = 0
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
  const enriched = await enrichCandidates(candidates);
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
        const supplementEnriched = await enrichCandidates(supplementCandidates);
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
        const yearEnriched = await enrichCandidates(yearCandidates);
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
    onboardingCount
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
