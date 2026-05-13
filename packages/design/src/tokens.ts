/**
 * Quiet Ink 디자인 토큰 — 공유 색상/간격/반경/모션/타이포.
 * 웹은 CSS 변수(`tokens.css`)로, 네이티브는 JS 상수로 사용.
 *
 * 갱신 (Day 25, 보조 세션, 2026-04-30):
 *   - 디자인 산출물 `_workspace/design-handoff/_incoming/neq-design/project/system/colors_and_type.css`
 *     기준으로 누락 항목 보강 (색상 12종 / 간격 2종 / 반경 1종 / 그림자 5종 / 타이포 scale 8종 / 모션 10종)
 *   - 기존 키는 호환 유지 (호출처 영향 0). 신규 키만 추가.
 *   - 폰트는 신규 `fontsV2` 키로 추가 (기존 `fonts.display = Fraunces_700Bold` 유지). Stage 4 D1~D5 진입 시 메인 세션이 전환 결정.
 */

// ─────────────────────────────────────────────────────
// Colors — Quiet Ink amber pivot
// ─────────────────────────────────────────────────────

export const colors = {
  // Background hierarchy
  bg: '#12110E',
  surface: '#1A1916',
  surfaceRaised: '#24231E',
  surfaceSunken: '#0B0A07',           // 신규 — input bg, inset

  // Borders
  border: '#2E2D27',
  borderSubtle: '#1F1E1A',            // 신규
  borderStrong: '#3A3833',            // 신규

  // Text
  textPrimary: '#EDEDEF',
  textSecondary: '#8E8F9A',
  textMuted: '#6B6C75',
  textInverse: '#12110E',             // 신규 — accent 위 텍스트
  textPrimaryDim: 'rgba(237, 237, 239, 0.07)', // 신규

  // Accent
  accent: '#C4A35A',
  accentHover: '#D4B36A',             // 신규
  // accentStrong 제거 (2026-05-13, Task D 정합) — web 6bda81e 와 정합.
  // 사용처 0건 dead token. 향후 strong variant 필요 시 재정의.
  accentDim: 'rgba(196, 163, 90, 0.12)',
  accentBorder: 'rgba(196, 163, 90, 0.25)',
  accentBorderLight: 'rgba(196, 163, 90, 0.15)', // 신규

  // Semantic
  danger: '#E05A4F',
  dangerDim: 'rgba(224, 90, 79, 0.14)',
  dangerOverlay: 'rgba(224, 90, 79, 0.22)', // 신규
  warning: '#D4A245',                 // 신규
  warningDim: 'rgba(212, 162, 69, 0.14)', // 신규
  info: '#7BA3D4',                    // 신규
  infoDim: 'rgba(123, 163, 212, 0.12)', // 신규
  success: '#4DB06A',                 // 신규
  successDim: 'rgba(77, 176, 106, 0.14)', // 신규

  // Overlay
  overlayLight: 'rgba(18, 17, 14, 0.4)',
  overlay: 'rgba(18, 17, 14, 0.7)',
  overlayHeavy: 'rgba(18, 17, 14, 0.85)',
  overlayDense: 'rgba(18, 17, 14, 0.92)', // 신규
  overlaySolid: 'rgba(18, 17, 14, 0.97)', // 신규

  // Category badges (3종 — DECISIONS.md #26, Day 26)
  // movie = amber / series = violet / variety = coral.
  // 음악·책은 V1 배제. show → variety 로 rename. 5종 → 3종.
  catMovie: '#C4A35A',
  catSeries: '#9B8AE0',
  catVariety: '#E08A6C',
} as const;

// ─────────────────────────────────────────────────────
// Spacing
// ─────────────────────────────────────────────────────

export const spacing = {
  '2xs': 2,                           // 신규
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,                          // 신규
} as const;

// ─────────────────────────────────────────────────────
// Radius
// ─────────────────────────────────────────────────────

export const radius = {
  sm: 4,
  md: 8,
  lg: 16,
  xl: 24,
  full: 9999,                         // 신규
} as const;

// ─────────────────────────────────────────────────────
// Shadows — 신규 전체. 네이티브는 elevation 또는 shadowProps 변환 필요
// ─────────────────────────────────────────────────────

export const shadows = {
  sm: '0 1px 3px rgba(0,0,0,0.20)',
  md: '0 4px 16px rgba(0,0,0,0.30)',
  lg: '0 8px 32px rgba(0,0,0,0.50)',
  dropdown: '0 4px 20px rgba(0,0,0,0.50)',
  toast: '0 2px 12px rgba(0,0,0,0.40)',
} as const;

// ─────────────────────────────────────────────────────
// Typography — scale (rem). 네이티브는 px 변환: 기준 16px × rem
// ─────────────────────────────────────────────────────

export const fontSize = {
  xs: '0.6875rem',      // 11
  sm: '0.8125rem',      // 13
  base: '0.9375rem',    // 15
  lg: '1.125rem',       // 18
  xl: '1.375rem',       // 22
  '2xl': '1.75rem',     // 28
  '3xl': '2.25rem',     // 36
  display: '3rem',      // 48
} as const;

