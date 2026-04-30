"use client";

/**
 * Illust — Quiet Ink 빈 상태 일러스트레이션 시스템.
 *
 * 8 시나리오 × 4 스타일.
 * - 본 D9 구현은 editorial + geometric 스타일 8종씩 = 16개 SVG 인라인 정의.
 * - letterpress / lineart 호출 시 editorial로 fallback (개발 모드 콘솔 경고 1회).
 *
 * 사용 패턴:
 *   <Illust name="welcome" style="editorial" size="md" />
 *
 * 시나리오 매핑 (StatusScreens 참조):
 *   welcome        — 첫 진입 / 스플래시
 *   emptyDiscover  — Discover 처음 / 카드 다 본 뒤 / Saved 필터 빈
 *   emptySaved     — Saved 0건
 *   noResults      — 검색 0건 / 추천 0건
 *   calibrating    — 첫 추천 계산 중 / 온보딩 분석
 *   error          — 네트워크 / 시스템 에러
 *   onboarding     — 온보딩 단계 진입 / 검색 0건 fallback
 *   archive        — 아카이브 / 컬렉션 (시청 리포트 #9 제거로 매핑 X — 정의만 유지)
 *
 * 색상 토큰 (illustrations.jsx 참조):
 *   ILLUST_AMBER     = #C4A35A (var(--accent))
 *   ILLUST_AMBER_DIM = rgba(196,163,90,0.20)
 *   ILLUST_INK       = #6B6C75 (var(--text-muted))
 *   ILLUST_STROKE    = #3A3833 (var(--border-strong))
 *   ILLUST_PAPER     = #24231E (var(--surface-raised))
 *   ILLUST_BG        = #12110E (var(--bg))
 *
 * Reduced motion: 정적 SVG, 모션 없음. 별도 분기 불필요.
 */

import type { CSSProperties, ReactNode } from "react";

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

export type IllustName =
  | "welcome"
  | "emptyDiscover"
  | "emptySaved"
  | "noResults"
  | "calibrating"
  | "error"
  | "onboarding"
  | "archive";

export type IllustStyle = "geometric" | "editorial" | "letterpress" | "lineart";

export type IllustSize = "sm" | "md" | "lg";

export interface IllustProps {
  name: IllustName;
  /** default: 'editorial' (phase2-brief.md §Visual style) */
  style?: IllustStyle;
  /** sm 64 / md 96 / lg 128 px (default 'md') */
  size?: IllustSize;
  /** 스크린리더 라벨 (생략 시 시각 숨김 처리 — 보조 일러) */
  "aria-label"?: string;
  className?: string;
  htmlStyle?: CSSProperties;
}

// ─────────────────────────────────────────────────────
// Color tokens — illustrations.jsx와 동일 hex
// ─────────────────────────────────────────────────────

export const ILLUST_AMBER = "#C4A35A";
export const ILLUST_AMBER_DIM = "rgba(196,163,90,0.20)";
export const ILLUST_INK = "#6B6C75";
export const ILLUST_STROKE = "#3A3833";
export const ILLUST_PAPER = "#24231E";
export const ILLUST_BG = "#12110E";

// ─────────────────────────────────────────────────────
// Pure logic — 단위 테스트 대상
// ─────────────────────────────────────────────────────

/** size → px (컨테이너 가로/세로). SVG viewBox는 200×200 고정. */
export function illustSizePx(size: IllustSize = "md"): number {
  switch (size) {
    case "sm":
      return 64;
    case "lg":
      return 128;
    case "md":
    default:
      return 96;
  }
}

/** 8 IllustName 전수 — 테스트에서 사용. */
export const ILLUST_NAMES: readonly IllustName[] = [
  "welcome",
  "emptyDiscover",
  "emptySaved",
  "noResults",
  "calibrating",
  "error",
  "onboarding",
  "archive",
];

/** 4 IllustStyle 전수. 본 구현은 editorial + geometric만. 나머지는 fallback. */
export const ILLUST_STYLES: readonly IllustStyle[] = [
  "geometric",
  "editorial",
  "letterpress",
  "lineart",
];

