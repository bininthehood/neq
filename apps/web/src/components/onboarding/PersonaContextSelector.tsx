"use client";

import { useState } from "react";
import type { PersonaContext } from "@neq/core";

/**
 * Persona v2 - 컨텍스트 선택 step (design doc 185·219 행).
 *
 * 출력: contentType (영화 / 시리즈 / 예능) × companion (혼자 / 같이) → PersonaContext.
 *
 * spec:
 * - pill group (single select), selected = accent, unselected = surface
 * - 동시 amber 토큰 = 2 (선택된 contentType pill + companion toggle). anti-slop #13 통과
 * - 두 그룹 모두 선택돼야 CTA 활성화
 * - 모바일 autoFocus 금지 (DESIGN.md)
 */

interface Props {
  onNext: (context: PersonaContext) => void;
  initial?: Partial<PersonaContext>;
}

const CONTENT_LABELS: Array<{
  value: PersonaContext["contentType"];
  label: string;
}> = [
  { value: "movie", label: "영화" },
  { value: "series", label: "시리즈" },
  { value: "variety", label: "예능" },
];

const COMPANION_LABELS: Array<{
  value: PersonaContext["companion"];
  label: string;
}> = [
  { value: "alone", label: "혼자" },
  { value: "together", label: "같이" },
];

export default function PersonaContextSelector({ onNext, initial }: Props) {
  const [contentType, setContentType] = useState<
    PersonaContext["contentType"] | null
  >(initial?.contentType ?? null);
  const [companion, setCompanion] = useState<
    PersonaContext["companion"] | null
  >(initial?.companion ?? null);

  const ready = contentType !== null && companion !== null;

  const submit = () => {
    if (!ready) return;
    onNext({ contentType, companion });
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 px-7 pt-8">
        <p
          className="font-display italic text-[26px] leading-[1.2] mb-2"
          style={{
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
          }}
        >
          어떤 페르소나를 만들까요?
        </p>
        <p
          className="text-sm mb-10"
          style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}
        >
          기분이나 상황에 따라 따로 가질 수 있어요
        </p>

        <PillGroupLabel>콘텐츠 유형</PillGroupLabel>
        <div
          role="radiogroup"
          aria-label="콘텐츠 유형"
          className="flex flex-wrap gap-2 mb-8"
        >
          {CONTENT_LABELS.map((opt) => {
            const selected = contentType === opt.value;
            return (
              <Pill
                key={opt.value}
                selected={selected}
                onClick={() => setContentType(opt.value)}
                ariaLabel={opt.label}
              >
                {opt.label}
              </Pill>
            );
          })}
        </div>

        <PillGroupLabel>같이 보나요?</PillGroupLabel>
        <div
          role="radiogroup"
          aria-label="시청 동반자"
          className="flex flex-wrap gap-2"
        >
          {COMPANION_LABELS.map((opt) => {
            const selected = companion === opt.value;
            return (
              <Pill
                key={opt.value}
                selected={selected}
                onClick={() => setCompanion(opt.value)}
                ariaLabel={opt.label}
              >
                {opt.label}
              </Pill>
            );
          })}
        </div>
      </div>

      <div className="px-6 pb-8 pt-3">
        <button
          type="button"
          onClick={submit}
          disabled={!ready}
          aria-disabled={!ready}
          className="w-full py-4 text-base font-semibold rounded-lg transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
          style={{
            background: ready ? "var(--accent)" : "var(--surface-raised)",
            color: ready ? "var(--bg)" : "var(--text-muted)",
            cursor: ready ? "pointer" : "default",
          }}
        >
          다음
        </button>
      </div>
    </div>
  );
}

function PillGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-sm mb-3"
      style={{
        color: "var(--text-secondary)",
        fontWeight: 500,
        letterSpacing: "-0.005em",
      }}
    >
      {children}
    </p>
  );
}

function Pill({
  selected,
  onClick,
  ariaLabel,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={ariaLabel}
      onClick={onClick}
      className="px-5 py-2.5 rounded-full text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
      style={{
        background: selected ? "var(--accent)" : "var(--surface)",
        color: selected ? "var(--bg)" : "var(--text-primary)",
        border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        fontWeight: 500,
        minHeight: 44,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
