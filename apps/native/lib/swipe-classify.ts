/**
 * Discover 카드 스와이프 판정 — 순수 함수 (1.1.0 숏폼식 조작, 2026-11-27).
 * `app/index.tsx` 의 Pan onUpdate/onEnd 가 UI 스레드에서 호출하므로 모두 worklet.
 * 탭·더블탭은 별도 `Gesture.Tap` 이 판정.
 *
 * 조작: 위 = 다음 작품 · 아래 = 이전 작품 · 좌/우 = 탭 이동 (손가락 왼쪽 = 오른쪽 탭).
 * 임계 (DESIGN.md 터치 임계): 세로 80px 또는 빠른 튕김(600px/s + 30px), 가로 80px(튕김 600px/s + 30px).
 * 상수는 실기기 손맛 조정용 손잡이 — 바꾸면 테스트 경계도 같이 바꾼다.
 * 방향 잠금: 처음 10px 움직인 축으로 고정 → 대각선 끌기가 탭 이동으로 새지 않음.
 */

export const SWIPE_Y_THRESHOLD = 80;
export const SWIPE_X_THRESHOLD = 80;
export const VELOCITY_THRESHOLD = 600;
export const VELOCITY_TRIGGER_DISTANCE = 30;
export const AXIS_LOCK_DISTANCE = 10;
export const TAP_MAX_DISTANCE = 8;
export const TAP_MAX_MS = 300;
/** 더블탭 두 번째 탭 대기. 한 번 탭(상세)이 이만큼 늦게 열린다 — 실기기에서 200~250 사이로 조정. */
export const DOUBLE_TAP_MAX_DELAY = 250;

/** 0 = 아직 미정, 1 = 가로, 2 = 세로 */
export type Axis = 0 | 1 | 2;
export type SwipeAction = 'next' | 'prev' | 'tab_next' | 'tab_prev' | 'none';

/** 처음 10px 이동 방향으로 축 고정. 이미 고정됐으면 그대로. */
export function lockAxis(current: Axis, dx: number, dy: number): Axis {
  'worklet';
  if (current !== 0) return current;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < AXIS_LOCK_DISTANCE) return 0;
  return ax > ay ? 1 : 2;
}

/** 축이 미정(10px 미만으로 끝난 짧은 움직임)이면 큰 쪽. 동률은 세로. */
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
  /** 이전 작품이 있는지 (첫 카드면 아래 = none) */
  hasPrev: boolean;
  /** 다음 작품이 이미 받아져 있는지 (없으면 위 = none, 고무줄 복귀) */
  hasNext: boolean;
}

function passed(d: number, v: number, threshold: number): boolean {
  'worklet';
  if (Math.abs(d) >= threshold) return true;
  // 튕김은 같은 방향 속도 + 최소 거리
  return Math.abs(v) > VELOCITY_THRESHOLD && Math.sign(v) === Math.sign(d) && Math.abs(d) > VELOCITY_TRIGGER_DISTANCE;
}

export function classifySwipe(e: SwipeEnd): SwipeAction {
  'worklet';
  const axis = resolveAxis(e.axis, e.dx, e.dy);
  if (axis === 1) {
    if (!passed(e.dx, e.vx, SWIPE_X_THRESHOLD)) return 'none';
    return e.dx < 0 ? 'tab_next' : 'tab_prev';
  }
  if (!passed(e.dy, e.vy, SWIPE_Y_THRESHOLD)) return 'none';
  if (e.dy < 0) return e.hasNext ? 'next' : 'none';
  return e.hasPrev ? 'prev' : 'none';
}

/** 탭 이동 순서 — 프로필은 넣지 않는다 (제임스 확정 2026-11-27). */
export const TAB_ORDER = ['index', 'mix', 'saved'] as const;
export type SwipeTab = (typeof TAB_ORDER)[number];

/** 좌우 스와이프로 갈 탭. 끝이면 null. */
export function tabAfterSwipe(from: SwipeTab, action: 'tab_next' | 'tab_prev'): SwipeTab | null {
  const i = TAB_ORDER.indexOf(from);
  const j = action === 'tab_next' ? i + 1 : i - 1;
  return j >= 0 && j < TAB_ORDER.length ? TAB_ORDER[j] : null;
}

/** 분석 이벤트용 탭 이름 (협의체 정의: discover·queue·saved) */
export const TAB_EVENT_NAME: Record<SwipeTab, 'discover' | 'queue' | 'saved'> = {
  index: 'discover',
  mix: 'queue',
  saved: 'saved',
};
