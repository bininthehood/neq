"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import type { AdCard as AdCardType } from "@/lib/ad-config";

interface AdCardProps {
  ad: AdCardType;
  depth: number;
  dragX: number;
  isDragging: boolean;
  swiping: boolean;
  isTop: boolean;
}

/**
 * 광고 카드 — 추천 카드와 동일한 레이아웃으로 렌더.
 * "AD" 라벨만 추가. 스와이프로 넘기기 가능.
 *
 * 현재 AD_ENABLED = false라서 실제로 렌더되지 않음.
 * 활성화 시 SwipeCard와 동일한 위치에 삽입.
 */
export default function AdCard({ ad, depth, dragX, isDragging, swiping, isTop }: AdCardProps) {
  const impressionSent = useRef(false);

  // 노출 트래킹 — 맨 앞에 올 때 1회
  useEffect(() => {
    if (isTop && !impressionSent.current) {
      impressionSent.current = true;
      ad.impression?.();
    }
  }, [isTop, ad]);

  const scaleVal = 1 - depth * 0.04;
  const yOffset = depth * 12;
  const tx = isTop ? dragX : 0;
  const rot = isTop ? dragX * 0.06 : 0;

  return (
    <div
      className="absolute overflow-hidden will-change-transform"
      style={{
        top: 0,
        bottom: "8px",
        left: "12px",
        right: "12px",
        transform: `translateX(${tx}px) translateY(${yOffset}px) rotate(${rot}deg) scale(${scaleVal})`,
        transition: isTop && isDragging ? "none" : "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
        borderRadius: "var(--radius-xl)",
        zIndex: 10 - depth,
      }}
    >
      {/* 광고 이미지 */}
      <Image
        src={ad.imageUrl}
        alt={ad.title}
        fill
        className="object-cover"
        sizes="(max-width: 480px) 100vw, 480px"
        unoptimized
      />

      {/* AD 라벨 — 좌상단 작게 */}
      <div
        className="absolute top-4 left-4 px-2 py-0.5 text-[10px] font-medium tracking-wider z-10 bg-overlay rounded-sm"
        style={{ color: "var(--text-muted)" }}
      >
        AD
      </div>

      {/* 하단 정보 — 추천 카드와 동일한 레이아웃 */}
      <div
        className="absolute bottom-0 left-0 right-0 p-5 pt-24 z-10"
        style={{ background: "linear-gradient(transparent, var(--bg-overlay-heavy) 40%, var(--bg))" }}
      >
        <h2 className="font-display text-2xl font-bold">{ad.title}</h2>
        <p className="text-sm mt-1 text-secondary">{ad.description}</p>

        {/* CTA */}
        <a
          href={ad.actionUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.stopPropagation();
            ad.click?.();
          }}
          className="inline-flex items-center gap-2 mt-3 px-4 py-2 text-sm font-medium active:scale-95 transition-transform bg-surface rounded-full border border-border"
        >
          {ad.actionLabel}
        </a>
      </div>
    </div>
  );
}
