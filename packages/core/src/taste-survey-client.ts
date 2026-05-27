/**
 * Taste survey client — 서버 endpoint fetch 래퍼.
 *
 * 보안: 클라이언트가 OpenAI 를 직접 호출하지 않는다 (API key 노출 차단,
 * plan-eng-review HIGH #4). 모든 LLM 호출은 web 서버의
 * `/api/onboarding/taste-survey/{step,summarize}` endpoint 경유.
 *
 * 정책:
 * - 8s timeout (AbortController) — design doc Latency 전략
 * - 1 retry (네트워크 일시 장애 / json_schema 파싱 실패) 후 fallback path
 * - 응답이 schema 와 다르면 parse_fail 분류
 * - session token 401 응답은 session_expired 분류 (클라가 modal trigger)
 *
 * 사용처: web/native 양쪽. native 는 baseUrl 을 web 도메인으로 지정.
 */
import type { PersonaContext, TasteSurveyAnswer } from './types';
import type {
  SurveyStepOutput,
  SurveySummaryOutput,
} from './static-survey';

export type SurveyClientErrorCode =
  | 'timeout'
  | 'rate_limit'
  | 'server_error'
  | 'parse_fail'
  | 'session_expired'
  | 'invalid_token'
  | 'origin_blocked'
  | 'network'
  | 'unknown';

export class SurveyClientError extends Error {
  readonly code: SurveyClientErrorCode;
  readonly status?: number;
  constructor(code: SurveyClientErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'SurveyClientError';
    this.code = code;
    this.status = status;
  }
}

export interface SurveyStepRequest {
  context: PersonaContext;
  prevAnswers: TasteSurveyAnswer[];
  step: 1 | 2 | 3;
  /**
   * 익명 사용자 식별자 (web/native 동일 key). 서버가 token 발급 시
   * payload 에 stamp 후 검증. 호출자는 반드시 동일 deviceId 유지.
   */
  deviceId: string;
}

export interface SurveySummaryRequest {
  context: PersonaContext;
  prevAnswers: TasteSurveyAnswer[];
  favorites: { title: string; tmdbId?: number }[];
  /** 익명 사용자 식별자 — step 호출과 동일 deviceId 필수 (token 검증). */
  deviceId: string;
}

export interface SurveyClientOptions {
  /** Base URL for the web API. native 는 prod 도메인, web 은 빈 문자열 (same-origin). */
  baseUrl?: string;
  /** Persona-creation-session token (서버 발급). 없으면 신규 발급. */
  token?: string;
  /** Timeout per attempt (ms). 기본 8000. */
  timeoutMs?: number;
  /** Retry count for transient errors (network / parse_fail / 5xx). 기본 1. */
  retries?: number;
  /** Optional fetch override (test injection). */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRIES = 1;

async function postJson<TOut>(
  url: string,
  body: unknown,
  options: SurveyClientOptions,
): Promise<TOut> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const fetchImpl = options.fetchImpl ?? fetch;
  let lastError: SurveyClientError | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (options.token) headers['x-persona-session'] = options.token;
      const res = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 401) {
        const data = (await res.json().catch(() => ({}))) as {
          code?: string;
          message?: string;
        };
        throw new SurveyClientError(
          data.code === 'invalid_token' ? 'invalid_token' : 'session_expired',
          data.message ?? 'session expired',
          401,
        );
      }
      if (res.status === 403) {
        throw new SurveyClientError('origin_blocked', 'origin blocked', 403);
      }
      if (res.status === 429) {
        throw new SurveyClientError('rate_limit', 'rate limit', 429);
      }
      if (res.status >= 500) {
        lastError = new SurveyClientError(
          'server_error',
          `server error ${res.status}`,
          res.status,
        );
        continue;
      }
      if (!res.ok) {
        throw new SurveyClientError(
          'unknown',
          `unexpected status ${res.status}`,
          res.status,
        );
      }
      try {
        const data = (await res.json()) as TOut;
        return data;
      } catch {
        lastError = new SurveyClientError(
          'parse_fail',
          'json parse failed',
          res.status,
        );
        continue;
      }
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof SurveyClientError) {
        // Non-retryable: 401/403/429 are terminal
        if (
          err.code === 'session_expired' ||
          err.code === 'invalid_token' ||
          err.code === 'origin_blocked' ||
          err.code === 'rate_limit'
        ) {
          throw err;
        }
        lastError = err;
        continue;
      }
      if ((err as Error)?.name === 'AbortError') {
        lastError = new SurveyClientError('timeout', 'request timed out');
        continue;
      }
      lastError = new SurveyClientError(
        'network',
        (err as Error)?.message ?? 'network error',
      );
    }
  }
  throw lastError ?? new SurveyClientError('unknown', 'exhausted retries');
}

/**
 * 서버 endpoint 가 응답에 신규 token 동봉 가능 (token 미보유 또는 만료 시
 * 자동 재발급 path). client 는 caller 에게 그대로 전달, caller 가 sessionStorage
 * 등에 저장.
 */
export type SurveyStepResponse = SurveyStepOutput & { newToken?: string };

function validateStepOutput(data: unknown): SurveyStepResponse {
  if (!data || typeof data !== 'object')
    throw new SurveyClientError('parse_fail', 'step output not object');
  const d = data as Record<string, unknown>;
  if (typeof d.question !== 'string' || d.question.length === 0)
    throw new SurveyClientError('parse_fail', 'invalid question');
  if (!Array.isArray(d.options) || d.options.length !== 4)
    throw new SurveyClientError('parse_fail', 'options must be 4');
  if (typeof d.axisHint !== 'string')
    throw new SurveyClientError('parse_fail', 'invalid axisHint');
  if (typeof d.shouldContinue !== 'boolean')
    throw new SurveyClientError('parse_fail', 'invalid shouldContinue');
  if (d.newToken !== undefined && typeof d.newToken !== 'string')
    throw new SurveyClientError('parse_fail', 'invalid newToken type');
  return data as SurveyStepResponse;
}

function validateSummaryOutput(data: unknown): SurveySummaryOutput {
  if (!data || typeof data !== 'object')
    throw new SurveyClientError('parse_fail', 'summary output not object');
  const d = data as Record<string, unknown>;
  if (typeof d.tasteSummary !== 'string' || d.tasteSummary.length === 0)
    throw new SurveyClientError('parse_fail', 'invalid tasteSummary');
  if (!Array.isArray(d.axes))
    throw new SurveyClientError('parse_fail', 'invalid axes');
  return data as SurveySummaryOutput;
}

/**
 * 분기 질문 생성 호출 — step 1·2·3 (서버가 sharpness 판정 후 shouldContinue 동봉).
 */
export async function fetchSurveyStep(
  request: SurveyStepRequest,
  options: SurveyClientOptions = {},
): Promise<SurveyStepResponse> {
  const url = `${options.baseUrl ?? ''}/api/onboarding/taste-survey/step`;
  const raw = await postJson<unknown>(url, request, options);
  return validateStepOutput(raw);
}

/**
 * 통합 요약 호출 — tasteSummary 자연어 생성.
 */
export async function fetchSurveySummary(
  request: SurveySummaryRequest,
  options: SurveyClientOptions = {},
): Promise<SurveySummaryOutput> {
  const url = `${options.baseUrl ?? ''}/api/onboarding/taste-survey/summarize`;
  const raw = await postJson<unknown>(url, request, options);
  return validateSummaryOutput(raw);
}
