"use client";

import type { SurveySummaryOutput } from "@neq/core";

/**
 * Persona v2 - 통합 요약 preview (design doc 133·259 행).
 *
 * spec:
 * - tasteSummary 자연어 3-5 문장을 Instrument Serif italic + accent-border 인용 형식으로 표시
 * - axes 도 muted text 로 함께 노출 (디버깅·신뢰감)
 * - CTA 2종: "맞아요" (primary accent) / "다시 받기" (secondary outline)
 * - "다시 받기" 가 destructive 가 아니므로 accent 없음 (anti-slop #13 가드)
 *
 * 호출처: PersonaSurveyController 가 summarize 완료 후 mount.
 */

interface Props {
  summary: SurveySummaryOutput;
  /** "맞아요" 선택. PersonaSurveyController 가 createPersona / first recommend 진입. */
  onAccept: () => void;
  /** "다시 받기" 선택. controller 가 step 2 부터 재진입 (prevAnswers 유지). */
  onRetry: () => void;
}

export default function TasteSummaryPreview({
  summary,
  onAccept,
  onRetry,
}: Props) {
  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 px-7 pt-8 overflow-y-auto">
        <p
          className="font-display italic text-[26px] leading-[1.2] mb-2"
          style={{
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
          }}
        >
          이런 분이시군요
        </p>
        <p
          className="text-sm mb-7"
          style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}
        >
          맞으면 그대로, 아니면 다시 받을게요
        </p>

        <blockquote
          className="font-display italic px-5 py-5 mb-6"
          style={{
            borderLeft: "2px solid var(--accent)",
            background: "var(--accent-dim)",
            color: "var(--text-primary)",
            fontSize: 17,
            lineHeight: 1.6,
            letterSpacing: "-0.01em",
          }}
        >
          {summary.tasteSummary}
        </blockquote>

        {summary.axes.length > 0 ? (
          <dl className="flex flex-col gap-2.5">
            {summary.axes.map((axis, idx) => (
              <div
                key={`${axis.name}-${idx}`}
                className="flex items-baseline gap-3"
                style={{
                  borderTop:
                    idx === 0 ? "1px solid var(--border)" : undefined,
                  paddingTop: idx === 0 ? 14 : 0,
                }}
              >
                <dt
                  className="text-xs uppercase tracking-[0.08em] shrink-0"
                  style={{
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-data)",
                    minWidth: 96,
                  }}
                >
                  {axis.name}
                </dt>
                <dd
                  className="text-sm"
                  style={{ color: "var(--text-secondary)", fontWeight: 500 }}
                >
                  {axis.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      <div className="px-6 pb-8 pt-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={onAccept}
          className="w-full py-4 text-base font-semibold rounded-lg transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
          style={{
            background: "var(--accent)",
            color: "var(--bg)",
            cursor: "pointer",
          }}
        >
          맞아요
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="w-full py-3 text-sm rounded-md transition-transform active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
          style={{
            color: "var(--text-secondary)",
            background: "transparent",
            border: "1px solid var(--border)",
          }}
        >
          다시 받기
        </button>
      </div>
    </div>
  );
}
