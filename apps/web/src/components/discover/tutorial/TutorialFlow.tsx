"use client";

/**
 * TutorialFlow v3 — Discover 첫 진입 4단계 튜토리얼.
 *
 * 4단계 (순서 고정, ↑ 위로 스와이프 미포함):
 *   1. 좌 스와이프 — 다음 작품
 *   2. 우 스와이프 — 이전 카드 overlay
 *   3. 아래 스와이프 — 저장
 *   4. 탭 — Detail 진입
 *
 * 흐름: 데모 1회 자동 재생 → 사용자 직접 실습 → 부모(page)가 emit 한 신호로 단계 진행.
 *
 * 실습 신호: 부모가 prop `userActionSignals` 로 전달하는 4개 카운터 또는 boolean.
 *   각 단계가 활성일 때 해당 신호가 변동(증가/true) 하면 onComplete 처리.
 *
 * 노출 정책 (page 가 책임):
 *   - localStorage `tutorialV3Shown`/`coachV2Shown` 둘 중 하나라도 true 면 마운트 X.
 *   - 첫 카드(filtered[0]) 로드 후만 마운트.
 *
 * 본 컴포넌트는 자체 dim 풀스크린이며 카드 시연은 dim 위 mock 카드로 진행.
 *   실제 카드 영역에는 영향 X — 부모 page 의 swipe 핸들러는 그대로 동작.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Recommendation } from "@/lib/types";
import { track } from "@/lib/analytics";
import SwipeLeftDemo from "./SwipeLeftDemo";
import SwipeRightDemo from "./SwipeRightDemo";
import SwipeDownDemo from "./SwipeDownDemo";
import TapDemo from "./TapDemo";

export type TutorialStep = "swipe_left" | "swipe_right" | "swipe_down" | "tap";

const STEPS: TutorialStep[] = ["swipe_left", "swipe_right", "swipe_down", "tap"];

/**
 * 부모(page) 가 실시간 변화를 emit 해주는 신호 묶음.
 * 각 단계 활성 시 해당 신호의 변동을 감지해 자동 진행.
 *
 * - leftSwipeCount: 좌 스와이프 발생 카운터 (topIdx 가 1 이상 증가하면 +1)
 * - rightSwipeCount: 우 스와이프(prev) 발생 카운터 (prevOverlayX flush 또는 prevCard 호출 시)
 * - saveActionCount: save (swipe-down 또는 button) 발생 카운터
 * - detailOpenCount: DetailSheet showDetail = true 진입 카운터
 *
 * 카운터 패턴인 이유: boolean 은 한 번 true 이후 false 복귀 타이밍이 까다로워
 *   useEffect 의존성에서 누락될 수 있음. 카운터는 단순 증가만 하므로 안전.
 */
export interface TutorialUserSignals {
  leftSwipeCount: number;
  rightSwipeCount: number;
  saveActionCount: number;
  detailOpenCount: number;
}

interface TutorialFlowProps {
  /** 시연용 카드 — 보통 filtered[0] 전달 */
  recForDemo: Recommendation;
  /** 부모가 실시간 emit 하는 사용자 액션 신호 */
  userActionSignals: TutorialUserSignals;
  /** 튜토리얼 종료 (완료 또는 건너뛰기). 부모가 localStorage 저장 + unmount 처리. */
  onClose: (reason: "completed" | "skipped", payload: { stepsCompleted: number; atStep: TutorialStep }) => void;
}

const STEP_INDEX: Record<TutorialStep, number> = {
  swipe_left: 0,
  swipe_right: 1,
  swipe_down: 2,
  tap: 3,
};

