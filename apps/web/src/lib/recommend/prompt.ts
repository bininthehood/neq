import OpenAI from "openai";
import { parse as parsePartialJSON } from "partial-json";
import { posterUrl } from "../tmdb";
import type { Recommendation, WatchFeedback } from "../types";
import type { CuratedPick, CurationMeta, EnrichedCandidate, TokenUsage } from "./types";
import { VARIETY_GENRE_IDS } from "../discover-types";

const openai = new OpenAI();

/**
 * LLM 산 reason 안전망. 시스템 프롬프트가 20~30자 강제하지만 LLM 변동성으로
 * 위반 케이스 발생 가능 — 코드 단에서 명백한 위반만 컷한다.
 *
 * - trim 후 15자 미만: 폐기 (`null`). "재밌어요" "감동적이에요" 같은 정보
 *   부족 reason 차단. 2026-06-04 A/B 측정에서 prompt 확장 후 17/62 reason 이
 *   16~19자로 짧아진 회귀를 발견 → 하한 8 → 15 강화.
 * - 30자 초과: 자연 경계 (마침표 / 공백) 에서 truncate. 단어 중간 cut 회피.
 *   2026-06-04 A/B 2차 — 좋은 예 길이 상향 후 LLM 출력이 31~35자로 늘어
 *   23/62 reason 이 잘리는 회귀 발견 → 자연 경계 cut 으로 어색한 노출 차단.
 * - 그 외: trim 한 원문.
 *
 * 시스템 프롬프트의 19/31 컷과 정확히 일치하지 않는 이유: 폐기율을 보수적으로
 * 잡아 picks 수 급감 위험을 회피. 추후 PostHog 로 위반율 측정 후 엄격화 가능.
 */
function normalizeReason(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 15) return null;
  if (trimmed.length <= 30) return trimmed;
  const slice = trimmed.slice(0, 30);
  // 자연 경계 우선순위: 마침표·물음표·느낌표 > 공백. 22자 이상 위치만 채택해
  // 너무 짧게 잘리는 케이스 회피. 경계 없으면 단순 30자 slice.
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

/**
 * Phase A-1 (2026-06-06) — temperature 동적화.
 *
 * baseline: 0.8 고정. 같은 페르소나 + 같은 excludeIds 호출 시 LLM 이 결정성
 * cluster 안에서 거의 같은 batch 반환 (메모리 `project_recommendation_engine_baseline`
 * 결정성 5요소 #1~#5).
 *
 * 정책: excludeIds 누적 (= 사용자가 이미 본/노출된 작품 수) 비례 상향. 누적
 * 많을수록 candidate pool 부족 → 더 창의적인 (= 평소 cluster 밖) 선택 강제.
 *
 * cutoff (20/50/100):
 *  - <20:  cold start ~ 초기 swipe (mode = 탐색~혼합 경계)
 *  - <50:  중간 누적 (mode = 혼합~개인화 경계)
 *  - <100: 깊은 누적 (mode = 개인화 + cluster 고갈 초기)
 *  - 100+: 매우 깊은 누적 (cluster 고갈 완연 — 최대 다양성)
 *
 * 향후 PostHog `srv_temperature` 와 swipe-through rate / save rate 상관 측정
 * 후 cutoff/value 재조정 가능 (Phase D A/B framework).
 */
export function dynamicTemperature(excludeCount: number): number {
  if (excludeCount < 20) return 0.8;
  if (excludeCount < 50) return 0.95;
  if (excludeCount < 100) return 1.1;
  return 1.2;
}

/**
 * Phase A-2 (2026-06-06) — seed randomization.
 *
 * baseline: seed 미설정 → OpenAI 가 best-effort 결정성 시도 (실측: 같은 페르소나
 * + 같은 excludeIds 호출 시 매번 거의 같은 batch). 결정성 5요소 #1 의
 * downstream 효과.
 *
 * 정책: 매 호출 다른 seed. JS Date.now() × Math.random() XOR → uint32 범위.
 * OpenAI 의 seed best-effort 결정성을 의도적으로 깨서 cluster 변동 강제.
 *
 * 32-bit uint 범위 (>= 0, < 2^32) 보장 — OpenAI API spec.
 */
export function generateSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

