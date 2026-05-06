"use client";

/**
 * CardVariantB — Typography-led (제목·이유가 위계 상위).
 *
 * 핸드오프 v2 `neko-card-variants.jsx` L100-167 포팅.
 * 작은 포스터 스트립(상단) + 큰 타이포 블록(하단).
 *
 * 한국어 fallback:
 *   - 명세는 reason 인용구를 Fraunces 이탤릭으로 렌더하지만, 한글에는 Noto Serif KR 가 fallback.
 *   - var(--font-display) = `var(--font-instrument-serif), Georgia, serif`
 *     → Korean 글자는 Pretendard 로 떨어지지 않게 'Noto Serif KR' 폴백 추가 필요
 *   - 본 컴포넌트 reason 의 fontFamily 만 'Noto Serif KR' 명시. globals.css :root 수정은
 *     03_b1_card_variants_changes.md 의 미해결 이슈로 남김 (여러 컴포넌트 영향).
 *
 * 변경/이탈:
 *   - 색상 토큰화
 *   - DESIGN.md anti-slop #6 (border-left 인용 블록) 회피 위해 좌측 4px 마진 + 색만 강조
 *     → 핸드오프는 borderLeft 2px 사용. 두 안 모두 가능. 명세 우선 → borderLeft 유지하되 액센트 색.
 *     이유: anti-slop 은 "AI 가 좋아하는" 패턴 회피로 본 카드의 디자인 언어 자체로 의도됨.
 */

import type { CardVariantProps } from "./types";
import { CatChip, OttChip, PosterImage, Rating } from "./parts";

export default function CardVariantB({ work, w = 300, h = 460, fullbleed = false }: CardVariantProps) {
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
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* small poster strip on top — 200/460 ≈ 43% */}
      <div style={{ position: "relative", height: "43%", overflow: "hidden", flexShrink: 0 }}>
        <PosterImage
          src={work.poster}
          alt={work.title}
          fill
          filter="saturate(0.85)"
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(26,25,22,0) 60%, var(--surface) 100%)",
            pointerEvents: "none",
          }}
        />
        {/* tiny meta over poster */}
        <div style={{ position: "absolute", top: 12, left: 14 }}>
          <CatChip cat={work.cat} />
        </div>
        <div style={{ position: "absolute", top: 14, right: 14 }}>
          <Rating value={work.rating} />
        </div>
      </div>

      {/* big typography block */}
      <div
        style={{
          flex: 1,
          padding: "14px 22px 20px",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        {/* italic Fraunces year + en — overline */}
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 12,
            fontStyle: "italic",
            color: "var(--text-secondary)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {work.titleEn} · {work.year}
        </div>

        {/* title — Pretendard bold (한글 우선).
            W4: 핸드오프 명세 32px 강화 — Typography-led 정체성 강조.
            새 토큰 추가하지 않고 variant B 전용 inline 처리 (확산 방지). */}
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "2rem",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
            color: "var(--text-primary)",
            marginBottom: 14,
          }}
        >
          {work.title}
        </div>

        {/* pull quote — reason in serif italic.
            한글은 Noto Serif KR 폴백. 영문은 Instrument Serif. */}
        <div
          style={{
            fontFamily:
              "var(--font-display), 'Noto Serif KR', var(--font-body), serif",
            fontSize: "var(--text-base)",
            fontStyle: "italic",
            fontWeight: 400,
            letterSpacing: "-0.01em",
            lineHeight: 1.4,
            color: "var(--accent)",
            paddingLeft: 12,
            borderLeft: "2px solid var(--accent)",
            marginBottom: "auto",
            // 긴 reason 잘라내기 — 카드 dim 고정이므로 max 4 라인.
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          &ldquo;{work.reason}&rdquo;
        </div>

        {/* bottom row — otts + dot meta */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 16,
            paddingTop: 12,
            borderTop: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", gap: 6 }}>
            {work.otts.map((o) => (
              <OttChip key={o} name={o} size={20} />
            ))}
          </div>
          <div
            style={{
              fontFamily: "var(--font-data)",
              fontSize: 10,
              color: "var(--text-muted)",
              letterSpacing: "0.05em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {work.runtime ? `${work.runtime}분` : work.seasons ? `시즌 ${work.seasons}` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
