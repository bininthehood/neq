"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { getOTTIcon } from "@neq/core";
import { OTT_OPTIONS } from "@/components/onboarding/data";
import { getAccountPrefs, setSubscribedOtt } from "@/lib/account-prefs";
import { track } from "@/lib/analytics";

// 2026-06-15 (build 27 follow-up) — native Profile 의 "구독 OTT" 섹션 web 정합 이식.
// 데이터 레이어: account-prefs 의 getAccountPrefs / setSubscribedOtt 재사용.
// 시각 패턴: web `OnboardingStepOTT.tsx` 의 row 패턴과 픽셀 정확 일치 (radius/padding/spacing).
// 토글 즉시 저장 (디바운스 X) — AsyncStorage 등가 localStorage 단일 키 갱신 < 10ms.
// onboarding step 9 ↔ Profile 컨텍스트 분기:
//   - onboarding: "다음" + "나중에 설정" CTA / Profile: CTA 없이 즉시 저장.
//   - onboarding 카피: "지금 보실 수 있는 작품만 추천해요" (확정적, 약속)
//   - Profile 카피: "추천에 살짝 반영해요" (현실, 약한 신호 — recommend.ts:216 정합)

const OTT_ICON_LOOKUP: Record<string, string> = {
  netflix: "Netflix",
  tving: "TVING",
  wavve: "wavve",
  watcha: "Watcha",
  disneyplus: "Disney Plus",
  appletv: "Apple TV+",
  coupangplay: "Coupang Play",
};

export default function SubscribedOttSection() {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    const prefs = getAccountPrefs();
    const initial = (prefs.subscribedOtt ?? []).filter((id) => {
      // comingSoon 자동 제외 (native profile.tsx:154 정합).
      const o = OTT_OPTIONS.find((opt) => opt.providerId === id);
      return o && !o.comingSoon;
    });
    setSelected(new Set(initial));
  }, []);

  const toggle = (providerId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const willEnable = !next.has(providerId);
      if (willEnable) next.add(providerId);
      else next.delete(providerId);
      const arr = Array.from(next);
      setSubscribedOtt(arr);
      track("profile_ott_toggled", {
        provider_id: providerId,
        on: willEnable,
        total_selected: arr.length,
      });
      return next;
    });
  };

  return (
    <section className="px-5 mb-6">
      <h2 className="text-xs uppercase tracking-wider text-muted font-semibold mb-2">
        구독 OTT
      </h2>
      <p
        className="text-xs mb-3"
        style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}
      >
        구독 중인 OTT를 알려 주시면 추천에 살짝 반영해요
      </p>
      <div className="flex flex-col gap-2">
        {OTT_OPTIONS.map((o) => {
          const on = selected.has(o.providerId);
          const isComingSoon = o.comingSoon === true;
          const lookupName = OTT_ICON_LOOKUP[o.id];
          const iconUrl = lookupName ? getOTTIcon(lookupName) : null;
          return (
            <button
              key={o.id}
              type="button"
              disabled={isComingSoon}
              role="switch"
              aria-checked={on}
              aria-disabled={isComingSoon}
              aria-label={
                isComingSoon
                  ? `${o.name} (곧 지원)`
                  : `${o.name} ${on ? "구독 중" : "구독 안 함"}`
              }
              onClick={() => {
                if (isComingSoon) return;
                toggle(o.providerId);
              }}
              className="flex items-center gap-3 px-3 py-3 rounded-lg transition-colors active:scale-[0.99]"
              style={{
                background: on ? "var(--surface-raised)" : "var(--surface)",
                border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                opacity: isComingSoon ? 0.5 : 1,
                cursor: isComingSoon ? "default" : "pointer",
              }}
            >
              {iconUrl ? (
                <div
                  className="w-9 h-9 rounded-md flex items-center justify-center overflow-hidden"
                  style={{
                    background: "var(--surface-raised)",
                    flexShrink: 0,
                  }}
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
                <div
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {o.name}
                </div>
              </div>
              {isComingSoon ? (
                <div
                  className="text-[11px] font-medium"
                  style={{ color: "var(--text-muted)", flexShrink: 0 }}
                >
                  곧 지원
                </div>
              ) : (
                <div
                  className="w-[22px] h-[22px] rounded-full flex items-center justify-center"
                  style={{
                    background: on ? "var(--accent)" : "transparent",
                    border: `1.5px solid ${
                      on ? "var(--accent)" : "var(--border)"
                    }`,
                    flexShrink: 0,
                  }}
                >
                  {on && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden
                    >
                      <polyline
                        points="5 13 10 18 19 7"
                        stroke="var(--bg)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