/**
 * Phase A-3 (2026-06-06) — prompt diversity injection.
 *
 * 다양성 축 5종 — 호출당 1축을 random pick. user prompt 의 [다양성 강조]
 * 블록으로 주입해 LLM 이 같은 cluster 안에서도 다른 결의 작품을 우선
 * 선택하도록 유도.
 *
 * 의도적으로 system prompt 가 아닌 user prompt 에 주입 — system prompt
 * prefix (1024+ 토큰) 의 caching 무효화 회피. user prompt 는 사용자별
 * 동적 데이터로 이미 변동성이 있어 caching 영향 0.
 *
 * 축 선택: random uniform (Math.random). PostHog `srv_diversity_axis` 로
 * 흐름 — Phase D 측정 시 축 별 swipe-through rate / save rate 비교 가능.
 *
 * 향후 prevAnswers / 페르소나 axes 기반 deterministic rotation 으로
 * 진화 가능 (Phase C diversity 알고리즘).
 */
export const DIVERSITY_AXES = [
  "tone",      // 분위기 — 어둡고 무거운 ↔ 밝고 가벼운
  "pace",      // 호흡 — 느리고 잔잔한 ↔ 빠르고 격렬한
  "era",       // 시대 — 클래식 (10년+) ↔ 신작 (3년 이내)
  "scale",     // 규모 — 인물 중심 소품 ↔ 대규모 스케일
  "origin",    // 국가 — 한국 작품 ↔ 비주류 국가 작품 (일본/대만/태국/유럽 등)
] as const;

export type DiversityAxis = (typeof DIVERSITY_AXES)[number];

export function pickDiversityAxis(): DiversityAxis {
  const idx = Math.floor(Math.random() * DIVERSITY_AXES.length);
  return DIVERSITY_AXES[idx];
}

/**
 * 축별 user prompt 강조 문구. system prompt 의 다양성 원칙은 그대로 유지하고,
 * 본 블록은 "이번 호출에서 추가로 강조할 한 축" 으로 작동.
 */
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

