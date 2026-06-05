import { describe, it, expect } from 'vitest';
import {
  getStaticSurveyStep,
  buildFallbackSummary,
} from '../static-survey';
import type { PersonaContext } from '../types';

const ALL_CONTEXTS: PersonaContext[] = [
  { contentType: 'movie', companion: 'alone' },
  { contentType: 'movie', companion: 'together' },
  { contentType: 'series', companion: 'alone' },
  { contentType: 'series', companion: 'together' },
  { contentType: 'variety', companion: 'alone' },
  { contentType: 'variety', companion: 'together' },
];

describe('getStaticSurveyStep', () => {
  it.each(ALL_CONTEXTS)(
    '$contentType-$companion 컨텍스트의 step 1·2·3 모두 정의됨',
    (context) => {
      for (const step of [1, 2, 3] as const) {
        const out = getStaticSurveyStep(context, step);
        expect(out).toBeDefined();
        expect(out?.question).toBeTruthy();
        expect(out?.question.length).toBeLessThanOrEqual(30);
        expect(out?.options).toHaveLength(4);
        expect(out?.axisHint).toBeTruthy();
        // step 2 만 shouldContinue=true (3-step path 강제), 그 외 false.
        expect(out?.shouldContinue).toBe(step === 2);
      }
    },
  );

  it.each(ALL_CONTEXTS)(
    '$contentType-$companion 의 4 옵션은 a·b·c·d id',
    (context) => {
      for (const step of [1, 2, 3] as const) {
        const out = getStaticSurveyStep(context, step);
        expect(out?.options.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
      }
    },
  );

  it('각 옵션의 label 은 비어있지 않음', () => {
    for (const context of ALL_CONTEXTS) {
      for (const step of [1, 2, 3] as const) {
        const out = getStaticSurveyStep(context, step);
        for (const opt of out?.options ?? []) {
          expect(opt.label.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('알 수 없는 contentType 은 undefined', () => {
    const out = getStaticSurveyStep(
      // @ts-expect-error invalid contentType
      { contentType: 'unknown', companion: 'alone' },
      1,
    );
    expect(out).toBeUndefined();
  });
});

describe('buildFallbackSummary', () => {
  it('빈 답 + 빈 favorites 도 기본 문장 생성', () => {
    const out = buildFallbackSummary({
      context: { contentType: 'movie', companion: 'alone' },
      prevAnswers: [],
      favorites: [],
    });
    expect(out.tasteSummary).toContain('혼자 볼 영화');
    expect(out.axes).toEqual([]);
  });

  it('답·favorites 가 있으면 자연어 조합', () => {
    const out = buildFallbackSummary({
      context: { contentType: 'series', companion: 'together' },
      prevAnswers: [
        { question: '같이 보는 사람의 취향은 어때요?', selectedOption: '비슷해요' },
      ],
      favorites: [
        { title: '오징어 게임', tmdbId: 93405 },
        { title: '킹덤', tmdbId: 75681 },
      ],
    });
    expect(out.tasteSummary).toContain('같이 볼 시리즈');
    expect(out.tasteSummary).toContain('"비슷해요"');
    expect(out.tasteSummary).toContain('《오징어 게임》');
    expect(out.tasteSummary).toContain('《킹덤》');
    expect(out.axes).toHaveLength(1);
    expect(out.axes[0].value).toBe('비슷해요');
  });

  it('favorites 4개 이상이면 처음 3개만 인용', () => {
    const out = buildFallbackSummary({
      context: { contentType: 'movie', companion: 'alone' },
      prevAnswers: [],
      favorites: [
        { title: 'A' },
        { title: 'B' },
        { title: 'C' },
        { title: 'D' },
        { title: 'E' },
      ],
    });
    expect(out.tasteSummary).toContain('《A》');
    expect(out.tasteSummary).toContain('《B》');
    expect(out.tasteSummary).toContain('《C》');
    expect(out.tasteSummary).not.toContain('《D》');
    expect(out.tasteSummary).not.toContain('《E》');
  });

  it('tasteSummary 가 공백 아님', () => {
    for (const context of ALL_CONTEXTS) {
      const out = buildFallbackSummary({
        context,
        prevAnswers: [],
        favorites: [],
      });
      expect(out.tasteSummary.trim().length).toBeGreaterThan(0);
    }
  });
});
