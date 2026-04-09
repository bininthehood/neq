"use client";

interface TutorialOverlayProps {
  onDismiss: () => void;
}

export default function TutorialOverlay({ onDismiss }: TutorialOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center animate-fade-in bg-overlay-dense"
      onClick={onDismiss}
    >
      <div className="flex flex-col items-start gap-6 px-8 max-w-[320px]">
        <div className="flex gap-10 w-full">
          {[
            ["\u2190", "다음 작품"],
            ["\u2192", "이전 작품"],
            ["\u2193", "봤어요? / 관심 없어요"],
          ].map(([icon, label]) => (
            <div key={label} className="flex flex-col items-center gap-1.5">
              <div className="text-[1.75rem] text-foreground">{icon}</div>
              <span className="text-xs font-medium text-secondary">
                {label}
              </span>
            </div>
          ))}
        </div>
        <div>
          <p className="text-sm text-secondary">
            카드를 탭하면 상세보기
          </p>
        </div>
        <p className="text-xs text-muted">아무 곳이나 탭하면 닫힘</p>
      </div>
    </div>
  );
}
