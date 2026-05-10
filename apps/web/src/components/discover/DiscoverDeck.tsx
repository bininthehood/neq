"use client";

import type { RefObject } from "react";
import type { Recommendation } from "@/lib/types";
import type { useSwipeGesture } from "@/hooks/useSwipeGesture";
import SwipeCard from "./SwipeCard";
import RewindOverlay from "./RewindOverlay";
import PrevCardOverlay from "./PrevCardOverlay";

/**
 * DiscoverDeck — discover 페이지의 카드 deck 영역.
 *
 * 책임:
 * - 카드 stack 렌더 (top + 아래 2장 stack)
 * - 아래 스와이프 힌트 ("저장" 라벨, dragY > 30 시 노출)
 * - 덱 뒤 스켈레톤 (loading/prefetching)
 * - RewindOverlay (VHS 되감기)
 * - PrevCardOverlay (우 스와이프 미리보기)
 *
 * state owner 는 부모 page (swipe / rewinding / saveAbsorbing 등). 본 컴포넌트는
 * 표시 + touch handler 위임만. 스와이프 후 topIdx 진행은 nextCard 등 부모 callback.
 */

interface DiscoverDeckProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  cardContainerRef: RefObject<HTMLDivElement | null>;
  swipe: ReturnType<typeof useSwipeGesture>;
  deckCards: Recommendation[];
  prevCard: Recommendation | null;
  loading: boolean;
  prefetching: boolean;
  saveAbsorbing: boolean;
  saveAbsorbDelta: { tx: number; ty: number } | null;
  immersive: boolean;
  rewinding: boolean;
  rewindCards: Recommendation[];
  onCardTap: () => void;
  onRewindComplete: () => void;
  metaInfo: (r: Recommendation) => string;
}

export default function DiscoverDeck({
  scrollRef,
  cardContainerRef,
  swipe,
  deckCards,
  prevCard,
  loading,
  prefetching,
  saveAbsorbing,
  saveAbsorbDelta,
  immersive,
  rewinding,
  rewindCards,
  onCardTap,
  onRewindComplete,
  metaInfo,
}: DiscoverDeckProps) {
  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0"
      style={{ overflowY: "hidden", overscrollBehavior: "none" }}
    >
      <div
        ref={cardContainerRef}
        className="relative px-3 pb-2"
        style={{ height: "100%", touchAction: "none" }}
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={swipe.onTouchEnd}
      >
        {/* 아래 스와이프 힌트 — Stage 4 D1: save 액션 진입 신호.
            dragY > 30 이상이면 카드가 살짝 작아지고 (SwipeCard 내부) save 버튼이 부풀음 */}
        {swipe.dragY > 30 && !saveAbsorbing && (
          <div
            className="absolute inset-x-0 bottom-20 z-20 flex justify-center"
            style={{
              pointerEvents: "none",
              opacity: Math.min(1, (swipe.dragY - 30) / 40),
              transition: swipe.dragging.current ? "none" : "opacity 0.25s ease-out",
            }}
          >
            <div
              className="px-3.5 py-1.5 text-xs flex items-center gap-1.5 rounded-full"
              style={{
                background: "var(--bg-overlay-heavy)",
                color: "var(--accent)",
                border: "1px solid var(--accent-border-light)",
                fontFamily: "var(--font-data)",
                letterSpacing: "0.04em",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21s-7-4.5-9.5-9C0.7 8.5 2.5 4 6 4c2 0 3.5 1 4 2 0.5-1 2-2 4-2 3.5 0 5.3 4.5 3.5 8C19 16.5 12 21 12 21z" />
              </svg>
              저장
            </div>
          </div>
        )}
        {/* 덱 뒤 스켈레톤 — 프리페치/로딩 중이거나 deck 이 비어있을 때 표시.
            2026-05-10 — deck.length === 0 (topIdx 가 끝 넘어갔지만 exhausted 아님) 시점에도
            카드 자리 스켈레톤 유지. 사용자 컨텍스트 (헤더/필터) 잃지 않고 자연스러운 대기. */}
        {(prefetching || loading || deckCards.length === 0) && (
          <div
            className="absolute overflow-hidden rounded-xl animate-pulse"
            style={{ top: 0, bottom: "8px", left: "12px", right: "12px", zIndex: 1, background: "var(--surface)" }}
          >
            <div className="absolute bottom-0 left-0 right-0 p-5 space-y-2.5">
              <div className="h-6 w-3/5 bg-surface-raised rounded-md" />
              <div className="h-3 w-2/5 bg-surface-raised rounded-sm" />
              <div className="h-4 w-4/5 bg-surface-raised rounded-sm" />
            </div>
          </div>
        )}
        {deckCards.map((r, stackIdx) => {
          const isTop = stackIdx === deckCards.length - 1;
          return (
            <SwipeCard
              key={r.tmdbId}
              rec={r}
              isTop={isTop}
              depth={deckCards.length - 1 - stackIdx}
              dragX={swipe.dragX}
              dragY={swipe.dragY}
              isDragging={swipe.dragging.current}
              swiping={swipe.swiping}
              absorbing={isTop && saveAbsorbing}
              absorbDelta={saveAbsorbDelta}
              immersive={isTop && immersive}
              onCardTap={onCardTap}
              metaInfo={metaInfo(r)}
            />
          );
        })}
        {/* 되감기 오버레이 — VHS 테이프 되감기 */}
        {rewinding && (
          <RewindOverlay cards={rewindCards} onComplete={onRewindComplete} />
        )}
        {swipe.prevOverlayX !== null && prevCard && (
          <PrevCardOverlay
            prev={prevCard}
            prevOverlayX={swipe.prevOverlayX}
            isDragging={swipe.dragging.current}
            metaInfo={metaInfo(prevCard)}
          />
        )}
      </div>
    </div>
  );
}
