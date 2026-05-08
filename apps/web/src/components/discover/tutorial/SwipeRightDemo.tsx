"use client";

/**
 * TutorialFlow v3 — 2단계: 우 스와이프 (이전 카드 overlay).
 *
 * 모션: 카드 mock 이 우측으로 살짝 밀렸다가 복귀 (1.5s).
 *   이전 작품 overlay 가 좌측 뒤로 살짝 비치는 시연을 위해 mock 카드 1장을 더 깔아둠.
 * 실습 트리거: 부모(TutorialFlow)가 swipe.prevOverlayX 발화 또는 topIdx 감소 감지로 진행.
 */

import type { Recommendation } from "@/lib/types";
import CardVariantA from "@/components/cards/CardVariantA";
import { mapRecToWork } from "@/components/cards/types";

interface SwipeRightDemoProps {
  recForDemo: Recommendation;
}

export default function SwipeRightDemo({ recForDemo }: SwipeRightDemoProps) {
  const work = mapRecToWork(recForDemo);
  return (
    <div className="relative flex flex-col items-center gap-7 select-none">
      {/* prev overlay 힌트 — 카드 mock 좌측 뒤에 살짝 (앞 카드보다 살짝 작고 dim). */}
      <div
        className="relative"
        style={{ width: 220, height: 320 }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: -28,
            top: 6,
            width: 220,
            height: 320,
            borderRadius: "var(--radius-xl)",
            overflow: "hidden",
            opacity: 0.45,
            transform: "scale(0.94) rotate(-3deg)",
            filter: "saturate(0.8)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <CardVariantA work={work} w={220} h={320} />
        </div>
        {/* 메인 카드 — 우측 푸시 모션 */}
        <div
          className="animate-tut-demo-right"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "var(--radius-xl)",
            overflow: "hidden",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <CardVariantA work={work} w={220} h={320} />
        </div>
      </div>
      {/* 방향 화살표 + 카피 */}
      <div className="flex flex-col items-center gap-2 px-6">
        <div
          className="flex items-center gap-3"
          aria-hidden="true"
          style={{ color: "var(--accent)" }}
        >
          <svg
            className="animate-tut-arrow-right"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
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
          오른쪽으로 밀면 직전 작품이 다시 와요
        </h2>
        <p className="text-xs text-center text-secondary leading-relaxed">
          되돌아갈 수 있어요
        </p>
      </div>
    </div>
  );
}
