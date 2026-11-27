import { describe, it, expect } from 'vitest';
import {
  classifySwipe,
  lockAxis,
  resolveAxis,
  tabAfterSwipe,
  type SwipeEnd,
} from '../swipe-classify';

const end = (p: Partial<SwipeEnd>): SwipeEnd => ({
  axis: 0, dx: 0, dy: 0, vx: 0, vy: 0, hasPrev: true, hasNext: true, ...p,
});

describe('위 = 다음 작품', () => {
  it('80px 경계: 79 는 제자리, 80 은 다음', () => {
    expect(classifySwipe(end({ axis: 2, dy: -79 }))).toBe('none');
    expect(classifySwipe(end({ axis: 2, dy: -80 }))).toBe('next');
  });
  it('빠른 튕김은 30px 넘으면 다음', () => {
    expect(classifySwipe(end({ axis: 2, dy: -30, vy: -1200 }))).toBe('none');
    expect(classifySwipe(end({ axis: 2, dy: -31, vy: -1200 }))).toBe('next');
  });
  it('속도 600 이하는 튕김 아님', () => {
    expect(classifySwipe(end({ axis: 2, dy: -50, vy: -600 }))).toBe('none');
  });
  it('반대 방향 속도(위로 끌다 아래로 놓기)는 튕김 아님', () => {
    expect(classifySwipe(end({ axis: 2, dy: -50, vy: 1500 }))).toBe('none');
  });
  it('다음 작품이 아직 없으면 제자리', () => {
    expect(classifySwipe(end({ axis: 2, dy: -200, hasNext: false }))).toBe('none');
  });
});

describe('아래 = 이전 작품', () => {
  it('80px 경계', () => {
    expect(classifySwipe(end({ axis: 2, dy: 79 }))).toBe('none');
    expect(classifySwipe(end({ axis: 2, dy: 80 }))).toBe('prev');
  });
  it('첫 카드에서는 아래로 밀어도 제자리', () => {
    expect(classifySwipe(end({ axis: 2, dy: 300, vy: 2000, hasPrev: false }))).toBe('none');
  });
  it('튕김', () => {
    expect(classifySwipe(end({ axis: 2, dy: 40, vy: 900 }))).toBe('prev');
  });
});

describe('좌우 = 탭 이동', () => {
  it('80px 경계, 손가락 왼쪽 = 다음 탭', () => {
    expect(classifySwipe(end({ axis: 1, dx: -79 }))).toBe('none');
    expect(classifySwipe(end({ axis: 1, dx: -80 }))).toBe('tab_next');
    expect(classifySwipe(end({ axis: 1, dx: 80 }))).toBe('tab_prev');
  });
  it('가로 튕김', () => {
    expect(classifySwipe(end({ axis: 1, dx: 35, vx: 1000 }))).toBe('tab_prev');
  });
  it('탭 순서 발견 → 큐 → 저장, 끝은 null, 프로필 없음', () => {
    expect(tabAfterSwipe('index', 'tab_next')).toBe('mix');
    expect(tabAfterSwipe('mix', 'tab_next')).toBe('saved');
    expect(tabAfterSwipe('saved', 'tab_next')).toBeNull();
    expect(tabAfterSwipe('saved', 'tab_prev')).toBe('mix');
    expect(tabAfterSwipe('index', 'tab_prev')).toBeNull();
  });
});

describe('방향 잠금 (첫 10px)', () => {
  it('10px 전에는 미정', () => {
    expect(lockAxis(0, 6, -7)).toBe(0);
  });
  it('처음 세로로 움직이면 이후 옆으로 크게 가도 세로 (탭 이동으로 새지 않음)', () => {
    const axis = lockAxis(0, 3, -12);
    expect(axis).toBe(2);
    expect(lockAxis(axis, -200, -40)).toBe(2);
    expect(classifySwipe(end({ axis, dx: -200, dy: -40 }))).toBe('none');
  });
  it('처음 가로로 움직이면 이후 위로 크게 가도 가로', () => {
    const axis = lockAxis(0, -12, -4);
    expect(axis).toBe(1);
    expect(classifySwipe(end({ axis, dx: -90, dy: -300 }))).toBe('tab_next');
  });
  it('10px 미만 끝: 큰 축, 동률 세로', () => {
    expect(resolveAxis(0, 5, 5)).toBe(2);
    expect(resolveAxis(0, 6, 5)).toBe(1);
  });
  it('탭 크기 움직임은 아무 일 없음', () => {
    expect(classifySwipe(end({ dx: 3, dy: -4 }))).toBe('none');
  });
});
