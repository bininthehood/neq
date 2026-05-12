"use client";

import { useEffect, useState, useCallback } from "react";
import type { Recommendation, RelatedWork } from "@/lib/types";
import { track } from "@/lib/analytics";
import { DETAIL_ENTER_MS, DETAIL_EXIT_MS, DETAIL_EASE, type MorphRect } from "@/hooks/useDetailSheet";
import { IconClose, IconShare, IconSave } from "@/components/Icons";
import { useDetailMorph, DetailMorphLayer } from "./detail/DetailMorphLayer";
import { DetailBody } from "./detail/DetailBody";

interface DetailSheetProps {
  rec: Recommendation;
  showDetail: boolean;
  detailY: number;
  detailAnimating: boolean;
  detailBodyRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onDetailTouchStart: (e: React.TouchEvent) => void;
  onDetailTouchMove: (e: React.TouchEvent) => void;
  onDetailTouchEnd: () => void;
  onShare: (rec: Recommendation) => void;
  /**
   * 사용자 직접 테스트 #7 — DetailSheet 안에서 직접 저장/저장 해제 가능.
   * - savedIds: 저장된 tmdbId Set. DetailSheet 내부에서 현재 displayed rec
   *   (relatedRec ?? initialRec) 기준으로 isSaved 계산 → 관련작 전환 시도 정상 반영 (B2 fix).
   * - onToggleSave: 클릭 시 호출. toast/store/Set 업데이트는 호출처 책임.
   * 둘 다 optional — 미지정 시 save 버튼 자체를 렌더링하지 않음 (하위 호환).
   */
  savedIds?: Set<number>;
  onToggleSave?: (rec: Recommendation) => void;
  /**
   * 사용자 직접 테스트 #4 — Saved 통합 후, ReactionLabel 등 페이지 별 추가 콘텐츠를
   * title meta block 옆에 노출하기 위한 slot. (Discover 진입 시에는 미지정.)
   */
  reactionBadge?: React.ReactNode;
  /**
   * 사용자 직접 테스트 #6 — Hero morph (Apple Music style).
   * 카드의 origin rect (getBoundingClientRect). null/undefined 면 morph 비활성.
   * 호출처가 카드 컨테이너 ref 로 측정해서 useDetailSheet.openDetail(rect) 로 전달.
   */
  morphRect?: MorphRect | null;
  /**
   * morph 단계 — "enter" (카드→hero), "exit" (hero→카드), null (비활성).
   * useDetailSheet hook 가 관리. enter 종료 시 자동 null. close 시 exit 으로 전이.
   */
  morphPhase?: "enter" | "exit" | null;
  /**
   * 위임 J #3 — Cast 영역 인물 클릭 시 호출.
   * 호출처(discover/saved page)는 받아서 SearchSheet 를 열고 그 이름으로 검색을 트리거.
   * 미지정 시 Cast row 는 비클릭 div 로 폴백 (구 동작 유지).
   */
  onSearchPerson?: (name: string) => void;
}

