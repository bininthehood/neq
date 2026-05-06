"use client";

import { useRef } from "react";
import type { Recommendation } from "@/lib/types";
import { easings, durations, cubicBezierCss } from "@neq/design";
import CardVariantA from "@/components/cards/CardVariantA";
import { mapRecToWork } from "@/components/cards/types";

interface SwipeCardProps {
  rec: Recommendation;
  isTop: boolean;
  depth: number;
  dragX: number;
  /** 아래/위 스와이프 시 카드 Y 변위. 양수=아래(save 흡수 진행), 음수=위(detail) */
  dragY?: number;
  isDragging: boolean;
  swiping: boolean;
  /**
   * save 흡수 모션 활성화 — 사용자가 아래 스와이프 임계 통과 또는 save 버튼 클릭 시.
   * `true` 가 되면 카드는 save 버튼 위치로 scale 축소 + 이동 + 페이드아웃.
   */
  absorbing?: boolean;
  /**
   * 카드 중심 → save 버튼까지의 변위 (px, transform translate 기준).
   * page.tsx 가 카드 컨테이너 ref + save 버튼 ref 두 개를 measure 해 차분으로 계산해 전달.
   * `absorbing=true` 일 때만 참조.
   */
  absorbDelta?: { tx: number; ty: number } | null;
  immersive: boolean;
  onCardTap: () => void;
  metaInfo: string;
}

const SPRING_EASING = cubicBezierCss(easings.spring);
const STEADY_MS = durations.steady;

export default function SwipeCard({
  rec,
  immersive,
  isTop,
  depth,
  dragX,
  dragY = 0,
  isDragging,
  swiping,
  absorbing = false,
  absorbDelta,
  onCardTap,
  metaInfo: _metaInfo,
}: SwipeCardProps) {
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const scaleVal = 1 - depth * 0.04;
  const yOffset = depth * 12;

  // GH-1 #4: variant picker 제거 — 항상 CardVariantA 시각 적용 (사용자 결정).
  // B/C 컴포넌트는 코드 보존 (백업) 하지만 호출하지 않음.
  // 외부 transform 컨테이너(absorb/drag 모션)는 그대로 유지하고 inner 시각은 A 풀블리드.
  const variantWork = mapRecToWork(rec);

  const absorbActive = absorbing && isTop;
  const absorbTx = absorbDelta?.tx ?? 0;
  const absorbTy = absorbDelta?.ty ?? 0;
  const absorbScale = absorbActive ? 0.12 : scaleVal;
  const absorbOpacity = absorbActive ? 0 : 1;
  const absorbRot = absorbActive ? -3 : 0;

  // 일반 드래그 (top 카드만): X + Y 추적, X 회전
  const baseTx = isTop ? dragX : 0;
  const baseTy = isTop ? dragY * 0.6 + yOffset : yOffset; // 아래 끌 때 시각적으로 따라감 (0.6 댐핑)
  const baseRot = isTop
    ? Math.sign(dragX) * Math.min(Math.abs(dragX) * 0.06, 15)
    : 0;
  // 아래로 끌 때 살짝 축소해 흡수 예고
  const dragScale = isTop && dragY > 30 ? Math.max(0.94, 1 - (dragY - 30) * 0.0008) : scaleVal;

  const tx = absorbActive ? absorbTx : baseTx;
  const ty = absorbActive ? absorbTy : baseTy;
  const rotation = absorbActive ? absorbRot : baseRot;
  const cardScale = absorbActive ? absorbScale : dragScale;
  const cardOpacity = absorbActive ? absorbOpacity : 1;

  const transition =
    isTop && isDragging
      ? "none"
      : absorbActive
        ? `transform ${STEADY_MS}ms ${SPRING_EASING}, opacity ${STEADY_MS}ms ease-out`
        : isTop
          ? "transform 0.3s cubic-bezier(0.34, 1.3, 0.64, 1), top 0.3s ease-out, bottom 0.3s ease-out, left 0.3s ease-out, right 0.3s ease-out, border-radius 0.3s ease-out, opacity 0.3s ease-out"
          : "transform 0.3s ease-out";

  return (
    <div
      // 사용자 직접 테스트 #6 — hero morph origin 측정용 마커.
      // top 카드만 morph 시작점이 됨. querySelector('[data-swipe-card-top]') 로 호출처 접근.
      data-swipe-card-top={isTop ? "true" : undefined}
      className="absolute overflow-hidden will-change-transform"
      style={{
        top: immersive ? "-12px" : 0,
        bottom: immersive ? "-8px" : "8px",
        left: immersive ? "-12px" : "12px",
        right: immersive ? "-12px" : "12px",
        borderRadius: immersive ? 0 : "var(--radius-xl)",
        transform: `translateX(${tx}px) translateY(${ty}px) rotate(${rotation}deg) scale(${cardScale})`,
        opacity: cardOpacity,
        transition,
        zIndex: 10 - depth,
        transformOrigin: "center center",
      }}
    >
      {/* GH-1 #4: 항상 CardVariantA 풀블리드. 자체 시각으로 타이틀/이유/OTT/카테고리/평점 모두 제공. */}
      <div className="absolute inset-0">
        <CardVariantA
          work={variantWork}
          w="100%"
          h="100%"
          fullbleed={immersive}
        />
      </div>

      {/* Tap area - pointer-based tap detection (drag-safe) */}
      {isTop && (
        <div
          className="absolute inset-0 z-[5]"
          onPointerDown={(e) => {
            pointerStartRef.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            const dx = Math.abs(e.clientX - pointerStartRef.current.x);
            const dy = Math.abs(e.clientY - pointerStartRef.current.y);
            if (dx < 10 && dy < 10 && !swiping) onCardTap();
          }}
        />
      )}
    </div>
  );
}
