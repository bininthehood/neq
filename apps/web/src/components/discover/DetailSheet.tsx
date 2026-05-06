"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import NextImage from "next/image";
import type { Recommendation, RelatedWork, RelatedWorksResponse, CastMember } from "@/lib/types";
import { getOTTLink, getOTTIcon } from "@/lib/ott-links";
import { track } from "@/lib/analytics";
import { getPrimaryCountryName } from "@/lib/country-names";
import { DETAIL_ENTER_MS, DETAIL_EXIT_MS, DETAIL_EASE, type MorphRect } from "@/hooks/useDetailSheet";
import {
  IconClose,
  IconStar,
  IconShare,
  IconSave,
} from "@/components/Icons";
import PosterFallback from "@/components/PosterFallback";

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
   * - isSaved: 현재 저장 상태 (호출처 page 가 store 와 동기화해 prop 으로 전달)
   * - onToggleSave: 클릭 시 호출. toast 발사/store 변경/savedIds 업데이트는 호출처 책임.
   * 둘 다 optional — 미지정 시 save 버튼 자체를 렌더링하지 않음 (하위 호환).
   */
  isSaved?: boolean;
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

function metaInfo(r: Recommendation) {
  return [
    getPrimaryCountryName(r.country),
    r.date ? r.date.slice(0, 4) : null,
    r.runtime ? `${r.runtime}분` : null,
    r.seasons ? `시즌 ${r.seasons}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
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
  isSaved = false,
  onToggleSave,
  reactionBadge,
  morphRect = null,
  morphPhase = null,
  onSearchPerson,
}: DetailSheetProps) {
  // 관련 작품 카드 클릭 시 sheet 내부에서 rec 을 교체 (route navigation 회피, F3 spec).
  // - relatedRec: 사용자가 collection/director 카로셀에서 클릭해 hydrate 된 작품
  // - displayRec: 화면에 보이는 최종 rec (relatedRec 우선, 없으면 props.rec)
  // sheet 가 닫힐 때 reset 하여 다음 진입 시 깨끗한 state.
  const [relatedRec, setRelatedRec] = useState<Recommendation | null>(null);
  const [hydratingRelated, setHydratingRelated] = useState(false);
  // 위임 P #3 (2026-05-02) — Cast 사진 lazy hydration.
  // mirror cache 경로 rec 은 castMembers 가 빈 배열 → 사진 안 보임.
  // sheet 진입 시 1회 /api/tmdb/credits 호출해 directorMember/castMembers 를 채운다.
  // 이미 채워진 rec (hydrate/enrichCandidates 경로) 은 fetch skip — 무한 루프 방지.
  const [lazyCastMembers, setLazyCastMembers] = useState<CastMember[] | null>(null);
  const [lazyDirectorMember, setLazyDirectorMember] = useState<CastMember | null>(null);
  const rec = relatedRec ?? initialRec;

  // GH-3 #7 — Synopsis 더보기/접기 토글.
  // 200자 임계 — 그 미만은 토글 자체 미노출 (자연스럽게 전체 표시).
  // line-clamp-5 (CSS) + 끝에 fade-out gradient 로 잘림 시각화.
  // rec 변경(관련작 클릭으로 교체) 시 자동 접힘으로 reset.
  const SYNOPSIS_THRESHOLD = 200;
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  useEffect(() => {
    setSynopsisExpanded(false);
  }, [rec.tmdbId]);

  // 관련 작품 (collection + director). 화면 rec 변경 시 마다 fetch.
  const [related, setRelated] = useState<RelatedWorksResponse | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);

  // 관련 작품 fetch — 화면 rec 의 tmdbId 변경 또는 sheet 가 열릴 때마다.
  //
  // setState 는 비동기 콜백(.then/.catch/.finally) 또는 cleanup 에서만 호출.
  // 시작 시 loading=true 도 promise microtask 로 미뤄서
  // react-hooks/set-state-in-effect 규칙 준수.
  useEffect(() => {
    if (!showDetail || !rec?.tmdbId) {
      return;
    }
    let cancelled = false;
    const url = `/api/tmdb/related?work_id=${rec.tmdbId}&type=${rec.type === "series" ? "series" : "movie"}`;

    // promise chain 시작점에서 loading=true 반영 + fetch 실행을 1 step 묶음.
    Promise.resolve()
      .then(() => {
        if (cancelled) return null;
        setRelatedLoading(true);
        return fetch(url);
      })
      .then((r) => (r && r.ok ? r.json() : null))
      .then((data: RelatedWorksResponse | null) => {
        if (cancelled) return;
        setRelated(
          data ?? { collection: null, recommendations: [], directorWorks: [], directorName: null },
        );
      })
      .catch(() => {
        if (cancelled) return;
        setRelated({ collection: null, recommendations: [], directorWorks: [], directorName: null });
      })
      .finally(() => {
        if (!cancelled) setRelatedLoading(false);
      });

    return () => {
      cancelled = true;
      // 다음 sheet 진입/rec 변경 시 깨끗한 state 보장
      setRelated(null);
      setRelatedLoading(false);
    };
  }, [showDetail, rec?.tmdbId, rec?.type]);

  // sheet 가 닫힐 때 relatedRec stack 초기화 — cleanup 패턴.
  useEffect(() => {
    if (!showDetail) return;
    return () => {
      setRelatedRec(null);
    };
  }, [showDetail]);

  // 위임 P #3 — Cast 사진 lazy hydration.
  // sheet 가 보이고 rec.castMembers 가 비어있는데 cast 이름이라도 있으면 (또는 director 만 있어도)
  // /api/tmdb/credits 1회 호출해 사진 채움. 이미 castMembers 가 있는 rec(검색/관련작 hydrate 경로)
  // 은 skip. rec.tmdbId 변경 시 다시 측정.
  // setState 는 모두 microtask/promise 콜백 안에서만 호출 (react-hooks/set-state-in-effect 준수).
  useEffect(() => {
    if (!showDetail || !rec?.tmdbId) return;
    const hasCastMembers = (rec.castMembers?.length ?? 0) > 0;
    const hasDirectorMember = rec.directorMember != null;
    let cancelled = false;
    if (hasCastMembers || hasDirectorMember) {
      // 이미 채워짐 — fetch 불필요. lazy state 도 microtask 로 정리.
      Promise.resolve().then(() => {
        if (cancelled) return;
        setLazyCastMembers(null);
        setLazyDirectorMember(null);
      });
      return () => {
        cancelled = true;
      };
    }
    // cast 이름조차 없으면 fetch 의미 X
    const hasNamesOnly = !!rec.director || (rec.cast?.length ?? 0) > 0;
    if (!hasNamesOnly) return;

    const url = `/api/tmdb/credits?id=${rec.tmdbId}&type=${rec.type === "series" ? "series" : "movie"}`;
    Promise.resolve()
      .then(() => fetch(url))
      .then((r) => (r && r.ok ? r.json() : null))
      .then((data: { directorMember: CastMember | null; castMembers: CastMember[] } | null) => {
        if (cancelled || !data) return;
        setLazyDirectorMember(data.directorMember);
        setLazyCastMembers(data.castMembers ?? []);
      })
      .catch(() => {
        // 실패 시 기존 fallback (이니셜) 그대로
      });
    return () => {
      cancelled = true;
    };
  }, [showDetail, rec?.tmdbId, rec?.type, rec?.castMembers, rec?.directorMember, rec?.director, rec?.cast]);

  /**
   * 사용자 직접 테스트 #6 — Hero morph (Apple Music style).
   *
   * 단순화된 FLIP 패턴:
   *   1) 진입 직전(`morphPhase === "enter"`): morph layer 를 카드 origin rect 에 absolute 배치
   *   2) 다음 frame 에 hero target rect 로 transition (DETAIL_ENTER_MS / DETAIL_EASE)
   *   3) ENTER_MS 후 hook 이 morphPhase=null 로 reset → layer 페이드 아웃
   *   4) close 시 hook 이 morphPhase="exit" 로 전환 → 역방향 transition (hero → origin, EXIT_MS)
   *
   * hero target rect 는 heroRef 로 측정. variant A/B/C 와 무관하게 카드 컨테이너 전체 rect 를
   * origin 으로 사용 → variant 별 포스터 위치 차이는 무시 (단일 morph 로직).
   * 이미지는 backdrop ?? posterUrl. backdrop 부재 시 poster 사용 → A/B variant 도 morph 동작.
   */
  const heroRef = useRef<HTMLDivElement>(null);
  const [heroRect, setHeroRect] = useState<MorphRect | null>(null);
  // morph 진행 중 transition 활성 여부 (next-frame trick).
  // enter: 첫 frame=morphRect 위치 그대로 → 다음 frame=heroRect 위치로 transition
  // exit: 첫 frame=heroRect 위치 → 다음 frame=morphRect 위치로 transition
  const [morphTransitioning, setMorphTransitioning] = useState(false);

  // morphPhase 변경 감지 → hero rect 측정 + transition trigger
  //
  // 핵심 시퀀스:
  //   1) morphPhase set → 첫 렌더 (heroRect=null → morph layer 미렌더, sheet 는 translate(100%))
  //   2) rAF1: heroRef mount 확인, heroRect 측정 (sheet transform 보정) + setHeroRect
  //   3) rAF2: heroRect 반영된 첫 렌더 — morphTransitioning=false → startRect 위치 표시
  //   4) rAF3: morphTransitioning=true → endRect 로 transition 발동
  // exit 시에는 이미 heroRect 를 알고 있으므로 즉시 transitioning=true → 역방향
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
      {/*
        Hero morph layer — 사용자 직접 테스트 #6.
        morphPhase 가 활성이고 origin/target rect 가 모두 있을 때만 렌더.
        - 첫 frame: enter=origin rect / exit=target(hero) rect
        - 다음 frame(morphTransitioning=true): enter=target rect / exit=origin rect
        - DETAIL_EASE / DETAIL_ENTER_MS or DETAIL_EXIT_MS 로 transition.
        backdrop 우선, 없으면 posterUrl. variant A/B 처럼 backdrop 없는 데이터에도 morph 동작.
      */}
      {morphPhase && morphRect && heroRect && (rec.backdrop || rec.posterUrl) && (() => {
        const isEnter = morphPhase === "enter";
        const startRect = isEnter ? morphRect : heroRect;
        const endRect = isEnter ? heroRect : morphRect;
        // morphTransitioning=false 면 startRect 그대로, true 면 endRect 로 전이
        const cur = morphTransitioning ? endRect : startRect;
        const dur = isEnter ? DETAIL_ENTER_MS : DETAIL_EXIT_MS;
        const posterSrc = rec.posterUrl;
        const backdropSrc = rec.backdrop;
        // cross-fade 기준 — atStart: 카드 모습 (poster 가시), atEnd: hero 모습 (backdrop 가시)
        // enter: start→end (poster→backdrop), exit: end→start (backdrop→poster)
        const atEnd = morphTransitioning;
        const showBackdropOnTop = !!backdropSrc && backdropSrc !== posterSrc;
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
            {posterSrc && (
              <NextImage
                src={posterSrc}
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
                src={backdropSrc}
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
      })()}
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
        <div
          ref={detailBodyRef}
          className="flex-1 overflow-y-auto px-5"
          style={{
            overscrollBehavior: "contain",
            paddingBottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
          }}
          onTouchStart={onDetailTouchStart}
          onTouchMove={onDetailTouchMove}
          onTouchEnd={onDetailTouchEnd}
        >
          {/* Hero — 큰 backdrop + №ID mark + 하단 그라디언트 (D3 콘텐츠 풍부화).
              backdrop 없으면 hero 자체 생략 → 기존 텍스트 우선 레이아웃 유지. */}
          {rec.backdrop && (
            <div
              ref={heroRef}
              data-detail-hero
              className="relative -mx-5 mb-4 overflow-hidden"
              style={{
                aspectRatio: "16 / 10",
                // morph 진행 중에는 hero 자체를 잠시 가려서 morph layer 와 이중 노출 방지.
                // enter 종료 후 (morphPhase=null) 자연 노출. exit 시작 시 다시 숨김.
                opacity: morphPhase ? 0 : 1,
                transition: morphPhase ? "none" : "opacity 120ms ease-out",
              }}
            >
              <NextImage
                src={rec.backdrop}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 480px) 100vw, 480px"
                priority
              />
              {/* 가독성용 하단 그라디언트 — 본문 배경(--bg)으로 자연 페이드 */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent 50%, var(--bg) 100%)",
                }}
              />
              {/* №ID — 아카이브식 ID. tmdbId 6자리 zero-pad. */}
              <div
                className="absolute top-3 left-5 font-data uppercase"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  color: "rgba(255, 255, 255, 0.7)",
                  textShadow: "0 1px 2px rgba(0, 0, 0, 0.5)",
                }}
                aria-hidden
              >
                № {String(rec.tmdbId).padStart(6, "0")}
              </div>
            </div>
          )}

          <h2 className="font-display text-xl font-bold pr-14">
            {rec.title}
          </h2>
          <p className="text-sm mt-0.5 text-muted">
            {rec.titleEn} · {metaInfo(rec)}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="flex items-center gap-1.5">
              <IconStar size={13} color="var(--accent)" />
              <span className="font-data text-sm font-semibold text-accent">
                {rec.rating.toFixed(1)}
              </span>
            </span>
            {/* Saved 페이지에서 ReactionLabel 등 페이지별 추가 배지를 끼워넣기 위한 slot.
                Discover 진입 시에는 미지정 → 렌더 X. */}
            {reactionBadge}
          </div>
          <div className="mt-4">
            {/* reason — 면(bg-accent-dim) → 선(borderLeft accent) 강조로 전환.
                2026-05-02 amber 누적 분배 정책 + Decisions Log #6 예외 패턴 재활용. */}
            <div
              className="pl-3 py-1 text-sm text-secondary"
              style={{ borderLeft: "2px solid var(--accent-border)" }}
            >
              {rec.reason}
            </div>
          </div>
          {rec.overview && (() => {
            // GH-3 #7 — 200자 이상이면 line-clamp-5 + 더보기/접기 토글.
            // 미만이면 그대로 전체 표시 (토글 미노출).
            const isLong = rec.overview.length >= SYNOPSIS_THRESHOLD;
            const showFade = isLong && !synopsisExpanded;
            return (
              <section className="mt-5" aria-labelledby="d3-synopsis-heading">
                <ChapterMark id="d3-synopsis-heading">Synopsis · 줄거리</ChapterMark>
                <div className="relative">
                  <p
                    className="text-sm leading-relaxed text-secondary"
                    style={
                      showFade
                        ? {
                            display: "-webkit-box",
                            WebkitLineClamp: 5,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }
                        : undefined
                    }
                  >
                    {rec.overview}
                  </p>
                  {showFade && (
                    <div
                      aria-hidden
                      className="absolute left-0 right-0 bottom-0 h-8 pointer-events-none"
                      style={{
                        background:
                          "linear-gradient(to bottom, transparent, var(--bg) 90%)",
                      }}
                    />
                  )}
                </div>
                {isLong && (
                  <button
                    type="button"
                    onClick={() => setSynopsisExpanded((v) => !v)}
                    aria-expanded={synopsisExpanded}
                    aria-controls="d3-synopsis-heading"
                    className="mt-1.5 min-h-[44px] py-2 text-xs font-medium active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-md"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {synopsisExpanded ? "접기" : "더보기"}
                  </button>
                )}
              </section>
            );
          })()}
          {/* Cast — director + cast 통합.
              위임 J #4: rec.directorMember/castMembers 가 있으면 실제 인물 사진 표시.
              위임 J #3: onSearchPerson 이 주어지면 클릭 시 SearchSheet 로 진입.
              두 신규 신호가 모두 미지정이어도 기존 이니셜 fallback 으로 동작 (회귀 0). */}
          {(rec.director || rec.cast?.length > 0) && (
            <section className="mt-5" aria-labelledby="d3-cast-heading">
              <ChapterMark id="d3-cast-heading" tone="muted">Cast · 출연</ChapterMark>
              <CastRow
                director={rec.director}
                cast={rec.cast}
                /* 위임 P #3 — lazy fetch 결과 우선. rec 자체가 이미 갖고 있으면 (hydrate 경로)
                   그것 사용. 둘 다 비면 cast 이름 fallback (이니셜). */
                directorMember={
                  rec.directorMember ?? lazyDirectorMember ?? null
                }
                castMembers={
                  rec.castMembers && rec.castMembers.length > 0
                    ? rec.castMembers
                    : lazyCastMembers ?? []
                }
                onSearchPerson={onSearchPerson}
              />
            </section>
          )}
          <section className="mt-5" aria-labelledby="d3-watch-heading">
            <ChapterMark id="d3-watch-heading" tone="muted">Where to watch · 시청 가능</ChapterMark>
            {rec.providers.length === 0 ? (
              <p className="text-sm text-muted py-2">현재 한국 OTT에서 제공 정보를 찾지 못했어요</p>
            ) : (
            <div className="flex flex-col gap-2">
              {rec.providers.map((p) => {
                const u = getOTTLink(p.name, rec.title);
                return (
                  <a
                    key={p.name}
                    href={u ?? rec.watchLink ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${p.name}에서 ${rec.title} 보기 (새 탭)`}
                    onClick={() =>
                      track("ott_link_clicked", {
                        tmdb_id: rec.tmdbId,
                        provider: p.name,
                        title: rec.title,
                      })
                    }
                    className="flex items-center gap-3 px-4 py-3 text-sm font-medium active:scale-[0.98] transition-transform bg-surface-raised rounded-md"
                  >
                    {(getOTTIcon(p.name) ?? p.logoUrl) ? (
                      <NextImage
                        src={(getOTTIcon(p.name) ?? p.logoUrl)!}
                        alt={p.name}
                        width={32}
                        height={32}
                        className="object-contain flex-shrink-0 rounded-sm bg-surface"
                        unoptimized
                      />
                    ) : (
                      <div className="w-8 h-8 flex-shrink-0 rounded-sm bg-surface" />
                    )}
                    <span className="flex-1">{p.name}</span>
                    {/* "열기" amber 텍스트 → text-muted 화살표. amber 보조 액션 금지 정책. */}
                    <span className="text-xs text-muted" aria-hidden>›</span>
                  </a>
                );
              })}
            </div>
            )}
          </section>
          {/* 관련 작품 — 시리즈 컬렉션 + 감독 다른 작품. F3 spec.
              - related === null + relatedLoading : 아직 로딩 (skeleton)
              - related 있고 collection/directorWorks 둘 다 비면 섹션 자체 숨김 */}
          {related === null && relatedLoading && (
            <div className="mt-5" aria-hidden>
              <div className="flex gap-2.5 overflow-x-auto pb-1 -mr-5">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 w-[90px] h-[132px] rounded-md bg-surface"
                    style={{ opacity: 0.5 }}
                  />
                ))}
              </div>
            </div>
          )}

          {related?.collection && related.collection.works.length > 0 && (
            <RelatedSection
              label={related.collection.name}
              works={related.collection.works}
              source="collection"
              tmdbId={rec.tmdbId}
              disabled={hydratingRelated}
              onClick={handleRelatedClick}
            />
          )}

          {/* 사용자 직접 테스트 #4 — TMDB recommendations 기반 비슷한 작품.
              collection (시리즈) 다음, director (감독 다른 작품) 이전 — 사용자 의도와 가까운 순서.
              빈 배열이면 섹션 자체 숨김. 옛 캐시 호환을 위해 optional chaining. */}
          {related?.recommendations && related.recommendations.length > 0 && (
            <RelatedSection
              label="비슷한 작품"
              works={related.recommendations}
              source="recommendations"
              tmdbId={rec.tmdbId}
              disabled={hydratingRelated}
              onClick={handleRelatedClick}
            />
          )}

          {related?.directorWorks && related.directorWorks.length > 0 && (
            <RelatedSection
              label={
                related.directorName
                  ? `${related.directorName} 감독의 다른 작품`
                  : "감독의 다른 작품"
              }
              works={related.directorWorks}
              source="director"
              tmdbId={rec.tmdbId}
              disabled={hydratingRelated}
              onClick={handleRelatedClick}
            />
          )}

        </div>
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

