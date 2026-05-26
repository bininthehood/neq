"use client";

import { useState } from "react";
import type { SurveyOption, SurveyStepOutput } from "@neq/core";

/**
 * Persona v2 - LLM 분기 질문 한 단계 (design doc 186·191 행).
 *
 * spec:
 * - 세로 리스트 4 옵션, 행 사이 hairline border 만 (카드/그리드/border-radius 금지)
 * - 옵션 = radio mark `●` + label + hint (한 줄씩)
 * - 선택 시 accent color + underline. background fill 금지
 * - min-height 64px (label + hint 두 줄)
 * - 동시 amber 토큰 = 2 (선택 옵션 + CTA). anti-slop #13 통과
 *
 * 부모는 step/totalSteps 로 진행 상태 표시. fallback 여부는 사용자에게 노출 X.
 */

interface Props {
  step: 1 | 2 | 3;
  /** 동적 step 3 진입 시 3, 보통 2. progress 표시용 (state machine 보유 값). */
  totalSteps: 2 | 3;
  output: SurveyStepOutput;
  onAnswer: (selectedOption: SurveyOption) => void;
}

export default function TasteSurveyStep({
  step,
  totalSteps,
  output,
  onAnswer,
}: Props) {
  const [selectedId, setSelectedId] = useState<SurveyOption["id"] | null>(null);

  const submit = () => {
    if (selectedId === null) return;
    const opt = output.options.find((o) => o.id === selectedId);
    if (opt) onAnswer(opt);
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 px-7 pt-8 overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-2">
          <p
            className="font-display italic text-[26px] leading-[1.2] flex-1"
            style={{
              color: "var(--text-primary)",
              letterSpacing: "-0.02em",
            }}
          >
            {output.question}
          </p>
          <span
            className="text-xs tabular-nums shrink-0 mt-2"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-data)",
              letterSpacing: "0.05em",
            }}
            aria-label={`설문 진행 ${step} / ${totalSteps}`}
          >
            {step} / {totalSteps}
          </span>
        </div>

        {output.axisHint ? (
          <p
            className="text-xs mb-7 uppercase tracking-[0.08em]"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-data)",
            }}
          >
            {output.axisHint}
          </p>
        ) : (
          <div className="mb-7" />
        )}

        <ul role="radiogroup" aria-label={output.question} className="flex flex-col">
          {output.options.map((opt, idx) => (
            <li
              key={opt.id}
              style={{
                borderTop: "1px solid var(--border)",
                borderBottom:
                  idx === output.options.length - 1
                    ? "1px solid var(--border)"
                    : undefined,
              }}
            >
              <OptionRow
                option={opt}
                selected={selectedId === opt.id}
                onSelect={() => setSelectedId(opt.id)}
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="px-6 pb-8 pt-3">
        <button
          type="button"
          onClick={submit}
          disabled={selectedId === null}
          aria-disabled={selectedId === null}
          className="w-full py-4 text-base font-semibold rounded-lg transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
          style={{
            background:
              selectedId !== null ? "var(--accent)" : "var(--surface-raised)",
            color: selectedId !== null ? "var(--bg)" : "var(--text-muted)",
            cursor: selectedId !== null ? "pointer" : "default",
          }}
        >
          다음
        </button>
      </div>
    </div>
  );
}

function OptionRow({
  option,
  selected,
  onSelect,
}: {
  option: SurveyOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="w-full text-left flex items-start gap-3 py-3.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
      style={{
        minHeight: 64,
        background: "transparent",
        cursor: "pointer",
      }}
    >
      <span
        className="shrink-0 mt-1 inline-flex items-center justify-center"
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          border: `1.5px solid ${selected ? "var(--accent)" : "var(--border-strong, var(--border))"}`,
        }}
        aria-hidden="true"
      >
        {selected ? (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--accent)",
              display: "block",
            }}
          />
        ) : null}
      </span>
      <span className="flex-1 flex flex-col gap-0.5">
        <span
          className="text-base"
          style={{
            color: selected ? "var(--accent)" : "var(--text-primary)",
            fontWeight: 500,
            textDecoration: selected ? "underline" : "none",
            textUnderlineOffset: "3px",
            textDecorationThickness: "1px",
          }}
        >
          {option.label}
        </span>
        {option.hint ? (
          <span
            className="text-sm"
            style={{ color: "var(--text-muted)", lineHeight: 1.45 }}
          >
            {option.hint}
          </span>
        ) : null}
      </span>
    </button>
  );
}
