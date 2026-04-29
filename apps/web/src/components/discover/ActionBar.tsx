"use client";

import { forwardRef } from "react";
import { IconSave, IconDetail, IconShare, IconRewind, IconRefresh } from "@/components/Icons";
import { easings, durations, cubicBezierCss } from "@neq/design";

interface ActionBarProps {
  isSaved: boolean;
  canRewind: boolean;
  onShare: () => void;
  onOpenDetail: () => void;
  onToggleSave: () => void;
  onRewind: () => void;
  onRefresh: () => void;
  /**
   * save 버튼 강조 상태 (Stage 4 D1, swipe-stack.jsx).
   *  - `flash`: save 직후 번쩍 강조 (accent 배경 + scale 1.15 + glow shadow). 600ms 후 자동 해제 호출자 책임
   *  - `pulling`: 사용자가 카드를 아래로 끌고 있는 중 — save 버튼 살짝 부풀어 흡수 준비 신호
   */
  saveFlash?: boolean;
  savePulling?: boolean;
}

const SPRING_EASING = cubicBezierCss(easings.spring);
const QUICK_MS = durations.quick;

const ActionBar = forwardRef<HTMLButtonElement, ActionBarProps>(function ActionBar(
  {
    isSaved,
    canRewind,
    onShare,
    onOpenDetail,
    onToggleSave,
    onRewind,
    onRefresh,
    saveFlash = false,
    savePulling = false,
  },
  saveBtnRef,
) {
  const saveActive = isSaved || saveFlash || savePulling;
  const saveScale = saveFlash ? 1.15 : savePulling ? 1.05 : 1;

  return (
    <div className="px-4 pb-2 shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <button
            onClick={onRewind}
            disabled={!canRewind}
            aria-label="처음으로"
            className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30"
          >
            <IconRewind size={17} color="var(--text-muted)" />
          </button>
          <button
            onClick={onShare}
            aria-label="공유"
            className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform"
          >
            <IconShare size={17} color="var(--text-muted)" />
          </button>
          <button
            onClick={onOpenDetail}
            aria-label="상세보기"
            className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform"
          >
            <IconDetail size={17} color="var(--text-muted)" />
          </button>
          <button
            onClick={onRefresh}
            aria-label="새로고침"
            className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform"
          >
            <IconRefresh size={17} color="var(--text-muted)" />
          </button>
        </div>
        <button
          ref={saveBtnRef}
          onClick={onToggleSave}
          aria-label="저장"
          className="w-14 h-14 flex items-center justify-center active:scale-90"
          style={{
            background: saveActive ? "var(--accent)" : "var(--surface-raised)",
            borderRadius: "var(--radius-xl)",
            transform: `scale(${saveScale})`,
            transition: `transform ${QUICK_MS}ms ${SPRING_EASING}, background 200ms ease, box-shadow 200ms ease`,
            boxShadow: saveFlash
              ? "0 0 32px rgba(196,163,90,0.6), 0 4px 16px rgba(0,0,0,0.4)"
              : "0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          <IconSave
            size={22}
            color="var(--bg)"
            filled={saveActive}
          />
        </button>
      </div>
    </div>
  );
});

export default ActionBar;
