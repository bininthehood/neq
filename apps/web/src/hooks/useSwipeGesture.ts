"use client";

import { useState, useRef, useCallback } from "react";
import { vibrate } from "@/lib/haptics";

interface UseSwipeGestureParams {
  topIdx: number;
  filteredLength: number;
  nextCard: () => void;
  setTopIdx: React.Dispatch<React.SetStateAction<number>>;
  /**
   * 아래 스와이프 (down) 콜백.
   * Stage 4 D1: swipe-stack.jsx 스펙 — 명시적 액션(save) 진입로.
   * dragY > THRESH 시 트리거. save 흡수 모션은 SwipeCard 측에서 dragY 로 표현.
   */
  onSwipeDown?: () => void;
  /**
   * DetailSheet 열기 콜백.
   *
   * G1-A 결정 (Handoff v2 Phase B): ↑ 스와이프 진입 제거 → **탭 단일 진입**.
   * prop 이름은 외부 호환성을 위해 `onSwipeUp` 으로 유지하지만, 내부 호출처는
   * tap 분기 1곳만 남음. dir === 'v' && dragY < -THRESH 분기는 삭제.
   *
   * 트리거 컨텍스트 (PostHog source 매핑):
   *   - 카드 탭 (8px / 300ms 미만 dirLock 미발생) → "card_tap"
   *   - ActionBar 버튼 → "action_bar"
   *   - ArrowUp 키보드 → "keyboard"
   */
  onSwipeUp?: () => void;
  onPrevCard?: () => void;
}

/**
 * 4방향 스와이프 제스처 훅 (Stage 4 D1, Handoff v2 G1-A 갱신).
 *
 * 디자인 산출물 `_workspace/design-handoff/.../neko-swipe-stack.jsx` 기반:
 *   - TAP = 8px / 300ms 임계 (탭 = DetailSheet 열기 — onSwipeUp 콜백)
 *   - THRESH = 70px (좌/우/아래 동일)
 *   - 좌  = 다음 카드 (nextCard)
 *   - 우  = 이전 카드 오버레이 (prevOverlayX)
 *   - 위  = (G1-A 이후 비활성) — DetailSheet 진입은 탭/ArrowUp/ActionBar 만
 *   - 아래 = save (onSwipeDown — 트리거 시 카드 흡수 애니메이션)
 *   - dominant axis 락: |dx| > |dy| 면 horizontal, 아니면 vertical
 */
export const SWIPE_THRESHOLD = 70; // swipe-stack.jsx THRESH
export const TAP_THRESHOLD = 8; // swipe-stack.jsx TAP
export const TAP_DURATION = 300; // swipe-stack.jsx tap dt

/**
 * 순수 판정 함수 — 단위 테스트용. hook 외부에서도 동일 임계 보장.
 * dx/dy/dt 입력으로 4방향 + tap + none 분류.
 */
export type SwipeDecision = "tap" | "left" | "right" | "up" | "down" | "none";
export function decideSwipe(dx: number, dy: number, dt: number): SwipeDecision {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  // tap 판정: 매우 작은 이동 + 짧은 지속
  if (absX < TAP_THRESHOLD && absY < TAP_THRESHOLD && dt < TAP_DURATION) {
    return "tap";
  }
  // dominant axis
  if (absX > absY) {
    if (dx < -SWIPE_THRESHOLD) return "left";
    if (dx > SWIPE_THRESHOLD) return "right";
  } else {
    if (dy < -SWIPE_THRESHOLD) return "up";
    if (dy > SWIPE_THRESHOLD) return "down";
  }
  return "none";
}