export default function TutorialFlow({ recForDemo, userActionSignals, onClose }: TutorialFlowProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const currentStep = STEPS[stepIdx];

  // 시작 시점 baseline — 각 신호의 "튜토리얼 시작 당시" 값 저장.
  // 단계가 활성일 때 baseline 보다 증가했으면 진행.
  // baseline 도 단계 진입 시점마다 갱신 — 한 단계 통과 후 다음 단계는 그 시점부터의 변동만 인정.
  const baselineRef = useRef<TutorialUserSignals>(userActionSignals);

  // 각 단계 진입 시 baseline 갱신 + step_shown 트래킹
  useEffect(() => {
    baselineRef.current = { ...userActionSignals };
    track("tutorial_step_shown", { step: currentStep });
    // userActionSignals 는 계속 변동하므로 의존성에서 제외 — step 진입 시점에만 baseline 캡처.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  // 신호 변동 → 진행 트리거
  useEffect(() => {
    const baseline = baselineRef.current;
    let triggered = false;
    if (currentStep === "swipe_left" && userActionSignals.leftSwipeCount > baseline.leftSwipeCount) {
      triggered = true;
    } else if (currentStep === "swipe_right" && userActionSignals.rightSwipeCount > baseline.rightSwipeCount) {
      triggered = true;
    } else if (currentStep === "swipe_down" && userActionSignals.saveActionCount > baseline.saveActionCount) {
      triggered = true;
    } else if (currentStep === "tap" && userActionSignals.detailOpenCount > baseline.detailOpenCount) {
      triggered = true;
    }
    if (triggered) {
      const nextIdx = stepIdx + 1;
      if (nextIdx >= STEPS.length) {
        track("tutorial_completed", { steps_completed: STEPS.length });
        onClose("completed", { stepsCompleted: STEPS.length, atStep: currentStep });
      } else {
        setStepIdx(nextIdx);
      }
    }
  }, [userActionSignals, currentStep, stepIdx, onClose]);

  const handleSkip = () => {
    track("tutorial_skipped", { at_step: currentStep });
    onClose("skipped", { stepsCompleted: stepIdx, atStep: currentStep });
  };

  const stepNumberLabel = useMemo(() => `${stepIdx + 1} / ${STEPS.length}`, [stepIdx]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="첫 사용 안내"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        background: "var(--bg-overlay-heavy)",
        // 탭/스와이프 시 dim 자체로 인한 차단을 막기 위해 pointerEvents 는 children 영역만 막고
        // 카드 영역은 통과시키면 되지만, B안 모션 시연 정책상 mock 카드를 dim 위에 띄우므로
        // dim 자체는 클릭 흡수 X — 사용자가 실제 카드(아래)를 만져야 진행되도록 pointer-events-none.
        // 단, 건너뛰기 버튼만 pointer-events 활성.
        pointerEvents: "none",
      }}
    >
      {/* 건너뛰기 — pointer-events 활성 영역. */}
      <div
        className="absolute top-3 right-3"
        style={{ pointerEvents: "auto" }}
      >
        <button
          onClick={handleSkip}
          aria-label="튜토리얼 건너뛰기"
          className="min-w-[44px] min-h-[44px] px-3 text-xs rounded-md active:scale-95 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
          style={{
            color: "var(--text-secondary)",
            fontFamily: "var(--font-body)",
            background: "transparent",
          }}
        >
          건너뛰기
        </button>
      </div>

      {/* 단계 번호 */}
      <div
        aria-hidden="true"
        className="absolute top-5 left-1/2 -translate-x-1/2"
      >
        <span
          className="text-xs"
          style={{
            color: "var(--text-muted)",
            fontFamily: "var(--font-data)",
            letterSpacing: "0.12em",
          }}
        >
          {stepNumberLabel}
        </span>
      </div>

      {/* 단계 본체 — 실습 시 실제 카드 만져야 하므로 데모 컨테이너도 pointer-events-none */}
      <div
        key={currentStep}
        className="animate-coach-enter"
        style={{ pointerEvents: "none" }}
      >
        {currentStep === "swipe_left" && <SwipeLeftDemo recForDemo={recForDemo} />}
        {currentStep === "swipe_right" && <SwipeRightDemo recForDemo={recForDemo} />}
        {currentStep === "swipe_down" && <SwipeDownDemo recForDemo={recForDemo} />}
        {currentStep === "tap" && <TapDemo recForDemo={recForDemo} />}
      </div>

      {/* 진행 도트 — 4단계 진척도 시각화. amber 카운트 1건 (현재 단계 dot). */}
      <div
        aria-hidden="true"
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2"
      >
        {STEPS.map((s) => {
          const idx = STEP_INDEX[s];
          const active = idx === stepIdx;
          const passed = idx < stepIdx;
          return (
            <span
              key={s}
              className="block rounded-full"
              style={{
                width: active ? 18 : 6,
                height: 6,
                background: active
                  ? "var(--accent)"
                  : passed
                  ? "var(--text-muted)"
                  : "var(--border-subtle)",
                transition: "width 200ms var(--ease-detail-morph), background 200ms var(--ease-detail-morph)",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
