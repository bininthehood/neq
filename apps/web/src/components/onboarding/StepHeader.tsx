"use client";

/**
 * Onboarding V2 (D4a) 공통 헤더.
 *
 * 구성:
 *  - "neq," 워드마크 이미지 정본 (`/neq-logo.png`, DESIGN.md Brand Identity)
 *  - 진행률 bar (1/5 ~ 5/5) — 디자인 산출물 StepProgress 패턴
 *  - 뒤로가기 버튼 (1단계 제외)
 *
 * 모든 시각 토큰 = `var(--accent)` / `var(--border)` / `var(--surface)`.
 * 직접 hex/px 사용 X.
 */

interface StepHeaderProps {
  current: number;          // 0..4
  total: number;            // 5
  onBack?: () => void;      // current === 0 이면 부모가 undefined 전달
}

export default function StepHeader({ current, total, onBack }: StepHeaderProps) {
  const showBack = current > 0 && onBack;
  return (
    <div className="shrink-0 px-6 pt-5 pb-3">
      {/* 1행: 뒤로가기 + 로고 + 진행 라벨 */}
      <div className="flex items-center justify-between min-h-[32px]">
        {showBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="이전 단계"
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>‹</span>
          </button>
        ) : (
          <div className="w-8 h-8" aria-hidden="true" />
        )}

        <img
          src="/neq-logo.png"
          alt="neq,"
          className="h-6 object-contain"
        />

        <div
          className="text-xs tabular-nums"
          style={{
            color: "var(--text-muted)",
            fontFamily: "var(--font-data)",
            letterSpacing: "0.05em",
            minWidth: 32,
            textAlign: "right",
          }}
        >
          {current + 1} / {total}
        </div>
      </div>

      {/* 2행: 진행률 bar (5세그먼트) */}
      <div className="flex gap-1.5 mt-4" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={current + 1}>
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className="flex-1 h-[3px] rounded-full"
            style={{
              background: i <= current ? "var(--accent)" : "var(--border)",
              opacity: i < current ? 0.7 : 1,
              transition: "background var(--duration-quick, 150ms) var(--ease-move, cubic-bezier(0.45, 0, 0.55, 1)), opacity var(--duration-quick, 150ms) var(--ease-move, cubic-bezier(0.45, 0, 0.55, 1))",
            }}
          />
        ))}
      </div>
    </div>
  );
}
