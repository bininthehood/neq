/**
 * Static survey set — onboarding 페르소나 설문 정상 경로 (2026-06-06 승격).
 *
 * 6 컨텍스트 (영화·시리즈·예능 × 혼자·같이) × 3 step × 4 옵션 = 완전 셋.
 * Quiet Ink tone — 절제된 한국어, 단순 옵션, hint 는 한 문장 이내.
 * DESIGN.md anti-slop 가드: 균일 카드 그리드 X (UI 가 세로 리스트로 렌더링), 옵션
 * label 은 일상적 어휘로 (마케팅 카피 금지).
 *
 * deterministic 동작 보장: 사용자 답에 무관하게 step 1→2→3 정의된 순서 진행.
 * step 2 의 shouldContinue=true 로 모든 사용자가 step 3 진입 (3-step path).
 */
import type { PersonaContext, TasteSurveyAnswer } from './types';

export interface SurveyOption {
  id: 'a' | 'b' | 'c' | 'd';
  label: string;
  hint?: string;
}

/**
 * 메타 취향 축 카테고리 — LLM 강제 비반복 enum (06 진단 B안, 2026-05-28).
 *
 * 평면 5종 ('pace/closure/theme/rhythm/mood') 에서 발견적 12종으로 확장.
 * 서버는 prevAnswers 에서 사용된 axisCategory 를 추출해 다음 step LLM 호출 시
 * "사용 금지" 목록으로 전달, JSON schema enum 강제와 prompt 자연어 힌트 둘 다 사용.
 * static fallback 풀도 동일 카테고리 라벨 사용.
 */
export type SurveyAxisCategory =
  | 'pace'           // 페이스 — 빠른 전개 vs 느린 호흡
  | 'closure'        // 결말 — 명쾌 vs 여운 vs 반전
  | 'character'      // 캐릭터 — 깊이 / 앙상블 / 도구화
  | 'world'          // 세계관 — 현실 / SF / 판타지 / 시대
  | 'tone'           // 톤·분위기 — 따뜻 / 긴장 / 재치 / 차가움
  | 'era'            // 시대·문화 — 현재 / 80s / 클래식 / 비서구
  | 'intensity'      // 강도 — 폭력·감정 강도
  | 'rhythm'         // 호흡 — binge / 매일 / 주말
  | 'theme'          // 주제 무게 — 죽음·전쟁 vs 일상·코미디
  | 'rewatch'        // 재시청성 — 일회성 vs 곱씹는 작품
  | 'context'        // 시청 맥락 — 배경 / 집중 / 잠들기 전 / 동반자
  | 'emotional_risk'; // 정서적 위험 — 슬픔·불편함 감수도

export interface SurveyStepOutput {
  question: string;
  options: SurveyOption[];
  axisHint: string;
  /**
   * 06 진단 B안 (2026-05-28) — LLM 강제 비반복 enum. static fallback 도 동일 라벨.
   * 서버가 prevAnswers 의 axisCategory 를 누적해 다음 step 호출 시 금지 목록 전달.
   */
  axisCategory: SurveyAxisCategory;
  /**
   * step 2 응답에 한해 의미. true=step 3 추가, false=summarize 진입.
   * 정상 경로 (정적 풀, 2026-06-06): step 2 = true (3-step path 강제),
   * step 3 = false (summarize 진입). step 1 은 의미 없음.
   */
  shouldContinue: boolean;
}

export interface SurveyStepInput {
  context: PersonaContext;
  prevAnswers: TasteSurveyAnswer[];
  step: 1 | 2 | 3;
}

export interface SurveySummaryInput {
  context: PersonaContext;
  prevAnswers: TasteSurveyAnswer[];
  favorites: { title: string; tmdbId?: number }[];
}

export interface SurveySummaryOutput {
  tasteSummary: string;
  axes: { name: string; value: string }[];
}

type ContextKey =
  | 'movie-alone'
  | 'movie-together'
  | 'series-alone'
  | 'series-together'
  | 'variety-alone'
  | 'variety-together';

function contextKey(context: PersonaContext): ContextKey {
  return `${context.contentType}-${context.companion}` as ContextKey;
}

/**
 * 영화·혼자 — 페이스 / 결말 / 주제 무게.
 */