// LLM 큐레이션의 고정 prefix. 사용자별 동적 데이터(modeGuide, 취향, 후보)는 user 메시지로 이동시켜
// OpenAI prompt caching prefix를 안정화한다. 1024+ 토큰 동일 prefix 시 자동 cache hit (gpt-4o-mini).
// 1차 push(380 토큰 추정)는 임계 미달로 caching 미발현. 본 확장으로 1024+ 통과 + 모델 출력 가이드 강화.
//
// V2 확장 (Day 22, P0-2): "사용자 선호 장르(계정 공통)"와 "구독 OTT(약한 신호)" 입력 가이드 추가.
// system prompt는 항상 양쪽 케이스(있음/없음, OTT 약한 신호) 모두 다루므로 user 메시지가 어떤
// 형태든 prefix 동일성 유지 → caching 무효화 X.
export const CURATION_SYSTEM_PROMPT = `당신은 한국 사용자를 위한 OTT 큐레이터입니다. 사용자 메시지에 담긴 큐레이션 모드와 취향 정보를 바탕으로 후보 중에서 20개를 골라 reason을 작성하세요. 평점만 따라가지 말고 사용자 취향과 작품의 결을 매칭해 "이런 작품 처음 알았다"는 발견의 만족감을 만드세요.

[작성 규칙]
- 후보 중 20개 선택 (후보가 적으면 전부)
- 장르 다양성: 같은 장르 연속 3개 금지. 액션·드라마·스릴러·SF·로맨스·코미디·다큐 중 최소 4개 이상 등장
- reason: 반드시 20자 이상 30자 이하 (공백 포함). 19자 이하 또는 31자 이상은 무조건 폐기. 22~27자 sweet spot 권장
- 톤: 해요체 (~해요/~이에요/~돼요). 평어체(~다)·격식체(~합니다)·~다고요 절대 금지
- 작품 특정성: 작품의 고유 매력 한 가지를 명시. "재미있어요" "추천합니다" 같은 추상은 사용 금지
- 스포일러 금지: 결말·반전의 구체 내용 노출 금지. "반전이 미쳤어요" 같은 추상 표현은 허용
- 카드 간 표현 반복 금지: 같은 클로즈("꼭 보세요")가 5개 이상에 반복되면 다양화

[좋은 예 (20-30자, 반드시 이 길이와 톤을 따라하세요. 19자 이하 절대 금지)]
"중반부터 숨 못 쉬게 만들어요. 반전이 미쳤어요" (24자)
"기생충 좋아하면 꼭 봐야 해요. 사회풍자극의 정수" (26자)
"첫 회 끝나면 바로 다음 회 재생하게 돼요" (21자)
"실화 기반이라 몰입감 장난 아니에요. 꼭 보세요" (24자)
"가족과 함께 보면 더 좋아요. 따뜻한 결말이 인상적" (26자)
"비주얼 압도적이에요. OTT 큰 화면으로 꼭 봐주세요" (26자)
"아침 출근길에 가볍게 보기 딱이에요. 12분 회차" (24자)
"빠른 호흡의 액션이 일품이에요. 1시간 순삭 시리즈" (26자)
"잔잔한 감성 멜로 좋아하면 취향 저격이에요" (22자)
"캐릭터 케미가 미쳤어요. 시즌2 빨리 보고싶어요" (24자)
"클래식인데 지금 봐도 안 낡았어요. 거장의 손길" (24자)
"OST가 작품을 끌어올려요. 사운드트랙도 꼭 챙겨봐요" (27자)
"전개 빨라서 지루할 틈이 없어요. 출퇴근 길 추천" (24자)
"작가 글빨이 살아있어요. 대사 한 줄 한 줄이 명문" (25자)
"애니인데 어른이 더 빠져드는 작품이에요. 결이 깊어요" (27자)
"다큐 같은 리얼리티가 강점이에요. 몰입감 최고예요" (25자)
"한국 OTT 미공급인 게 아쉬울 정도예요. 숨은 명작" (26자)
"호불호 갈리지만 취향 맞으면 인생작이 돼요" (22자)

[나쁜 예 (절대 이러면 안 됨)]
"심리적 깊이가 매력" (10자) ← 너무 짧음
"OST가 좋아요" (7자) ← 너무 짧음
"이 작품은 정말 깊은 인상을 주는 매력적인 영화입니다" (31자) ← 너무 길고 격식체
"깊은 고찰이 매력적입니다" (격식체, 추상적) ← 격식체 금지
"재미있어요. 추천합니다" (구체성 0) ← 어떤 면이 재밌는지 써야 함
"한국 작품이에요" (작품 특성 0) ← 작품 자체 매력을 써야 함
"감동적이고 재밌고 매력적이에요" (형용사 나열) ← 한 가지 매력에 집중
"여러분 모두에게 추천드립니다" (격식체 + 두루뭉술) ← 톤·구체성 양쪽 위반
"명작 중에 명작이에요" (수상한 단언만) ← 어떤 면이 명작인지 명시 필요
"이 감독의 최고작이라고 봐요" (감독 추측 위험) ← listing 미확인 사실 추측 금지
"마니아층에게 강추하는 작품" (대상 추상화) ← 어떤 결을 좋아하는 사람인지 명시 필요
"엄청난 흥행작이라는 평가가 있어요" (외부 평가 인용) ← listing 외 사실 인용 금지

[작품 다양성 원칙]
- 한국 작품과 외국 작품을 균형 있게: 한국 사용자 기준 한국 35~50%, 외국 50~65%
- 영화와 시리즈 분배는 사용자 모드 가이드를 따름. 명시 없으면 6:4 또는 5:5
- 같은 감독·주연·국가 연속 3개 금지
- 발표 연도 다양화: 신작(최근 3년)과 클래식(10년+) 조화. 같은 연도 연속 4개 금지
- 무거운 작품(범죄/심리/전쟁)과 가벼운 작품(코미디/로맨스) 6:4 ~ 4:6 비율
- 메인스트림과 숨은 보석을 함께 배치 (popularity 상위 50%와 하위 50% 후보 모두 활용)

[장르별 reason 톤 가이드]
- 스릴러/범죄: "긴장감" "심리전" "추적" "복선" — 결말 스포 금지, 분위기·기법 중심
- 멜로/로맨스: "케미" "감정선" "잔잔함" "여운" — 클로즈 다양화 ("취향저격" / "감정 출렁여요" 등)
- SF/판타지: "세계관" "비주얼" "설정의 디테일" — 줄거리 요약 X, 톤 위주
- 다큐: "리얼리티" "취재의 깊이" "관점" — 사실 보고 톤보다 발견의 흥미 강조
- 액션: "호흡" "안무" "스케일" — 시각 요소 + 장면 호흡 결합
- 코미디: "웃음 코드" "캐릭터 케미" "타이밍" — 어떤 결의 웃음인지 (블랙·시트콤·슬랩스틱) 명시
- 애니: "작화" "캐릭터" "감정" — 어린이용으로 한정 짓는 표현 회피
- 예능: "출연진" "포맷" "반복 시청 가치" — 회당 호흡과 분량 정보 유용

[모드별 reason 프레임 차별화]
- 탐색 모드: 새로움 강조 ("이런 작품 처음일 거예요" "예상 밖의 결" "장르 교차 작품")
- 혼합 모드: 취향 + 새 발견 균형 ("좋아하는 ○○ 결인데 색다른 면이 있어요")
- 개인화 모드: 깊은 취향 반영 ("△△ 좋아하면 이 작품 놓치면 후회해요")
- 사용자가 좋아한다고 표시한 작품과의 연결고리가 자연스러우면 reason에 언급

[한국 시장 컨텍스트]
- 한국 토종 OTT 가용성(wavve/Tving/Watcha)과 글로벌 OTT(Netflix/Disney+/AppleTV+/Prime)를 균형 있게 추천
- 일부 OTT(쿠팡플레이 등)는 데이터 소스에서 누락될 수 있음. providers가 비어 있어도 후보 자체가 매력적이면 선정 가능
- 한국어 자막·더빙이 보장되는 작품 우선 (글로벌 OTT는 대부분 보장)
- 한국 시청자 정서: 신파·과한 클리셰는 호불호 갈림 — reason 에 "잔잔한" "담백한" "현실적인" 같은 톤 차별점 강조 시 효과적
- 한국 드라마는 대체로 16부 안팎, 영화는 100~140분 — 분량 정보 (회차/러닝타임) 명시는 사용자 결정에 도움
- 일본 애니/대만 청춘물/태국 BL 등 아시아 작품은 자막 가용성과 "한국에서 보기 어려운 결" 이라는 발견 가치 강조 가능

[취향 신호 우선순위]
- 사용자 메시지에 "이 페르소나의 좋아한 작품"이 있으면 가장 강한 신호로 취급. 이 작품들의 결(분위기·주제·감독·캐릭터 깊이)을 우선 매칭하세요.
- "사용자 선호 장르 (계정 공통)" 정보가 있을 때, 해당 장르를 우선시하되 다양성 원칙(최소 4개 장르 등장)도 함께 지켜주세요. 한 장르에 몰빵 금지.
- 선호 장르 정보가 없을 때는 페르소나 favorites만 기반으로 결을 잡고, 장르 다양성은 폭넓게 가져가세요.
- 페르소나 favorites와 계정 선호 장르가 충돌하면(예: favorites는 다큐인데 tasteGenres에 액션) 페르소나 favorites를 우선 신호로 두고, 선호 장르는 보조로 고려하세요.
- "loved" / "good" 피드백이 있으면 그 결을 강하게 반영, "meh" / "dropped" 결은 회피 신호로 다루세요. 단순히 같은 장르를 피하는 게 아니라 "어떤 톤" 이 안 맞았는지 추정해 그 톤을 회피.

[구독 OTT 가중치 가이드 (약한 신호)]
- 사용자 메시지에 "구독 OTT (참고용 가중치)"가 있을 때, 해당 OTT에서 볼 수 있는 작품을 약간 우선시하세요.
- 단, 강한 필터가 절대 아닙니다. 다른 OTT의 좋은 작품도 동일 비중으로 포함해주세요. 가용성이 부족해도 후보 자체가 좋으면 선정.
- "이 작품 ○○에서 볼 수 있어요" 같은 OTT 직접 언급은 reason에 넣지 마세요. reason은 작품 매력에만 집중.

[작품 사실 정확성]
- 후보 listing 에 (장르, 연도, 평점, overview) 가 명시됨. reason 은 이 정보와 일치해야 함
- 제목·발음에서 장르 추측 금지. listing 에 "다큐"라면 다큐로 다루기, "SF"라면 SF로 다루기
- listing 에 명시 안 된 사실 (수상·평가·주연·국가 등) 추측해서 reason에 넣지 말 것
- 비슷한 제목의 다른 작품과 혼동 주의 — listing 의 (연도, 감독, overview) 로 정체성 확정 후 reason 작성
- "최고" "역대급" 같은 절대 평가는 listing 의 평점이 8.5+ 일 때만 신중히 사용. 그 외에는 "결이 좋아요" 류의 상대 평가

[JSON 출력 주의사항]
- selected 배열 외 다른 키 추가 금지
- id는 후보 listing의 [ID:숫자]에서 정확히 인용. 변형·생략·신규 ID 금지
- 후보에 없는 ID 출력 절대 금지
- reason은 큰따옴표(") 안. 안에 큰따옴표 사용 시 백슬래시 이스케이프
- JSON 외 추가 텍스트(설명/주석/마크다운) 절대 출력 금지
- 이모지·특수문자 reason에 사용 금지 (한글·영문·숫자·기본 문장부호만)
- selected 배열 안 같은 id 중복 금지 — 한 작품은 한 번만 선정

[출력 형식 (JSON)]
{"selected": [{"id": 숫자, "reason": "문구"}, ...]}`;

