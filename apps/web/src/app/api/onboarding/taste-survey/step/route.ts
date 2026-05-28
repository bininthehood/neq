/**
 * POST /api/onboarding/taste-survey/step
 *
 * LLM 동적 취향 설문 — 분기 질문 생성 endpoint (step 1·2·3).
 *
 * 가드 순서:
 *   1. Body validate (JSON parse + 필수 필드)
 *   2. Origin check (prod / preview 도메인만, dev 는 허용)
 *   3. Session token verify (x-persona-session 헤더) — 없거나 만료 시 IP rate
 *      limit 체크 후 신규 발급
 *   4. OpenAI gpt-4o-mini 호출 (json_schema strict)
 *   5. parse_fail 시 1 retry
 *   6. 모두 실패 시 static fallback (packages/core/static-survey)
 *   7. step 2 응답 시 sharpness 휴리스틱 → shouldContinue 동봉
 *   8. response (신규 token 발급 시 newToken 동봉)
 *
 * design doc: ~/.gstack/projects/bininthehood-Neko/james-main-design-20260524-185113.md
 */
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import {
  getStaticSurveyStep,
  type PersonaContext,
  type TasteSurveyAnswer,
  type SurveyStepOutput,
  type SurveyAxisCategory,
} from '@neq/core';
import {
  issueToken,
  verifyToken,
} from '../_lib/session-token';
import { checkIpTokenLimit } from '../_lib/rate-limit';
import { shouldAddStep3 } from '../_lib/sharpness';

export const runtime = 'nodejs';

const openai = new OpenAI();
const MODEL = 'gpt-4o-mini';

interface StepRequestBody {
  context: PersonaContext;
  prevAnswers: TasteSurveyAnswer[];
  step: 1 | 2 | 3;
  deviceId: string;
}

function isValidContext(ctx: unknown): ctx is PersonaContext {
  if (!ctx || typeof ctx !== 'object') return false;
  const c = ctx as Record<string, unknown>;
  return (
    (c.contentType === 'movie' ||
      c.contentType === 'series' ||
      c.contentType === 'variety') &&
    (c.companion === 'alone' || c.companion === 'together')
  );
}

function validateBody(body: unknown): StepRequestBody | string {
  if (!body || typeof body !== 'object') return 'body must be object';
  const b = body as Record<string, unknown>;
  if (!isValidContext(b.context)) return 'invalid context';
  if (!Array.isArray(b.prevAnswers)) return 'prevAnswers must be array';
  if (b.step !== 1 && b.step !== 2 && b.step !== 3) return 'step must be 1·2·3';
  if (typeof b.deviceId !== 'string' || !b.deviceId)
    return 'deviceId required';
  return b as unknown as StepRequestBody;
}

const ALLOWED_ORIGIN_HOSTS_REGEX = [
  /^neq\.app$/,
  /\.vercel\.app$/,
  /^localhost(:\d+)?$/,
  /^127\.0\.0\.1(:\d+)?$/,
];

function isAllowedOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  // origin 헤더 부재 = same-origin 요청 (Next.js / fetch) — 허용
  if (!origin) return true;
  try {
    const host = new URL(origin).host;
    return ALLOWED_ORIGIN_HOSTS_REGEX.some((re) => re.test(host));
  } catch {
    return false;
  }
}

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

const LLM_TIMEOUT_MS = 8000;

/**
 * 06 진단 B안 (2026-05-28) — axis 카테고리 enum. SurveyAxisCategory 와 같은 값.
 * LLM_SCHEMA 에 string enum 으로 강제, prompt 에 자연어 힌트 둘 다 사용.
 */
const AXIS_CATEGORIES: readonly SurveyAxisCategory[] = [
  'pace',
  'closure',
  'character',
  'world',
  'tone',
  'era',
  'intensity',
  'rhythm',
  'theme',
  'rewatch',
  'context',
  'emotional_risk',
] as const;

