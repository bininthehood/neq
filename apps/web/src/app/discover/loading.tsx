/**
 * DiscoverLoading — 첫 페이지 진입 시 Discover 페이지 skeleton.
 *
 * D7 / Round 2 Edge Cases 1A 명세:
 *  - 2:3 비율 카드 1장 + 내부 5개 skel row (제목/포스터 62%/메타1/메타2/OTT 칩 3개)
 *  - chip skeleton (filter chips)
 *  - 마이크로카피: "오늘의 다섯 편, 고르는 중" + "Curating · 1 / 5" eyebrow
 *
 * pulse 애니메이션은 globals.css 의 prefers-reduced-motion 가드로 자동 차단됨.
 */
export default function DiscoverLoading() {
  return (
    <div className="h-dvh flex flex-col" aria-busy="true" aria-label="추천 작품 불러오는 중">
      {/* Header — 워드마크는 neq-logo.png 이미지 정본 (DESIGN.md Brand Identity) */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/neq-logo.png" alt="neq," className="h-5 object-contain" />
        <div className="w-9 h-9 animate-pulse bg-surface rounded-full" />
      </div>

      {/* Filter chips placeholder — 4개 chip 가변 폭 */}
      <div className="shrink-0 px-4 py-2 flex gap-2 overflow-hidden">
        <div className="h-9 w-15 animate-pulse bg-surface rounded-full" style={{ width: 60 }} />
        <div className="h-9 animate-pulse bg-surface rounded-full" style={{ width: 50 }} />
        <div className="h-9 animate-pulse bg-surface rounded-full" style={{ width: 70 }} />
        <div className="h-9 animate-pulse bg-surface rounded-full" style={{ width: 45 }} />
      </div>

      {/* "오늘의 다섯 편, 고르는 중" sub-eyebrow — body 톤 */}
      <div className="px-5 pb-2 shrink-0 flex items-center gap-2">
        <span
          className="inline-block w-1 h-1 rounded-full animate-pulse"
          style={{ background: "var(--accent)" }}
        />
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          오늘의 다섯 편, 고르는 중
        </span>
      </div>

      {/* Card skeleton — 2:3 비율 1장, 내부 5개 row */}
      <div className="flex-1 flex items-center justify-center px-5 pb-3 min-h-0">
        <div
          className="w-full max-w-[320px] flex flex-col gap-2.5 p-3.5"
          style={{
            aspectRatio: "2 / 3",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-xl)",
          }}
        >
          {/* row 1: title (h 18, w 40%) */}
          <div
            className="animate-pulse rounded-md bg-surface-raised"
            style={{ height: 18, width: "40%" }}
          />
          {/* row 2: poster slab (h 62%, r 8) — 핵심 */}
          <div
            className="animate-pulse rounded-md bg-surface-raised flex-1"
            style={{ minHeight: "55%" }}
          />
          {/* row 3: meta line 1 (h 14, w 80%) */}
          <div
            className="animate-pulse rounded-sm bg-surface-raised"
            style={{ height: 14, width: "80%" }}
          />
          {/* row 4: meta line 2 (h 11, w 60%) */}
          <div
            className="animate-pulse rounded-sm bg-surface-raised"
            style={{ height: 11, width: "60%" }}
          />
          {/* row 5: 3 OTT chips */}
          <div className="flex gap-1.5 mt-auto">
            <div
              className="animate-pulse bg-surface-raised"
              style={{ height: 20, width: 56, borderRadius: 10 }}
            />
            <div
              className="animate-pulse bg-surface-raised"
              style={{ height: 20, width: 48, borderRadius: 10 }}
            />
            <div
              className="animate-pulse bg-surface-raised"
              style={{ height: 20, width: 42, borderRadius: 10 }}
            />
          </div>
        </div>
      </div>

      {/* "Curating · 1 / 5" — Geist Mono 톤 (font-data uppercase, 10px, 0.15em tracking) */}
      <div className="px-4 pb-2 shrink-0 text-center">
        <p
          className="font-data uppercase"
          style={{
            fontSize: "10px",
            letterSpacing: "0.15em",
            color: "var(--text-muted)",
          }}
        >
          Curating · 1 / 5
        </p>
      </div>

      {/* Bottom nav placeholder */}
      <nav
        className="flex pb-6 pt-2 shrink-0"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div className="flex-1 flex flex-col items-center gap-1.5 py-2">
          <div className="w-5 h-5 animate-pulse bg-surface-raised rounded-sm" />
          <div className="w-12 h-3 animate-pulse bg-surface-raised rounded-sm" />
        </div>
        <div className="flex-1 flex flex-col items-center gap-1.5 py-2">
          <div className="w-5 h-5 animate-pulse bg-surface-raised rounded-sm" />
          <div className="w-10 h-3 animate-pulse bg-surface-raised rounded-sm" />
        </div>
      </nav>
    </div>
  );
}
