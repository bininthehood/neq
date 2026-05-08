/**
 * ChapterMark — D3 콘텐츠 풍부화 섹션 헤더 (핸드오프 jsx Section 헤더 정량).
 *
 * Geist Mono · 11px (DESIGN.md 최소 xs) · uppercase · tracking 0.12em.
 * tone="accent" 는 시트의 첫 헤더(Synopsis)만 — 위계 정점 마커.
 * tone="muted" 는 그 외 섹션(Cast/Watch/Related) — 색이 아닌 위치/순서로 위계 표현.
 * (2026-05-02 amber 누적 분배 정책: 한 화면 amber ≤ 4)
 */
export function ChapterMark({
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
