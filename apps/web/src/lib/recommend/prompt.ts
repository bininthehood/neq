import OpenAI from "openai";
import { parse as parsePartialJSON } from "partial-json";
import { posterUrl, filterWatchProviders } from "../tmdb";
import type { Recommendation, WatchFeedback } from "../types";
import type { CuratedPick, CurationMeta, EnrichedCandidate, TokenUsage } from "./types";
import { VARIETY_GENRE_IDS } from "../discover-types";

const openai = new OpenAI();

/**
 * reason 톤 원칙 (2026-07-10 — Instagram 큐레이션 게시물 문구 톤 정합).
 *
 * reason 은 "줄거리 기반의 담백한 설명 + 취향 연결 관찰" — 평가/감상/마케팅이 아님.
 *  1. fact 기반: overview 의 인물·상황·사건을 짧게 설명
 *  2. 가벼운 종결 우선: "...이야기" "...드라마" "...스릴러" 등 형식 명사
 *  3. 평가 단정 금지: 좋습니다 / 잘 맞습니다 / 오래 남습니다 / 꼭 보세요
 *  4. 과장 마케팅 금지: 최고의 / 놀라운 / 완벽한 / 강력 추천 / 인생작 / 역대급
 *  5. 제품·AI 포지셔닝 금지: AI 추천 / 알고리즘 / 개인화 / 선택 피로
 * 시스템 프롬프트의 [reason 톤 원칙] 블록과 아래 REASON_BANNED_PATTERNS,
 * templateReason 풀이 이 원칙의 3개 시행 지점 — 함께 갱신할 것.
 */
export const REASON_BANNED_PATTERNS: RegExp[] = [
  // 평가 단정형
  /좋습니다|잘 맞습니다|오래 남습니다|소중함입니다/,
  /추천합니다|추천드립니다|추천해요|강추/,
  /꼭 보세요|봐주세요|놓치지 마세요/,
  // 과장 마케팅
  /최고의|최고예요|놀라운|완벽한|완벽해요|강력 추천|인생작|역대급|미쳤어요/,
  // 제품/AI 포지셔닝
  /\bAI\b|알고리즘|개인화 추천|선택 피로/,
];

// 길이 안전망 경계 — 시스템 프롬프트 (35~80자 강제, 45~70 sweet spot) 정합.
// 폐기/컷 경계를 프롬프트보다 느슨히 잡는 이유: 폐기율을 보수적으로 잡아
// picks 수 급감 위험 회피 (기존 20~30자 체제의 운영 경험 승계).
const REASON_MIN_DISCARD = 25; // 미만 폐기 — 내용 설명이 성립할 수 없는 길이
const REASON_MAX = 90; // 초과 시 자연 경계 truncate — 카드 3줄 클리핑 방지
const REASON_CUT_FLOOR = 60; // truncate 시 최소 보존 길이 (너무 짧게 잘리는 케이스 회피)

/**
 * LLM 산 reason 안전망. 시스템 프롬프트가 35~80자를 강제하지만 LLM 변동성으로
 * 위반 케이스 발생 가능 — 코드 단에서 명백한 위반만 컷한다.
 * (2026-07-10 톤 개편 — 기존 15/30 경계를 25/90 으로 상향. 상세 위 상수 주석.)
 */
function normalizeReason(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < REASON_MIN_DISCARD) return null;
  if (trimmed.length <= REASON_MAX) return trimmed;
  const slice = trimmed.slice(0, REASON_MAX);
  // 자연 경계 우선순위: 마침표·물음표·느낌표 > 공백. CUT_FLOOR 이상 위치만 채택해
  // 너무 짧게 잘리는 케이스 회피. 경계 없으면 단순 MAX slice.
  const punct = Math.max(
    slice.lastIndexOf("."),
    slice.lastIndexOf("?"),
    slice.lastIndexOf("!"),
  );
  if (punct >= REASON_CUT_FLOOR) return slice.slice(0, punct + 1).trim();
  const space = slice.lastIndexOf(" ");
  if (space >= REASON_CUT_FLOOR) return slice.slice(0, space).trim();
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