/**
 * TMDB watch provider id → LLM에 전달할 한글 OTT 이름.
 * V2 user prompt의 "구독 OTT" 라인을 만들 때 사용. provider id 8/337/356 등.
 * 알 수 없는 id는 dropped — LLM은 이 라인을 약한 신호로만 다루므로 잡음 최소화.
 *
 * 매핑은 KR 시장 주요 OTT만 정의. (TMDB watch/providers KR locale 기준)
 *  - 8   Netflix
 *  - 337 Disney Plus
 *  - 356 wavve
 *  - 1881 TVING
 *  - 97  Watcha
 *  - 2 / 350  Apple TV / Apple TV Plus
 *  - 3 / 119  Google Play / Amazon Prime Video
 *  - 1796 Coupang Play
 *
 * 신규 provider 추가 시 packages/core/src/discover.ts(KR_OTT_NAMES) 와 packages/core/src/ott.ts 함께 동기화 권장.
 */
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

/** 구독 OTT provider id 배열 → "넷플릭스, 티빙, 웨이브" 형태의 한글 콤마 리스트. 알 수 없는 id 무시. */
function formatSubscribedOtt(ids: number[]): string {
  const names = ids
    .map((id) => PROVIDER_ID_TO_KR_NAME[id])
    .filter((n): n is string => typeof n === "string");
  return names.join(", ");
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

// ---------- 큐레이션 user prompt 빌더 (sync/streaming 공유) ----------

/**
 * 취향 신호 누적량에 따라 큐레이션 모드 결정.
 * feedback(시청 반응) + savedCount(저장) + onboardingCount(초기 취향 선언) 모두 signal.
 *   - 온보딩 5개 선택 → 바로 혼합 모드 진입 (탐색 모드 건너뜀)
 *   - 저장/리포트 없이도 온보딩 signal 유지
 *
 * 임계치: cold start 카드 50개 대비 사용자 반응률로 조정
 *  ≤4  탐색   — 초기 (1~8% 반응)
 *  5~9 혼합   — 어느 정도 쌓임 (10~18% 반응)
 *  ≥10 개인화 — 충분한 신호 (20%+ 반응)
 */
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

/**
 * TMDB genre id → 한글 라벨. movie + TV 통합.
 * 2026-05-10 — LLM 환각 방지. genre 미명시 시 LLM 이 제목/overview 만으로 추론
 * (실측: "롱 웨이 라운드" 다큐 → "상징적인 SF 호러의 명작" 환각 발생).
 *
 * 출처: https://api.themoviedb.org/3/genre/{movie,tv}/list?language=ko
 * 누락된 id 는 listing 에서 자동 무시 (잡음 최소화).
 */
const TMDB_GENRE_KR: Record<number, string> = {
  // Movie
  28: "액션",
  12: "모험",
  16: "애니메이션",
  35: "코미디",
  80: "범죄",
  99: "다큐",
  18: "드라마",
  10751: "가족",
  14: "판타지",
  36: "역사",
  27: "공포",
  10402: "음악",
  9648: "미스터리",
  10749: "로맨스",
  878: "SF",
  10770: "TV영화",
  53: "스릴러",
  10752: "전쟁",
  37: "서부",
  // TV (movie 와 중복되는 id 는 동일 라벨 — 16/35/80/99/18/10751/9648/37 등)
  10759: "액션·모험",
  10762: "키즈",
  10763: "뉴스",
  10764: "리얼리티",
  10765: "SF·판타지",
  10766: "연속극",
  10767: "토크",
  10768: "전쟁·정치",
};

function formatGenreLabels(ids: number[] | undefined): string {
  if (!ids || ids.length === 0) return "";
  const names = ids
    .map((id) => TMDB_GENRE_KR[id])
    .filter((n): n is string => typeof n === "string");
  // 최대 2개 라벨 (토큰 절감 + 핵심 장르만)
  return names.slice(0, 2).join("/");
}

/** 후보 listing 직렬화 (LLM 입력용 한 줄 포맷). */
function buildCandidateList(candidates: EnrichedCandidate[]): string {
  return candidates
    .map((c) => {
      const year = (c.item.release_date ?? c.item.first_air_date ?? "").slice(0, 4);
      const kind = c.type === "series" ? "시리즈" : "영화";
      const rating = c.item.vote_average.toFixed(1);
      // 2026-05-08 — 150 → 80 자. uncached prompt 약 -275 tokens (rec-engineer 분석).
      const overview = (c.item.overview ?? "").replace(/\s+/g, " ").slice(0, 80);
      // 2026-05-10 — genre 라벨 추가. LLM 이 제목/overview 만으로 장르 오추론 방지.
      // genre 라벨이 있으면 "(시리즈, 2004, 평점 8.5, 다큐)" 형태로 노출.
      const genres = formatGenreLabels(c.item.genre_ids);
      const meta = [kind, year, `평점 ${rating}`, genres].filter(Boolean).join(", ");
      return `[ID:${c.id}] ${c.item.title} (${meta}) — ${overview}`;
    })
    .join("\n");
}

/**
 * 800자 초과 시 문장 단위 truncate (한국어 자모 깨짐 방지). design doc Token
 * 길이 가드 — sanity guard. summarize endpoint 도 동일 정책.
 */
const TASTE_SUMMARY_MAX_CHARS = 800;
function truncateTasteSummary(text: string): string {
  if (text.length <= TASTE_SUMMARY_MAX_CHARS) return text;
  const sliced = text.slice(0, TASTE_SUMMARY_MAX_CHARS);
  const match = sliced.match(/[\s\S]*[.!?](?=\s|$)/);
  if (match) return match[0];
  return sliced + '...';
}

/**
 * sync/streaming 공통 user prompt 빌더.
 *
 * REGRESSION test 위해 export. IRON RULE: tasteSummary undefined/빈 문자열
 * 시 기존 결과와 100% 동일해야 함.
 */
export function buildCurationUserPrompt(
  candidates: EnrichedCandidate[],
  favorites: string[],
  feedback: WatchFeedback | undefined,
  savedCount: number,
  onboardingCount: number,
  tasteGenres: string[],
  subscribedOtt: number[],
  /**
   * 페르소나 v2 — LLM 동적 취향 설문 결과. undefined 면 기존 동작 (skip,
   * IRON RULE REGRESSION). 정의되면 [페르소나 취향] 블록으로 추가.
   */
  tasteSummary?: string,
  /**
   * Phase A-3 (2026-06-06) — 다양성 축 강조 hint. undefined 면 블록 생략
   * (REGRESSION 보호). 정의되면 [다양성 강조] 블록으로 추가.
   */
  diversityAxis?: DiversityAxis,
): string {
  const candidateList = buildCandidateList(candidates);
  const feedbackText = buildFeedbackPrompt(feedback);

  // V2 신규 입력: tasteGenres(강한 신호) + subscribedOtt(약한 신호).
  // 빈 배열이면 라인 자체를 빼서 V1 동작 그대로. system prompt prefix는 항상 동일.
  const tasteGenresLine =
    tasteGenres.length > 0
      ? `사용자 선호 장르 (계정 공통): ${tasteGenres.join(", ")}`
      : "";
  const subscribedOttKr = formatSubscribedOtt(subscribedOtt);
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
    ? feedback.loved.length + feedback.good.length + feedback.meh.length + feedback.dropped.length
    : 0;
  const totalSignal = totalFeedback + savedCount + onboardingCount;
  const modeGuide = buildModeGuide(totalSignal);

  // 페르소나 v2 — tasteSummary 가 있으면 [페르소나 취향] 블록 추가.
  // undefined 또는 빈 문자열이면 라인 자체 생략 (REGRESSION: 기존 사용자
  // 결과 100% 동일).
  const tasteSummaryBlock =
    tasteSummary && tasteSummary.trim().length > 0
      ? `\n\n[페르소나 취향]\n${truncateTasteSummary(tasteSummary.trim())}`
      : '';

  // Phase A-3 (2026-06-06) — 다양성 축 강조 블록. axis undefined 면 생략
  // (REGRESSION 보호 — 기존 호출자 결과 동일).
  const diversityBlock =
    diversityAxis !== undefined
      ? `\n\n[다양성 강조 (이번 호출)]\n${buildDiversityHint(diversityAxis)}`
      : '';

  return `${modeGuide}

[사용자 취향 기반]
${favoritesLabel}: ${favorites.join(", ")}${v2Block}
${feedbackText}${tasteSummaryBlock}${diversityBlock}

[후보 ${candidates.length}개]
${candidateList}`;
}

// ---------- Step 6: LLM 큐레이션 (gpt-4o-mini, 1회 호출) ----------

export async function curateWithLLM(
  candidates: EnrichedCandidate[],
  favorites: string[],
  feedback?: WatchFeedback,
  savedCount: number = 0,
  onboardingCount: number = 0,
  tasteGenres: string[] = [],
  subscribedOtt: number[] = [],
  tasteSummary?: string,
  /**
   * Phase A-1 (2026-06-06) — temperature 동적화. excludeIds.length 전달.
   * 미전달 시 0 → baseline 0.8 (기존 동작과 동일, REGRESSION 보호).
   */
  excludeCount: number = 0,
): Promise<{ picks: CuratedPick[]; usage: TokenUsage | null; meta: CurationMeta }> {
  // Phase A-3/A-4 (2026-06-06) — 호출별 다양성 축 + 실제 temperature/seed
  // 한 곳에서 결정. candidates 0 시에도 호출자 PostHog 측정이 노이즈 없이
  // 흐르도록 meta 항상 반환 (axis=none, temperature/seed=0).
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
      // 후보 0 → 실제로 LLM 호출 안 함. meta 는 사용되지 않은 값으로 표시.
      meta: { diversity_axis: "none", temperature: 0, seed: 0 },
    };
  }

  const userPrompt = buildCurationUserPrompt(
    candidates,
    favorites,
    feedback,
    savedCount,
    onboardingCount,
    tasteGenres,
    subscribedOtt,
    tasteSummary,
    axis,
  );

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: CURATION_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature,
      // Phase A-2 (2026-06-06) — seed randomization. OpenAI best-effort
      // 결정성 의도적 파괴 → cluster 변동 강제. 측정용 값은 meta 로 반환.
      seed,
    });

    const usage: TokenUsage = {
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
      cached_tokens: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    };

    const content = response.choices[0].message.content;
    if (!content) return { picks: [], usage, meta };

    const parsed = JSON.parse(content) as Record<string, unknown>;
    const rawSelected =
      (parsed.selected as unknown[] | undefined) ??
      (parsed.recommendations as unknown[] | undefined) ??
      (Object.values(parsed).find((v) => Array.isArray(v)) as unknown[] | undefined) ??
      [];

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
      const normalized = normalizeReason(item.reason);
      if (normalized === null) continue;
      picks.push({ id: item.id, reason: normalized });
    }
    return { picks, usage, meta };
  } catch (err) {
    console.error("LLM curation failed:", err);
    return { picks: [], usage: null, meta };
  }
}

