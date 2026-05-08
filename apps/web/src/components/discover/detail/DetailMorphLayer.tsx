"use client";

import { useEffect, useRef, useState } from "react";
import NextImage from "next/image";
import { DETAIL_ENTER_MS, DETAIL_EXIT_MS, DETAIL_EASE, type MorphRect } from "@/hooks/useDetailSheet";

/**
 * useDetailMorph — Hero morph (Apple Music style) 상태/effect 캡슐화.
 *
 * 단순화된 FLIP 패턴:
 *   1) 진입 직전(`morphPhase === "enter"`): morph layer 를 카드 origin rect 에 absolute 배치
 *   2) 다음 frame 에 hero target rect 로 transition (DETAIL_ENTER_MS / DETAIL_EASE)
 *   3) ENTER_MS 후 hook 이 morphPhase=null 로 reset → layer 페이드 아웃
 *   4) close 시 hook 이 morphPhase="exit" 로 전환 → 역방향 transition (hero → origin, EXIT_MS)
 *
 * 핵심 시퀀스:
 *   1) morphPhase set → 첫 렌더 (heroRect=null → morph layer 미렌더, sheet 는 translate(100%))
 *   2) rAF1: heroRef mount 확인, heroRect 측정 (sheet transform 보정) + setHeroRect
 *   3) rAF2: heroRect 반영된 첫 렌더 — morphTransitioning=false → startRect 위치 표시
 *   4) rAF3: morphTransitioning=true → endRect 로 transition 발동
 * exit 시에는 이미 heroRect 를 알고 있으므로 즉시 transitioning=true → 역방향
 */
export function useDetailMorph(
  morphPhase: "enter" | "exit" | null,
  morphRect: MorphRect | null,
) {
  const heroRef = useRef<HTMLDivElement>(null);
  const [heroRect, setHeroRect] = useState<MorphRect | null>(null);
  const [morphTransitioning, setMorphTransitioning] = useState(false);

  useEffect(() => {
    if (!morphPhase || !morphRect) {
      setMorphTransitioning(false);
      return;
    }
    let raf1 = 0;
    let raf2 = 0;
    let raf3 = 0;
    if (morphPhase === "enter") {
      raf1 = requestAnimationFrame(() => {
        if (heroRef.current) {
          const r = heroRef.current.getBoundingClientRect();
          // sheet 가 아직 translateY(100%) 라면 hero rect 가 viewport 밖. 보정:
          // sheet 의 부모 transform 만큼 hero rect.top 이 밀려있으므로 final sheet top 으로 환산.
          const sheetEl = heroRef.current.closest("[data-detail-sheet]") as HTMLElement | null;
          let adjustedTop = r.top;
          if (sheetEl) {
            const sheetRect = sheetEl.getBoundingClientRect();
            const viewportH = window.innerHeight;
            const finalSheetTop = viewportH - sheetRect.height;
            const offset = sheetRect.top - finalSheetTop;
            adjustedTop = r.top - offset;
          }
          setHeroRect({ left: r.left, top: adjustedTop, width: r.width, height: r.height });
        }
        // heroRect 가 set 되면서 morph layer 가 startRect 로 첫 렌더.
        // 그 다음 frame 에 transitioning=true → endRect 로 transition.
        raf2 = requestAnimationFrame(() => {
          raf3 = requestAnimationFrame(() => {
            setMorphTransitioning(true);
          });
        });
      });
    } else if (morphPhase === "exit") {
      // exit: heroRect 는 이미 알고 있음. 첫 렌더가 endRect(=heroRect) 로 표시되어야 하므로
      // transitioning=false 부터 시작 → 다음 frame 에 true 로 (morphRect 로 역방향).
      setMorphTransitioning(false);
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setMorphTransitioning(true);
        });
      });
    }
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      cancelAnimationFrame(raf3);
    };
  }, [morphPhase, morphRect]);

  return { heroRef, heroRect, morphTransitioning };
}

