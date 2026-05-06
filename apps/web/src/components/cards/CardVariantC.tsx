"use client";

/**
 * CardVariantC — Cinematic (어두운 백드롭 + 영화관 액자식).
 *
 * 핸드오프 v2 `neko-card-variants.jsx` L170-252 포팅.
 * 어두운 backdrop + 중앙 작은 포스터 + film grain + vignette + "Now Showing" 캡션.
 *
 * 변경/이탈:
 *   - 색상 토큰화 (var(--surface-sunken) = #0B0A07)
 *   - <img> → PosterImage
 *   - filter brightness/saturate/contrast 는 inline 유지 (CSS variable 로 빼기엔 단발성)
 *   - backdrop 이 null 이면 poster 로 폴백
 */

import type { CardVariantProps } from "./types";
import { CatChip, OttChip, PosterImage, Rating } from "./parts";

export default function CardVariantC({ work, w = 300, h = 460, fullbleed = false }: CardVariantProps) {
  const backdropSrc = work.backdrop || work.poster;

  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: fullbleed ? 0 : "var(--radius-xl)",
        overflow: "hidden",
        background: "var(--surface-sunken)",
        position: "relative",
        boxShadow: fullbleed ? "none" : "var(--shadow-lg)",
      }}
    >
      {/* backdrop image — heavy darkening */}
      <div style={{ position: "absolute", inset: 0 }}>
        <PosterImage
          src={backdropSrc}
          alt={work.title}
          fill
          filter="brightness(0.35) saturate(0.6) contrast(1.1)"
        />
      </div>

      {/* film grain overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "3px 3px",
          mixBlendMode: "overlay",
          pointerEvents: "none",
        }}
      />

      {/* vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(0,0,0,0.6) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* center poster — small & framed (152×228 in 320×480 ≈ 47.5%×47.5%) */}
      <div
        style={{
          position: "absolute",
          top: "42%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 152,
          height: 228,
          boxShadow:
            "0 20px 50px rgba(0,0,0,0.8), 0 0 0 1px var(--accent-border)",
          borderRadius: "var(--radius-sm)",
          overflow: "hidden",
        }}
      >
        <PosterImage src={work.poster} alt={work.title} fill />
        {/* mask the poster's baked-in title bar so it doesn't clash with the card's title */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "38%",
            background:
              "linear-gradient(to bottom, transparent 0%, rgba(11,10,7,0.4) 35%, rgba(11,10,7,0.95) 100%)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* top — cat + rating */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 18,
          right: 18,
          display: "flex",
          justifyContent: "space-between",
          zIndex: 2,
        }}
      >
        <CatChip cat={work.cat} />
        <div
          style={{
            padding: "4px 10px",
            borderRadius: "var(--radius-sm)",
            background: "rgba(0,0,0,0.5)",
            border: "1px solid var(--accent-border)",
          }}
        >
          <Rating value={work.rating} />
        </div>
      </div>

      {/* bottom — caption block, marquee feel */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: 18,
          textAlign: "center",
          zIndex: 2,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 11,
            fontStyle: "italic",
            color: "var(--accent)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          — Now Showing —
        </div>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-xl)",
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
            marginBottom: 6,
          }}
        >
          {work.title}
        </div>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "rgba(237,237,239,0.7)",
            marginBottom: 12,
            fontStyle: "italic",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {work.reason}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 10,
            alignItems: "center",
            fontFamily: "var(--font-data)",
            fontSize: 10,
            color: "var(--text-secondary)",
            letterSpacing: "0.08em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>{work.year}</span>
          <span
            style={{
              width: 3,
              height: 3,
              borderRadius: "50%",
              background: "var(--accent)",
            }}
          />
          <span>
            {work.runtime ? `${work.runtime}MIN` : work.seasons ? `S${work.seasons}` : "—"}
          </span>
          <span
            style={{
              width: 3,
              height: 3,
              borderRadius: "50%",
              background: "var(--accent)",
            }}
          />
          <div style={{ display: "flex", gap: 4 }}>
            {work.otts.slice(0, 3).map((o) => (
              <OttChip key={o} name={o} size={18} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
