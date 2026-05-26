import { describe, it, expect } from 'vitest';
import { shouldAddStep3 } from '../_lib/sharpness';
import type { TasteSurveyAnswer } from '@neq/core';

function ans(q: string, opt: string): TasteSurveyAnswer {
  return { question: q, selectedOption: opt };
}

describe('shouldAddStep3', () => {
  it('답이 1개 이하면 false (step 2 답이 없음)', () => {
    expect(shouldAddStep3([])).toBe(false);
    expect(shouldAddStep3([ans('q1', 'a')])).toBe(false);
  });

  it('step 2 답이 "d" (id 그대로) → true (Rule 1)', () => {
    expect(shouldAddStep3([ans('q1', 'a'), ans('q2', 'd')])).toBe(true);
    expect(shouldAddStep3([ans('q1', 'b'), ans('q2', 'd')])).toBe(true);
    expect(shouldAddStep3([ans('q1', 'c'), ans('q2', 'd')])).toBe(true);
  });

  it('step 2 답이 "무관" label → true (Rule 1, label 기반)', () => {
    expect(shouldAddStep3([ans('q1', 'a'), ans('q2', '무관')])).toBe(true);
    expect(
      shouldAddStep3([ans('q1', 'a'), ans('q2', '잘 모르겠어요')]),
    ).toBe(true);
    expect(shouldAddStep3([ans('q1', 'a'), ans('q2', '모름')])).toBe(true);
  });

  it('step 1·2 양극단 a·d → true (Rule 2)', () => {
    expect(shouldAddStep3([ans('q1', 'a'), ans('q2', 'd')])).toBe(true);
    expect(shouldAddStep3([ans('q1', 'd'), ans('q2', 'a')])).toBe(true);
  });

  it('인접 옵션 (a·b, b·c, c·d) → false', () => {
    expect(shouldAddStep3([ans('q1', 'a'), ans('q2', 'b')])).toBe(false);
    expect(shouldAddStep3([ans('q1', 'b'), ans('q2', 'c')])).toBe(false);
    expect(shouldAddStep3([ans('q1', 'b'), ans('q2', 'a')])).toBe(false);
  });

  it('같은 옵션 (a·a, c·c 등) → false', () => {
    expect(shouldAddStep3([ans('q1', 'a'), ans('q2', 'a')])).toBe(false);
    expect(shouldAddStep3([ans('q1', 'c'), ans('q2', 'c')])).toBe(false);
  });

  it('label 형식 일반 답 → c (중립) → false', () => {
    expect(
      shouldAddStep3([
        ans('q1', '빠르게 몰입'),
        ans('q2', '명쾌한 마무리'),
      ]),
    ).toBe(false);
  });
});
