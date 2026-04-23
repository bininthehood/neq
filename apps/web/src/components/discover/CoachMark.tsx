"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";

export type CoachStep = "swipe" | "save" | "persona";

interface CoachMarkProps {
  step: CoachStep;
  /** 해당 step이 이미 완료된 상태면 false로 전달해 렌더 스킵 */
  active: boolean;
  /** 외부 액션(스와이프/저장/페르소나 탭)이 발생했을 때 true로 바꿔 dismiss */
  completedByAction?: boolean;
  /** dismiss 시 호출. localStorage 플래그 설정과 v2 완료 판단은 부모가 담당 */
  onDismiss: (step: CoachStep, via: "action" | "timeout") => void;
}

const COPY: Record<CoachStep, string> = {
  swipe: "왼쪽으로 밀면 다음 작품이 나와요",
  save: "마음에 들면 저장해두세요",
  persona: "취향을 나눠서 관리할 수 있어요",
};

const AUTO_DISMISS_MS: Record<CoachStep, number> = {
  swipe: 5000,
  save: 3000,
  persona: 3000,
};

export default function CoachMark({ step, active, completedByAction, onDismiss }: CoachMarkProps) {
  const [visible, setVisible] = useState(active);
  const shownRef = useRef(false);

  useEffect(() => {
    if (!active || shownRef.current) return;
    shownRef.current = true;
    setVisible(true);
    track("coach_shown", { step });

    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss(step, "timeout");
      track("coach_completed", { step, via: "timeout" });
    }, AUTO_DISMISS_MS[step]);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step]);

  useEffect(() => {
    if (!visible || !completedByAction) return;
    setVisible(false);
    onDismiss(step, "action");
    track("coach_completed", { step, via: "action" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedByAction, visible, step]);

  if (!active || !visible) return null;

  // 위치: swipe는 화면 하단 중앙, save는 ActionBar 위, persona는 헤더 아래
  const position =
    step === "swipe"
      ? "bottom-28 left-1/2 -translate-x-1/2"
      : step === "save"
      ? "bottom-28 left-1/2 -translate-x-1/2"
      : "top-16 left-1/2 -translate-x-1/2";

  const label =
    step === "swipe" ? "←" : step === "save" ? "♡" : "↓";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed ${position} z-30 pointer-events-none animate-coach-enter`}
    >
      <div
        className="flex items-center gap-2 px-4 py-2.5 rounded-full"
        style={{
          background: "var(--bg-overlay-dense)",
          border: "1px solid var(--accent-border)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <span
          className="text-sm font-medium"
          style={{ color: "var(--accent)" }}
          aria-hidden="true"
        >
          {label}
        </span>
        <span className="text-sm text-secondary whitespace-nowrap">
          {COPY[step]}
        </span>
      </div>
    </div>
  );
}
