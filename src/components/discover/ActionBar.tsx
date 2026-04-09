"use client";

import type { Recommendation } from "@/lib/types";
import { IconSave, IconDetail, IconShare } from "@/components/Icons";

interface ActionBarProps {
  current: Recommendation | undefined;
  topIdx: number;
  filtered: Recommendation[];
  isSaved: boolean;
  onShare: () => void;
  onOpenDetail: () => void;
  onToggleSave: () => void;
}

export default function ActionBar({
  current,
  topIdx,
  filtered,
  isSaved,
  onShare,
  onOpenDetail,
  onToggleSave,
}: ActionBarProps) {
  return (
    <div className="px-4 pb-2 shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5 flex-1 mr-3 items-center justify-center">
          {filtered.map((_, i) => (
            <div
              key={i}
              className="transition-all"
              style={{
                width: i === topIdx ? 16 : 6,
                height: 6,
                background:
                  i === topIdx
                    ? "var(--accent)"
                    : i < topIdx
                      ? "var(--text-muted)"
                      : "var(--border)",
                borderRadius: "var(--radius-full)",
              }}
            />
          ))}
        </div>
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