[reason 톤 원칙 — 큐레이션 계정의 작품 소개 문구처럼]
- reason 은 과장된 평가·감상평이 아니라 "줄거리 기반의 담백한 설명" 입니다. listing 의 overview 에서 인물·상황·사건을 뽑아 fact 중심으로 씁니다.
- 문장 끝은 가볍게, 형식 명사로 맺는 것을 우선합니다: "...이야기" "...드라마" "...로맨스" "...스릴러" "...코미디" "...다큐멘터리" "...시리즈" "...애니메이션" "...SF" 등
- 평가 단정형 금지: "좋습니다" "잘 맞습니다" "오래 남습니다" "감동입니다" "꼭 보세요" "추천합니다" 같은 문장으로 끝내지 마세요
- 과장 마케팅 표현 금지: "최고의" "놀라운" "완벽한" "강력 추천" "인생작" "역대급" "미쳤어요"
- 제품/AI 포지셔닝 금지: "AI가 추천" "알고리즘" "개인화 추천" "선택 피로" 언급 금지
- 취향 연결은 평가가 아니라 관찰로: "잔잔한 일상물을 좋아한 취향과 닿는 ..." 처럼 사용자의 결과 작품을 조용히 이어주세요

[작성 규칙]
- 후보 중 20개 선택 (후보가 적으면 전부)
- 장르 다양성: 같은 장르 연속 3개 금지. 액션·드라마·스릴러·SF·로맨스·코미디·다큐 중 최소 4개 이상 등장
- reason: 반드시 35자 이상 80자 이하 (공백 포함). 34자 이하 또는 81자 이상은 무조건 폐기. 45~70자 sweet spot 권장
- 작품 특정성: 그 작품에서만 성립하는 인물·설정·상황을 담으세요. "재미있어요" "추천합니다" 같은 추상은 사용 금지
- 스포일러 금지: 결말·반전의 구체 내용 노출 금지. 이야기의 출발점(설정)까지만 설명
- 카드 간 문형 반복 금지: 같은 어미·구조가 5개 이상 반복되면 다양화

[좋은 예 (35-80자, 반드시 이 길이와 톤을 따라하세요)]
"은퇴한 벤이 패션 스타트업의 시니어 인턴으로 들어가 CEO 줄스와 함께 일하는 이야기" (45자)
"도시를 떠난 혜원이 고향에서 직접 농사짓고 요리하며 사계절을 보내는 드라마" (40자)
"시간을 되돌릴 수 있는 팀이 사랑과 가족, 일상 속 선택을 겪는 로맨스" (37자)
"연쇄 실종 사건을 쫓던 형사가 마을이 오래 감춰 온 비밀과 마주하는 스릴러" (40자)
"우주에 홀로 남겨진 식물학자가 지구로 돌아갈 방법을 하나씩 찾아가는 SF" (39자)
"무명 밴드가 첫 앨범을 만드는 반년을 가까이에서 기록한 다큐멘터리" (36자)
"잔잔한 일상물을 좋아한 취향과 닿는, 시골 마을 수의사의 사계절을 담은 드라마" (42자)
"엉겁결에 한 가족이 된 좀도둑들이 서로의 빈자리를 채워 가는 이야기" (37자)
"평범한 회사원이 어느 날 갑자기 시간이 멈춘 도시에서 눈을 뜨며 시작되는 미스터리" (44자)
"결혼식 전날 사라진 신부를 찾는 하객들의 하루를 따라가는 소동극 코미디" (39자)

