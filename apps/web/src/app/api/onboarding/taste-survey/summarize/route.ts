/**
 * POST /api/onboarding/taste-survey/summarize
 *
 * 컨텍스트 + 설문 답 + favorites 를 종합해 자연어 tasteSummary (3-5 문장) 생성.
 * 결과는 클라이언트가 persona.tasteSummary 에 저장 → 후속 recommend 호출 시
 * system 프롬프트에 prepend.
 *
 * 가드: step 와 동일 (origin / token / rate limit / LLM 1 retry / fallback).
 * 추가: 800 token (대략 800 자) 초과 시 재생성 1회 ("더 짧게" 지시 강화).
 */
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import {
  buildFallbackSummary,
  type PersonaContext,
  type TasteSurveyAnswer,
  type SurveySummaryOutput,
} from '@neq/core';
import {
  issueToken,
  verifyToken,
} from '../_lib/session-token';
import { checkIpTokenLimit } from '../_lib/rate-limit';

export const runtime = 'nodejs';

const openai = new OpenAI();
const MODEL = 'gpt-4o-mini';
const LLM_TIMEOUT_MS = 8000;
const MAX_SUMMARY_CHARS = 800;

interface SummarizeRequestBody {
  context: PersonaContext;
  prevAnswers: TasteSurveyAnswer[];
  favorites: { title: string; tmdbId?: number }[];
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

function validateBody(body: unknown): SummarizeRequestBody | string {
  if (!body || typeof body !== 'object') return 'body must be object';
  const b = body as Record<string, unknown>;
  if (!isValidContext(b.context)) return 'invalid context';
  if (!Array.isArray(b.prevAnswers)) return 'prevAnswers must be array';
  if (!Array.isArray(b.favorites)) return 'favorites must be array';
  if (typeof b.deviceId !== 'string' || !b.deviceId)
    return 'deviceId required';
  return b as unknown as SummarizeRequestBody;
}

const ALLOWED_ORIGIN_HOSTS_REGEX = [
  /^neq\.app$/,
  /\.vercel\.app$/,
  /^localhost(:\d+)?$/,
  /^127\.0\.0\.1(:\d+)?$/,
];

function isAllowedOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
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
  return req.headers.get('x-real-ip') ?? 'unknown';
}

const SUMMARY_SCHEMA = {
  name: 'taste_summary_output',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      tasteSummary: { type: 'string' },
      axes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'value'],
          properties: {
            name: { type: 'string' },
            value: { type: 'string' },
          },
        },
      },
    },
    required: ['tasteSummary', 'axes'],
  },
} as const;

const SYSTEM_PROMPT_BASE = `당신은 neko 의 한국 OTT 사용자 취향을 한국어 자연어로
요약하는 분석가입니다. 사용자의 설문 답과 좋아하는 작품을 종합해 3-5 문장의
"이 사용자는 어떤 사람인가" 요약을 만듭니다.

규칙:
- 3-5 문장. 800자 이내.
- 친근하지만 절제된 톤 (Quiet Ink).
- 사용자가 본인 요약을 보고 "맞아"라고 끄덕일 만한 구체성.
- 작품 제목은 《》로 감싸기 (선택, 자연스러울 때만).
- 마케팅 카피·과장 금지.
- axes 는 설문 답에서 추출한 구조화 메타 (디버깅용). 각 axis name + value.

JSON schema 를 정확히 따르세요.`;