/**
 * Style fallback resolver — letterpress / lineart는 editorial로.
 * 단위 테스트 대상.
 */
export function resolveIllustStyle(style: IllustStyle): IllustStyle {
  if (style === "letterpress" || style === "lineart") {
    return "editorial";
  }
  return style;
}

// 개발 모드 1회 경고 — fallback 발생 시
const fallbackWarned = new Set<IllustStyle>();

function warnFallbackOnce(style: IllustStyle): void {
  if (typeof process === "undefined") return;
  if (process.env.NODE_ENV === "production") return;
  if (fallbackWarned.has(style)) return;
  fallbackWarned.add(style);
  // eslint-disable-next-line no-console
  console.warn(
    `[Illust] style="${style}" is not implemented yet — falling back to "editorial". This warning fires once per style per session.`,
  );
}

// ─────────────────────────────────────────────────────
// GEOMETRIC — 8종. 기하학적 추상.
// ─────────────────────────────────────────────────────

const GEOMETRIC: Record<IllustName, () => ReactNode> = {
  welcome: () => (
    <>
      <circle
        cx="100"
        cy="100"
        r="84"
        fill="none"
        stroke={ILLUST_STROKE}
        strokeWidth="1"
      />
      <path
        d="M 100 38 A 62 62 0 1 0 100 162 A 44 44 0 1 1 100 38 Z"
        fill={ILLUST_AMBER_DIM}
        stroke={ILLUST_AMBER}
        strokeWidth="1.5"
      />
      <circle cx="148" cy="64" r="3" fill={ILLUST_AMBER} />
      <line
        x1="22"
        y1="172"
        x2="178"
        y2="172"
        stroke={ILLUST_INK}
        strokeWidth="1"
        strokeLinecap="square"
      />
    </>
  ),
  emptyDiscover: () => (
    <>
      <rect
        x="64"
        y="56"
        width="72"
        height="100"
        rx="2"
        fill={ILLUST_PAPER}
        stroke={ILLUST_STROKE}
        strokeWidth="1"
        transform="rotate(-6 100 106)"
      />
      <rect
        x="64"
        y="56"
        width="72"
        height="100"
        rx="2"
        fill={ILLUST_PAPER}
        stroke={ILLUST_STROKE}
        strokeWidth="1"
        transform="rotate(-2 100 106)"
      />
      <rect
        x="64"
        y="56"
        width="72"
        height="100"
        rx="2"
        fill={ILLUST_BG}
        stroke={ILLUST_AMBER}
        strokeWidth="1.5"
      />
      <circle cx="100" cy="106" r="3" fill={ILLUST_AMBER} />
      <path
        d="M 152 106 L 172 106 M 166 100 L 172 106 L 166 112"
        fill="none"
        stroke={ILLUST_INK}
        strokeWidth="1"
        strokeLinecap="square"
      />
    </>
  ),
  emptySaved: () => (
    <>
      <rect
        x="36"
        y="40"
        width="128"
        height="120"
        fill="none"
        stroke={ILLUST_STROKE}
        strokeWidth="1"
      />
      <line
        x1="36"
        y1="100"
        x2="164"
        y2="100"
        stroke={ILLUST_STROKE}
        strokeWidth="1"
      />
      <rect
        x="56"
        y="56"
        width="6"
        height="40"
        fill={ILLUST_AMBER}
        transform="rotate(-8 59 76)"
      />
      <rect
        x="68"
        y="56"
        width="6"
        height="40"
        fill="none"
        stroke={ILLUST_INK}
        strokeWidth="1"
        transform="rotate(-3 71 76)"
      />
      <circle cx="100" cy="130" r="2" fill={ILLUST_INK} />
      <circle cx="112" cy="130" r="2" fill={ILLUST_INK} />
      <circle cx="124" cy="130" r="2" fill={ILLUST_INK} />
    </>
  ),
  noResults: () => (
    <>
      {[40, 70, 100, 130, 160].flatMap((y) =>
        [40, 70, 100, 130, 160].map((x) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill={ILLUST_INK} />
        )),
      )}
      <circle
        cx="86"
        cy="86"
        r="36"
        fill={ILLUST_BG}
        stroke={ILLUST_AMBER}
        strokeWidth="1.5"
      />
      <line
        x1="112"
        y1="112"
        x2="148"
        y2="148"
        stroke={ILLUST_AMBER}
        strokeWidth="1.5"
        strokeLinecap="square"
      />
      <line
        x1="68"
        y1="104"
        x2="104"
        y2="68"
        stroke={ILLUST_INK}
        strokeWidth="1"
        strokeLinecap="square"
      />
    </>
  ),
  calibrating: () => (
    <>
      <circle
        cx="100"
        cy="100"
        r="68"
        fill="none"
        stroke={ILLUST_STROKE}
        strokeWidth="1"
      />
      <path
        d="M 100 32 A 68 68 0 0 1 168 100"
        fill="none"
        stroke={ILLUST_AMBER}
        strokeWidth="1.5"
        strokeLinecap="square"
      />
      <line
        x1="40"
        y1="100"
        x2="160"
        y2="100"
        stroke={ILLUST_INK}
        strokeWidth="1"
        strokeLinecap="square"
      />
      <circle cx="128" cy="100" r="3" fill={ILLUST_AMBER} />
      <line x1="64" y1="96" x2="64" y2="104" stroke={ILLUST_INK} strokeWidth="1" />
      <line
        x1="100"
        y1="96"
        x2="100"
        y2="104"
        stroke={ILLUST_INK}
        strokeWidth="1"
      />
      <line
        x1="136"
        y1="96"
        x2="136"
        y2="104"
        stroke={ILLUST_INK}
        strokeWidth="1"
      />
    </>
  ),
  error: () => (
    <>
      <path
        d="M 50 50 L 150 50 L 150 100 L 100 150 L 50 150 Z"
        fill={ILLUST_PAPER}
        stroke={ILLUST_STROKE}
        strokeWidth="1"
      />
      <path
        d="M 100 150 L 150 100 L 150 50"
        fill="none"
        stroke={ILLUST_AMBER}
        strokeWidth="1.5"
      />
      <path
        d="M 50 110 L 80 100 L 75 120 L 105 110 L 100 130 L 130 120"
        fill="none"
        stroke={ILLUST_INK}
        strokeWidth="1"
        strokeLinecap="square"
      />
      <circle cx="160" cy="44" r="3" fill={ILLUST_AMBER} />
    </>
  ),
  onboarding: () => (
    <>
      <line
        x1="40"
        y1="170"
        x2="160"
        y2="170"
        stroke={ILLUST_STROKE}
        strokeWidth="1"
      />
      <circle cx="40" cy="170" r="3" fill={ILLUST_AMBER} />
      <circle cx="100" cy="170" r="3" fill={ILLUST_AMBER} />
      <circle cx="160" cy="170" r="3" fill={ILLUST_INK} fillOpacity="0.3" />
      <path
        d="M 70 60 L 130 100 L 70 140 Z"
        fill={ILLUST_AMBER_DIM}
        stroke={ILLUST_AMBER}
        strokeWidth="1.5"
        strokeLinejoin="miter"
      />
      <path
        d="M 50 60 L 110 100 L 50 140 Z"
        fill="none"
        stroke={ILLUST_STROKE}
        strokeWidth="1"
        strokeLinejoin="miter"
      />
    </>
  ),
  archive: () => (
    <>
      <rect
        x="40"
        y="50"
        width="120"
        height="10"
        fill={ILLUST_PAPER}
        stroke={ILLUST_STROKE}
        strokeWidth="1"
      />
      <rect
        x="50"
        y="68"
        width="100"
        height="10"
        fill={ILLUST_PAPER}
        stroke={ILLUST_STROKE}
        strokeWidth="1"
      />
      <rect x="40" y="86" width="120" height="10" fill={ILLUST_AMBER} />
      <rect
        x="58"
        y="104"
        width="84"
        height="10"
        fill={ILLUST_PAPER}
        stroke={ILLUST_STROKE}
        strokeWidth="1"
      />
      <rect
        x="40"
        y="122"
        width="120"
        height="10"
        fill={ILLUST_PAPER}
        stroke={ILLUST_STROKE}
        strokeWidth="1"
      />
      <rect
        x="64"
        y="140"
        width="72"
        height="10"
        fill={ILLUST_PAPER}
        stroke={ILLUST_STROKE}
        strokeWidth="1"
      />
      <circle cx="170" cy="91" r="2.5" fill={ILLUST_AMBER} />
    </>
  ),
};