interface LLMQuestionOutput {
  question: string;
  options: { id: 'a' | 'b' | 'c' | 'd'; label: string; hint?: string }[];
  axisHint: string;
  axisCategory: SurveyAxisCategory;
}

const LLM_SCHEMA = {
  name: 'survey_step_output',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      question: { type: 'string' },
      options: {
        type: 'array',
        minItems: 4,
        maxItems: 4,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'label', 'hint'],
          properties: {
            id: { type: 'string', enum: ['a', 'b', 'c', 'd'] },
            label: { type: 'string' },
            hint: { type: 'string' },
          },
        },
      },
      axisHint: { type: 'string' },
      axisCategory: {
        type: 'string',
        enum: [...AXIS_CATEGORIES],
      },
    },
    required: ['question', 'options', 'axisHint', 'axisCategory'],
  },
} as const;

const SYSTEM_PROMPT = `당신은 neq 의 한국 OTT 사용자 콜드스타트 설문 설계자입니다.
사용자의 메타 취향을 *발견적으로* 끌어내는 한국어 분기 질문을 생성합니다.

[메타 취향 축 — axisCategory enum, 매 step 다른 카테고리 사용]
- pace: 빠른 전개 vs 느린 호흡
- closure: 명쾌 / 여운 / 반전 결말
- character: 깊이 / 앙상블 / 도구화된 캐릭터
- world: 현실 / SF / 판타지 / 시대 배경 / 장르 형식
- tone: 따뜻 / 긴장 / 재치 / 차가움
- era: 현재 / 80~90s / 클래식 / 비서구 문화권
- intensity: 폭력·감정 강도 (얼마나 세게)
- rhythm: 한 번에 몰아 vs 매일 조금 vs 주말 / 러닝타임
- theme: 죽음·전쟁·사회 vs 일상·코미디
- rewatch: 일회성 vs 곱씹는 작품
- context: 시청 맥락 (배경 / 집중 / 잠들기 전 / 동반자)
- emotional_risk: 슬픔·불편함 감수도

[step 의도]
- step 1 = broad. 사용자 폭을 넓게 짚는 질문. 가장 식별력 높은 1개 카테고리.
- step 2 = contrast. step 1 과 다른 카테고리, 의외의 축으로 대비.
- step 3 = sharpness. step 1·2 에서 안 잡힌 미세한 결을 잡는 날카로운 질문.

[질문 작성 규칙]
- 질문은 30자 이내, 친근하지만 절제된 톤 (Quiet Ink). 마케팅 카피·"~한 당신"·이모지 금지.
- 옵션은 정확히 4개. id 순서 a·b·c·d. label 은 짧고 자연스러운 한국어 (8자 내외 권장).
- 옵션 d 는 항상 "무관 / 모름 / 잘 모르겠어요" 등 회피 옵션. 사용자에게 강요 금지.
- hint 는 옵션 label 의 짧은 보조 설명. 한 줄 이내.
- 같은 axisCategory 두 번 사용 금지. 이전에 쓴 카테고리는 user prompt 에 명시됨.

[좋은 질문 예시]
GOOD (axisCategory=tone): "어떤 분위기에 마음이 풀려요?"
  a: 따뜻한 거실 톤 / b: 차갑고 절제된 / c: 들썩이는 / d: 그날 기분 따라
  → 톤 카테고리를 구체 감각어로 분기. 형용사 강도 차이 있음.

GOOD (axisCategory=era): "어느 시대 정서에 더 끌려요?"
  a: 지금 이 순간 / b: 80~90년대 / c: 비서구·아시아 결 / d: 시대는 안 따져요
  → era 카테고리. 단순 연도 X, 정서 결로 묶음.

[진부한 질문 예시 — 피할 것]
BAD: "어떤 영화가 좋아요?" → 너무 광범위, 메타 축 없음.
BAD: "장르는 뭘 좋아하세요?" → 장르는 favorites picker 가 잡음. 메타 축이 아님.
BAD: "감동·재미·긴장 중 뭐?" → 옵션이 의미 단위가 섞여 분기 안 됨.

JSON schema 를 정확히 따르세요. axisCategory 는 위 enum 12종 중 1개 정확히.`;

