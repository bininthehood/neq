"use client";

/**
 * Onboarding V2 — Step 1: Welcome.
 *
 * 디자인 산출물 `neko-onboarding.jsx` StepWelcome 매핑.
 * 로고 + intro 카피 + "시작하기" CTA. 데이터 입력 없음.
 */

interface Props {
  onNext: () => void;
}

export default function OnboardingStepWelcome({ onNext }: Props) {
  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        {/* 시각적 hero — 로고 라지 */}
        <img
          src="/neq-logo.png"
          alt="neq,"
          className="h-16 object-contain mb-8"
        />

        <p
          className="font-display italic text-[28px] leading-[1.15]"
          style={{
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
          }}
        >
          오늘의 한 편을<br />고르는 시간
        </p>

        <p
          className="text-sm mt-3 max-w-[280px]"
          style={{
            color: "var(--text-secondary)",
            lineHeight: 1.6,
          }}
        >
          알고리즘 대신, 큐레이션.<br />
          당신의 취향에 맞춰 매일 한 작품씩.
        </p>
      </div>

      {/* CTA */}
      <div className="px-6 pb-8 pt-3">
        <button
          type="button"
          onClick={onNext}
          className="w-full py-4 text-base font-semibold rounded-lg transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
          style={{
            background: "var(--accent)",
            color: "var(--bg)",
          }}
        >
          시작하기
        </button>
      </div>
    </div>
  );
}