// ─────────────────────────────────────────────────────
// EDITORIAL — 8종. 잡지 일러 느낌. 손맛 있는 잉크 스팟.
// ─────────────────────────────────────────────────────

const EDITORIAL: Record<IllustName, () => ReactNode> = {
  welcome: () => (
    <>
      {/* sun rising — sketchy curve */}
      <path
        d="M 60 100 Q 80 60, 100 60 Q 122 60, 140 100"
        fill="none"
        stroke={ILLUST_AMBER}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M 60 100 L 140 100"
        stroke={ILLUST_AMBER}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* horizon — hand wobble */}
      <path
        d="M 22 138 Q 60 136, 100 138 T 178 138"
        fill="none"
        stroke={ILLUST_INK}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* hatching inside sun */}
      <path
        d="M 78 88 L 122 88 M 76 96 L 124 96 M 80 80 L 120 80"
        stroke={ILLUST_AMBER}
        strokeWidth="0.6"
        strokeLinecap="round"
        opacity="0.5"
      />
      {/* small bird mark */}
      <path
        d="M 144 56 q 6 -4 12 0 q 6 -4 12 0"
        fill="none"
        stroke={ILLUST_INK}
        strokeWidth="1"
        strokeLinecap="round"
      />
    </>
  ),
  emptyDiscover: () => (
    <>
      {/* card outline — slightly wonky */}
      <path
        d="M 70 56 L 138 60 L 134 156 L 66 152 Z"
        fill={ILLUST_PAPER}
        stroke={ILLUST_INK}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* inner sketch lines */}
      <path
        d="M 78 80 L 124 84 M 76 96 L 126 100 M 78 116 L 122 120"
        stroke={ILLUST_INK}
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.5"
      />
      {/* amber ink stamp */}
      <circle cx="100" cy="120" r="5" fill={ILLUST_AMBER} />
      <circle
        cx="100"
        cy="120"
        r="9"
        fill="none"
        stroke={ILLUST_AMBER}
        strokeWidth="0.8"
        opacity="0.4"
      />
      {/* arrow swoosh */}
      <path
        d="M 148 106 q 12 -4 20 0 m -6 -5 l 6 5 l -6 6"
        fill="none"
        stroke={ILLUST_AMBER}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </>
  ),
  emptySaved: () => (
    <>
      {/* sketchy plank */}
      <path
        d="M 30 110 L 170 116"
        stroke={ILLUST_INK}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M 30 110 L 30 130 L 170 136 L 170 116"
        fill="none"
        stroke={ILLUST_INK}
        strokeWidth="0.8"
        strokeLinecap="round"
      />
      {/* two leaning books */}
      <path
        d="M 50 70 L 56 110 L 64 110 L 60 70 Z"
        fill={ILLUST_AMBER}
        stroke={ILLUST_AMBER_DIM}
        strokeWidth="0.5"
      />
      <path
        d="M 70 76 L 76 111 L 84 111 L 78 74 Z"
        fill="none"
        stroke={ILLUST_INK}
        strokeWidth="1"
      />
      {/* tiny sparkle */}
      <path
        d="M 130 80 L 134 84 M 132 78 L 132 86"
        stroke={ILLUST_AMBER}
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* faint hatching for texture */}
      <path
        d="M 40 130 L 46 134 M 60 132 L 66 136 M 80 134 L 86 138 M 100 134 L 106 138 M 120 134 L 126 138"
        stroke={ILLUST_INK}
        strokeWidth="0.5"
        opacity="0.4"
      />
    </>
  ),
  noResults: () => (
    <>
      {/* page underneath */}
      <path
        d="M 60 50 L 150 56 L 144 158 L 54 152 Z"
        fill={ILLUST_PAPER}
        stroke={ILLUST_INK}
        strokeWidth="1.2"
        strokeLinejoin="round"
        opacity="0.6"
      />
      {/* lens */}
      <ellipse
        cx="100"
        cy="92"
        rx="32"
        ry="30"
        fill="none"
        stroke={ILLUST_AMBER}
        strokeWidth="1.4"
      />
      {/* handle — hand-drawn */}
      <path
        d="M 124 116 q 8 8 16 18 q 4 4 8 6"
        fill="none"
        stroke={ILLUST_AMBER}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* lens highlight */}
      <path
        d="M 84 78 q 8 -4 16 0"
        fill="none"
        stroke={ILLUST_AMBER}
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.6"
      />
      {/* nothing slash */}
      <path
        d="M 84 102 q 16 -8 32 0"
        fill="none"
        stroke={ILLUST_INK}
        strokeWidth="1"
        strokeLinecap="round"
      />
    </>
  ),
  calibrating: () => (
    <>
      {/* balance scale beam */}
      <path
        d="M 100 36 L 100 110"
        stroke={ILLUST_INK}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M 50 64 L 150 60"
        stroke={ILLUST_INK}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* left pan */}
      <path
        d="M 36 64 q 14 22 28 0"
        fill="none"
        stroke={ILLUST_INK}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M 36 64 L 64 64"
        stroke={ILLUST_INK}
        strokeWidth="0.6"
        strokeLinecap="round"
        opacity="0.4"
      />
      {/* right pan — tipped, amber */}
      <path
        d="M 134 64 q 14 22 28 0"
        fill="none"
        stroke={ILLUST_AMBER}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M 134 64 L 162 64"
        stroke={ILLUST_AMBER}
        strokeWidth="0.6"
        strokeLinecap="round"
        opacity="0.5"
      />
      {/* weight in right pan */}
      <circle cx="148" cy="74" r="4" fill={ILLUST_AMBER} />
      {/* base */}
      <path
        d="M 76 130 L 124 130"
        stroke={ILLUST_INK}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M 92 130 L 84 150 M 108 130 L 116 150"
        stroke={ILLUST_INK}
        strokeWidth="1"
        strokeLinecap="round"
      />
    </>
  ),
  error: () => (
    <>
      {/* torn paper */}
      <path
        d="M 50 50 L 150 50 L 150 96 L 130 100 L 140 110 L 120 116 L 132 130 L 110 134 L 124 150 L 50 150 Z"
        fill={ILLUST_PAPER}
        stroke={ILLUST_INK}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* hatching */}
      <path
        d="M 64 70 L 116 70 M 62 84 L 112 84 M 62 96 L 100 96"
        stroke={ILLUST_INK}
        strokeWidth="0.7"
        strokeLinecap="round"
        opacity="0.4"
      />
      {/* exclamation */}
      <circle
        cx="158"
        cy="56"
        r="10"
        fill="none"
        stroke={ILLUST_AMBER}
        strokeWidth="1.2"
      />
      <path
        d="M 158 50 L 158 58 M 158 62 L 158 63"
        stroke={ILLUST_AMBER}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </>
  ),
  onboarding: () => (
    <>
      {/* footstep trail */}
      <path
        d="M 36 132 q 20 -30 60 -28 q 40 2 60 -32"
        fill="none"
        stroke={ILLUST_INK}
        strokeWidth="1"
        strokeLinecap="round"
        strokeDasharray="4 4"
      />
      {/* footprint marks */}
      <ellipse cx="48" cy="130" rx="6" ry="3" fill={ILLUST_INK} opacity="0.5" />
      <ellipse cx="78" cy="116" rx="6" ry="3" fill={ILLUST_INK} opacity="0.7" />
      <ellipse cx="110" cy="106" rx="6" ry="3" fill={ILLUST_AMBER} />
      {/* destination flag */}
      <path
        d="M 152 72 L 152 130"
        stroke={ILLUST_AMBER}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M 152 72 L 174 80 L 152 90" fill={ILLUST_AMBER} />
      {/* glow under flag */}
      <ellipse cx="152" cy="132" rx="10" ry="2" fill={ILLUST_AMBER} opacity="0.3" />
    </>
  ),
  archive: () => (
    <>
      {/* stacked polaroid cards */}
      <path
        d="M 36 60 L 110 56 L 116 124 L 42 128 Z"
        fill={ILLUST_PAPER}
        stroke={ILLUST_INK}
        strokeWidth="1"
        transform="rotate(-8 76 92)"
      />
      <path
        d="M 60 50 L 134 54 L 130 122 L 56 118 Z"
        fill={ILLUST_PAPER}
        stroke={ILLUST_INK}
        strokeWidth="1"
        transform="rotate(2 96 86)"
      />
      <path
        d="M 84 56 L 158 58 L 156 126 L 82 124 Z"
        fill={ILLUST_BG}
        stroke={ILLUST_AMBER}
        strokeWidth="1.4"
        transform="rotate(8 120 92)"
      />
      {/* sketch lines inside top card */}
      <path
        d="M 100 80 q 10 -4 20 0 M 96 96 q 14 -4 28 0 M 96 110 q 10 -4 20 0"
        stroke={ILLUST_AMBER}
        strokeWidth="0.7"
        strokeLinecap="round"
        opacity="0.5"
        transform="rotate(8 120 92)"
      />
      {/* heart save mark */}
      <path
        d="M 168 142 q -3 -4 -6 0 q -3 -4 -6 0 q 0 4 6 8 q 6 -4 6 -8 z"
        fill={ILLUST_AMBER}
      />
    </>
  ),
};

