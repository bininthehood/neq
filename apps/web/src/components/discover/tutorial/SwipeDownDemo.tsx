"use client";

/**
 * TutorialFlow v3 — 3단계: 아래 스와이프 (저장).
 *
 * 모션: 카드 mock 이 아래로 살짝 밀렸다가 복귀 + save 글리프 강조 펄스 (1.5s).
 * 실습 트리거: 부모(TutorialFlow)가 saveAbsorbing/savedIds 변화 감지로 진행.
 *
 * NOTE: anti-slop #13 amber 카운트 — 화살표 1 + 하트 글리프 1 = 2건 (지침 안내선 ≤ 2 준수).
 *   하트는 amber 글리프지만 transient 튜토리얼 overlay 라 카운트 제외 정책 적용 (DESIGN.md L34).
 */

import type { Recommendation } from "@/lib/types";
import CardVariantA from "@/components/cards/CardVariantA";
import { mapRecToWork } from "@/components/cards/types";

interface SwipeDownDemoProps {
  recForDemo: Recommendation;
}

export default function SwipeDownDemo({ recForDemo }: SwipeDownDemoProps) {
  const work = mapRecToWork(recForDemo);
  return (
    <div className="relative flex flex-col items-center gap-7 select-none">
      {/* 카드 mock — 자동 아래 푸시 모션 */}
      <div
        className="animate-tut-demo-down"
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
      {/* 방향 화살표 + 카피 + save 글리프 강조 (펄스 ring + 하트). */}
      <div className="flex flex-col items-center gap-3 px-6">
        <div
          className="flex items-center gap-3"
          aria-hidden="true"
          style={{ color: "var(--accent)" }}
        >
          <svg
            className="animate-tut-arrow-down"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
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
          아래로 밀어 마음에 드는 작품을 저장해요
        </h2>
        <p className="text-xs text-center text-secondary leading-relaxed">
          나중에 보고 싶은 작품을 모아둬요
        </p>
      </div>
    </div>
  );
}
