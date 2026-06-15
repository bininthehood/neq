import Svg, { Path, Line, Circle, Polygon, Polyline } from 'react-native-svg';

/**
 * Native 아이콘 시스템 — web `apps/web/src/components/Icons.tsx` SVG path 포팅.
 *
 * 2026-05-18 Fix C — native 가 텍스트 이모지 (⟲⤴ⓘ⟳♥♡✕⌕) 사용 중 → web 의 SVG 와
 * 시각 차이 큼. react-native-svg 기반 컴포넌트로 통일 (web 정합).
 *
 * **제외 (사용자 명시 유지 요청):**
 *  - SwipeCard 의 `★ {rating}` ratingText
 *  - SwipeCard 의 "영화 / 시리즈" typeText
 *  → 이들은 SwipeCard 안에서 `<Text>★ ...</Text>` 그대로 유지.
 */

interface IconProps {
  size?: number;
  color?: string;
}

export function IconRewind({ size = 20, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Polygon points="11 19 2 12 11 5 11 19" />
      <Polygon points="22 19 13 12 22 5 22 19" />
    </Svg>
  );
}

export function IconShare({ size = 20, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 14v6a2 2 0 002 2h12a2 2 0 002-2v-6" stroke={color} strokeWidth={1.2} strokeLinecap="square" />
      <Line x1="12" y1="3" x2="12" y2="16" stroke={color} strokeWidth={2} strokeLinecap="square" />
      <Polyline points="8 7 12 3 16 7" stroke={color} strokeWidth={1.2} fill="none" strokeLinecap="square" />
    </Svg>
  );
}

// IconDetail — ActionBar 상세보기 버튼. web `apps/web/src/components/Icons.tsx`
// IconDetail 정본 포팅 (2026-05-19 native↔PWA 정합 — 항목 2).
// 기존 IconInfo(원 안에 i)를 web 의 3라인 tapering 모양으로 교체.
// 3개 line: (4,7→20,7) sw2.2 / (4,12→16,12) sw1.5 / (4,17→12,17) sw1 — 모두 strokeLinecap square.
export function IconDetail({ size = 22, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="4" y1="7" x2="20" y2="7" stroke={color} strokeWidth={2.2} strokeLinecap="square" />
      <Line x1="4" y1="12" x2="16" y2="12" stroke={color} strokeWidth={1.5} strokeLinecap="square" />
      <Line x1="4" y1="17" x2="12" y2="17" stroke={color} strokeWidth={1} strokeLinecap="square" />
    </Svg>
  );
}

export function IconRefresh({ size = 16, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="23 4 23 10 17 10" />
      <Polyline points="1 20 1 14 7 14" />
      <Path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </Svg>
  );
}

export function IconSave({ size = 24, color = '#000', filled = true }: IconProps & { filled?: boolean }) {
  const path = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
  if (filled) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <Path d={path} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={path} stroke={color} strokeWidth={1.2} strokeLinecap="square" />
    </Svg>
  );
}

export function IconClose({ size = 20, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="6" y1="6" x2="18" y2="18" stroke={color} strokeWidth={2.2} strokeLinecap="square" />
      <Line x1="18" y1="6" x2="6" y2="18" stroke={color} strokeWidth={1.2} strokeLinecap="square" />
    </Svg>
  );
}

export function IconSearch({ size = 20, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx="9" cy="9" r="6" stroke={color} strokeWidth={1.5} />
      <Path d="M13.5 13.5L17 17" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

// IconArchive — PWA `Icons.tsx` IconArchive 정합. 박스 + 뚜껑 + 라벨.
// Saved 카드 우상단 아카이브 토글 버튼용. report 있거나 isArchived 일 때만 노출.
export function IconArchive({ size = 16, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      {/* 뚜껑 */}
      <Path
        d="M2 3 H14 V6 H2 Z"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="square"
        fill="none"
      />
      {/* 박스 */}
      <Path
        d="M3 6 H13 V14 H3 Z"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="square"
        fill="none"
      />
      {/* 라벨 */}
      <Line
        x1="6"
        y1="9.5"
        x2="10"
        y2="9.5"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="square"
      />
    </Svg>
  );
}

// 2026-06-15 (build 27) — DetailSheet history navigation (← / →). 좌상단 prev/next
// 화살표. Phase 4 정본 chevron 패턴 (polyline, strokeWidth 2, round terminals).
// 단일 chevron shape — IconChevronDown 과 동일 두께/스타일. viewBox 24 통일.
export function IconChevronLeft({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="15 6 9 12 15 18"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export function IconChevronRight({ size = 18, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="9 6 15 12 9 18"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

// 2026-05-20 — FilterChips / SavedFilters 공용 chevron. web `▾` 글리프 (fontSize 11)
// 가 native 시스템 폰트에서 작고 흐릿하게 렌더 → 가독성 부족. SVG polyline 으로
// 명확한 v 모양 + 적절한 크기. SavedFilters 의 자체 IconChevronDown 도 향후 이걸로 통일.
export function IconChevronDown({ size = 12, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="6 9 12 15 18 9"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

// IconStar — SwipeCard Rating 칩용. web `Icons.tsx` IconStar path 포팅 (C-1).
// 기존 native SwipeCard 의 `★` 유니코드 문자를 SVG 로 대체 (Iconography 정합).
export function IconStar({ size = 11, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4l-6.4 4.8 2.4-7.2-6-4.8h7.6L12 2z" />
    </Svg>
  );
}

// ─────────────────────────────────────────────────────
// BottomNav 탭 아이콘 — 2026-05-19 native↔PWA 정합 audit E-1.
// 정본: `_design-handoff/Phase 4 - Full Prototype.html` L168-184 TabIcon* +
//       web `apps/web/src/components/Icons.tsx` IconDiscover/IconBookmark/IconUser.
// 기존 native BottomNav 가 텍스트 이모지 (◉ ♡ ◎) 사용 → SVG 로 통일 (5/18 Fix C 누락분).
// viewBox 20×20, currentColor 위임 (focused 색은 호출처에서 주입).
// ─────────────────────────────────────────────────────

// Discover — active: 외곽 circle + 중앙 dot / inactive: 외곽 circle + diamond.
export function IconDiscover({ size = 20, color = '#000', active = false }: IconProps & { active?: boolean }) {
  if (active) {
    return (
      <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
        <Circle cx="10" cy="10" r="7.5" stroke={color} strokeWidth={1.5} />
        <Circle cx="10" cy="10" r="2" fill={color} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx="10" cy="10" r="7.5" stroke={color} strokeWidth={1.4} />
      <Path d="M13 7L11 11L7 13L9 9L13 7Z" stroke={color} strokeWidth={1.2} strokeLinejoin="round" />
    </Svg>
  );
}

// Saved — Bookmark (Heart 아님 — Phase 4 정본). active 시 안쪽 fillOpacity 0.18.
export function IconBookmark({ size = 20, color = '#000', active = false }: IconProps & { active?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M5 3h10v15l-5-3.5L5 18V3z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        fill={active ? color : 'none'}
        fillOpacity={active ? 0.18 : 0}
      />
    </Svg>
  );
}

// Profile — head circle + body arc.
export function IconUser({ size = 20, color = '#000' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx="10" cy="7" r="3.2" stroke={color} strokeWidth={1.5} />
      <Path d="M3.5 17C4.5 13.8 7 12 10 12s5.5 1.8 6.5 5" stroke={color} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
