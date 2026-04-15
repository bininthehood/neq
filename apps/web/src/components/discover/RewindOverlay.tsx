"use client";

import { useEffect, useRef, useCallback } from "react";
import type { Recommendation } from "@/lib/types";

interface RewindOverlayProps {
  /** 되감기할 카드 목록 (현재 topIdx 기준, 0번부터 topIdx-1까지 역순) */
  cards: Recommendation[];
  /** 애니메이션 완료 콜백 */
  onComplete: () => void;
}

/**
 * 되감기 오버레이 — VHS 테이프 되감기 느낌
 * rAF 기반으로 포스터를 빠르게 순회하며, DOM 직접 조작으로 60fps 보장
 */
export default function RewindOverlay({ cards, onComplete }: RewindOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  // 적응형 속도: 카드 수에 따라 총 시간 조절
  const totalCards = cards.length;
  // 2장 → 400ms, 10장 → 700ms, 30장+ → 1200ms
  const duration = Math.min(1200, Math.max(400, 200 + totalCards * 50));

  const animate = useCallback((timestamp: number) => {
    if (!startTimeRef.current) startTimeRef.current = timestamp;
    const elapsed = timestamp - startTimeRef.current;
    const progress = Math.min(1, elapsed / duration);

    // easeOutQuart — 처음 빠르게, 마지막에 감속 (되감기 관성)
    const eased = 1 - Math.pow(1 - progress, 4);
    const cardIndex = Math.min(
      totalCards - 1,
      Math.floor(eased * totalCards)
    );

    const card = cards[cardIndex];

    // DOM 직접 조작 — setState 없이 60fps
    if (imgRef.current && card?.posterUrl) {
      // src가 달라졌을 때만 교체 (불필요한 로드 방지)
      if (imgRef.current.getAttribute("data-idx") !== String(cardIndex)) {
        imgRef.current.src = card.posterUrl;
        imgRef.current.setAttribute("data-idx", String(cardIndex));
      }
    }

    // 카운터 업데이트
    if (counterRef.current) {
      const remaining = totalCards - cardIndex;
      counterRef.current.textContent = `${remaining}`;
    }

    // 프로그레스 바
    if (containerRef.current) {
      const bar = containerRef.current.querySelector<HTMLDivElement>("[data-progress]");
      if (bar) bar.style.transform = `scaleX(${1 - progress})`;
    }

    if (progress < 1) {
      rafRef.current = requestAnimationFrame(animate);
    } else {
      // 마지막 카드(첫 번째)에서 잠깐 머문 뒤 완료
      setTimeout(onComplete, 150);
    }
  }, [cards, totalCards, duration, onComplete]);

  useEffect(() => {
    // prefers-reduced-motion 존중 — 즉시 점프
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      onComplete();
      return;
    }

    // 첫 프레임에서 마지막(=현재) 카드의 포스터로 시작
    if (imgRef.current && cards[0]?.posterUrl) {
      imgRef.current.src = cards[0].posterUrl;
      imgRef.current.setAttribute("data-idx", "0");
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [animate, cards, onComplete]);

  // 첫 카드(=가장 최근에 넘긴 카드)의 포스터를 초기값으로
  const initialPoster = cards[0]?.posterUrl;

  return (
    <div
      ref={containerRef}
      className="absolute inset-x-3 top-0 bottom-2 z-30 overflow-hidden"
      style={{ borderRadius: "var(--radius-xl)" }}
    >
      {/* 포스터 이미지 — rAF로 src만 교체 */}
      {initialPoster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-top"
          style={{
            // 스캔라인 + 약간의 블러로 VHS 느낌
            filter: "blur(1px) contrast(1.1)",
          }}
        />
      )}

      {/* 스캔라인 오버레이 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)",
          mixBlendMode: "multiply",
        }}
      />

      {/* 어두운 오버레이 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "rgba(18, 17, 14, 0.5)" }}
      />

      {/* 되감기 카운터 */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 19 2 12 11 5 11 19" />
          <polygon points="22 19 13 12 22 5 22 19" />
        </svg>
        <span
          ref={counterRef}
          className="font-data text-2xl font-bold"
          style={{ color: "var(--accent)" }}
        >
          {totalCards}
        </span>
      </div>

      {/* 하단 프로그레스 바 */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{ background: "rgba(196, 163, 90, 0.2)" }}
      >
        <div
          data-progress=""
          className="h-full origin-left"
          style={{
            background: "var(--accent)",
            transform: "scaleX(1)",
            transition: "none",
          }}
        />
      </div>
    </div>
  );
}