/**
 * 06 진단 B안 (2026-05-28) — TasteSurveyAnswer 에서 axisCategory 추출.
 * client 가 다음 step 호출 시 prevAnswers 항목에 axisCategory 동봉하면 우선 사용.
 * 미동봉 시 client 영향 0 → 빈 배열 (자연어 힌트 없이 schema enum 만 강제).
 */
function extractUsedAxes(
  prevAnswers: TasteSurveyAnswer[],
): SurveyAxisCategory[] {
  const used: SurveyAxisCategory[] = [];
  for (const a of prevAnswers) {
    const cand = (a as TasteSurveyAnswer & { axisCategory?: unknown })
      .axisCategory;
    if (typeof cand === 'string' && (AXIS_CATEGORIES as readonly string[]).includes(cand)) {
      used.push(cand as SurveyAxisCategory);
    }
  }
  return used;
}

function stepIntent(step: number): string {
  if (step === 1) return 'broad — 사용자 폭을 가장 넓게 짚는 카테고리 1개';
  if (step === 2) return 'contrast — step 1 과 다른 결, 의외의 축으로 대비';
  return 'sharpness — step 1·2 에서 안 잡힌 미세한 결을 잡는 날카로운 질문';
}

function buildUserPrompt(
  context: PersonaContext,
  prevAnswers: TasteSurveyAnswer[],
  step: number,
): string {
  const ctxLabel =
    context.contentType === 'movie'
      ? '영화'
      : context.contentType === 'series'
        ? '시리즈'
        : '예능';
  const companionLabel = context.companion === 'alone' ? '혼자' : '같이';
  const prevSummary =
    prevAnswers.length === 0
      ? '(이전 답 없음 — 첫 질문)'
      : prevAnswers
          .map((a, i) => {
            const ax = (a as TasteSurveyAnswer & { axisCategory?: string })
              .axisCategory;
            const axisTag = ax ? ` [axisCategory=${ax}]` : '';
            return `${i + 1}. Q: ${a.question}${axisTag} / A: ${a.selectedOption}`;
          })
          .join('\n');
  const usedAxes = extractUsedAxes(prevAnswers);
  const forbidLine =
    usedAxes.length > 0
      ? `금지 axisCategory (이미 사용됨): ${usedAxes.join(', ')}\n다음 질문은 위 카테고리 *외* 의 다른 1종을 선택하세요.`
      : '아직 사용된 axisCategory 없음. step 의도에 맞는 식별력 높은 카테고리를 선택하세요.';

  return `컨텍스트: ${companionLabel} 보는 ${ctxLabel}
현재 step: ${step} (의도: ${stepIntent(step)})
${forbidLine}

이전 답:
${prevSummary}

위 컨텍스트와 의도에 맞춰 step ${step} 의 분기 질문 1개와 4 옵션을 생성하세요.
응답에 axisCategory 를 정확히 1개 포함하세요 (위 금지 목록 외).`;
}

