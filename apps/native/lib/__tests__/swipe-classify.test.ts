import { describe, it, expect } from 'vitest';
import { classifySwipe, lockAxis, resolveAxis, type SwipeEnd } from '../swipe-classify';

const W = 402;
const end = (p: Partial<SwipeEnd>): SwipeEnd => ({
  axis: 0, dx: 0, dy: 0, vx: 0, vy: 0, hasPrev: true, screenWidth: W, ...p,
});

describe('위 스와이프 = 관심 없음', () => {
  it('100px 경계: 99 는 무시, 100 은 숨김', () => {
    expect(classifySwipe(end({ axis: 2, dy: -99 }))).toBe('none');
    expect(classifySwipe(end({ axis: 2, dy: -100 }))).toBe('hide');
  });
  it('빠른 튕김은 60px 넘어야 숨김 (저장 30px 보다 보수적)', () => {
    expect(classifySwipe(end({ axis: 2, dy: -50, vy: -1500 }))).toBe('none');
    expect(classifySwipe(end({ axis: 2, dy: -61, vy: -1500 }))).toBe('hide');
  });
  it('느린 짧은 위 끌기는 아무 일 없음', () => {
    expect(classifySwipe(end({ axis: 2, dy: -40, vy: -200 }))).toBe('none');
  });
});

describe('방향 잠금 (첫 10px)', () => {
  it('10px 전에는 미정', () => {
    expect(lockAxis(0, 6, -7)).toBe(0);
  });
  it('처음 가로로 움직이면 이후 위로 크게 가도 가로', () => {
    const axis = lockAxis(0, -12, -4);
    expect(axis).toBe(1);
    expect(lockAxis(axis, -20, -140)).toBe(1);
    // 가로로 잠긴 상태에서 위로 140 → 숨김이 아니라 좌 판정(-20 은 임계 미달 → none)
    expect(classifySwipe(end({ axis, dx: -20, dy: -140 }))).toBe('none');
  });
  it('처음 세로로 움직이면 이후 옆으로 커져도 세로', () => {
    const axis = lockAxis(0, 3, -11);
    expect(axis).toBe(2);
    expect(classifySwipe(end({ axis, dx: -150, dy: -110 }))).toBe('hide');
  });
  it('대각선(45°) 미정 상태는 세로 우선 — 기존 absX > absY 규칙', () => {
    expect(resolveAxis(0, -80, 80)).toBe(2);
    expect(classifySwipe(end({ dx: -80, dy: 80 }))).toBe('save');
  });
});

describe('기존 동작 회귀 (좌·우·아래)', () => {
  it('좌 70px 초과 = 다음, 70 은 미달', () => {
    expect(classifySwipe(end({ axis: 1, dx: -70 }))).toBe('none');
    expect(classifySwipe(end({ axis: 1, dx: -71 }))).toBe('next');
  });
  it('좌 빠른 튕김 30px 초과', () => {
    expect(classifySwipe(end({ axis: 1, dx: -31, vx: -900 }))).toBe('next');
    expect(classifySwipe(end({ axis: 1, dx: -29, vx: -900 }))).toBe('none');
  });
  it('우 = 이전 카드, 진행률 0.3 초과', () => {
    expect(classifySwipe(end({ axis: 1, dx: W * 0.3 }))).toBe('none');
    expect(classifySwipe(end({ axis: 1, dx: W * 0.3 + 1 }))).toBe('prev');
    expect(classifySwipe(end({ axis: 1, dx: 40, vx: 900 }))).toBe('prev');
  });
  it('첫 카드(이전 없음)에서 우 스와이프는 무시', () => {
    expect(classifySwipe(end({ axis: 1, dx: 300, hasPrev: false }))).toBe('none');
  });
  it('아래 70px 초과 = 저장, 튕김 30px', () => {
    expect(classifySwipe(end({ axis: 2, dy: 70 }))).toBe('none');
    expect(classifySwipe(end({ axis: 2, dy: 71 }))).toBe('save');
    expect(classifySwipe(end({ axis: 2, dy: 31, vy: 900 }))).toBe('save');
  });
  it('탭 크기 움직임(8px 미만)은 어떤 스와이프도 아님', () => {
    for (const [dx, dy] of [[7, 0], [0, 7], [-7, -7], [5, -5]]) {
      expect(classifySwipe(end({ dx, dy }))).toBe('none');
    }
  });
});
