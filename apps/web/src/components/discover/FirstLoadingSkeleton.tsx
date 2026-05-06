"use client";

import { useEffect, useState } from "react";
import { Illust, NeqSpinner } from "@neq/design";

const MESSAGES = [
  "취향을 분석하고 있어요…",
  "숨겨진 명작을 찾는 중이에요…",
  "당신에게 꼭 맞는 작품을 고르고 있어요…",
  "거의 다 왔어요…",
];

/**
 * 첫 추천 로드 중 표시되는 가벼운 진행 화면.
 * 온보딩 직후 LLM 큐레이션(~15초) 동안 사용자에게 진행감을 제공.
 *
 * D9 통합 (Option A — calibrating 일러 노출):
 *  - 중심: <Illust name="calibrating"> + <NeqSpinner size="lg">
 *  - 보조: 회전 메시지 (3초마다 다음 메시지)
 *  - Skeleton 카드 자리는 D11 NeqSpinner로 대체. 첫 진입의 의도 = "취향 분석 중"이라는 신호 → 일러가 더 명확.
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
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">
        <Illust
          name="calibrating"
          style="editorial"
          size="lg"
          aria-label="추천을 준비하고 있어요"
        />
        <NeqSpinner size="lg" label="첫 추천 로딩 중" />

        {/* 회전 메시지 */}
        <div className="flex flex-col items-center gap-1">
          <p
            key={messageIndex}
            className="text-sm text-center animate-fade-in"
            style={{ color: "var(--text-secondary)" }}
          >
            {MESSAGES[messageIndex]}
          </p>
          <p
            className="text-xs text-center"
            style={{ color: "var(--text-muted)" }}
          >
            첫 추천은 조금 시간이 걸려요
          </p>
        </div>
      </div>

    </div>
  );
}