/**
 * DetailMorphLayer — 카드 origin rect → hero target rect 로 morph 되는 absolute 레이어.
 *
 * morphPhase 가 활성이고 origin/target rect 가 모두 있을 때만 렌더.
 * - 첫 frame: enter=origin rect / exit=target(hero) rect
 * - 다음 frame(morphTransitioning=true): enter=target rect / exit=origin rect
 * - DETAIL_EASE / DETAIL_ENTER_MS or DETAIL_EXIT_MS 로 transition.
 * backdrop 우선, 없으면 posterUrl. variant A/B 처럼 backdrop 없는 데이터에도 morph 동작.
 */
export function DetailMorphLayer({
  morphPhase,
  morphRect,
  heroRect,
  morphTransitioning,
  posterUrl,
  backdrop,
}: {
  morphPhase: "enter" | "exit" | null;
  morphRect: MorphRect | null;
  heroRect: MorphRect | null;
  morphTransitioning: boolean;
  posterUrl: string | null;
  backdrop: string | null;
}) {
  if (!morphPhase || !morphRect || !heroRect || !(backdrop || posterUrl)) {
    return null;
  }
  const isEnter = morphPhase === "enter";
  const startRect = isEnter ? morphRect : heroRect;
  const endRect = isEnter ? heroRect : morphRect;
  // morphTransitioning=false 면 startRect 그대로, true 면 endRect 로 전이
  const cur = morphTransitioning ? endRect : startRect;
  const dur = isEnter ? DETAIL_ENTER_MS : DETAIL_EXIT_MS;
  // cross-fade 기준 — atStart: 카드 모습 (poster 가시), atEnd: hero 모습 (backdrop 가시)
  // enter: start→end (poster→backdrop), exit: end→start (backdrop→poster)
  const atEnd = morphTransitioning;
  const showBackdropOnTop = !!backdrop && backdrop !== posterUrl;
  // backdrop 가 우선 표시되어야 할 시점 = atEnd 시점 (enter), atStart 시점 (exit)
  const backdropVisible = isEnter ? atEnd : !atEnd;
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        left: cur.left,
        top: cur.top,
        width: cur.width,
        height: cur.height,
        borderRadius: atEnd && isEnter ? 0 : "var(--radius-xl)",
        overflow: "hidden",
        transition: morphTransitioning
          ? `left ${dur}ms ${DETAIL_EASE}, top ${dur}ms ${DETAIL_EASE}, width ${dur}ms ${DETAIL_EASE}, height ${dur}ms ${DETAIL_EASE}, border-radius ${dur}ms ${DETAIL_EASE}`
          : "none",
        willChange: "left, top, width, height",
        zIndex: 60,
        pointerEvents: "none",
        background: "var(--surface)",
      }}
    >
      {/* bottom layer: poster (카드와 동일 이미지) — 항상 표시 */}
      {posterUrl && (
        <NextImage
          src={posterUrl}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 480px) 100vw, 480px"
          priority
          unoptimized
        />
      )}
      {/* top layer: backdrop (hero 와 동일 이미지) — cross-fade.
          backdrop 이 poster 와 다를 때만 stack 사용. */}
      {showBackdropOnTop && (
        <NextImage
          src={backdrop}
          alt=""
          fill
          className="object-cover absolute inset-0"
          sizes="(max-width: 480px) 100vw, 480px"
          priority
          unoptimized
          style={{
            opacity: backdropVisible ? 1 : 0,
            transition: `opacity ${dur}ms ${DETAIL_EASE}`,
          }}
        />
      )}
      {/* hero 측 gradient — 도착 시 hero 와 자연스러운 연결 (enter 종착) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, transparent 50%, var(--bg) 100%)",
          opacity: backdropVisible ? 1 : 0.3,
          transition: `opacity ${dur}ms ${DETAIL_EASE}`,
        }}
      />
    </div>
  );
}
