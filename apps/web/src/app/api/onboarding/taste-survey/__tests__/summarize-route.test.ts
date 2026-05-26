import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

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

import { POST } from '../summarize/route';
import {
  _setStoreForTest,
  _clearMemoryStoreForTest,
} from '../_lib/rate-limit';

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
  return new Request(
    'http://localhost/api/onboarding/taste-survey/summarize',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '1.2.3.4',
        ...headers,
      },
      body: JSON.stringify(body),
    },
  ) as unknown as Parameters<typeof POST>[0];
}

function mockSummary(text: string) {
  mockCreate.mockResolvedValueOnce({
    choices: [
      {
        message: {
          content: JSON.stringify({
            tasteSummary: text,
            axes: [{ name: 'pace', value: '천천히' }],
          }),
        },
      },
    ],
  });
}

const VALID_BODY = {
  context: { contentType: 'movie' as const, companion: 'alone' as const },
  prevAnswers: [
    { question: '어떤 페이스?', selectedOption: '천천히' },
  ],
  favorites: [
    { title: '기생충', tmdbId: 496243 },
    { title: '올드보이', tmdbId: 670 },
  ],
  deviceId: 'device-abc',
};

describe('POST /api/onboarding/taste-survey/summarize', () => {
  it('1. happy — 200 + tasteSummary + axes + newToken', async () => {
    mockSummary('여운이 긴 작품을 좋아하는 사람입니다.');
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasteSummary).toBe('여운이 긴 작품을 좋아하는 사람입니다.');
    expect(body.axes).toEqual([{ name: 'pace', value: '천천히' }]);
    expect(body.newToken).toMatch(/\./);
  });

  it('2. invalid body → 400', async () => {
    const res = await POST(makeReq({ context: 'wrong' }));
    expect(res.status).toBe(400);
  });

  it('3. LLM 2회 실패 → 룰 기반 fallback (200 + _fallback)', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('5xx'))
      .mockRejectedValueOnce(new Error('5xx'));
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._fallback).toBe(true);
    expect(body.tasteSummary).toContain('혼자 볼 영화');
  });

  it('4. tasteSummary 800자 초과 → 재생성 (짧은 응답으로 교체)', async () => {
    const longSummary = '가'.repeat(900);
    const shortSummary = '짧은 요약입니다.';
    mockSummary(longSummary); // 1st call
    mockSummary(shortSummary); // 2nd call (shorter retry)
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasteSummary).toBe(shortSummary);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('5. 800자 초과 + 재생성도 여전히 길면 sentence boundary truncate', async () => {
    // 2개 문장으로 구성, 첫 문장이 ~50자, 둘째 문장도 길어 전체 900자 가정.
    const longText =
      '첫 번째 문장입니다. ' +
      '두번째 문장은 매우 매우 매우 매우 길어요 ' + '아주 아주 '.repeat(100);
    mockSummary(longText);
    mockSummary(longText);
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    // 첫 문장만 살아남거나 (sentence boundary), 어쨌든 800자 이하
    expect(body.tasteSummary.length).toBeLessThanOrEqual(803);
  });

  it('6. origin not allowed → 403', async () => {
    const res = await POST(
      makeReq(VALID_BODY, { origin: 'https://evil.example.com' }),
    );
    expect(res.status).toBe(403);
  });
});
