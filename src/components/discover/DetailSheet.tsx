"use client";

import NextImage from "next/image";
import type { Recommendation } from "@/lib/types";
import { getOTTLink, getOTTIcon } from "@/lib/ott-links";
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
    r.country?.length > 0 ? r.country.join("/") : null,
    r.date ? r.date.slice(0, 4) : null,
    r.runtime ? `${r.runtime}분` : null,
    r.seasons ? `시즌 ${r.seasons}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function DetailSheet({
  rec,
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
            <div className="flex flex-col gap-2">
              {rec.providers.map((p) => {
                const u = getOTTLink(p.name, rec.title);
                return (
                  <a
                    key={p.name}
                    href={u ?? rec.watchLink ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
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
          </div>
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
