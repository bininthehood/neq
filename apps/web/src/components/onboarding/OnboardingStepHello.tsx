"use client";

import { useState } from "react";

/**
 * Onboarding V2 — Step 2: Hello (닉네임/사용자 호칭).
 *
 * 디자인 산출물 StepIntro 매핑. 빈 값 허용 (선택). 입력 없으면 "건너뛰기" 라벨로 진행.
 *
 * 저장 위치:
 *  - LocalStorage `neq_user_nickname` (단순 문자열). 기존 store/account-prefs 변경 X.
 *  - 비어있으면 키 자체를 제거.
 *
 * 부모는 onNext(nickname?) 으로 라우팅 처리. nickname 은 빈 문자열일 수도 있음.
 */

const NICKNAME_KEY = "neq_user_nickname";

export function getUserNickname(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(NICKNAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setUserNickname(name: string): void {
  if (typeof window === "undefined") return;
  try {
    if (name.trim().length === 0) {
      localStorage.removeItem(NICKNAME_KEY);
    } else {
      localStorage.setItem(NICKNAME_KEY, name.trim());
    }
  } catch {
    /* quota: 무시 */
  }
}

interface Props {
  onNext: (nickname: string) => void;
  initialName?: string;
}

export default function OnboardingStepHello({ onNext, initialName = "" }: Props) {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();
  const hasValue = trimmed.length > 0;

  const submit = () => {
    setUserNickname(trimmed);
    onNext(trimmed);
  };

  const skip = () => {
    setUserNickname(""); // 명시적 비움
    onNext("");
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
          먼저, 어떻게 부를까요?
        </p>
        <p
          className="text-sm mb-8"
          style={{
            color: "var(--text-secondary)",
            lineHeight: 1.55,
          }}
        >
          리포트와 추천 메시지에 사용해요
        </p>

        {/* 입력 필드 */}
        <div
          className="px-4 py-3 rounded-lg"
          style={{
            background: "var(--surface)",
            border: `1px solid ${hasValue ? "var(--accent-border-light)" : "var(--border)"}`,
            transition: "border-color var(--duration-quick, 150ms) var(--ease-move, ease)",
          }}
        >
          <div
            className="text-[9px] uppercase tracking-[0.1em] mb-1"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-data)",
            }}
          >
            Name · 이름
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && hasValue) submit(); }}
            placeholder="예: 민지"
            maxLength={24}
            autoFocus
            className="w-full bg-transparent border-none outline-none text-lg font-medium p-0"
            style={{ color: "var(--text-primary)" }}
          />
        </div>

        {/* 미리보기 */}
        <div
          className="mt-6 px-4 py-3 rounded-lg font-display italic text-[15px]"
          style={{
            background: "var(--accent-dim)",
            color: "var(--text-primary)",
            lineHeight: 1.5,
          }}
        >
          “{hasValue ? trimmed : "○○○"} 님, 이번 주 한 편 어떠세요?”
        </div>
      </div>

      {/* CTA + 건너뛰기 */}
      <div className="px-6 pb-8 pt-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!hasValue}
          className="w-full py-4 text-base font-semibold rounded-lg transition-transform active:scale-[0.98]"
          style={{
            background: hasValue ? "var(--accent)" : "var(--surface-raised)",
            color: hasValue ? "var(--bg)" : "var(--text-muted)",
            cursor: hasValue ? "pointer" : "default",
          }}
        >
          다음
        </button>
        <button
          type="button"
          onClick={skip}
          className="w-full py-3 text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          건너뛰기
        </button>
      </div>
    </div>
  );
}
