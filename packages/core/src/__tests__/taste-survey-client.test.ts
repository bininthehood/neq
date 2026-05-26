import { describe, it, expect, vi } from 'vitest';
import {
  fetchSurveyStep,
  fetchSurveySummary,
  SurveyClientError,
} from '../taste-survey-client';
import type { PersonaContext } from '../types';

const CONTEXT: PersonaContext = { contentType: 'movie', companion: 'alone' };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const VALID_STEP_OUTPUT = {
  question: '어떤 페이스가 좋아요?',
  options: [
    { id: 'a', label: '빠르게' },
    { id: 'b', label: '천천히' },
    { id: 'c', label: '균형' },
    { id: 'd', label: '무관' },
  ],
  axisHint: 'pace',
  shouldContinue: false,
};

const VALID_SUMMARY_OUTPUT = {
  tasteSummary: '여운이 긴 작품을 좋아합니다.',
  axes: [{ name: 'pace', value: '천천히' }],
};

describe('fetchSurveyStep', () => {
  it('happy path — 200 + valid schema → output', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, VALID_STEP_OUTPUT),
    );
    const out = await fetchSurveyStep(
      { context: CONTEXT, prevAnswers: [], step: 1 },
      { fetchImpl, baseUrl: 'https://neq.app' },
    );
    expect(out.question).toBe('어떤 페이스가 좋아요?');
    expect(out.shouldContinue).toBe(false);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://neq.app/api/onboarding/taste-survey/step',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('token 이 있으면 x-persona-session 헤더 동봉', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, VALID_STEP_OUTPUT),
    );
    await fetchSurveyStep(
      { context: CONTEXT, prevAnswers: [], step: 1 },
      { fetchImpl, token: 'abc.xyz' },
    );
    const call = fetchImpl.mock.calls[0][1];
    expect(call.headers['x-persona-session']).toBe('abc.xyz');
  });

  it('429 → rate_limit, retry X (terminal)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { message: 'too many' }));
    await expect(
      fetchSurveyStep(
        { context: CONTEXT, prevAnswers: [], step: 1 },
        { fetchImpl, retries: 1 },
      ),
    ).rejects.toMatchObject({
      code: 'rate_limit',
      status: 429,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('401 + invalid_token code → invalid_token', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { code: 'invalid_token' }));
    await expect(
      fetchSurveyStep(
        { context: CONTEXT, prevAnswers: [], step: 1 },
        { fetchImpl },
      ),
    ).rejects.toMatchObject({ code: 'invalid_token' });
  });

  it('401 + 다른 code → session_expired', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, {}));
    await expect(
      fetchSurveyStep(
        { context: CONTEXT, prevAnswers: [], step: 1 },
        { fetchImpl },
      ),
    ).rejects.toMatchObject({ code: 'session_expired' });
  });

  it('5xx → 1 retry 후 마지막 server_error throw', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(503, {}));
    await expect(
      fetchSurveyStep(
        { context: CONTEXT, prevAnswers: [], step: 1 },
        { fetchImpl, retries: 1 },
      ),
    ).rejects.toMatchObject({ code: 'server_error' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('5xx 후 200 valid → 성공', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, {}))
      .mockResolvedValueOnce(jsonResponse(200, VALID_STEP_OUTPUT));
    const out = await fetchSurveyStep(
      { context: CONTEXT, prevAnswers: [], step: 1 },
      { fetchImpl, retries: 1 },
    );
    expect(out.question).toBe('어떤 페이스가 좋아요?');
  });

  it('200 + parse_fail → 1 retry 후 parse_fail throw', async () => {
    const invalid = { question: '?', options: [{}], axisHint: 'x' };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, invalid))
      .mockResolvedValueOnce(jsonResponse(200, invalid));
    await expect(
      fetchSurveyStep(
        { context: CONTEXT, prevAnswers: [], step: 1 },
        { fetchImpl, retries: 1 },
      ),
    ).rejects.toMatchObject({ code: 'parse_fail' });
  });

  it('AbortError → timeout', async () => {
    const fetchImpl = vi.fn().mockImplementationOnce(() => {
      const err = new Error('aborted');
      (err as Error).name = 'AbortError';
      return Promise.reject(err);
    });
    fetchImpl.mockImplementationOnce(() => {
      const err = new Error('aborted');
      (err as Error).name = 'AbortError';
      return Promise.reject(err);
    });
    await expect(
      fetchSurveyStep(
        { context: CONTEXT, prevAnswers: [], step: 1 },
        { fetchImpl, retries: 1, timeoutMs: 10 },
      ),
    ).rejects.toMatchObject({ code: 'timeout' });
  });

  it('403 → origin_blocked (terminal)', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(403, {}));
    await expect(
      fetchSurveyStep(
        { context: CONTEXT, prevAnswers: [], step: 1 },
        { fetchImpl },
      ),
    ).rejects.toMatchObject({ code: 'origin_blocked' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('fetchSurveySummary', () => {
  it('happy path', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, VALID_SUMMARY_OUTPUT),
    );
    const out = await fetchSurveySummary(
      {
        context: CONTEXT,
        prevAnswers: [],
        favorites: [{ title: '기생충' }],
      },
      { fetchImpl, baseUrl: 'https://neq.app' },
    );
    expect(out.tasteSummary).toContain('여운');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://neq.app/api/onboarding/taste-survey/summarize',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('invalid summary schema → parse_fail', async () => {
    const invalid = { tasteSummary: '', axes: 'not-array' };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, invalid))
      .mockResolvedValueOnce(jsonResponse(200, invalid));
    await expect(
      fetchSurveySummary(
        {
          context: CONTEXT,
          prevAnswers: [],
          favorites: [],
        },
        { fetchImpl, retries: 1 },
      ),
    ).rejects.toMatchObject({ code: 'parse_fail' });
  });
});

describe('SurveyClientError', () => {
  it('code/status 모두 보유', () => {
    const err = new SurveyClientError('rate_limit', 'too many', 429);
    expect(err.code).toBe('rate_limit');
    expect(err.status).toBe(429);
    expect(err.message).toBe('too many');
    expect(err.name).toBe('SurveyClientError');
  });
});
