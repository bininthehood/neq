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
      <div className="flex items-center justify-end">
        <div className="flex gap-2">
          <button
            onClick={onShare}
            aria-label="공유"
            className="w-12 h-12 flex items-center justify-center active:scale-90 transition-transform rounded-full"
            style={{
              background: "transparent",
              border: "1px solid var(--accent-border)",
            }}
          >
            <IconShare size={18} color="var(--accent)" />
          </button>
          <button
            onClick={onOpenDetail}
            aria-label="상세보기"
            className="w-12 h-12 flex items-center justify-center active:scale-90 transition-transform rounded-full"
            style={{
              background: "transparent",
              border: "1px solid var(--accent-border)",
            }}
          >
            <IconDetail size={18} color="var(--accent)" />
          </button>
          <button
            onClick={onToggleSave}
            aria-label="저장"
            className="w-12 h-12 flex items-center justify-center active:scale-90 transition-transform"
            style={{
              background: isSaved ? "var(--accent-dim)" : "var(--surface)",
              border: `1px solid ${isSaved ? "var(--accent-border)" : "var(--border)"}`,
              borderRadius: "var(--radius-full)",
            }}
          >
            <IconSave
              size={20}
              color={isSaved ? "var(--accent)" : "var(--text-muted)"}
              filled={isSaved}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