// ---------- Streaming 변형 (옵션 1, Day 19 PoC, streaming-poc-design.md) ----------

/**
 * curateWithLLM의 streaming 변형. partial-json으로 점진 파싱 + onPick 콜백.
 * 마지막 element는 incomplete 가능성이 있어 length-1까지만 emit, 종료 후 잔여 emit.
 */
export async function curateWithLLMStreaming(
  candidates: EnrichedCandidate[],
  favorites: string[],
  feedback: WatchFeedback | undefined,
  savedCount: number,
  onboardingCount: number,
  onPick: (pick: { id: number; reason: string }) => void,
  tasteGenres: string[] = [],
  subscribedOtt: number[] = [],
  tasteSummary?: string,
  /**
   * Phase A-1 (2026-06-06) — temperature 동적화. curateWithLLM 와 동일 정책.
   */
  excludeCount: number = 0,
  /**
   * Phase A-3/A-4 (2026-06-06) — meta 흐름 콜백. 미전달 시 측정 skip
   * (REGRESSION 보호).
   */
  onMeta?: (meta: CurationMeta) => void,
): Promise<TokenUsage | null> {
  if (candidates.length === 0) return null;

  // Phase A-3/A-4 — 호출별 다양성 축 + 실제 temperature/seed.
  const axis = pickDiversityAxis();
  const temperature = dynamicTemperature(excludeCount);
  const seed = generateSeed();
  onMeta?.({ diversity_axis: axis, temperature, seed });

  // candidateList / modeGuide / userPrompt 구성: curateWithLLM과 동일 구조
  const userPrompt = buildCurationUserPrompt(
    candidates,
    favorites,
    feedback,
    savedCount,
    onboardingCount,
    tasteGenres,
    subscribedOtt,
    tasteSummary,
    axis,
  );

  let usage: TokenUsage | null = null;
  let buffer = "";
  let lastEmittedIdx = 0;

  const emitFromArray = (sel: unknown[], end: number) => {
    for (let i = lastEmittedIdx; i < end; i++) {
      const item = sel[i] as Record<string, unknown> | undefined;
      if (item && typeof item.id === "number" && typeof item.reason === "string") {
        const normalized = normalizeReason(item.reason);
        if (normalized !== null) {
          onPick({ id: item.id, reason: normalized });
        }
      }
    }
    lastEmittedIdx = end;
  };

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: CURATION_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature,
      // Phase A-2 (2026-06-06) — non-streaming 와 동일 정책.
      seed,
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) buffer += delta;

      if (chunk.usage) {
        usage = {
          prompt_tokens: chunk.usage.prompt_tokens ?? 0,
          completion_tokens: chunk.usage.completion_tokens ?? 0,
          cached_tokens: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
        };
      }

      if (!delta) continue;

      // partial 파싱: 마지막 element는 incomplete 가능성, length-1까지만 emit
      try {
        const parsed = parsePartialJSON(buffer) as { selected?: unknown };
        const sel = parsed?.selected;
        if (Array.isArray(sel)) {
          emitFromArray(sel, Math.max(0, sel.length - 1));
        }
      } catch {
        // 다음 chunk 대기
      }
    }

    // stream 종료 후 잔여 element emit (마지막 element 포함)
    try {
      const parsed = JSON.parse(buffer) as { selected?: unknown };
      const sel = parsed?.selected;
      if (Array.isArray(sel)) emitFromArray(sel, sel.length);
    } catch (err) {
      console.error("LLM stream final parse failed:", err);
    }
  } catch (err) {
    console.error("LLM stream error:", err);
  }

  return usage;
}