const MOVIE_ALONE: SurveyStepOutput[] = [
  {
    question: '어떤 페이스가 좋아요?',
    axisHint: '페이스 (pace)',
    axisCategory: 'pace',
    options: [
      { id: 'a', label: '빠르게 몰입', hint: '긴장감 있는 전개' },
      { id: 'b', label: '천천히 깊게', hint: '호흡이 긴 작품' },
      { id: 'c', label: '균형', hint: '상황에 따라 달라요' },
      { id: 'd', label: '잘 모르겠어요', hint: '딱히 정한 게 없어요' },
    ],
    shouldContinue: false,
  },
  {
    question: '어떤 결말을 더 좋아해요?',
    axisHint: '결말 (closure)',
    axisCategory: 'closure',
    options: [
      { id: 'a', label: '명쾌한 마무리', hint: '모든 게 해결되는' },
      { id: 'b', label: '여운이 남는 마무리', hint: '해석의 여지가 있는' },
      { id: 'c', label: '반전이 있는 마무리', hint: '예상을 뒤집는' },
      { id: 'd', label: '무관', hint: '결말은 중요하지 않아요' },
    ],
    shouldContinue: true,
  },
  {
    question: '어떤 주제를 견딜 수 있어요?',
    axisHint: '주제 무게 (theme weight)',
    axisCategory: 'theme',
    options: [
      { id: 'a', label: '무거운 주제', hint: '죽음·전쟁·심리 등' },
      { id: 'b', label: '가벼운 주제', hint: '코미디·로맨스 위주' },
      { id: 'c', label: '둘 다', hint: '기분 따라' },
      { id: 'd', label: '잘 모르겠어요' },
    ],
    shouldContinue: false,
  },
];

/**
 * 영화·같이 — 보편성 / 시간 / 분위기.
 */
const MOVIE_TOGETHER: SurveyStepOutput[] = [
  {
    question: '같이 보는 사람과 무엇을 공유하고 싶어요?',
    axisHint: '공유 동기 (shared context)',
    axisCategory: 'context',
    options: [
      { id: 'a', label: '같이 웃기', hint: '코미디·가벼운 분위기' },
      { id: 'b', label: '같이 몰입', hint: '긴장감 있는 전개' },
      { id: 'c', label: '같이 생각', hint: '대화가 남는 작품' },
      { id: 'd', label: '잘 모르겠어요' },
    ],
    shouldContinue: false,
  },
  {
    question: '러닝타임은 얼마가 적당해요?',
    axisHint: '러닝타임 (rhythm)',
    axisCategory: 'rhythm',
    options: [
      { id: 'a', label: '90분 이하', hint: '짧고 가볍게' },
      { id: 'b', label: '2시간 안팎', hint: '일반적인 길이' },
      { id: 'c', label: '길어도 괜찮음', hint: '대작·전작 OK' },
      { id: 'd', label: '무관' },
    ],
    shouldContinue: true,
  },
  {
    question: '어떤 분위기가 어울려요?',
    axisHint: '분위기 (tone)',
    axisCategory: 'tone',
    options: [
      { id: 'a', label: '따뜻한 분위기', hint: '편안한 감정' },
      { id: 'b', label: '긴장된 분위기', hint: '집중하게 되는' },
      { id: 'c', label: '재치 있는 분위기', hint: '대사가 살아있는' },
      { id: 'd', label: '무관' },
    ],
    shouldContinue: false,
  },
];

/**
 * 시리즈·혼자 — 호흡 / 시즌 / 캐릭터.
 */