[나쁜 예 (절대 이러면 안 됨)]
"보고 나면 오래 남는 따뜻한 영화입니다" ← 평가 단정형. 내용 설명이 없음
"기분 전환용으로 완벽한 작품입니다" ← 과장 마케팅 + 평가 단정
"AI가 취향에 맞춰 고른 추천작입니다" ← 제품/AI 포지셔닝 금지
"반전이 미쳤어요. 꼭 보세요" ← 과장 + 권유 종결. 무슨 이야기인지 없음
"호불호 갈리지만 취향 맞으면 인생작이 돼요" ← 과장 표현 + 평가 단정
"심리적 깊이가 매력" ← 너무 짧고 추상적
"재미있어요. 추천합니다" ← 구체성 0 + 평가 단정
"감동적이고 재밌고 매력적이에요" ← 형용사 나열, 내용 없음
"이 감독의 최고작이라고 봐요" ← 과장 + listing 미확인 사실 추측 금지
"엄청난 흥행작이라는 평가가 있어요" ← 외부 평가 인용 금지

[작품 다양성 원칙]
- 한국 작품과 외국 작품을 균형 있게: 한국 사용자 기준 한국 35~50%, 외국 50~65%
- 영화와 시리즈 분배는 사용자 모드 가이드를 따름. 명시 없으면 6:4 또는 5:5
- 같은 감독·주연·국가 연속 3개 금지
- 발표 연도 다양화: 신작(최근 3년)과 클래식(10년+) 조화. 같은 연도 연속 4개 금지
- 무거운 작품(범죄/심리/전쟁)과 가벼운 작품(코미디/로맨스) 6:4 ~ 4:6 비율
- 메인스트림과 숨은 보석을 함께 배치 (popularity 상위 50%와 하위 50% 후보 모두 활용)

[장르별 reason 소재 가이드 — 전부 "무슨 이야기인지" 를 중심에]
- 스릴러/범죄: 누가 무엇을 쫓는지, 어떤 사건에서 출발하는지. 결말 스포 금지
- 멜로/로맨스: 두 사람이 어떤 상황에서 만나고 무엇이 관계를 흔드는지
- SF/판타지: 어떤 세계·규칙 위에서 벌어지는 이야기인지 (설정 한 줄)
- 다큐: 무엇을, 누구를, 얼마 동안 따라간 기록인지
- 액션: 주인공이 누구와 왜 부딪히는지. 무대(도시/전장/우주 등) 명시 유용
- 코미디: 어떤 상황의 어긋남에서 웃음이 나오는지
- 애니: 그림으로 그려낸 어떤 세계·인물의 이야기인지. 어린이용 한정 표현 회피
- 예능: 어떤 포맷으로 누가 무엇을 하는지. 회당 분량 정보 유용

[모드별 reason 프레임 차별화]
- 탐색 모드: 낯선 설정·장르 교차 지점을 설명의 앞에 배치
- 혼합 모드: 취향과의 접점을 관찰로 언급 ("○○ 결과 닿는, ..." ) 후 내용 설명
- 개인화 모드: 사용자가 좋아한 작품과의 연결고리를 구체적으로 ("△△처럼 ...한 상황에서 시작하는 ...")
- 어느 모드든 문장의 몸통은 작품 내용 설명 — 취향 연결은 수식으로만

[한국 시장 컨텍스트]
- 한국 토종 OTT 가용성(wavve/Tving/Watcha)과 글로벌 OTT(Netflix/Disney+/AppleTV+/Prime)를 균형 있게 추천
- 한국에서 스트리밍/대여/구매 가능한 작품만 선정. providers가 비어 있는 후보는 한국 미가용으로 간주하고 제외
- 한국어 자막·더빙이 보장되는 작품 우선 (글로벌 OTT는 대부분 보장)
- 한국 시청자 정서: 신파·과한 클리셰는 호불호 갈림 — reason 에 "잔잔한" "담백한" "현실적인" 같은 톤 수식은 유용 (단, 평가 단정이 아닌 내용 설명의 수식으로)
- 한국 드라마는 대체로 16부 안팎, 영화는 100~140분 — 분량 정보 (회차/러닝타임) 명시는 사용자 결정에 도움
- 일본 애니/대만 청춘물/태국 BL 등 아시아 작품은 자막 가용성과 "한국에서 보기 어려운 결" 이라는 발견 가치 강조 가능

