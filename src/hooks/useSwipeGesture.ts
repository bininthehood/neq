"use client";

import { useState, useRef, useCallback } from "react";
import { vibrate } from "@/lib/haptics";

interface UseSwipeGestureParams {
  topIdx: number;
  filteredLength: number;
  nextCard: () => void;
  setTopIdx: React.Dispatch<React.SetStateAction<number>>;
  onSwipeDown?: () => void;
}

export function useSwipeGesture({
  topIdx,
  filteredLength,
  nextCard,
  setTopIdx,
  onSwipeDown,
}: UseSwipeGestureParams) {
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [prevOverlayX, setPrevOverlayX] = useState<number | null>(null);
  const [scrollLocked, setScrollLocked] = useState(false);

  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const dirLock = useRef<"h" | "v" | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (swiping) return;
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
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
        e.preventDefault();
        if (!scrollLocked) setScrollLocked(true);

        if (dx > 0 && filteredLength > 1) {
          // right drag -> prev card overlay from left
          const screenW = window.innerWidth;
          setPrevOverlayX(Math.min(0, -screenW + dx));
        } else if (dx <= 0) {
          // left drag -> push current card (next)
          setPrevOverlayX(null);
          setDragX(dx);
          setDragY(0);
        }
      } else if (dirLock.current === "v" && dy > 0) {
        e.preventDefault();
        // 아래 스와이프 진행도 추적
        setDragY(Math.min(100, dy * 0.5));
      }
    },
    [scrollLocked, filteredLength],
  );

  const onTouchEnd = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    const dir = dirLock.current;
    dirLock.current = null;
    if (dir === "v") {
      if (dragY > 40 && onSwipeDown) {
        vibrate(10);
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
          vibrate(10);
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
      } else if (dragX < -80) {
        vibrate(10);
        nextCard();
      } else {
        setDragX(0);
        setDragY(0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragX, dragY, nextCard, prevOverlayX, filteredLength, onSwipeDown]);

  // prevCard via keyboard/button - overlay animation
  const prevCard = useCallback(() => {
    if (swiping || prevOverlayX !== null || filteredLength === 0) return;
    if (topIdx <= 0) {
      setTopIdx(filteredLength - 1);
      return;
    }
    setSwiping(true);
    const w = typeof window !== "undefined" ? window.innerWidth : 400;
    setPrevOverlayX(-w);
    requestAnimationFrame(() => {
      setPrevOverlayX(0);
      vibrate(10);
      const t = setTimeout(() => {
        timersRef.current.delete(t);
        setTopIdx((i) => i - 1);
        setPrevOverlayX(null);
        setSwiping(false);
        scrollRef.current?.scrollTo({ top: 0 });
      }, 350);
      timersRef.current.add(t);
    });
  }, [swiping, topIdx, prevOverlayX, filteredLength, setTopIdx]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
  }, []);

  return {
    dragX,
    setDragX,
    dragY,
    setDragY,
    swiping,
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
    prevCard,
    clearTimers,
  };
}