export function useSwipeGesture({
  topIdx,
  filteredLength,
  nextCard,
  setTopIdx,
  onSwipeDown,
  onSwipeUp,
  onPrevCard,
}: UseSwipeGestureParams) {
  const [dragX, setDragX] = useState(0);
  const [firstCardHint, setFirstCardHint] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [swiping, _setSwiping] = useState(false);
  const swipingRef = useRef(false); // stale closure 방지용 ref 미러
  const setSwiping = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    _setSwiping((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      swipingRef.current = next;
      return next;
    });
  }, []);
  const [prevOverlayX, setPrevOverlayX] = useState<number | null>(null);
  const [scrollLocked, setScrollLocked] = useState(false);

  const startX = useRef(0);
  const startY = useRef(0);
  const startT = useRef(0);
  const dragging = useRef(false);
  const dirLock = useRef<"h" | "v" | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (swiping) return;
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      startT.current = Date.now();
      dragging.current = true;
      dirLock.current = null;
    },
    [swiping],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!dragging.current) return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;
      if (!dirLock.current) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10)
          dirLock.current = "h";
        else if (Math.abs(dy) > 10) dirLock.current = "v";
        else return;
      }
      if (dirLock.current === "h") {
        // preventDefault 제거 — 부모 div에 touch-action: none으로 처리
        if (!scrollLocked) setScrollLocked(true);

        if (dx > 0 && topIdx === 0) {
          setDragX(dx * 0.15);
          if (dx > 30 && !firstCardHint) setFirstCardHint(true);
        } else if (dx > 0 && filteredLength > 1 && topIdx > 0) {
          const screenW = window.innerWidth;
          setPrevOverlayX(Math.min(0, -screenW + dx));
        } else if (dx <= 0) {
          setPrevOverlayX(null);
          setDragX(dx);
          setDragY(0);
        }
      } else if (dirLock.current === "v") {
        // G1-A: ↑ 스와이프 진입 제거 — 위 방향 dragY 추적도 비활성.
        // dragY 는 아래 방향 (save) 만 추적.
        if (dy > 0) setDragY(Math.min(140, dy));
      }
    },
    [scrollLocked, filteredLength, topIdx, firstCardHint],
  );

  const onTouchEnd = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    const dir = dirLock.current;
    const dt = Date.now() - startT.current;
    dirLock.current = null;
    // 첫 카드 힌트 자동 해제
    if (firstCardHint) setTimeout(() => setFirstCardHint(false), 1500);

    // tap 판정 (swipe-stack.jsx 패턴): |dx|<8, |dy|<8, dt<300
    // dirLock 이 잡히지 않았거나 (10px 미만) 트리거 임계 미달이면 탭으로 처리
    const tappable =
      dir === null &&
      dt < TAP_DURATION &&
      Math.abs(dragX) < TAP_THRESHOLD &&
      Math.abs(dragY) < TAP_THRESHOLD;
    if (tappable) {
      // 탭 = DetailSheet 열기 (swipe-stack.jsx)
      onSwipeUp?.();
      setDragX(0);
      setDragY(0);
      return;
    }

    if (dir === "v") {
      // G1-A: 위 방향 진입 제거. 아래 방향 (save) 만 처리.
      if (dragY > SWIPE_THRESHOLD && onSwipeDown) {
        // 사이클 2 통일 매핑: swipe-down = light (실제 save haptic medium 은 toggleSave 가 발사)
        vibrate("light");
        onSwipeDown();
      }
      setDragY(0);
    } else if (dir === "h") {
      setScrollLocked(false);
      if (prevOverlayX !== null && prevOverlayX > -Infinity) {
        // prev card overlay judgment
        const screenW = window.innerWidth;
        const progress = 1 + prevOverlayX / screenW; // 0=start, 1=arrived
        if (progress > 0.3) {
          // 30%+ -> land: animate to 0, then switch topIdx
          setPrevOverlayX(0);
          // 사이클 2 통일 매핑: prev card 진입 = medium
          vibrate("medium");
          onPrevCard?.();
          setTimeout(() => {
            setTopIdx((i) => (i > 0 ? i - 1 : filteredLength - 1));
            setPrevOverlayX(null);
            scrollRef.current?.scrollTo({ top: 0 });
          }, 300);
        } else {
          // not enough -> revert: animate to -screenW, then remove
          setPrevOverlayX(-screenW);
          setTimeout(() => setPrevOverlayX(null), 300);
        }
      } else if (dragX < -SWIPE_THRESHOLD) {
        // 사이클 2 통일 매핑: pass(left swipe) = light
        vibrate("light");
        nextCard();
      } else {
        setDragX(0);
        setDragY(0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragX, dragY, nextCard, prevOverlayX, filteredLength, onSwipeDown, onSwipeUp, onPrevCard]);

  // prevCard via keyboard/button - overlay animation
  const prevCard = useCallback(() => {
    if (swiping || prevOverlayX !== null || filteredLength === 0) return;
    if (topIdx <= 0) return; // 첫 카드에서는 이전으로 갈 수 없음
    setSwiping(true);
    const w = typeof window !== "undefined" ? window.innerWidth : 400;
    setPrevOverlayX(-w);
    requestAnimationFrame(() => {
      setPrevOverlayX(0);
      // 사이클 2 통일 매핑: prev card 진입 = medium
      vibrate("medium");
      onPrevCard?.();
      const t = setTimeout(() => {
        timersRef.current.delete(t);
        setTopIdx((i) => i - 1);
        setPrevOverlayX(null);
        setSwiping(false);
        scrollRef.current?.scrollTo({ top: 0 });
      }, 350);
      timersRef.current.add(t);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSwiping 은 React setState (stable identity 보장), deps 불필요.
  }, [swiping, topIdx, prevOverlayX, filteredLength, setTopIdx, onPrevCard]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
  }, []);

  return {
    dragX,
    setDragX,
    dragY,
    setDragY,
    swiping,
    swipingRef,
    setSwiping,
    prevOverlayX,
    setPrevOverlayX,
    scrollLocked,
    scrollRef,
    timersRef,
    dragging,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    firstCardHint,
    prevCard,
    clearTimers,
  };
}