[취향 신호 우선순위]
- 사용자 메시지에 "이 취향의 좋아한 작품"이 있으면 가장 강한 신호로 취급. 이 작품들의 결(분위기·주제·감독·캐릭터 깊이)을 우선 매칭하세요.
- "사용자 선호 장르 (계정 공통)" 정보가 있을 때, 해당 장르를 우선시하되 다양성 원칙(최소 4개 장르 등장)도 함께 지켜주세요. 한 장르에 몰빵 금지.
- 선호 장르 정보가 없을 때는 취향 favorites만 기반으로 결을 잡고, 장르 다양성은 폭넓게 가져가세요.
- 취향 favorites와 계정 선호 장르가 충돌하면(예: favorites는 다큐인데 tasteGenres에 액션) 취향 favorites를 우선 신호로 두고, 선호 장르는 보조로 고려하세요.
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
- "최고" "역대급" 같은 절대 평가는 평점과 무관하게 사용 금지 (톤 원칙) — 평가 대신 내용을 설명할 것

[JSON 출력 주의사항]
- selected 배열 외 다른 키 추가 금지
- id는 후보 listing의 [ID:숫자]에서 정확히 인용. 변형·생략·신규 ID 금지
- 후보에 없는 ID 출력 절대 금지
- reason은 큰따옴표(") 안. 안에 큰따옴표 사용 시 백슬래시 이스케이프
- JSON 외 추가 텍스트(설명/주석/마크다운) 절대 출력 금지
- 이모지·특수문자 reason에 사용 금지 (한글·영문·숫자·기본 문장부호만)
- selected 배열 안 같은 id 중복 금지 — 한 작품은 한 번만 선정

[출력 순서 (중요)]
- selected 배열은 자신 있는 매칭 순서로 정렬. 첫 pick = 사용자의 취향에 가장 강하게 매칭되는 작품
- 2번째 pick 부터는 매칭 강도가 점진적으로 약해지도록 배치 (다양성 원칙은 유지)
- 응답이 partial 로 소비될 수 있으므로 앞쪽 pick 일수록 확신도가 높아야 함

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
      ? "이 취향의 좋아한 작품"
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
      ? `\n\n[취향 요약]\n${truncateTasteSummary(tasteSummary.trim())}`
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
    providers: filterWatchProviders(candidate.providers),
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
    // Saved 장르 필터용 — mirror candidate.item.genre_ids 그대로 (TMDB 재호출 없음).
    genres: candidate.item.genre_ids ?? [],
  };
}

// ---------- 템플릿 reason (LLM 미선택 후보용) ----------
// 2026-07-10 톤 개편 — 상단 [reason 톤 원칙] 정합. 템플릿은 개별 줄거리를 모르므로
// 장르의 전형적인 이야기 형태를 "관찰형 설명 + 가벼운 명사 종결" 로 서술.
// 평가 단정("좋아요"/"딱이에요")·권유("보세요")·과장("최고") 금지 —
// REASON_BANNED_PATTERNS 를 reason-tone 테스트가 전 풀에 대해 검사한다.