export default function DetailSheet({
  rec: initialRec,
  showDetail,
  detailY,
  detailAnimating,
  detailBodyRef,
  onClose,
  onDetailTouchStart,
  onDetailTouchMove,
  onDetailTouchEnd,
  onShare,
  savedIds,
  onToggleSave,
  reactionBadge,
  morphRect = null,
  morphPhase = null,
  onSearchPerson,
}: DetailSheetProps) {
  // 관련 작품 카드 클릭 시 sheet 내부에서 rec 을 교체 (route navigation 회피, F3 spec).
  // - relatedRec: 사용자가 collection/director 카로셀에서 클릭해 hydrate 된 작품
  // - rec: 화면에 보이는 최종 rec (relatedRec 우선, 없으면 props.initialRec)
  // sheet 가 닫힐 때 reset 하여 다음 진입 시 깨끗한 state.
  const [relatedRec, setRelatedRec] = useState<Recommendation | null>(null);
  const [hydratingRelated, setHydratingRelated] = useState(false);
  const rec = relatedRec ?? initialRec;
  // B2 fix — savedIds 기반 isSaved 계산. 이전엔 호출처가 initialRec 기준 boolean 을 전달해
  // relatedRec(관련작) 으로 전환되어도 button 상태가 옛 작품 기준으로 굳어 토글이 안 됨.
  const isSaved = savedIds?.has(rec.tmdbId) ?? false;

  // sheet 가 닫힐 때 relatedRec stack 초기화 — cleanup 패턴.
  useEffect(() => {
    if (!showDetail) return;
    return () => {
      setRelatedRec(null);
    };
  }, [showDetail]);

  // Hero morph 상태/effect 캡슐화 — heroRef 는 DetailHero(body 안)로 forward.
  const { heroRef, heroRect, morphTransitioning } = useDetailMorph(
    morphPhase ?? null,
    morphRect,
  );

  // 관련 작품 카드 클릭 — TMDB hydrate → relatedRec 교체. body scroll top 으로 리셋.
  // source: 사용자 직접 테스트 #4 — "recommendations" 추가 (TMDB 비슷한 작품).
  const handleRelatedClick = useCallback(
    async (
      work: RelatedWork,
      source: "collection" | "director" | "recommendations",
    ) => {
      track("detail_related_clicked", {
        tmdb_id: rec.tmdbId,
        related_id: work.id,
        source,
        title: work.title,
      });
      setHydratingRelated(true);
      try {
        const type = work.mediaType === "tv" ? "series" : "movie";
        const res = await fetch(`/api/tmdb/hydrate?id=${work.id}&type=${type}`);
        if (res.ok) {
          const next: Recommendation = await res.json();
          setRelatedRec(next);
          // 새 작품으로 교체했으니 본문 스크롤 위로
          if (detailBodyRef.current) detailBodyRef.current.scrollTop = 0;
        }
      } catch {
        // hydrate 실패 — 무시. 사용자는 기존 rec 상태 유지
      } finally {
        setHydratingRelated(false);
      }
    },
    [rec.tmdbId, detailBodyRef],
  );

  if (!showDetail) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ touchAction: "none" }}
      onTouchMove={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-sheet-title"
    >
      {/* dim background — 명시적 onClick 으로 닫기. root 의 onClick 은 제거.
          이전엔 root onClick={onClose} + sheet stopPropagation 패턴이었지만,
          모바일 합성 click 이 morph layer (pointer-events:none) 또는 sheet 가
          아직 viewport 밖일 때 root 로 bubble 되어 sheet 가 즉시 닫히는 회귀 발생.
          dim 자체에만 onClick 을 두면 sheet 영역 외 dim 영역 click 만 닫기로 처리 — 안전. */}
      <div
        className="absolute inset-0 bg-overlay-heavy"
        onClick={onClose}
        aria-hidden
        style={{
          opacity: 1 - detailY / 100,
          // dim 페이드: enter 는 morph 와 동시 (450ms), exit 은 짧게 (350ms).
          // detailY === 100 (closed) 인 시점에는 transition 자체가 적용되지 않으므로
          // 방향성은 detailAnimating 진입 시점에 의해 결정됨.
          transition: detailAnimating
            ? `opacity ${detailY > 0 ? DETAIL_EXIT_MS : DETAIL_ENTER_MS}ms ${DETAIL_EASE}`
            : "none",
        }}
      />
      <DetailMorphLayer
        morphPhase={morphPhase ?? null}
        morphRect={morphRect}
        heroRect={heroRect}
        morphTransitioning={morphTransitioning}
        posterUrl={rec.posterUrl}
        backdrop={rec.backdrop}
      />
      {/* sheet — D3 morph: 카드 → 시트 단일 transform. easing/duration 은
          핸드오프 정량 (450/350ms, cubic-bezier(0.32, 0.72, 0.24, 1)).
          탭 진입만 가정 (G1-A) — onSwipeUp 분기는 useSwipeGesture 에서 제거됨. */}
      <div
        data-detail-sheet
        className="relative w-full max-w-[480px] max-h-[90dvh] flex flex-col bg-background"
        style={{
          borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
          transform: `translateY(${detailY}%)`,
          transition: detailAnimating
            ? `transform ${detailY > 0 ? DETAIL_EXIT_MS : DETAIL_ENTER_MS}ms ${DETAIL_EASE}`
            : "none",
          willChange: detailAnimating ? "transform" : undefined,
        }}
      >
        {/* handle bar */}
        <div className="px-5 pt-4 pb-2 flex items-center justify-between shrink-0">
          <div className="flex-1 flex justify-center">
            <div
              className="w-10 h-1 rounded-full"
              style={{ background: "var(--border)" }}
            />
          </div>
          <button
            className="w-11 h-11 flex items-center justify-center flex-shrink-0 -mr-1 bg-surface rounded-full"
            onClick={onClose}
          >
            <IconClose size={16} color="var(--text-secondary)" />
          </button>
        </div>
        {/* body — GH-3 #8: action row 가 sheet 하단 fixed 로 분리되었으므로
            본문 padding-bottom 을 늘려 콘텐츠 가림 방지.
            (action row 높이 ~76px + safe-area + 여백 → 28+ 의 padding-bottom) */}
        <DetailBody
          rec={rec}
          showDetail={showDetail}
          detailBodyRef={detailBodyRef}
          onDetailTouchStart={onDetailTouchStart}
          onDetailTouchMove={onDetailTouchMove}
          onDetailTouchEnd={onDetailTouchEnd}
          heroRef={heroRef}
          morphPhase={morphPhase ?? null}
          reactionBadge={reactionBadge}
          onSearchPerson={onSearchPerson}
          hydratingRelated={hydratingRelated}
          onRelatedClick={handleRelatedClick}
        />
        {/* Action row — GH-3 #8 (2026-05-02): sheet 하단 fixed.
            body 스크롤 영역 밖으로 분리해 항상 보이도록 sticky-bottom 패턴.
            "공중에 띄운 느낌" (위임 M, 2026-05-02): 배경 투명. 본문 콘텐츠가 row 후방으로 비치도록.
            상단 hairline + boxShadow 로만 분리감 유지 (배경 fill 없음).
            safe-area-inset-bottom 으로 iOS PWA home indicator 회피.
            save (핵심 CTA, amber 카운트 제외) + share (보조, secondary 톤).
            44×44 hit area + focus-visible amber outline (DESIGN.md). */}
        <div
          className="absolute left-0 right-0 bottom-0 z-10 px-5 pt-3 flex gap-2"
          style={{
            background: "transparent",
            borderTop: "1px solid var(--border-subtle)",
            boxShadow: "0 -8px 24px rgba(0, 0, 0, 0.25)",
            paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          }}
        >
          {onToggleSave && (
            <button
              type="button"
              onClick={() => onToggleSave(rec)}
              aria-label={isSaved ? `${rec.title} 저장 해제` : `${rec.title} 저장`}
              aria-pressed={isSaved}
              className="flex-1 min-h-[44px] py-3 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              style={
                isSaved
                  ? {
                      // SelectedWorkPanel save 버튼과 동일 패턴 — solid surface-raised + accent border/text.
                      // accent-dim (12% alpha) 만으로는 면이 거의 안 보여 인지 약했음.
                      background: "var(--surface-raised)",
                      border: "1px solid var(--accent-border)",
                      color: "var(--accent)",
                    }
                  : {
                      background: "var(--accent)",
                      border: "1px solid var(--accent)",
                      color: "var(--bg)",
                    }
              }
            >
              <IconSave
                size={16}
                color={isSaved ? "var(--accent)" : "var(--bg)"}
                filled={isSaved}
              />
              {isSaved ? "저장됨" : "저장하기"}
            </button>
          )}
          <button
            type="button"
            onClick={() => onShare(rec)}
            aria-label={`${rec.title} 공유하기`}
            className={`${onToggleSave ? "" : "flex-1 "}min-h-[44px] py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`}
            style={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
          >
            <IconShare size={16} color="var(--text-secondary)" />
            {onToggleSave ? null : <span>공유하기</span>}
            {onToggleSave && <span className="sr-only">공유하기</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
