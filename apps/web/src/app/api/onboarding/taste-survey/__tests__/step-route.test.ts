import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// OpenAI SDK mock — vi.hoisted 패턴 (mock factory 가 module 평가 전 실행됨)
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));
vi.mock('openai', () => ({
  default: class {
    chat = {
      completions: {
        create: mockCreate,
      },
    };
  },
}));

// rate-limit / session-token / sharpness 는 실제 사용
import { POST } from '../step/route';
import {
  _setStoreForTest,
  _clearMemoryStoreForTest,
  IP_TOKEN_LIMIT_FOR_TEST,
  type RateLimitStore,
} from '../_lib/rate-limit';
import { issueToken } from '../_lib/session-token';

const ORIGINAL_SECRET = process.env.TASTE_SURVEY_TOKEN_SECRET;

beforeEach(() => {
  process.env.TASTE_SURVEY_TOKEN_SECRET = 'a'.repeat(64);
  _clearMemoryStoreForTest();
  _setStoreForTest(null);
  mockCreate.mockReset();
});

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.TASTE_SURVEY_TOKEN_SECRET;
  else process.env.TASTE_SURVEY_TOKEN_SECRET = ORIGINAL_SECRET;
});

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/onboarding/taste-survey/step', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '1.2.3.4',
      ...headers,
    },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

function mockLLMSuccess() {
  mockCreate.mockResolvedValueOnce({
    choices: [
      {
        message: {
          content: JSON.stringify({
            question: '어떤 페이스가 좋아요?',
            options: [
              { id: 'a', label: '빠르게', hint: '긴장감 있는' },
              { id: 'b', label: '천천히', hint: '호흡이 긴' },
              { id: 'c', label: '균형', hint: '상황 따라' },
              { id: 'd', label: '무관', hint: '딱히 없음' },
            ],
            axisHint: 'pace',
          }),
        },
      },
    ],
  });
}

const VALID_BODY = {
  context: { contentType: 'movie' as const, companion: 'alone' as const },
  prevAnswers: [],
  step: 1 as const,
  deviceId: 'device-abc',
};

describe('POST /api/onboarding/taste-survey/step', () => {
  it('1. happy — 200 + question/options/newToken (첫 호출, token 없음)', async () => {
    mockLLMSuccess();
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.question).toBe('어떤 페이스가 좋아요?');
    expect(body.options).toHaveLength(4);
    expect(body.shouldContinue).toBe(false); // step 1 은 항상 false
    expect(body.newToken).toMatch(/\./); // 신규 token 발급
  });

  it('2. invalid body → 400', async () => {
    const res = await POST(makeReq({ context: 'wrong' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('invalid_body');
  });

  it('3. invalid context → 400', async () => {
    const res = await POST(
      makeReq({
        context: { contentType: 'book', companion: 'alone' },
        prevAnswers: [],
        step: 1,
        deviceId: 'd',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('4. origin not allowed → 403', async () => {
    const res = await POST(
      makeReq(VALID_BODY, { origin: 'https://evil.example.com' }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('origin_blocked');
  });

  it('5. allowed origin (vercel.app subdomain) → 200', async () => {
    mockLLMSuccess();
    const res = await POST(
      makeReq(VALID_BODY, { origin: 'https://neq-preview-abc.vercel.app' }),
    );
    expect(res.status).toBe(200);
  });

  it('6. IP rate limit 초과 (token 없을 때) → 429', async () => {
    // IP 한도 미리 채움
    const store: RateLimitStore = {
      incr: vi.fn().mockResolvedValue(IP_TOKEN_LIMIT_FOR_TEST + 1),
      expire: vi.fn(),
    };
    _setStoreForTest(store);
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe('rate_limit');
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('7. valid token 제공 → 호출 통과 (rate limit check 안 함)', async () => {
    mockLLMSuccess();
    const token = issueToken('device-abc');
    const res = await POST(
      makeReq(VALID_BODY, { 'x-persona-session': token }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // 기존 token 유효 → newToken 미발급
    expect(body.newToken).toBeUndefined();
  });

  it('8. invalid token (device_mismatch) → 401 invalid_token', async () => {
    const token = issueToken('device-other');
    const res = await POST(
      makeReq(VALID_BODY, { 'x-persona-session': token }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('invalid_token');
  });

  it('9. expired token + IP 한도 통과 → 신규 발급 + 200', async () => {
    const past = Date.now() - 60 * 60 * 1000; // 1 hour ago
    const token = issueToken('device-abc', past);
    mockLLMSuccess();
    const res = await POST(
      makeReq(VALID_BODY, { 'x-persona-session': token }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.newToken).toMatch(/\./);
  });

  it('10. LLM 2회 실패 → static fallback 사용 (200 + _fallback)', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('5xx'))
      .mockRejectedValueOnce(new Error('5xx'));
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._fallback).toBe(true);
    expect(body.question).toBeTruthy();
    expect(body.options).toHaveLength(4);
  });

  it('11. step 2 + 양극단 답 → shouldContinue=true', async () => {
    mockLLMSuccess();
    const res = await POST(
      makeReq({
        ...VALID_BODY,
        step: 2,
        prevAnswers: [
          { question: 'q1', selectedOption: 'a' },
          { question: 'q2', selectedOption: 'd' },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shouldContinue).toBe(true);
  });
});
