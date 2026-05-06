"use client";

/**
 * Card variants 공용 sub-components.
 * 핸드오프 v2 `neko-card-variants.jsx` 의 _OttChip / _CatChip / _Rating 포팅.
 *
 * - 토큰 (CSS 변수) 사용 — 하드코딩된 색상 금지
 * - DESIGN.md 의 anti-slop 준수 (그라디언트 배경 X, 균일 둥근 모서리 X)
 * - 한글 라벨 + 영문 비율 우선 Pretendard
 */

import NextImage from "next/image";
import type { CSSProperties } from "react";
import { IconStar } from "@/components/Icons";
import { getOTTIcon } from "@/lib/ott-links";
import {
  CAT_COLOR_VAR,
  CAT_LABEL,
  type CardCategory,
} from "./types";

/* ─── Category chip ───────────────────────────────────
 * 핸드오프 v2: rgba(18,17,14,0.7) bg + 카테고리 색 텍스트 + 1px ${color}40 보더.
 * 토큰 매핑: bg = var(--bg-overlay), 카테고리 색 = var(--cat-*).
 * 보더는 카테고리 색의 25% 투명 — color-mix 로.
 */
export function CatChip({ cat, style }: { cat: CardCategory; style?: CSSProperties }) {
  const color = CAT_COLOR_VAR[cat];
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "4px 10px",
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-overlay)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        color,
        fontFamily: "var(--font-body)",
        fontSize: "var(--text-xs)",
        fontWeight: 600,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
        letterSpacing: "-0.005em",
        ...style,
      }}
    >
      {CAT_LABEL[cat]}
    </span>
  );
}

/* ─── OTT chip — TMDB provider 이미지 우선, 없으면 plain ───
 * 핸드오프 명세는 22×22 정사각 short-code 칩이지만,
 * 현재 코드베이스는 OTT 아이콘 SVG 자산을 갖고 있어 그쪽을 우선.
 * 자산 없으면 명세대로 short-code chip 폴백.
 */
export function OttChip({ name, size = 22 }: { name: string; size?: number }) {
  const iconSrc = getOTTIcon(name);
  if (iconSrc) {
    return (
      <NextImage
        src={iconSrc}
        alt={name}
        width={size}
        height={size}
        className="object-contain"
        style={{ borderRadius: "var(--radius-sm)" }}
        unoptimized
      />
    );
  }
  // 폴백: short-code (앞 2글자 대문자)
  const short = name.slice(0, 2).toUpperCase();
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "var(--radius-sm)",
        background: "var(--surface-raised)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-data)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "-0.02em",
      }}
    >
      {short}
    </span>
  );
}

/* ─── Rating — star + tabular-nums ─────────────────── */
export function Rating({
  value,
  color = "var(--accent)",
  size = 11,
}: {
  value: number;
  color?: string;
  size?: number;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontFamily: "var(--font-data)",
        fontSize: 12,
        fontWeight: 600,
        color,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <IconStar size={size} color={color} />
      {value.toFixed(1)}
    </span>
  );
}

/* ─── PosterImage — Next/Image 또는 fallback ─────────
 * 핸드오프는 plain <img>. 우리는 Next/Image 우선.
 */
export function PosterImage({
  src,
  alt,
  fill = false,
  filter,
  style,
}: {
  src: string | null;
  alt: string;
  fill?: boolean;
  filter?: string;
  style?: CSSProperties;
}) {
  if (!src) {
    return (
      <div
        style={{
          position: fill ? "absolute" : "relative",
          inset: fill ? 0 : undefined,
          width: fill ? "100%" : "100%",
          height: fill ? "100%" : "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--surface)",
          ...style,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 48,
            color: "var(--text-muted)",
          }}
        >
          N
        </span>
      </div>
    );
  }
  if (fill) {
    return (
      <NextImage
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 480px) 90vw, 400px"
        className="object-cover object-top"
        style={{ filter, ...style }}
      />
    );
  }
  return (
    <NextImage
      src={src}
      alt={alt}
      width={300}
      height={460}
      sizes="(max-width: 480px) 90vw, 400px"
      className="object-cover object-top"
      style={{ width: "100%", height: "100%", filter, ...style }}
    />
  );
}
