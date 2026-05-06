interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

export function IconPass({ size = 24, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="square" strokeLinejoin="miter" className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function IconSave({ size = 24, color = "currentColor", className, filled = true }: IconProps & { filled?: boolean }) {
  if (filled) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none" className={className}>
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        stroke={color} strokeWidth={1.2} strokeLinecap="square" />
    </svg>
  );
}

export function IconInfo({ size = 24, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeLinecap="square" className={className}>
      <line x1="12" y1="16" x2="12" y2="12" strokeWidth={2} />
      <circle cx="12" cy="8" r="0.8" fill={color} stroke="none" />
    </svg>
  );
}

export function IconRefresh({ size = 16, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

export function IconRewind({ size = 20, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none" className={className}>
      <polygon points="11 19 2 12 11 5 11 19" />
      <polygon points="22 19 13 12 22 5 22 19" />
    </svg>
  );
}

export function IconDetail({ size = 20, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <line x1="4" y1="7" x2="20" y2="7" stroke={color} strokeWidth={2.2} strokeLinecap="square" />
      <line x1="4" y1="12" x2="16" y2="12" stroke={color} strokeWidth={1.5} strokeLinecap="square" />
      <line x1="4" y1="17" x2="12" y2="17" stroke={color} strokeWidth={1} strokeLinecap="square" />
    </svg>
  );
}

export function IconChevronUp({ size = 16, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="square" className={className}>
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

export function IconClose({ size = 20, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <line x1="6" y1="6" x2="18" y2="18" stroke={color} strokeWidth={2.2} strokeLinecap="square" />
      <line x1="18" y1="6" x2="6" y2="18" stroke={color} strokeWidth={1.2} strokeLinecap="square" />
    </svg>
  );
}

export function IconCheck({ size = 16, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeLinecap="square" className={className}>
      <polyline points="20 6 9 17 4 12" strokeWidth={2.5} />
    </svg>
  );
}

export function IconStar({ size = 14, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none" className={className}>
      <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4l-6.4 4.8 2.4-7.2-6-4.8h7.6L12 2z" />
    </svg>
  );
}

// 핸드오프 (_design-handoff/Phase 4 - Full Prototype.html L171-172) — active variant 두 가지.
//   active: 외곽 circle r=7.5 stroke 1.5 + 중앙 small dot fill (focus 인지)
//   inactive: 외곽 circle r=7.5 stroke 1.4 + diamond stroke 1.2 (방향 모티프)
export function IconDiscover({ size = 20, color = "currentColor", className, active = false }: IconProps & { active?: boolean }) {
  if (active) {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
        <circle cx="10" cy="10" r="7.5" stroke={color} strokeWidth={1.5} />
        <circle cx="10" cy="10" r="2" fill={color} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="10" cy="10" r="7.5" stroke={color} strokeWidth={1.4} />
      <path d="M13 7L11 11L7 13L9 9L13 7Z" stroke={color} strokeWidth={1.2} strokeLinejoin="round" />
    </svg>
  );
}

// 핸드오프 (_design-handoff/Phase 4 L178) — Saved 탭은 Heart 가 아니라 Bookmark.
// active 시 fillOpacity 0.18 으로 안쪽 살짝 채움.
export function IconBookmark({ size = 20, color = "currentColor", className, active = false }: IconProps & { active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M5 3h10v15l-5-3.5L5 18V3z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        fill={active ? color : "none"}
        fillOpacity={active ? 0.18 : 0}
      />
    </svg>
  );
}

// IconHeart 는 saved/page.tsx 의 작은 reaction badge (size 8) + 빈 상태 hero (size 32) 에서
// 사용 중. BottomNav 는 IconBookmark 로 분리 (Phase 4 정본). Heart 자체는 그대로 보존.
export function IconHeart({ size = 20, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        stroke={color} strokeWidth={1.2} strokeLinecap="square" />
    </svg>
  );
}

/**
 * 위임 L #6 — Saved 뷰 모드 토글 아이콘.
 * IconGrid: 2×2 정사각 (Grid 모드)
 * IconList: 가로 줄 3개 (List 모드)
 */
export function IconGrid({ size = 16, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="square" className={className}>
      <rect x="2" y="2" width="5" height="5" />
      <rect x="9" y="2" width="5" height="5" />
      <rect x="2" y="9" width="5" height="5" />
      <rect x="9" y="9" width="5" height="5" />
    </svg>
  );
}

export function IconList({ size = 16, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="square" className={className}>
      <line x1="2.5" y1="3.5" x2="13.5" y2="3.5" />
      <line x1="2.5" y1="8" x2="13.5" y2="8" />
      <line x1="2.5" y1="12.5" x2="13.5" y2="12.5" />
    </svg>
  );
}

/**
 * IconPreview: 큰 hero (위) + 작은 카드 3개 (아래) — Coverflow / 미리보기 모드.
 */
export function IconPreview({ size = 16, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="square" className={className}>
      <rect x="3" y="2" width="10" height="7" />
      <rect x="2" y="11" width="3" height="3" />
      <rect x="6.5" y="11" width="3" height="3" />
      <rect x="11" y="11" width="3" height="3" />
    </svg>
  );
}

/**
 * IconArchive: 위 뚜껑 + 박스 + 라벨 — 시청 리포트 ✓ 와 시각 구분되는 아카이브 아이콘.
 */
export function IconArchive({ size = 16, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="square" className={className}>
      <rect x="2" y="3" width="12" height="3" />
      <rect x="3" y="6" width="10" height="8" />
      <line x1="6" y1="9.5" x2="10" y2="9.5" />
    </svg>
  );
}

export function IconFilm({ size = 40, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="2" stroke={color} strokeWidth={1.2} />
      <line x1="7" y1="2" x2="7" y2="22" stroke={color} strokeWidth={1.8} strokeLinecap="square" />
      <line x1="17" y1="2" x2="17" y2="22" stroke={color} strokeWidth={1.8} strokeLinecap="square" />
      <line x1="2" y1="12" x2="22" y2="12" stroke={color} strokeWidth={1} />
      <line x1="2" y1="7" x2="7" y2="7" stroke={color} strokeWidth={1} />
      <line x1="2" y1="17" x2="7" y2="17" stroke={color} strokeWidth={1} />
      <line x1="17" y1="7" x2="22" y2="7" stroke={color} strokeWidth={1} />
      <line x1="17" y1="17" x2="22" y2="17" stroke={color} strokeWidth={1} />
    </svg>
  );
}

export function IconClapper({ size = 24, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeLinecap="square" className={className}>
      <rect x="2" y="10" width="20" height="12" rx="2" strokeWidth={1.2} />
      <path d="M2 10h20" strokeWidth={1.8} />
      <path d="M2 10l3-7h14l3 7" strokeWidth={1.2} />
      <line x1="7.5" y1="3.5" x2="9" y2="10" strokeWidth={1} />
      <line x1="13.5" y1="3.5" x2="15" y2="10" strokeWidth={1} />
    </svg>
  );
}

export function IconDiamond({ size = 24, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeLinecap="square" className={className}>
      <path d="M6 3h12l4 6-10 12L2 9z" strokeWidth={1.2} />
      <path d="M2 9h20" strokeWidth={1.8} />
      <path d="M10 3l-2 6 4 12 4-12-2-6" strokeWidth={1} />
    </svg>
  );
}

export function IconSwipe({ size = 24, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeLinecap="square" className={className}>
      <path d="M18 11V6a2 2 0 0 0-4 0" strokeWidth={1.2} />
      <path d="M14 10V4a2 2 0 0 0-4 0v7" strokeWidth={1.2} />
      <path d="M10 10.5V9a2 2 0 0 0-4 0v6" strokeWidth={1.2} />
      <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2a8 8 0 0 1-6-2.7" strokeWidth={1.8} />
    </svg>
  );
}

// 핸드오프 (_design-handoff/Phase 4 L181) — head r=3.2 + body arc round.
export function IconUser({ size = 20, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="10" cy="7" r="3.2" stroke={color} strokeWidth={1.5} />
      <path d="M3.5 17C4.5 13.8 7 12 10 12s5.5 1.8 6.5 5" stroke={color} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </svg>
  );
}

// 핸드오프 (_design-handoff/Phase 4 L175) — lens r=6 + handle path round, viewBox 20×20.
export function IconSearch({ size = 20, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="9" cy="9" r="6" stroke={color} strokeWidth={1.5} />
      <path d="M13.5 13.5L17 17" stroke={color} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function IconShare({ size = 20, color = "currentColor", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 14v6a2 2 0 002 2h12a2 2 0 002-2v-6" stroke={color} strokeWidth={1.2} strokeLinecap="square" />
      <line x1="12" y1="3" x2="12" y2="16" stroke={color} strokeWidth={2} strokeLinecap="square" />
      <polyline points="8 7 12 3 16 7" stroke={color} strokeWidth={1.2} fill="none" strokeLinecap="square" />
    </svg>
  );
}

export function NeqSpinner({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={`animate-spin-slow ${className ?? ""}`}>
      <circle cx="24" cy="24" r="22" stroke="var(--border)" strokeWidth="2" />
      <circle cx="24" cy="24" r="22" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="square" strokeDasharray="34.5 103.5" />
      <circle cx="24" cy="24" r="4" fill="var(--accent)" opacity="0.3" />
      <circle cx="24" cy="12" r="2.5" fill="var(--accent)" opacity="0.7" />
      <circle cx="34.4" cy="18" r="2.5" fill="var(--accent)" opacity="0.5" />
      <circle cx="34.4" cy="30" r="2.5" fill="var(--accent)" opacity="0.35" />
      <circle cx="24" cy="36" r="2.5" fill="var(--accent)" opacity="0.2" />
      <circle cx="13.6" cy="30" r="2.5" fill="var(--accent)" opacity="0.15" />
      <circle cx="13.6" cy="18" r="2.5" fill="var(--accent)" opacity="0.1" />
    </svg>
  );
}

export function NeqLogo({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
      <rect x="2" y="2" width="44" height="44" rx="12" fill="var(--surface)" />
      <path
        d="M14 34V14l10 14.5L34 14v20"
        stroke="var(--accent)"
        strokeWidth="3.5"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
