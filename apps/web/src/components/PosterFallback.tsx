/**
 * PosterFallback — 포스터 이미지가 없거나 로드 실패 시 표시되는 typographic fallback.
 *
 * D7 / Round 2 Edge Cases 명세:
 *  - dashed border (1px dashed var(--border))
 *  - Fraunces italic 큰 타이틀 (작품 제목의 줄바꿈 가능)
 *  - Geist Mono uppercase eyebrow (`poster · n/a`) — 빈 상태에도 디자인 정체성 유지
 *  - bg-surface-sunken 으로 카드 본문과 대비
 *
 * 단순 회색 박스(LLM-slop)에서 탈피하여 빈 상태에도 안목있는 큐레이션 인상을 유지.
 * size="xs" 는 history thumbnail (64×96 이하), size="lg" 는 SwipeCard 메인 (320+).
 */

type Size = "xs" | "sm" | "md" | "lg";

interface Props {
  title: string;
  /** xs: 64×96 / sm: 96×144 / md: 200×300 / lg: SwipeCard 큰 메인 */
  size?: Size;
  /** 카드 영역 채우기 (absolute inset-0 형태) */
  fill?: boolean;
  className?: string;
  /** eyebrow 텍스트 — 기본 "poster · n/a" */
  eyebrow?: string;
}

/**
 * 작품 제목을 이중 줄로 분할 (한글/영문 혼합 대응).
 * 너무 길면 두 어절 / 너무 짧으면 그대로.
 */
function splitTitle(title: string): { line1: string; line2?: string } {
  const trimmed = title.trim();
  if (trimmed.length <= 4) return { line1: trimmed };
  // 공백 분할
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const mid = Math.ceil(parts.length / 2);
    return {
      line1: parts.slice(0, mid).join(" "),
      line2: parts.slice(mid).join(" "),
    };
  }
  // 공백 없는 한글 등 — 중간 분할
  const mid = Math.ceil(trimmed.length / 2);
  return { line1: trimmed.slice(0, mid), line2: trimmed.slice(mid) };
}

const SIZE_MAP: Record<
  Size,
  { titleSize: string; eyebrowSize: string; padding: string; gap: string }
> = {
  xs: {
    titleSize: "text-base", // 16px — 64×96 썸네일
    eyebrowSize: "text-[9px]",
    padding: "p-1.5",
    gap: "gap-1",
  },
  sm: {
    titleSize: "text-xl", // 22px — 96×144 detail poster
    eyebrowSize: "text-[10px]",
    padding: "p-2",
    gap: "gap-1.5",
  },
  md: {
    titleSize: "text-2xl", // 28px — 카드 그리드 (Saved 200~240px)
    eyebrowSize: "text-[10px]",
    padding: "p-3",
    gap: "gap-2",
  },
  lg: {
    titleSize: "text-3xl sm:text-[44px]", // SwipeCard 메인
    eyebrowSize: "text-[11px]",
    padding: "p-5",
    gap: "gap-3",
  },
};

export default function PosterFallback({
  title,
  size = "md",
  fill = false,
  className = "",
  eyebrow = "poster · n/a",
}: Props) {
  const { line1, line2 } = splitTitle(title);
  const cfg = SIZE_MAP[size];

  // dashed border + surface-sunken — anti-slop 회색 박스 회피
  const baseClass = `flex flex-col items-center justify-center text-center ${cfg.padding} ${cfg.gap}`;
  const positionClass = fill ? "absolute inset-0" : "w-full h-full";

  return (
    <div
      className={`${positionClass} ${baseClass} ${className}`}
      style={{
        background: "var(--surface-sunken)",
        border: "1px dashed var(--border)",
        borderRadius: "inherit",
      }}
      aria-hidden="true"
    >
      <div
        className={`${cfg.titleSize} font-display`}
        style={{
          fontStyle: "italic",
          fontWeight: 500,
          letterSpacing: "-0.02em",
          lineHeight: 1.05,
          color: "var(--text-primary)",
        }}
      >
        {line1}
        {line2 && (
          <>
            <br />
            {line2}
          </>
        )}
      </div>
      {/* eyebrow — Geist Mono 가 없을 때는 font-data (Outfit) 폴백,
          uppercase + tracking 으로 잡지/티켓 톤 유지 */}
      <div
        className={`${cfg.eyebrowSize} font-data uppercase`}
        style={{
          color: "var(--text-muted)",
          letterSpacing: "0.15em",
        }}
      >
        {eyebrow}
      </div>
    </div>
  );
}
