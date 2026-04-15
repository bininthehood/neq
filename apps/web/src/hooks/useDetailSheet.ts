"use client";

import { useState, useRef, useCallback } from "react";

export function useDetailSheet() {
  const [showDetail, setShowDetail] = useState(false);
  const [detailY, setDetailY] = useState(100); // 0=open, 100=closed
  const [detailAnimating, setDetailAnimating] = useState(false);
  const detailStartY = useRef(0);
  const detailDragging = useRef(false);
  const detailBodyRef = useRef<HTMLDivElement>(null);

  const openDetail = useCallback(() => {
    setShowDetail(true);
    setDetailY(100);
    requestAnimationFrame(() => {
      setDetailAnimating(true);
      setDetailY(0);
    });
  }, []);

  const closeDetail = useCallback(() => {
    setDetailAnimating(true);
    setDetailY(100);
    setTimeout(() => {
      setShowDetail(false);
      setDetailAnimating(false);
    }, 300);
  }, []);

  const onDetailTouchStart = useCallback((e: React.TouchEvent) => {
    detailStartY.current = e.touches[0].clientY;
    detailDragging.current = false;
  }, []);

  const onDetailTouchMove = useCallback((e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - detailStartY.current;
    const atTop =
      !detailBodyRef.current || detailBodyRef.current.scrollTop <= 0;
    if (dy > 0 && atTop) {
      detailDragging.current = true;
      e.preventDefault();
      setDetailAnimating(false);
      setDetailY(Math.min(100, (dy / window.innerHeight) * 120));
    }
  }, []);

  const onDetailTouchEnd = useCallback(() => {
    if (!detailDragging.current) return;
    detailDragging.current = false;
    if (detailY > 25) closeDetail();
    else {
      setDetailAnimating(true);
      setDetailY(0);
    }
  }, [detailY, closeDetail]);

  return {
    showDetail,
    detailY,
    detailAnimating,
    detailBodyRef,
    openDetail,
    closeDetail,
    onDetailTouchStart,
    onDetailTouchMove,
    onDetailTouchEnd,
  };
}
