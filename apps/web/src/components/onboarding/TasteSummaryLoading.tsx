"use client";

/**
 * LLM 통합 요약 호출 대기 화면 (Persona v2 - PR 2-b).
 *
 * spec (design doc 184·239 행):
 * - Instrument Serif italic 한 줄 카피
 * - spinner 금지 (Quiet Ink anti-slop). 4 line skeleton 으로 진행 암시
 * - `aria-busy="true"` 컨테이너 + 자식 `aria-hidden`
 *
 * 호출처: `PersonaSurveyController` 가 fetchSurveySummary 진행 중일 때 mount.
 */

interface Props {
  /** "당신의 취향을 그리는 중" 외 다른 문구 (테스트/재요약 등) 가능. */
  message?: string;
}

const DEFAULT_MESSAGE = "당신의 취향을 그리는 중";

export default function TasteSummaryLoading({
  message = DEFAULT_MESSAGE,
}: Props) {
  return (
    <div
      className="flex-1 flex flex-col px-7 pt-12"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <p
        className="font-display italic text-[26px] leading-[1.2] mb-10"
        style={{
          color: "var(--text-primary)",
          letterSpacing: "-0.02em",
        }}
      >
        {message}
      </p>

      <div className="flex flex-col gap-3" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-3 rounded-full skeleton-bar"
            style={{
              background: "var(--accent-dim)",
              width: i === 3 ? "60%" : "100%",
              opacity: 0.65,
              animationDelay: `${i * 120}ms`,
            }}
          />
        ))}
      </div>

      <style jsx>{`
        .skeleton-bar {
          animation: skeleton-pulse 1400ms ease-in-out infinite;
        }
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 0.8; }
        }
        @media (prefers-reduced-motion: reduce) {
          .skeleton-bar { animation: none; opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
