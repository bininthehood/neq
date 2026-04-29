"use client";

import { useEffect, useState, useCallback } from "react";
import NextImage from "next/image";
import type { Recommendation, RelatedWork, RelatedWorksResponse } from "@/lib/types";
import { getOTTLink, getOTTIcon } from "@/lib/ott-links";
import { track } from "@/lib/analytics";
import { getPrimaryCountryName } from "@/lib/country-names";
import {
  IconClose,
  IconStar,
  IconShare,
} from "@/components/Icons";

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
}: DetailSheetProps) {
  // 관련 작품 카드 클릭 시 sheet 내부에서 rec 을 교체 (route navigation 회피, F3 spec).
  // - relatedRec: 사용자가 collection/director 카로셀에서 클릭해 hydrate 된 작품
  // - displayRec: 화면에 보이는 최종 rec (relatedRec 우선, 없으면 props.rec)
  // sheet 가 닫힐 때 reset 하여 다음 진입 시 깨끗한 state.
  const [relatedRec, setRelatedRec] = useState<Recommendation | null>(null);
  const [hydratingRelated, setHydratingRelated] = useState(false);
  const rec = relatedRec ?? initialRec;

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
        setRelated(data ?? { collection: null, directorWorks: [], directorName: null });
      })
      .catch(() => {
        if (cancelled) return;
        setRelated({ collection: null, directorWorks: [], directorName: null });
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

  // 관련 작품 카드 클릭 — TMDB hydrate → relatedRec 교체. body scroll top 으로 리셋.
  const handleRelatedClick = useCallback(
    async (work: RelatedWork, source: "collection" | "director") => {
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
      onClick={onClose}
      onTouchMove={(e) => e.stopPropagation()}
    >
      {/* dim background */}
      <div
        className="absolute inset-0 bg-overlay-heavy"
        style={{
          opacity: 1 - detailY / 100,
          transition: detailAnimating ? "opacity 0.3s ease-out" : "none",
        }}
      />
      {/* sheet */}
      <div
        className="relative w-full max-w-[480px] max-h-[90dvh] flex flex-col bg-background"
        style={{
          borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
          transform: `translateY(${detailY}%)`,
          transition: detailAnimating
            ? "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)"
            : "none",
        }}
        onClick={(e) => e.stopPropagation()}
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
        {/* body */}
        <div
          ref={detailBodyRef}
          className="flex-1 overflow-y-auto px-5 pb-8"
          style={{ overscrollBehavior: "contain" }}
          onTouchStart={onDetailTouchStart}
          onTouchMove={onDetailTouchMove}
          onTouchEnd={onDetailTouchEnd}
        >
          <h2 className="font-display text-xl font-bold pr-14">
            {rec.title}
          </h2>
          <p className="text-sm mt-0.5 text-muted">
            {rec.titleEn} · {metaInfo(rec)}
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <IconStar size={13} color="var(--accent)" />
            <span className="font-data text-sm font-semibold text-accent">
              {rec.rating.toFixed(1)}
            </span>
          </div>
          {rec.backdrop && (
            <div className="relative w-full h-40 mt-4 overflow-hidden rounded-md">
              <NextImage
                src={rec.backdrop}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 480px) 100vw, 480px"
              />
            </div>
          )}
          <div className="mt-4">
            <div className="px-3 py-2 text-sm bg-accent-dim rounded-md">
              {rec.reason}
            </div>
          </div>
          {(rec.director || rec.cast?.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
              {rec.director && (
                <div>
                  <span className="text-xs text-muted">감독 </span>
                  <span className="text-sm">{rec.director}</span>
                </div>
              )}
              {rec.cast?.length > 0 && (
                <div>
                  <span className="text-xs text-muted">출연 </span>
                  <span className="text-sm">{rec.cast.join(", ")}</span>
                </div>
              )}
            </div>
          )}
          {rec.overview && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2 text-muted">
                줄거리
              </h3>
              <p className="text-sm leading-relaxed text-secondary">
                {rec.overview}
              </p>
            </div>
          )}
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2 text-muted">
              시청 가능
            </h3>
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
                    <span className="text-xs text-accent">열기</span>
                  </a>
                );
              })}
            </div>
            )}
          </div>
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
              label={`${related.collection.name} 시리즈`}
              works={related.collection.works}
              source="collection"
              tmdbId={rec.tmdbId}
              disabled={hydratingRelated}
              onClick={handleRelatedClick}
            />
          )}

          {related && related.directorWorks.length > 0 && (
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

          {/* share */}
          <button
            onClick={() => onShare(rec)}
            className="w-full mt-4 py-3 text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform rounded-lg"
            style={{
              background: "transparent",
              border: "1px solid var(--accent-border)",
              color: "var(--accent)",
            }}
          >
            <IconShare size={16} color="var(--accent)" />
            공유하기
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
}: {
  label: string;
  works: RelatedWork[];
  source: "collection" | "director";
  tmdbId: number;
  disabled?: boolean;
  onClick: (work: RelatedWork, source: "collection" | "director") => void;
}) {
  // tmdbId 는 PostHog 이벤트의 origin 식별 (이미 onClick 내부에서 fire 되지만,
  // 디버깅용 로그/data-attribute 로 노출 가능). 현재는 onClick 으로 전달만.
  void tmdbId;
  return (
    <div className="mt-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider mb-2 text-accent">
        {label}
      </h3>
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
                <div className="w-full h-full flex items-center justify-center text-muted text-xl">
                  ◇
                </div>
              )}
            </div>
            <div className="text-[11px] font-medium leading-snug line-clamp-2">
              {w.title}
            </div>
            {w.year && (
              <div className="font-data text-[10px] text-muted mt-0.5">
                {w.year}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