const SERIES_ALONE: SurveyStepOutput[] = [
  {
    question: '한 번에 얼마나 보고 싶어요?',
    axisHint: '시청 호흡 (rhythm)',
    axisCategory: 'rhythm',
    options: [
      { id: 'a', label: '몰아보기', hint: '한 시즌 통째로' },
      { id: 'b', label: '하루 1-2 화', hint: '조금씩 오래' },
      { id: 'c', label: '주말에 몰아서', hint: '시간 날 때만' },
      { id: 'd', label: '잘 모르겠어요' },
    ],
    shouldContinue: false,
  },
  {
    question: '몇 시즌까지 견딜 수 있어요?',
    axisHint: '시즌 길이 (pace)',
    axisCategory: 'pace',
    options: [
      { id: 'a', label: '1 시즌 단편', hint: '명확한 결말' },
      { id: 'b', label: '2-3 시즌', hint: '적당한 길이' },
      { id: 'c', label: '장편 대서사', hint: '5 시즌 이상도 OK' },
      { id: 'd', label: '무관' },
    ],
    shouldContinue: true,
  },
  {
    question: '캐릭터가 어떻길 바라요?',
    axisHint: '캐릭터 깊이 (character)',
    axisCategory: 'character',
    options: [
      { id: 'a', label: '한 명에 깊이 몰입', hint: '주인공 서사' },
      { id: 'b', label: '여럿이 얽혀', hint: '앙상블 캐스트' },
      { id: 'c', label: '플롯이 더 중요', hint: '캐릭터는 도구' },
      { id: 'd', label: '잘 모르겠어요' },
    ],
    shouldContinue: false,
  },
];

/**
 * 시리즈·같이 — 진입 장벽 / 갱신 / 장르.
 */
const SERIES_TOGETHER: SurveyStepOutput[] = [
  {
    question: '같이 보는 사람의 취향은 어때요?',
    axisHint: '동반자 취향 (context)',
    axisCategory: 'context',
    options: [
      { id: 'a', label: '비슷해요', hint: '큰 갈등 없음' },
      { id: 'b', label: '꽤 달라요', hint: '중간 지점이 필요' },
      { id: 'c', label: '아직 모르겠어요', hint: '같이 탐색 중' },
      { id: 'd', label: '상관 없어요' },
    ],
    shouldContinue: false,
  },
  {
    question: '새 시즌 기다리는 게 괜찮아요?',
    axisHint: '갱신 인내심 (rhythm)',
    axisCategory: 'rhythm',
    options: [
      { id: 'a', label: '완결작 선호', hint: '기다리기 싫어요' },
      { id: 'b', label: '진행 중도 OK', hint: '같이 따라가는 재미' },
      { id: 'c', label: '구분 안 해요' },
      { id: 'd', label: '잘 모르겠어요' },
    ],
    shouldContinue: true,
  },
  {
    question: '같이 볼 때 어떤 장르가 안전해요?',
    axisHint: '안전 장르 (world)',
    axisCategory: 'world',
    options: [
      { id: 'a', label: '드라마·로맨스', hint: '감정선 위주' },
      { id: 'b', label: '범죄·스릴러', hint: '긴장감 위주' },
      { id: 'c', label: 'SF·판타지', hint: '세계관 위주' },
      { id: 'd', label: '잘 모르겠어요' },
    ],
    shouldContinue: false,
  },
];

/**
 * 예능·혼자 — 톤 / 형식 / 출연자.
 */
const VARIETY_ALONE: SurveyStepOutput[] = [
  {
    question: '혼자 볼 때 예능은 어떤 역할이에요?',
    axisHint: '시청 동기 (context)',
    axisCategory: 'context',
    options: [
      { id: 'a', label: '배경 음악처럼', hint: '집안일하며 흘려보기' },
      { id: 'b', label: '집중해서 즐기기', hint: '제대로 시청' },
      { id: 'c', label: '잠들기 전 가볍게', hint: '루틴처럼' },
      { id: 'd', label: '잘 모르겠어요' },
    ],
    shouldContinue: false,
  },
  {
    question: '어떤 형식이 더 끌려요?',
    axisHint: '예능 형식 (world)',
    axisCategory: 'world',
    options: [
      { id: 'a', label: '관찰 예능', hint: '일상·여행' },
      { id: 'b', label: '토크쇼', hint: '대화·인터뷰' },
      { id: 'c', label: '서바이벌·게임', hint: '경쟁·미션' },
      { id: 'd', label: '무관' },
    ],
    shouldContinue: true,
  },
  {
    question: '출연자는 누가 좋아요?',
    axisHint: '출연자 선호 (character)',
    axisCategory: 'character',
    options: [
      { id: 'a', label: '익숙한 얼굴', hint: '오래 본 출연자' },
      { id: 'b', label: '새로운 얼굴', hint: '낯선 사람의 매력' },
      { id: 'c', label: '한 명의 강한 캐릭터', hint: '주연 중심' },
      { id: 'd', label: '무관' },
    ],
    shouldContinue: false,
  },
];