// ─────────────────────────────────────────────────────
// Style sets
// ─────────────────────────────────────────────────────

const STYLES: Record<"editorial" | "geometric", Record<IllustName, () => ReactNode>> = {
  editorial: EDITORIAL,
  geometric: GEOMETRIC,
};

/**
 * 디버그/테스트용: 주어진 (name, style) 조합이 fallback 없이 직접 정의되어 있는지 확인.
 * letterpress / lineart는 false 반환 — 호출 시 editorial로 fallback이 일어남을 의미.
 *
 * @returns true  — editorial / geometric 본 위임 구현 범위
 *          false — letterpress / lineart 본 위임 스코프 외 (호출 시 fallback)
 */
export function illustHasNativeStyle(name: IllustName, style: IllustStyle): boolean {
  if (style !== "editorial" && style !== "geometric") return false;
  const set = STYLES[style];
  return !!set[name];
}

// ─────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────

export function Illust({
  name,
  style = "editorial",
  size = "md",
  "aria-label": ariaLabel,
  className,
  htmlStyle,
}: IllustProps) {
  // letterpress / lineart fallback
  if (style === "letterpress" || style === "lineart") {
    warnFallbackOnce(style);
  }
  const resolved = resolveIllustStyle(style);
  const set =
    resolved === "geometric" ? STYLES.geometric : STYLES.editorial;
  const Body = set[name];
  if (!Body) return null;

  const px = illustSizePx(size);

  return (
    <svg
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className={className}
      width={px}
      height={px}
      viewBox="0 0 200 200"
      data-neko-illust={name}
      data-neko-illust-style={resolved}
      style={{ display: "block", flexShrink: 0, ...htmlStyle }}
    >
      <Body />
    </svg>
  );
}