async function callLLM(
  context: PersonaContext,
  prevAnswers: TasteSurveyAnswer[],
  step: number,
): Promise<LLMQuestionOutput | null> {
  const userPrompt = buildUserPrompt(context, prevAnswers, step);
  // 1 retry
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
      try {
        const response = await openai.chat.completions.create(
          {
            model: MODEL,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userPrompt },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: LLM_SCHEMA,
            },
            // 06 진단 B안 (2026-05-28): 다양성 ↑ — 추천엔진 (0.9) 와 동률.
            temperature: 0.9,
          },
          { signal: controller.signal },
        );
        clearTimeout(timer);
        const content = response.choices[0]?.message?.content;
        if (!content) continue;
        const parsed = JSON.parse(content) as LLMQuestionOutput;
        // 응답 schema 추가 검증 — axisCategory enum 포함
        if (
          typeof parsed.question === 'string' &&
          Array.isArray(parsed.options) &&
          parsed.options.length === 4 &&
          typeof parsed.axisHint === 'string' &&
          typeof parsed.axisCategory === 'string' &&
          (AXIS_CATEGORIES as readonly string[]).includes(parsed.axisCategory)
        ) {
          return parsed;
        }
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // continue retry
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  // 1. Origin check
  if (!isAllowedOrigin(req)) {
    return NextResponse.json(
      { code: 'origin_blocked', message: 'origin not allowed' },
      { status: 403 },
    );
  }

  // 2. Body validate
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { code: 'invalid_body', message: 'invalid JSON' },
      { status: 400 },
    );
  }
  const validated = validateBody(body);
  if (typeof validated === 'string') {
    return NextResponse.json(
      { code: 'invalid_body', message: validated },
      { status: 400 },
    );
  }
  const { context, prevAnswers, step, deviceId } = validated;

  // 3. Session token verify
  const providedToken = req.headers.get('x-persona-session');
  let newToken: string | undefined;
  if (providedToken) {
    const result = verifyToken(providedToken, deviceId);
    if (!result.valid) {
      if (result.error === 'expired') {
        // Token 만료 — IP rate limit 통과 시 신규 발급
        const limit = await checkIpTokenLimit(getClientIp(req));
        if (!limit.allowed) {
          return NextResponse.json(
            {
              code: 'session_expired',
              message: 'token expired and rate limit exceeded',
            },
            {
              status: 401,
              headers: { 'Retry-After': String(limit.retryAfterSec ?? 3600) },
            },
          );
        }
        newToken = issueToken(deviceId);
      } else if (result.error === 'device_mismatch') {
        return NextResponse.json(
          { code: 'invalid_token', message: 'device mismatch' },
          { status: 401 },
        );
      } else {
        return NextResponse.json(
          { code: 'invalid_token', message: result.error ?? 'invalid' },
          { status: 401 },
        );
      }
    }
  } else {
    // Token 없음 — IP rate limit 체크 후 신규 발급
    const limit = await checkIpTokenLimit(getClientIp(req));
    if (!limit.allowed) {
      return NextResponse.json(
        { code: 'rate_limit', message: 'IP rate limit exceeded' },
        {
          status: 429,
          headers: { 'Retry-After': String(limit.retryAfterSec ?? 3600) },
        },
      );
    }
    newToken = issueToken(deviceId);
  }

  // 4. LLM 호출 (1 retry 포함)
  let llmOutput = await callLLM(context, prevAnswers, step);

  // 5. LLM 실패 시 static fallback
  let usedFallback = false;
  if (!llmOutput) {
    const fallback = getStaticSurveyStep(context, step);
    if (!fallback) {
      return NextResponse.json(
        {
          code: 'fallback_unavailable',
          message: 'no static fallback for this context/step',
        },
        { status: 500 },
      );
    }
    llmOutput = {
      question: fallback.question,
      options: fallback.options as LLMQuestionOutput['options'],
      axisHint: fallback.axisHint,
      axisCategory: fallback.axisCategory,
    };
    usedFallback = true;
  }

  // 6. step 2 응답 시 sharpness 판정
  let shouldContinue = false;
  if (step === 2) {
    shouldContinue = shouldAddStep3(prevAnswers);
  }

  const response: SurveyStepOutput & { newToken?: string; _fallback?: boolean } = {
    question: llmOutput.question,
    options: llmOutput.options,
    axisHint: llmOutput.axisHint,
    axisCategory: llmOutput.axisCategory,
    shouldContinue,
  };
  if (newToken) response.newToken = newToken;
  if (usedFallback) response._fallback = true;

  return NextResponse.json(response);
}