/**
 * 예능·같이 — 함께 웃기 / 시간대 / 회차 길이.
 */
const VARIETY_TOGETHER: SurveyStepOutput[] = [
  {
    question: '같이 볼 때 무엇이 가장 중요해요?',
    axisHint: '공유 가치 (context)',
    axisCategory: 'context',
    options: [
      { id: 'a', label: '같이 웃기', hint: '폭소 위주' },
      { id: 'b', label: '같이 대화', hint: '이야기거리' },
      { id: 'c', label: '함께 응원', hint: '서바이벌·경쟁' },
      { id: 'd', label: '무관' },
    ],
    shouldContinue: false,
  },
  {
    question: '주로 언제 봐요?',
    axisHint: '시청 시간대 (rhythm)',
    axisCategory: 'rhythm',
    options: [
      { id: 'a', label: '저녁 식사 중', hint: '식탁에서' },
      { id: 'b', label: '주말 낮', hint: '여유 있는 시간' },
      { id: 'c', label: '늦은 밤', hint: '잠들기 전' },
      { id: 'd', label: '무관' },
    ],
    shouldContinue: true,
  },
  {
    question: '한 회 길이는 어느 정도가 좋아요?',
    axisHint: '회차 길이 (pace)',
    axisCategory: 'pace',
    options: [
      { id: 'a', label: '30분 이내', hint: '짧고 부담 없게' },
      { id: 'b', label: '1시간 안팎', hint: '제대로 빠져들기' },
      { id: 'c', label: '길어도 OK', hint: '몇 시간도 가능' },
      { id: 'd', label: '무관' },
    ],
    shouldContinue: false,
  },
];

const SURVEY_BY_CONTEXT: Record<ContextKey, SurveyStepOutput[]> = {
  'movie-alone': MOVIE_ALONE,
  'movie-together': MOVIE_TOGETHER,
  'series-alone': SERIES_ALONE,
  'series-together': SERIES_TOGETHER,
  'variety-alone': VARIETY_ALONE,
  'variety-together': VARIETY_TOGETHER,
};

/**
 * 컨텍스트별 step (1~3) 의 미리 정의된 질문 반환.
 * LLM 호출 실패 시 client/server 양쪽이 fallback 으로 호출.
 *
 * step 3 는 static 셋에서 shouldContinue=false 라 사실상 미진입.
 * design doc 의 dynamic 분기 vs static deterministic 의 절충.
 */
export function getStaticSurveyStep(
  context: PersonaContext,
  step: 1 | 2 | 3,
): SurveyStepOutput | undefined {
  const set = SURVEY_BY_CONTEXT[contextKey(context)];
  if (!set) return undefined;
  return set[step - 1];
}

/**
 * LLM summarize 실패 시 룰 기반 fallback. context + 답을 한국어 자연어로 조합.
 * 빈 페르소나 차단이 목적이므로 품질보다 안정성 우선.
 */
export function buildFallbackSummary(
  input: SurveySummaryInput,
): SurveySummaryOutput {
  const { context, prevAnswers, favorites } = input;
  const contextLabel =
    context.contentType === 'movie'
      ? '영화'
      : context.contentType === 'series'
        ? '시리즈'
        : '예능';
  const companionLabel = context.companion === 'alone' ? '혼자' : '같이';
  const axes = prevAnswers.map((a) => ({
    name: a.question.replace(/[?.]/g, '').trim(),
    value: a.selectedOption,
  }));
  const favTitles =
    favorites.length > 0
      ? favorites
          .slice(0, 3)
          .map((f) => `《${f.title}》`)
          .join(', ')
      : null;

  const lines: string[] = [];
  lines.push(`${companionLabel} 볼 ${contextLabel}를 위한 페르소나입니다.`);
  if (axes.length > 0) {
    const axisSummary = axes
      .map((a) => `${a.name}은 "${a.value}"`)
      .join(', ');
    lines.push(`${axisSummary} 쪽을 선호합니다.`);
  }
  if (favTitles) {
    lines.push(`${favTitles} 같은 작품과 결이 맞는 추천을 좋아합니다.`);
  }

  return {
    tasteSummary: lines.join(' '),
    axes,
  };
}
