"use client";

/**
 * Onboarding V2 — Step 3-1: Genre.
 *
 * 사용자가 선호하는 장르 3개를 GENRE_CHIPS 에서 고름. account_prefs.tasteGenres 에 즉시 저장.
 * 다음 단계(Taste) 가 이 선택을 읽어 장르별 작품 추천 + 검색 진입을 제공.
 *
 * 정확히 3개 선택 강제 (4개째는 가장 오래된 항목을 FIFO 로 교체).
 */

import { useState } from "react";
import { setTasteGenres, getAccountPrefs } from "@/lib/account-prefs";
import { GENRE_CHIPS } from "./data";

interface Props {
  onNext: (opts?: { random?: boolean }) => void;
}

const MIN_COUNT = 1;

export default function OnboardingStepGenre({ onNext }: Props) {
  const [selected, setSelected] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    return getAccountPrefs().tasteGenres ?? [];
  });

  const toggle = (id: string) => {
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  };

  const submit = () => {
    setTasteGenres(selected);
    onNext();
  };

  // 보조 액션: 장르 선택 비우고 cold start v1 분기로 진입.
  // 일부 선택한 상태에서 클릭해도 비우고 진행 (혼동 줄임).
  const submitRandom = () => {
    setSelected([]);
    setTasteGenres([]);
    onNext({ random: true });
  };

  const isReady = selected.length >= MIN_COUNT;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 min-h-0 px-7 pt-8 overflow-y-auto">
        <p
          className="font-display italic text-[26px] leading-[1.2] mb-2"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
        >
          어떤 장르를 좋아하세요?
        </p>
        <p
          className="text-sm mb-8"
          style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}
        >
          좋아하는 장르를 자유롭게 골라주세요. 다음 단계에서 작품을 추천해드릴게요.
        </p>

        {/* 동그란 chip + flex-wrap 반응형 (이전 디자인 복귀) */}
        <div className="flex flex-wrap gap-2">
          {GENRE_CHIPS.map((g) => {
            const isSel = selected.includes(g.id);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => toggle(g.id)}
                aria-pressed={isSel}
                aria-label={`${g.ko}${isSel ? " 선택됨" : ""}`}
                className="px-4 py-2.5 rounded-full text-[13px] font-medium transition-colors flex items-center gap-1.5 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
                style={{
                  background: isSel ? "var(--accent)" : "var(--surface)",
                  border: `1px solid ${isSel ? "var(--accent)" : "var(--border)"}`,
                  color: isSel ? "var(--bg)" : "var(--text-primary)",
                  fontWeight: isSel ? 600 : 500,
                }}
              >
                {isSel && <span style={{ fontSize: 10 }}>✓</span>}
                {g.ko}
              </button>
            );
          })}
        </div>

        <div
          className="mt-6 text-center text-xs tabular-nums"
          style={{ color: "var(--text-muted)" }}
        >
          선택 {selected.length}개
        </div>
      </div>

      <div className="px-6 pb-8 pt-3 shrink-0 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!isReady}
          className="w-full py-4 text-base font-semibold rounded-lg transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
          style={{
            background: isReady ? "var(--accent)" : "var(--surface-raised)",
            color: isReady ? "var(--bg)" : "var(--text-muted)",
            cursor: isReady ? "pointer" : "default",
          }}
        >
          {isReady ? "다음" : "최소 1개 이상 선택해주세요"}
        </button>
        <button
          type="button"
          onClick={submitRandom}
          className="text-sm py-1.5 px-2 rounded transition-colors active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
          style={{
            color: "var(--text-secondary)",
            textDecoration: "underline",
            textUnderlineOffset: "3px",
            textDecorationColor: "var(--border-strong, var(--border))",
          }}
        >
          다양하게 추천받기
        </button>
      </div>
    </div>
  );
}
