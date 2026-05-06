"use client";

import { useState } from "react";
import Image from "next/image";
import { OTT_OPTIONS } from "./data";
import { setSubscribedOtt } from "@/lib/account-prefs";
import { getOTTIcon } from "@/lib/ott-links";

// OTT_OPTIONS.id → providers 객체 키 매핑 (이름 형식 차이 보정).
// providers 정의: packages/core/src/ott.ts. 매칭 안 되면 short text 폴백.
const OTT_ICON_LOOKUP: Record<string, string> = {
  netflix: "Netflix",
  tving: "TVING",
  wavve: "wavve",
  watcha: "Watcha",
  disney: "Disney Plus",
  apple: "Apple TV Plus",
  coupang: "Coupang Play",
};

/**
 * Onboarding V2 — Step 4: OTT.
 *
 * 사용자가 구독 중인 OTT 를 선택. 결과는 TMDB provider id 배열로
 * `account_prefs.subscribedOtt` 에 저장. LLM 입력에서 약한 신호로 사용.
 *
 * 디자인 산출물 StepOTT 매핑.
 *
 * 진행 조건: 1개 이상 선택 (디자인 산출물과 동일).
 *  - "구독 중 없음" 옵션은 별도 secondary 버튼 (미선택 진행).
 */

interface Props {
  onNext: () => void;
  initialProviders?: number[];
}

export default function OnboardingStepOTT({ onNext, initialProviders = [] }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set(initialProviders));

  const toggle = (providerId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  };

  const submit = () => {
    setSubscribedOtt(Array.from(selected));
    onNext();
  };

  const skip = () => {
    setSubscribedOtt([]);
    onNext();
  };

  const hasSelection = selected.size > 0;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-7 pt-6 shrink-0">
        <p
          className="font-display italic text-[26px] leading-[1.2] mb-2"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
        >
          어디서 보세요?
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}>
          구독 중인 OTT를 알려 주시면<br />지금 바로 볼 수 있는 작품만 추천해요
        </p>
      </div>

      {/* OTT 리스트 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-7 pt-5 pb-4">
        <div className="flex flex-col gap-2">
          {OTT_OPTIONS.map((o) => {
            const on = selected.has(o.providerId);
            const lookupName = OTT_ICON_LOOKUP[o.id];
            const iconUrl = lookupName ? getOTTIcon(lookupName) : null;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.providerId)}
                className="flex items-center gap-3 px-3 py-3 rounded-lg transition-colors active:scale-[0.99]"
                style={{
                  background: on ? "var(--surface-raised)" : "var(--surface)",
                  border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                {iconUrl ? (
                  <div
                    className="w-9 h-9 rounded-md flex items-center justify-center overflow-hidden"
                    style={{ background: "var(--surface-raised)", flexShrink: 0 }}
                  >
                    <Image
                      src={iconUrl}
                      alt={o.name}
                      width={28}
                      height={28}
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div
                    className="w-9 h-9 rounded-md flex items-center justify-center text-[13px] font-bold"
                    style={{ background: o.color, color: "#fff", flexShrink: 0 }}
                  >
                    {o.short}
                  </div>
                )}
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {o.name}
                  </div>
                </div>
                <div
                  className="w-[22px] h-[22px] rounded-full flex items-center justify-center"
                  style={{
                    background: on ? "var(--accent)" : "transparent",
                    border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`,
                    color: "var(--bg)",
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  {on ? "✓" : ""}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <div className="px-6 pb-8 pt-3 shrink-0 flex flex-col gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!hasSelection}
          className="w-full py-4 text-base font-semibold rounded-lg transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
          style={{
            background: hasSelection ? "var(--accent)" : "var(--surface-raised)",
            color: hasSelection ? "var(--bg)" : "var(--text-muted)",
            cursor: hasSelection ? "pointer" : "default",
          }}
        >
          다음
        </button>
        <button
          type="button"
          onClick={skip}
          className="w-full py-3 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2 rounded-md"
          style={{ color: "var(--text-secondary)" }}
        >
          구독 중인 OTT 없음 / 나중에 설정
        </button>
      </div>
    </div>
  );
}
