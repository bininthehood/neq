"use client";

import type { Recommendation } from "@/lib/types";
import CardVariantA from "@/components/cards/CardVariantA";
import { mapRecToWork } from "@/components/cards/types";

interface PrevCardOverlayProps {
  prev: Recommendation;
  prevOverlayX: number;
  isDragging: boolean;
  metaInfo: string;
}

export default function PrevCardOverlay({
  prev,
  prevOverlayX,
  isDragging,
}: PrevCardOverlayProps) {
  // GH-1 #3: 항상 CardVariantA 풀블리드. SwipeCard 와 동일 시각으로 정합 유지.
  // 우 스와이프(이전) 시 prev overlay 가 default 시각으로 잠시 표시되는 회귀 방지.
  const variantWork = mapRecToWork(prev);

  return (
    <div
      className="absolute overflow-hidden will-change-transform rounded-xl"
      style={{
        top: 0,
        bottom: "8px",
        left: "12px",
        right: "12px",
        transform: `translateX(${prevOverlayX}px)`,
        transition: isDragging
          ? "none"
          : "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
        zIndex: 20,
        boxShadow: "8px 0 32px rgba(0,0,0,0.5)",
      }}
    >
      <div className="absolute inset-0">
        <CardVariantA work={variantWork} w="100%" h="100%" fullbleed={false} />
      </div>
    </div>
  );
}