function buildUserPrompt(
  context: PersonaContext,
  prevAnswers: TasteSurveyAnswer[],
  favorites: SummarizeRequestBody['favorites'],
  shorter: boolean,
): string {
  const ctxLabel =
    context.contentType === 'movie'
      ? '영화'
      : context.contentType === 'series'
        ? '시리즈'
        : '예능';
  const companionLabel = context.companion === 'alone' ? '혼자' : '같이';
  const ansBlock =
    prevAnswers.length === 0
      ? '(없음)'
      : prevAnswers
          .map((a, i) => `${i + 1}. ${a.question} → ${a.selectedOption}`)
          .join('\n');
  const favBlock =
    favorites.length === 0
      ? '(없음)'
      : favorites
          .slice(0, 5)
          .map((f) => `- ${f.title}`)
          .join('\n');
  const shorterHint = shorter
    ? '\n\n주의: 직전 응답이 너무 길었습니다. 이번엔 3 문장, 500자 이내로 더 압축하세요.'
    : '';
  return `컨텍스트: ${companionLabel} 보는 ${ctxLabel}

설문 답:
${ansBlock}

좋아하는 작품 (최대 5):
${favBlock}

이 사용자의 취향을 3-5 문장으로 요약하세요.${shorterHint}`;
}

async function callLLMSummary(
  body: SummarizeRequestBody,
  shorter: boolean,
): Promise<SurveySummaryOutput | null> {
  const userPrompt = buildUserPrompt(
    body.context,
    body.prevAnswers,
    body.favorites,
    shorter,
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
      try {
        const response = await openai.chat.completions.create(
          {
            model: MODEL,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT_BASE },
              { role: 'user', content: userPrompt },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: SUMMARY_SCHEMA,
            },
            temperature: 0.7,
          },
          { signal: controller.signal },
        );
        clearTimeout(timer);
        const content = response.choices[0]?.message?.content;
        if (!content) continue;
        const parsed = JSON.parse(content) as SurveySummaryOutput;
        if (
          typeof parsed.tasteSummary === 'string' &&
          parsed.tasteSummary.length > 0 &&
          Array.isArray(parsed.axes)
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

/**
 * 800자 초과 시 문장 단위 truncate (한국어 자모 깨짐 방지).
 */
function truncateAtSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const sliced = text.slice(0, maxChars);
  // 마지막 문장 경계 (., ?, !, 다음 공백/끝)
  const match = sliced.match(/[\s\S]*[.!?](?=\s|$)/);
  if (match) return match[0];
  // 문장 경계 없으면 그냥 잘라서 ...
  return sliced + '...';
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
  const { context, prevAnswers, favorites, deviceId } = validated;

  // 3. Session token verify (step endpoint 와 동일 정책)
  const providedToken = req.headers.get('x-persona-session');
  let newToken: string | undefined;
  if (providedToken) {
    const result = verifyToken(providedToken, deviceId);
    if (!result.valid) {
      if (result.error === 'expired') {
        const limit = await checkIpTokenLimit(getClientIp(req));
        if (!limit.allowed) {
          return NextResponse.json(
            { code: 'session_expired', message: 'token expired + rate limit' },
            { status: 401 },
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
    const limit = await checkIpTokenLimit(getClientIp(req));
    if (!limit.allowed) {
      return NextResponse.json(
        { code: 'rate_limit', message: 'IP rate limit exceeded' },
        { status: 429 },
      );
    }
    newToken = issueToken(deviceId);
  }

  // 4. LLM 호출
  let summary = await callLLMSummary(validated, false);

  // 5. 800자 초과 시 재생성 1회 (shorter hint)
  if (summary && summary.tasteSummary.length > MAX_SUMMARY_CHARS) {
    const retry = await callLLMSummary(validated, true);
    if (retry && retry.tasteSummary.length <= MAX_SUMMARY_CHARS) {
      summary = retry;
    } else {
      // 재시도도 길면 sentence boundary truncate
      summary = {
        ...summary,
        tasteSummary: truncateAtSentence(summary.tasteSummary, MAX_SUMMARY_CHARS),
      };
    }
  }

  // 6. LLM 실패 시 룰 기반 fallback
  let usedFallback = false;
  if (!summary) {
    summary = buildFallbackSummary({
      context,
      prevAnswers,
      favorites,
    });
    usedFallback = true;
  }

  const response: SurveySummaryOutput & {
    newToken?: string;
    _fallback?: boolean;
  } = {
    tasteSummary: summary.tasteSummary,
    axes: summary.axes,
  };
  if (newToken) response.newToken = newToken;
  if (usedFallback) response._fallback = true;

  return NextResponse.json(response);
}
