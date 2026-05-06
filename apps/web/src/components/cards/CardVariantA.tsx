"use client";

/**
 * CardVariantA — Poster-led (사진 잡지 톤).
 *
 * 핸드오프 v2 `neko-card-variants.jsx` L46-97 포팅.
 * 풀블리드 포스터 + 하단 그라디언트 캡션.
 *
 * 변경/이탈:
 *   - rgba 색상 → CSS 변수 (var(--bg-overlay), var(--accent), var(--text-primary))
 *   - <img> → PosterImage (Next/Image)
 *   - fullbleed prop 추가 — Discover immersive 모드 시 모서리/그림자 제거
 */

import type { CardVariantProps } from "./types";
import { CatChip, OttChip, PosterImage, Rating } from "./parts";

export default function CardVariantA({ work, w = 300, h = 460, fullbleed = false }: CardVariantProps) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: fullbleed ? 0 : "var(--radius-xl)",
        overflow: "hidden",
        background: "var(--surface)",
        position: "relative",
        boxShadow: fullbleed ? "none" : "var(--shadow-lg)",
      }}
    >
      {/* full-bleed poster */}
      <div style={{ position: "absolute", inset: 0 }}>
        <PosterImage src={work.poster} alt={work.title} fill />
      </div>

      {/* bottom gradient overlay — text legibility */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 50%, var(--bg-overlay-heavy) 92%, var(--bg-overlay-solid) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* top row — cat + rating */}
      <div
        style={{
          position: "absolute",
          top: 14,
          left: 14,
          right: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <CatChip cat={work.cat} />
        <div
          style={{
            padding: "4px 10px",
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-overlay)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <Rating value={work.rating} />
        </div>
      </div>

      {/* bottom — title + reason + otts */}
      <div
        style={{
          position: "absolute",
          left: 18,
          right: 18,
          bottom: 16,
          color: "var(--text-primary)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-sm)",
            fontStyle: "italic",
            color: "var(--accent)",
            letterSpacing: "0.02em",
            marginBottom: 6,
          }}
        >
          {work.year} · {work.titleEn}
        </div>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-2xl)",
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1.15,
            marginBottom: 10,
          }}
        >
          {work.title}
        </div>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-sm)",
            fontWeight: 400,
            color: "rgba(237,237,239,0.85)",
            lineHeight: 1.4,
            marginBottom: 12,
            maxWidth: "85%",
          }}
        >
          {work.reason}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {work.otts.map((o) => (
            <OttChip key={o} name={o} />
          ))}
        </div>
      </div>
    </div>
  );
}
