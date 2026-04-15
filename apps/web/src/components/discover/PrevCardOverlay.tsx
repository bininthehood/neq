"use client";

import NextImage from "next/image";
import type { Recommendation } from "@/lib/types";
import { getOTTIcon } from "@/lib/ott-links";

interface PrevCardOverlayProps {
  prev: Recommendation;
  prevOverlayX: number;
  isDragging: boolean;
  metaInfo: string;
}

export default function PrevCardOverlay({
  prev,
  prevOverlayX,
  isDragging,
  metaInfo,
}: PrevCardOverlayProps) {
  return (
    <div
      className="absolute overflow-hidden will-change-transform rounded-xl"
      style={{
        top: 0,
        bottom: "8px",
        left: "12px",
        right: "12px",
        transform: `translateX(${prevOverlayX}px)`,
        transition: isDragging
          ? "none"
          : "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
        zIndex: 20,
        boxShadow: "8px 0 32px rgba(0,0,0,0.5)",
      }}
    >
      {prev.posterUrl ? (
        <NextImage
          src={prev.posterUrl}
          alt={prev.title}
          fill
          className="object-cover"
          sizes="(max-width: 480px) 90vw, 400px"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-surface">
          <span className="font-display text-5xl text-muted">N</span>
        </div>
      )}
      <div className="absolute top-4 right-4 backdrop-blur-sm px-3 py-1.5 flex items-center gap-1.5 bg-overlay rounded-md">
        <span className="font-data font-semibold text-accent">
          {prev.rating.toFixed(1)}
        </span>
      </div>
      <div className="absolute top-4 left-4 backdrop-blur-sm px-3 py-1.5 text-sm bg-overlay rounded-md">
        {prev.type === "series" ? "시리즈" : "영화"}
      </div>
      <div
        className="absolute bottom-0 left-0 right-0 p-5 pt-24"
        style={{
          background:
            "linear-gradient(transparent, var(--bg-overlay-heavy) 40%, var(--bg))",
        }}
      >
        <h2 className="font-display text-3xl font-bold">{prev.title}</h2>
        <div className="flex items-center gap-2 mt-1.5">
          {metaInfo && (
            <span className="text-xs text-muted">{metaInfo}</span>
          )}
          <div className="flex gap-1 items-center">
            {prev.providers.slice(0, 4).map((p) => {
              const iconSrc = getOTTIcon(p.name) ?? p.logoUrl;
              return iconSrc ? (
                <NextImage
                  key={p.name}
                  src={iconSrc}
                  alt={p.name}
                  width={24}
                  height={24}
                  className="object-contain rounded-sm"
                  unoptimized
                />
              ) : null;
            })}
          </div>
        </div>
        <div
          className="mt-2 px-2.5 py-1.5 text-sm rounded-md text-secondary"
          style={{ background: "var(--accent-dim)" }}
        >
          {prev.reason}
        </div>
      </div>
    </div>
  );
}
