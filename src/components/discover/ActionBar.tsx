"use client";

import type { Recommendation } from "@/lib/types";
import { IconSave, IconDetail, IconShare } from "@/components/Icons";

interface ActionBarProps {
  current: Recommendation | undefined;
  isSaved: boolean;
  onShare: () => void;
  onOpenDetail: () => void;
  onToggleSave: () => void;
}

export default function ActionBar({
  current,
  isSaved,
  onShare,
  onOpenDetail,
  onToggleSave,
}: ActionBarProps) {
  return (
    <div className="px-4 pb-2 shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <button
            onClick={onShare}
            aria-label="공유"
            className="w-10 h-10 flex items-center justify-center active:scale-90 transition-transform"
          >
            <IconShare size={17} color="var(--text-muted)" />
          </button>
          <button
            onClick={onOpenDetail}
            aria-label="상세보기"
            className="w-10 h-10 flex items-center justify-center active:scale-90 transition-transform"
          >
            <IconDetail size={17} color="var(--text-muted)" />
          </button>
        </div>
        <button
          onClick={onToggleSave}
          aria-label="저장"
          className="w-14 h-14 flex items-center justify-center active:scale-90 transition-transform"
          style={{
            background: isSaved ? "var(--accent)" : "var(--accent)",
            borderRadius: "var(--radius-xl)",
          }}
        >
          <IconSave
            size={22}
            color="var(--bg)"
            filled={isSaved}
          />
        </button>
      </div>
    </div>
  );
}
