"use client";

import NextImage from "next/image";
import type { Recommendation } from "@/lib/types";

/**
 * DetailHero — backdrop 큰 이미지 + №ID mark + 하단 그라디언트 (D3 콘텐츠 풍부화).
 *
 * backdrop 없으면 hero 자체 생략 → 기존 텍스트 우선 레이아웃 유지.
 * heroRef 는 부모(useDetailMorph)가 소유하고 morph 진행 중 위치 측정에 사용.
 * morphPhase 활성 시 hero 자체를 잠시 가려서 morph layer 와 이중 노출 방지.
 */
export function DetailHero({
  rec,
  heroRef,
  morphPhase,
}: {
  rec: Recommendation;
  heroRef: React.RefObject<HTMLDivElement | null>;
  morphPhase: "enter" | "exit" | null;
}) {
  if (!rec.backdrop) return null;
  return (
    <div
      ref={heroRef}
      data-detail-hero
      className="relative -mx-5 mb-4 overflow-hidden"
      style={{
        aspectRatio: "16 / 10",
        // morph 진행 중에는 hero 자체를 잠시 가려서 morph layer 와 이중 노출 방지.
        // enter 종료 후 (morphPhase=null) 자연 노출. exit 시작 시 다시 숨김.
        opacity: morphPhase ? 0 : 1,
        transition: morphPhase ? "none" : "opacity 120ms ease-out",
      }}
    >
      <NextImage
        src={rec.backdrop}
        alt=""
        fill
        className="object-cover"
        sizes="(max-width: 480px) 100vw, 480px"
        priority
      />
      {/* 가독성용 하단 그라디언트 — 본문 배경(--bg)으로 자연 페이드 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, transparent 50%, var(--bg) 100%)",
        }}
      />
      {/* №ID — 아카이브식 ID. tmdbId 6자리 zero-pad. */}
      <div
        className="absolute top-3 left-5 font-data uppercase"
        style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          color: "rgba(255, 255, 255, 0.7)",
          textShadow: "0 1px 2px rgba(0, 0, 0, 0.5)",
        }}
        aria-hidden
      >
        № {String(rec.tmdbId).padStart(6, "0")}
      </div>
    </div>
  );
}
