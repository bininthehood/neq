"use client";

/**
 * TutorialFlow v3 — 4단계: 탭 (Detail 진입).
 *
 * 모션: 카드 mock 이 살짝 작아졌다가 커지는 탭 ripple 모방 (0.9s).
 *   카드 위에 ripple ring 펄스 — amber 1건 카운트.
 * 실습 트리거: 부모(TutorialFlow)가 detail.showDetail 발화 감지로 진행.
 */

import type { Recommendation } from "@/lib/types";
import CardVariantA from "@/components/cards/CardVariantA";
import { mapRecToWork } from "@/components/cards/types";

interface TapDemoProps {
  recForDemo: Recommendation;
}

export default function TapDemo({ recForDemo }: TapDemoProps) {
  const work = mapRecToWork(recForDemo);
  return (
    <div className="relative flex flex-col items-center gap-7 select-none">
      {/* 카드 mock — 탭 ripple 모방 */}
      <div className="relative" style={{ width: 220, height: 320 }}>
        <div
          className="animate-tut-demo-tap"
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
        {/* ripple ring — 카드 중앙에 펄스. transient overlay 라 amber 카운트 제외. */}
        <div
          aria-hidden="true"
          className="absolute pointer-events-none animate-tut-tap-ring"
          style={{
            left: "50%",
            top: "50%",
            width: 56,
            height: 56,
            marginLeft: -28,
            marginTop: -28,
            borderRadius: "9999px",
            border: "2px solid var(--accent)",
            transformOrigin: "center",
          }}
        />
      </div>
      {/* 카피 — 탭 단계는 화살표 대신 ripple 로 대체. */}
      <div className="flex flex-col items-center gap-2 px-6">
        <h2
          className="text-base font-medium text-center"
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            letterSpacing: "-0.02em",
          }}
        >
          카드를 터치하면 자세히 볼 수 있어요
        </h2>
        <p className="text-xs text-center text-secondary leading-relaxed">
          감독, 출연, OTT 가용성 확인
        </p>
      </div>
    </div>
  );
}
