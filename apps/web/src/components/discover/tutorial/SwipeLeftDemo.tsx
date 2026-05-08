"use client";

/**
 * TutorialFlow v3 — 1단계: 좌 스와이프 (다음 작품).
 *
 * 모션: 카드 mock 이 좌측으로 살짝 밀렸다가 복귀 (1.5s).
 * 실습 트리거: 부모(TutorialFlow)에서 page 의 swipe.swiping → topIdx 증가 감지로 onComplete 호출.
 *   여기서는 prop `userActedAt: number | null` 로 트리거 시점을 받아 흐름 진행.
 *
 * 카드 mock: SwipeCard 의 시각만 차용하지 않고 실제 카드 영역에 overlay 로 시연 카드 띄움.
 * 실제 카드(filtered[0])를 dim 위에 그대로 둘 수 있으면 좋지만 z-index 충돌 방지 위해 mock 카드.
 *   mock 카드는 CardVariantA 그대로 — 디자인 파편화 방지.
 */

import type { Recommendation } from "@/lib/types";
import CardVariantA from "@/components/cards/CardVariantA";
import { mapRecToWork } from "@/components/cards/types";

interface SwipeLeftDemoProps {
  recForDemo: Recommendation;
}

export default function SwipeLeftDemo({ recForDemo }: SwipeLeftDemoProps) {
  const work = mapRecToWork(recForDemo);
  return (
    <div className="relative flex flex-col items-center gap-7 select-none">
      {/* 카드 mock — 자동 좌측 푸시 모션 */}
      <div
        className="animate-tut-demo-left"
        style={{
          width: 220,
          height: 320,
          borderRadius: "var(--radius-xl)",
          overflow: "hidden",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <CardVariantA work={work} w={220} h={320} />
      </div>
      {/* 방향 화살표 + 카피 */}
      <div className="flex flex-col items-center gap-2 px-6">
        <div
          className="flex items-center gap-3"
          aria-hidden="true"
          style={{ color: "var(--accent)" }}
        >
          <svg
            className="animate-tut-arrow-left"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </div>
        <h2
          className="text-base font-medium text-center"
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            letterSpacing: "-0.02em",
          }}
        >
          왼쪽으로 밀어 다음 작품을 발견해요
        </h2>
        <p className="text-xs text-center text-secondary leading-relaxed">
          안 끌리는 작품은 그냥 밀어내세요
        </p>
      </div>
    </div>
  );
}
