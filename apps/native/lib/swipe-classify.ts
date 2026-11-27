/**
 * Discover 카드 스와이프 판정 — 순수 함수 (Night Pool 5단계).
 * `app/index.tsx` 의 Pan onUpdate/onEnd 가 UI 스레드에서 호출하므로 모두 worklet.
 * 탭은 별도 `Gesture.Tap().maxDistance(TAP_MAX_DISTANCE).maxDuration(TAP_MAX_MS)` 가 판정.
 *
 * 임계 (DESIGN.md 터치 임계 · 계획 5단계):
 *   좌·아래 70px (기존 값 유지 — 회귀 방지), 위(관심 없음) 100px, 우 = 오버레이 진행률 0.3.
 *   빠른 튕김(800px/s) 은 30px 이상이면 좌·우·아래 인정. 위는 숨기기라 튕김에도 60px 요구.
 *   방향 잠금: 처음 10px 움직인 축으로 고정 → 대각선 끌기가 저장/숨김으로 새지 않음.
 */

export const SWIPE_X_THRESHOLD = 70;
export const SWIPE_DOWN_THRESHOLD = 70;
export const SWIPE_UP_THRESHOLD = 100;
export const PREV_OVERLAY_TRIGGER = 0.3;
export const VELOCITY_THRESHOLD = 800;
export const VELOCITY_TRIGGER_DISTANCE = 30;
export const UP_VELOCITY_TRIGGER_DISTANCE = 60;
export const AXIS_LOCK_DISTANCE = 10;
export const TAP_MAX_DISTANCE = 8;
export const TAP_MAX_MS = 300;

/** 0 = 아직 미정, 1 = 가로, 2 = 세로 */
export type Axis = 0 | 1 | 2;
export type SwipeAction = 'next' | 'prev' | 'save' | 'hide' | 'none';

/** 처음 10px 이동 방향으로 축 고정. 이미 고정됐으면 그대로. */
export function lockAxis(current: Axis, dx: number, dy: number): Axis {
  'worklet';
  if (current !== 0) return current;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < AXIS_LOCK_DISTANCE) return 0;
  return ax > ay ? 1 : 2;
}

/** 축이 미정(10px 미만으로 끝난 짧은 움직임)이면 큰 쪽. 동률은 세로(기존 `absX > absY` 규칙). */
export function resolveAxis(locked: Axis, dx: number, dy: number): 1 | 2 {
  'worklet';
  if (locked !== 0) return locked;
  return Math.abs(dx) > Math.abs(dy) ? 1 : 2;
}

export interface SwipeEnd {
  axis: Axis;
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  /** 이전 카드가 있으면 우 스와이프 = 이전 카드 오버레이 */
  hasPrev: boolean;
  screenWidth: number;
}

export function classifySwipe(e: SwipeEnd): SwipeAction {
  'worklet';
  const axis = resolveAxis(e.axis, e.dx, e.dy);
  const fastX = Math.abs(e.vx) > VELOCITY_THRESHOLD;
  const fastY = Math.abs(e.vy) > VELOCITY_THRESHOLD;
  if (axis === 1) {
    if (e.dx > 0 && e.hasPrev) {
      const progress = e.dx / e.screenWidth;
      const flick = fastX && e.vx > 0 && e.dx > VELOCITY_TRIGGER_DISTANCE;
      return progress > PREV_OVERLAY_TRIGGER || flick ? 'prev' : 'none';
    }
    const flick = fastX && e.vx < 0 && e.dx < -VELOCITY_TRIGGER_DISTANCE;
    return e.dx < -SWIPE_X_THRESHOLD || flick ? 'next' : 'none';
  }
  if (e.dy > 0) {
    const flick = fastY && e.vy > 0 && e.dy > VELOCITY_TRIGGER_DISTANCE;
    return e.dy > SWIPE_DOWN_THRESHOLD || flick ? 'save' : 'none';
  }
  const flick = fastY && e.vy < 0 && e.dy < -UP_VELOCITY_TRIGGER_DISTANCE;
  return e.dy <= -SWIPE_UP_THRESHOLD || flick ? 'hide' : 'none';
}