/**
 * 관련 작품 가로 카로셀 — 디자인 spec (neko-detail-sheet.jsx SimilarStrip 참조).
 * 카드 90×132, 간격 10px, label 은 amber accent + uppercase tracking.
 *
 * - 클릭 시 PostHog detail_related_clicked 발사 후 onClick 호출
 * - 빈 works 는 호출처에서 이미 가드. 본 컴포넌트는 항상 work.length > 0 가정
 */
function RelatedSection({
  label,
  works,
  source,
  tmdbId,
  disabled,
  onClick,
  tone = "muted",
}: {
  label: string;
  works: RelatedWork[];
  source: "collection" | "director" | "recommendations";
  tmdbId: number;
  disabled?: boolean;
  onClick: (
    work: RelatedWork,
    source: "collection" | "director" | "recommendations",
  ) => void;
  tone?: "accent" | "muted";
}) {
  // tmdbId 는 PostHog 이벤트의 origin 식별 (이미 onClick 내부에서 fire 되지만,
  // 디버깅용 로그/data-attribute 로 노출 가능). 현재는 onClick 으로 전달만.
  void tmdbId;
  const headingId = `d3-related-${source}`;
  return (
    <section className="mt-5" aria-labelledby={headingId}>
      <ChapterMark id={headingId} tone={tone}>{label}</ChapterMark>
      <div
        className="flex gap-2.5 overflow-x-auto pb-1 -mr-5"
        style={{ scrollbarWidth: "none" }}
      >
        {works.map((w) => (
          <button
            key={w.id}
            type="button"
            disabled={disabled}
            className="flex-shrink-0 w-[90px] text-left active:scale-[0.97] transition-transform disabled:opacity-50"
            onClick={() => onClick(w, source)}
          >
            <div
              className="w-[90px] h-[132px] rounded-md overflow-hidden mb-1.5 bg-surface relative"
              style={{ border: "1px solid var(--border)" }}
            >
              {w.posterUrl ? (
                <NextImage
                  src={w.posterUrl}
                  alt={w.title}
                  fill
                  sizes="90px"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <PosterFallback title={w.title} size="xs" />
              )}
            </div>
            <div className="text-[11px] font-medium leading-snug line-clamp-2">
              {w.title}
            </div>
            {w.year && (
              <div className="font-data text-xs text-muted mt-0.5">
                {w.year}
              </div>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * ChapterMark — D3 콘텐츠 풍부화 섹션 헤더 (핸드오프 jsx Section 헤더 정량).
 *
 * Geist Mono · 11px (DESIGN.md 최소 xs) · uppercase · tracking 0.12em.
 * tone="accent" 는 시트의 첫 헤더(Synopsis)만 — 위계 정점 마커.
 * tone="muted" 는 그 외 섹션(Cast/Watch/Related) — 색이 아닌 위치/순서로 위계 표현.
 * (2026-05-02 amber 누적 분배 정책: 한 화면 amber ≤ 4)
 */
function ChapterMark({
  children,
  id,
  tone = "accent",
}: {
  children: React.ReactNode;
  id?: string;
  tone?: "accent" | "muted";
}) {
  return (
    <h3
      id={id}
      className={`font-data text-xs font-medium uppercase mb-2 ${
        tone === "accent" ? "text-accent" : "text-secondary"
      }`}
      style={{ letterSpacing: "0.12em" }}
    >
      {children}
    </h3>
  );
}

/**
 * CastRow — director + cast 가로 스크롤 행.
 *
 * 위임 J #3 #4 — 사용자 직접 테스트 피드백 적용:
 *  - #4: directorMember/castMembers (TMDB profile_path) 있으면 실제 인물 사진 (NextImage).
 *        구버전 rec(이름만) 또는 profileUrl null 인 경우 기존 이니셜 fallback 유지.
 *  - #3: onSearchPerson 콜백 주어지면 64×64 영역을 button 으로 래핑 → 클릭 시 검색.
 *        콜백 미지정 시 비클릭 div 로 폴백 (회귀 0).
 *
 * 데이터 결합 규칙:
 *  - directorMember 가 있으면 그것을 1순위로 사용. 없고 director(이름) 만 있으면 fallback row 생성.
 *  - castMembers 가 비어있고 cast(이름 배열)만 있으면 cast 를 fallback 으로 매핑.
 *  - 길이/순서: director(1) → cast(최대 4) → 항상 5개 이하.
 */
function CastRow({
  director,
  cast,
  directorMember,
  castMembers,
  onSearchPerson,
}: {
  director: string | null;
  cast: string[];
  directorMember: CastMember | null;
  castMembers: CastMember[];
  onSearchPerson?: (name: string) => void;
}) {
  type Item = {
    name: string;
    role: "감독" | "출연";
    profileUrl: string | null;
    /** key 충돌 방지용 — tmdbId 가 있으면 사용, 없으면 name+index. */
    keyId: string;
  };
  const items: Item[] = [];

  // 1) Director — directorMember 우선, 없으면 director 문자열 fallback
  if (directorMember) {
    items.push({
      name: directorMember.name,
      role: "감독",
      profileUrl: directorMember.profileUrl,
      keyId: `d-${directorMember.tmdbId}`,
    });
  } else if (director) {
    items.push({
      name: director,
      role: "감독",
      profileUrl: null,
      keyId: `d-${director}`,
    });
  }

  // 2) Cast — castMembers 가 있으면 그걸로, 없으면 cast 문자열 배열 fallback
  if (castMembers && castMembers.length > 0) {
    for (const m of castMembers) {
      items.push({
        name: m.name,
        role: "출연",
        profileUrl: m.profileUrl,
        keyId: `c-${m.tmdbId}`,
      });
    }
  } else {
    for (let i = 0; i < cast.length; i++) {
      items.push({
        name: cast[i],
        role: "출연",
        profileUrl: null,
        keyId: `c-${cast[i]}-${i}`,
      });
    }
  }

  if (items.length === 0) return null;

  return (
    <div
      className="flex gap-2.5 overflow-x-auto pb-1 -mr-5"
      style={{ scrollbarWidth: "none" }}
    >
      {items.map((p) => (
        <CastItem
          key={p.keyId}
          name={p.name}
          role={p.role}
          profileUrl={p.profileUrl}
          onSearchPerson={onSearchPerson}
        />
      ))}
    </div>
  );
}

/**
 * CastItem — 인물 1명 셀 (사진 또는 이니셜 + 이름 + 역할).
 *
 * onSearchPerson 이 있으면 button (44×44 hit area 충족), 없으면 div.
 * 사진 영역은 64×64 원형, 이름 클램프 2줄(11px font-medium), 역할은 muted xs.
 */
function CastItem({
  name,
  role,
  profileUrl,
  onSearchPerson,
}: {
  name: string;
  role: "감독" | "출연";
  profileUrl: string | null;
  onSearchPerson?: (name: string) => void;
}) {
  const Avatar = (
    <div
      className="mx-auto mb-1.5 relative overflow-hidden flex items-center justify-center"
      style={{
        width: 64,
        height: 64,
        borderRadius: "50%",
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
      }}
      aria-hidden
    >
      {profileUrl ? (
        <NextImage
          src={profileUrl}
          alt=""
          fill
          sizes="64px"
          className="object-cover"
          unoptimized
        />
      ) : (
        <span
          className="font-display italic"
          style={{
            color: "var(--text-secondary)",
            fontSize: 22,
            lineHeight: 1,
          }}
        >
          {name.charAt(0)}
        </span>
      )}
    </div>
  );

  const Label = (
    <>
      <div
        className="text-[11px] font-medium leading-tight line-clamp-2"
        style={{ color: "var(--text-primary)" }}
      >
        {name}
      </div>
      <div
        className="font-data text-xs mt-0.5"
        style={{ color: "var(--text-muted)" }}
      >
        {role}
      </div>
    </>
  );

  if (onSearchPerson) {
    return (
      <button
        type="button"
        onClick={() => {
          track("detail_cast_clicked", { name, role });
          onSearchPerson(name);
        }}
        aria-label={`${name} ${role} 검색`}
        className="flex-shrink-0 text-center active:scale-[0.97] transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
        style={{ width: 64, minHeight: 44 }}
      >
        {Avatar}
        {Label}
      </button>
    );
  }

  return (
    <div className="flex-shrink-0 text-center" style={{ width: 64 }}>
      {Avatar}
      {Label}
    </div>
  );
}