// 네이티브용 px 변환 헬퍼
export const fontSizePx = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 18,
  xl: 22,
  '2xl': 28,
  '3xl': 36,
  display: 48,
} as const;

// ─────────────────────────────────────────────────────
// Fonts
// ─────────────────────────────────────────────────────

/**
 * 기존 폰트 매핑 (Day 14~ 시점). 호환 유지 — 호출처 (apps/native/components 다수) 영향 0.
 * Stage 4 D1~D5 진입 시 메인 세션이 fontsV2 로 전환 결정.
 */
export const fonts = {
  display: 'Fraunces_700Bold',
  displayReg: 'Fraunces_400Regular',
  data: 'Outfit_600SemiBold',
  dataReg: 'Outfit_400Regular',
} as const;

/**
 * 디자인 산출물 (Day 25 분석) 신규 폰트 매핑.
 * - body: Pretendard Variable (한글 + 영문 본문/UI)
 * - display: Instrument Serif (큰 헤더, hero, italic 액센트)
 * - data: Geist Mono (수치 tabular, 라벨)
 *
 * 웹 사용처 — apps/web/src/app/layout.tsx 의 next/font import 변경 또는 CSS @import 통합
 * 네이티브 사용처 — expo-font 로 로드 후 RN StyleSheet 에서 fontFamily 로 참조
 */
export const fontsV2 = {
  body: 'PretendardVariable',
  bodyMedium: 'PretendardVariable',  // weight 500
  bodyBold: 'PretendardVariable',    // weight 700
  display: 'InstrumentSerif',
  displayItalic: 'InstrumentSerifItalic',
  data: 'GeistMono',
  dataMedium: 'GeistMonoMedium',
} as const;

// ─────────────────────────────────────────────────────
// Motion — easing + duration. RN Reanimated 3 / web CSS 양쪽 사용
// ─────────────────────────────────────────────────────

/**
 * Cubic bezier 4-tuple. 네이티브 (Reanimated `Easing.bezier(...)`) + 웹 CSS `cubic-bezier(...)` 양쪽.
 */
export const easings = {
  enter: [0.25, 1, 0.5, 1] as const,         // 부드러운 감속. 등장, 시트 열림, 모달
  exit: [0.5, 0, 0.75, 0] as const,          // 점점 빨라지며 퇴장. 시트 닫힘, 카드 날아감
  move: [0.45, 0, 0.55, 1] as const,         // 대칭 가속-감속. 위치 이동, 레이아웃 변경
  spring: [0.34, 1.3, 0.64, 1] as const,     // 미세 오버슈트 30%. 카드 스냅백, 제스처 릴리즈
  soft: [0.4, 0, 0.2, 1] as const,           // Material standard. opacity, 색상, 미세 변화
  /**
   * DetailSheet morph 전용 (Handoff v2 D3, Phase C 정합).
   * web globals.css `--ease-detail-morph` + apps/web `useDetailSheet.DETAIL_EASE` 와 동일.
   * 네이티브는 spring 으로 흉내내지 말고 이 곡선 그대로 사용 — 인지 100% 정합.
   */
  detailMorph: [0.32, 0.72, 0.24, 1] as const,
} as const;

/**
 * Duration ms. 사용 사례별 5단계.
 */
export const durations = {
  instant: 80,    // 버튼 active, 탭, 토글
  quick: 150,     // 필터 칩, 드롭다운, 색상
  moderate: 250,  // 페이드, 토스트, 오버레이
  steady: 350,    // 바텀시트, 카드 스냅백
  slow: 500,      // 풀스크린, 온보딩 스텝
  /**
   * DetailSheet morph 전용 (Handoff v2 D3, Phase C 정합).
   * exit 은 enter 의 절반 미만 — swipe-down 직후 morph 축소-확장이 길면 jank 로 인지됨.
   * native 의 spring 모델 (damping 20 / stiffness 160) 은 ~280ms 인지.
   * Easing.bezier + withTiming 으로 web 과 정확 일치시킴.
   */
  detailEnter: 450,
  detailExit: 180,
  /**
   * Swipe dismiss 콜백 타이밍 (사이클 2 단일화).
   *  - save 480ms — `feedback_swipe_ux.md` 잠금. 카드 흡수 + 다음 카드 advance.
   *  - pass 360ms — 좌 스와이프 dismiss + 다음 카드 advance.
   *
   * web `apps/web/src/hooks/useRecommendations` (nextCard 콜백) 과 native
   * `apps/native/app/index.tsx` (`PASS_DISMISS_MS`, `SAVE_ABSORB_MS`) 양쪽에서 사용.
   */
  swipeSaveDismiss: 480,
  swipePassDismiss: 360,
} as const;

// 헬퍼: 웹 CSS string
export const cubicBezierCss = (e: readonly [number, number, number, number]): string =>
  `cubic-bezier(${e[0]}, ${e[1]}, ${e[2]}, ${e[3]})`;

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

export type Colors = typeof colors;
export type Spacing = typeof spacing;
export type Radius = typeof radius;
export type Shadows = typeof shadows;
export type FontSize = typeof fontSize;
export type FontSizePx = typeof fontSizePx;
export type Fonts = typeof fonts;
export type FontsV2 = typeof fontsV2;
export type Easings = typeof easings;
export type Durations = typeof durations;
