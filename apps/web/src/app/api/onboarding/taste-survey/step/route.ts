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

interface LLMQuestionOutput {
  question: string;
  options: { id: 'a' | 'b' | 'c' | 'd'; label: string; hint?: string }[];
  axisHint: string;
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
    },
    required: ['question', 'options', 'axisHint'],
  },
} as const;

const SYSTEM_PROMPT = `당신은 neko 의 한국 OTT 사용자 콜드스타트 설문 설계자입니다.
사용자의 메타 취향 축 (페이스, 결말, 주제 무게, 호흡, 분위기 등) 을 끌어내는
한국어 분기 질문을 생성합니다.

규칙:
- 질문은 30자 이내, 친근하지만 절제된 톤 (Quiet Ink).
- 옵션은 정확히 4개. id: a, b, c, d. label 은 짧고 자연스러운 한국어.
- 옵션 d 는 "무관 / 모름" 등 회피 옵션을 포함하도록 (사용자가 강요받지 않게).
- hint 는 옵션 label 의 짧은 보조 설명. 한 줄 이내.
- 이전 답을 보고 자연스러운 다음 질문으로 분기. 같은 축 반복 금지.

JSON schema 를 정확히 따르세요.`;

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
          .map((a, i) => `${i + 1}. Q: ${a.question} / A: ${a.selectedOption}`)
          .join('\n');
  return `컨텍스트: ${companionLabel} 보는 ${ctxLabel}
현재 step: ${step}
이전 답:
${prevSummary}

위 컨텍스트에 맞춰 step ${step} 의 분기 질문 1개와 4 옵션을 생성하세요.`;
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
            temperature: 0.7,
          },
          { signal: controller.signal },
        );
        clearTimeout(timer);
        const content = response.choices[0]?.message?.content;
        if (!content) continue;
        const parsed = JSON.parse(content) as LLMQuestionOutput;
        // 응답 schema 추가 검증
        if (
          typeof parsed.question === 'string' &&
          Array.isArray(parsed.options) &&
          parsed.options.length === 4 &&
          typeof parsed.axisHint === 'string'
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
    shouldContinue,
  };
  if (newToken) response.newToken = newToken;
  if (usedFallback) response._fallback = true;

  return NextResponse.json(response);
}
