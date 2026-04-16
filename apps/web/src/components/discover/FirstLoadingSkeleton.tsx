"use client";

import { useEffect, useState } from "react";
import BottomNav from "@/components/BottomNav";

const MESSAGES = [
  "취향을 분석하고 있어요…",
  "숨겨진 명작을 찾는 중이에요…",
  "당신에게 꼭 맞는 작품을 고르고 있어요…",
  "거의 다 왔어요…",
];

/**
 * 첫 추천 로드 중 표시되는 가벼운 스켈레톤 + 회전 메시지.
 * 온보딩 직후 LLM 큐레이션(~15초) 동안 사용자에게 진행감을 제공.
 */
export default function FirstLoadingSkeleton() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setMessageIndex((i) => (i + 1) % MESSAGES.length);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        {/* 카드 스켈레톤 */}
        <div
          className="w-full max-w-[360px] aspect-[2/3] rounded-xl overflow-hidden relative"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            className="absolute inset-0 animate-pulse"
            style={{
              background:
                "linear-gradient(135deg, var(--surface) 0%, var(--surface-raised) 50%, var(--surface) 100%)",
            }}
          />
        </div>

        {/* 회전 메시지 */}
        <p
          key={messageIndex}
          className="mt-8 text-sm text-center animate-fade-in"
          style={{ color: "var(--text-secondary)" }}
        >
          {MESSAGES[messageIndex]}
        </p>
        <p
          className="mt-2 text-xs text-center"
          style={{ color: "var(--text-muted)" }}
        >
          첫 추천은 조금 시간이 걸려요
        </p>
      </div>

      <BottomNav active="discover" />
    </div>
  );
}
