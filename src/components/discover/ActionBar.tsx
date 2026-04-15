"use client";

import { IconSave, IconDetail, IconShare, IconRewind, IconRefresh } from "@/components/Icons";

interface ActionBarProps {
  isSaved: boolean;
  canRewind: boolean;
  onShare: () => void;
  onOpenDetail: () => void;
  onToggleSave: () => void;
  onRewind: () => void;
  onRefresh: () => void;
}

export default function ActionBar({
  isSaved,
  canRewind,
  onShare,
  onOpenDetail,
  onToggleSave,
  onRewind,
  onRefresh,
}: ActionBarProps) {
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
          onClick={onToggleSave}
          aria-label="저장"
          className="w-14 h-14 flex items-center justify-center active:scale-90 transition-transform"
          style={{
            background: isSaved ? "var(--accent)" : "var(--surface-raised)",
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
