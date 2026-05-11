"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { durations, easings, cubicBezierCss } from "@neq/design";

/**
 * DetailSheet morph 모션 정량 (핸드오프 v2 D3, 사이클 2 단일화).
 *
 * **단일 source: `packages/design/src/tokens.ts`**
 *   - `durations.detailEnter` = 450 / `durations.detailExit` = 350
 *   - `easings.detailMorph` = [0.32, 0.72, 0.24, 1]
 *
 * globals.css 의 `--duration-detail-enter|exit`, `--ease-detail-morph` 와 값이 동일해야 함
 * (CSS 영역은 별도 채널). 여기서 ms 값을 re-export 하는 이유는 closeDetail 의 setTimeout
 * 과 saved/page.tsx, components/discover/DetailSheet.tsx 의 inline transition 문자열에서
 * 사용하기 때문.
 */
export const DETAIL_ENTER_MS = durations.detailEnter;
export const DETAIL_EXIT_MS = durations.detailExit;
export const DETAIL_EASE = cubicBezierCss(easings.detailMorph);

/**
 * 사용자 직접 테스트 #6 — Hero morph (Apple Music style).
 *
 * 카드 → DetailSheet hero 영역으로의 시각 보간을 위해 origin rect 를 저장한다.
 * - openDetail(rect?) 로 카드 컨테이너의 getBoundingClientRect() 를 받아 morph 시작점으로 사용
 * - DetailSheet 가 morph layer (포스터/backdrop 이미지) 를 origin → hero 로 transition
 * - close 시 hook 내부에서 morphRect 를 유지 → DetailSheet 가 역방향 (hero → origin) 전이
 * - rect 없이 호출되면 기존 sheet 슬라이드만 사용 (Saved 페이지 등 morph 미적용 경로 호환)
 */
export type MorphRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function useDetailSheet() {
  const [showDetail, setShowDetail] = useState(false);
  const [detailY, setDetailY] = useState(100); // 0=open, 100=closed
  const [detailAnimating, setDetailAnimating] = useState(false);
  /**
   * morph origin rect — 카드 진입 시 카드 위치/크기.
   * null 이면 morph layer 미렌더 → 기존 슬라이드만 동작.
   * close 시에도 동일 rect 를 사용해 역방향 morph (hero → 카드).
   */
  const [morphRect, setMorphRect] = useState<MorphRect | null>(null);
  /** morph 진행 단계 — "enter": 카드→hero, "exit": hero→카드, null: 비활성/완료 */
  const [morphPhase, setMorphPhase] = useState<"enter" | "exit" | null>(null);
  const detailStartY = useRef(0);
  const detailDragging = useRef(false);
  const detailBodyRef = useRef<HTMLDivElement>(null);
  /**
   * 사용자 직접 테스트 (D-1 회귀) — iPhone 14 Pro Max 합성 click 가드.
   *
   * **버그**: 모바일 디바이스 / Chrome devtools 모바일 에뮬레이션에서 카드 탭 시:
   *   1) touchstart → touchend 발사 → SwipeCard.onCardTap → openDetail
   *   2) sheet 가 마운트 (DetailSheet root: fixed inset-0, onClick={onClose})
   *   3) 브라우저가 touchend 후 ~50–350ms 안에 합성 mousedown/mouseup/click 발사
   *   4) sheet morph 진행 중이라 (215, 437) 좌표가 dim 또는 morph layer (pointer-events:none)
   *      → 통과 → root onClick 트리거 → closeDetail 호출 → sheet 즉시 닫힘
   *
   * **가드**: openDetail 호출 시각을 기록하고, 그 후 GUARD_MS(=400ms) 이내에 들어오는
   * closeDetail 호출은 무시한다. 사용자가 의도적으로 닫으려는 시점은 모션 종료 후이므로
   * 이 윈도우는 자연스럽다. ESC 키로 닫는 경우도 마찬가지로 보호되지만, 모션이
   * 끝나기 전에 ESC 를 누르는 것은 매우 드물고 어색해 트레이드오프 수용.
   *
   * @see _workspace/03_fix_d1_morph_bug.md
   */
  const openedAtRef = useRef<number>(0);
  const morphEnterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const CLOSE_GUARD_MS = 400;

  const openDetail = useCallback((rect?: MorphRect | null) => {
    // 이전 close timer 가 있으면 취소 — race 방지
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (morphEnterTimerRef.current) {
      clearTimeout(morphEnterTimerRef.current);
      morphEnterTimerRef.current = null;
    }
    openedAtRef.current = Date.now();
    setShowDetail(true);
    setDetailY(100);
    if (rect && !prefersReducedMotion()) {
      setMorphRect(rect);
      setMorphPhase("enter");
    } else {
      setMorphRect(null);
      setMorphPhase(null);
    }
    requestAnimationFrame(() => {
      setDetailAnimating(true);
      setDetailY(0);
    });
    // morph enter 종료 시점 — DETAIL_ENTER_MS 후 phase 초기화 (layer 숨김)
    if (rect && !prefersReducedMotion()) {
      morphEnterTimerRef.current = setTimeout(() => {
        setMorphPhase((p) => (p === "enter" ? null : p));
        morphEnterTimerRef.current = null;
      }, DETAIL_ENTER_MS);
    }
  }, []);

  /**
   * close 옵션:
   *   skipMorph — swipe-down 으로 닫는 경우 sheet 가 이미 화면 밖이라 morph exit 가
   *     별도 모션으로 보임 (sheet 닫힌 후 카드 morph 발생). swipe 시 morph 생략 →
   *     sheet 슬라이드 다운만, 카드는 deck 에 그대로 노출 (자연스러움).
   */
  const closeDetail = useCallback((opts?: { skipMorph?: boolean }) => {
    // 합성 click 가드 — 방금 열린 직후 들어오는 닫기는 무시.
    // 사용자가 명시적으로 닫는 시점은 모션 완료 후이므로 무해함.
    const elapsed = Date.now() - openedAtRef.current;
    if (elapsed < CLOSE_GUARD_MS) {
      return;
    }
    // morph enter timer 가 살아있으면 취소 (exit 단계 morphPhase 덮어쓰기 방지)
    if (morphEnterTimerRef.current) {
      clearTimeout(morphEnterTimerRef.current);
      morphEnterTimerRef.current = null;
    }
    setDetailAnimating(true);
    setDetailY(100);
    if (morphRect && !prefersReducedMotion() && !opts?.skipMorph) {
      setMorphPhase("exit");
    }
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setShowDetail(false);
      setDetailAnimating(false);
      setMorphRect(null);
      setMorphPhase(null);
      closeTimerRef.current = null;
    }, DETAIL_EXIT_MS);
  }, [morphRect]);

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
    // swipe-down 으로 닫는 경우 morph 스킵 — sheet 가 이미 swipe 따라 내려간 상태에서
    // morph exit 가 별도로 발동되면 "sheet 닫힘 → 카드 morph" 순으로 보여 부자연.
    // (2026-05-11 사용자 보고)
    if (detailY > 25) closeDetail({ skipMorph: true });
    else {
      setDetailAnimating(true);
      setDetailY(0);
    }
  }, [detailY, closeDetail]);

  // unmount 시 보류 중인 timer 정리 — 메모리 누수 + late state update 방지
  useEffect(() => {
    return () => {
      if (morphEnterTimerRef.current) clearTimeout(morphEnterTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

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
    morphRect,
    morphPhase,
  };
}