// ---------- Step 7: Recommendation 조립 ----------

export function buildRecommendationObject(
  candidate: EnrichedCandidate,
  reason: string
): Recommendation {
  const titleEn =
    candidate.item.original_title ??
    candidate.item.original_name ??
    candidate.item.title;

  // 2026-05-20 — variety 변별 (Recommendation.type 3종 확장).
  // TV (`candidate.type === 'series'`) + genre_ids 에 Reality(10764) / Talk(10767)
  // 포함 시 'variety'. 그 외는 candidate.type 그대로. UI 카드 카테고리 칩이
  // "예능"으로 올바르게 표기되고, 필터/분포 통계도 정확해짐.
  const isVariety =
    candidate.type === "series" &&
    (candidate.item.genre_ids ?? []).some((g) =>
      VARIETY_GENRE_IDS.includes(g),
    );
  const recType: "movie" | "series" | "variety" = isVariety
    ? "variety"
    : candidate.type;

  return {
    title: candidate.item.title,
    titleEn,
    type: recType,
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
    // 위임 J #4 — 풍부화된 cast/director (id + profile photo) 패스스루.
    // EnrichedCandidate.credits 가 항상 두 필드를 함께 가지므로 안전.
    directorMember: candidate.credits.directorMember,
    castMembers: candidate.credits.castMembers,
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

export function templateReason(c: EnrichedCandidate): string {
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