const GENRE_REASONS: Record<number, string[]> = {
  28:    ["속도감 있는 추격과 대결이 이어지는 액션", "몸으로 부딪히는 장면들이 중심에 있는 액션"],
  12:    ["낯선 곳으로 떠난 인물들의 여정을 따라가는 모험물", "길 위에서 벌어지는 일들을 담은 모험 이야기"],
  16:    ["그림으로 그려낸 세계 위에 이야기를 쌓아가는 애니메이션", "손그림의 결이 살아 있는 애니메이션"],
  35:    ["일상의 어긋남에서 웃음을 만들어 가는 코미디", "인물들의 소동이 꼬리를 무는 코미디"],
  80:    ["사건의 실마리를 쫓는 사람들의 이야기를 담은 범죄물", "범죄와 그것을 쫓는 사람들 양쪽을 따라가는 이야기"],
  99:    ["실제 인물과 사건을 카메라로 가까이 따라간 다큐멘터리", "현장을 오래 지켜보며 기록한 다큐멘터리"],
  18:    ["인물의 선택과 관계를 천천히 따라가는 드라마", "감정의 결을 조금씩 쌓아 올리는 드라마"],
  10751: ["아이와 어른이 함께 볼 수 있게 그려낸 가족 이야기", "한 가족의 크고 작은 일들을 담은 이야기"],
  14:    ["현실 밖의 규칙 위에 세워진 세계를 그린 판타지", "다른 세계로 건너간 인물들의 이야기를 담은 판타지"],
  36:    ["실제 역사 위에 인물들의 이야기를 얹은 시대극", "한 시대를 통과해 가는 사람들의 이야기"],
  27:    ["일상에 스며드는 불안을 조금씩 키워 가는 공포물", "어둠 속에서 긴장을 쌓아 가는 호러"],
  10402: ["음악이 인물과 서사의 중심에 있는 이야기", "무대와 연주의 순간들을 담아낸 음악 영화"],
  9648:  ["단서를 하나씩 맞춰 가며 진실에 다가가는 미스터리", "감춰진 사정이 겹겹이 드러나는 미스터리"],
  10749: ["두 사람이 서로에게 스며드는 과정을 그린 로맨스", "어긋나고 다시 만나기를 반복하는 관계를 그린 로맨스"],
  878:   ["과학적 상상 위에 세워진 세계에서 벌어지는 SF", "기술이 바꿔 놓은 세계를 배경으로 한 SF"],
  53:    ["쫓고 쫓기는 긴장이 이어지는 스릴러", "의심이 조금씩 확신으로 바뀌어 가는 심리 스릴러"],
  10752: ["전장 한가운데 놓인 사람들의 이야기를 담은 전쟁물", "전쟁이 일상을 바꿔 놓는 과정을 그린 이야기"],
  37:    ["황야를 배경으로 총잡이들의 세계를 그린 서부극", "국경 마을의 대치와 결투를 담은 서부극"],
  10765: ["SF와 판타지의 설정이 섞인 세계를 그린 시리즈", "낯선 세계의 규칙 위에서 전개되는 시리즈"],
  10764: ["출연진의 관계와 상황이 곧 이야기가 되는 리얼리티 예능", "매회 새로운 상황이 벌어지는 리얼리티 프로그램"],
  10767: ["출연자들의 대화로 흘러가는 토크 프로그램", "게스트마다 다른 이야기가 오가는 토크 프로그램"],
};

// 평점/연도/국가 풀 — 평가 단정 대신 관찰 가능한 사실만.
const RATING_REASONS = [
  "많은 시청자가 높은 평점을 남긴 작품",
  "공개 후 오랫동안 평점 상위권에 있는 작품",
];

const CLASSIC_REASONS = [
  "여러 해가 지난 지금도 다시 찾게 되는 고전",
  "시간이 지나며 오히려 자주 회자되는 클래식",
];

const RECENT_REASONS = [
  "최근 공개되어 회자되고 있는 신작",
  "올해 새로 공개된 작품",
];

const KR_REASONS = [
  "한국의 창작자들이 만든 이야기",
  "한국을 배경으로 그려낸 이야기",
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

  // 폴백 — 톤 원칙 동일 (관찰형, 명사 종결)
  if (rating >= 8.5) return "많은 시청자가 높은 평점을 남긴 작품";
  if (c.type === "series") return "회차를 이어 가며 이야기를 쌓아 가는 시리즈";
  return "지금 취향의 결과 닿아 있는 작품";
}
