/**
 * neq 디자인 토큰 — Night Pool (2026-11-26 리디자인, DESIGN.md 정본).
 * 웹은 CSS 변수(`tokens.css`)로, 네이티브는 `apps/native/lib/tokens.ts` 변환층을 거쳐 사용.
 *
 * - `palette.dark` / `palette.light`: 순수 문자열 값만 둔다 (react-native import 금지 — 웹 번들 공유).
 *   iOS 다크·라이트 전환(DynamicColorIOS)은 네이티브 변환층에서 만든다 (계획 X4).
 * - `accent*` 키는 삭제했다 (계획 D5). 용도별로 `lime`(채움)·`limeText`(라임 의미 글자)·
 *   `aqua`(원색: 틴트·옅은 면)·`aquaText`(글자·아이콘·선)를 쓴다.
 *   lime 위 글자는 `textInverse`.
 * - `tokens.css` 와 값이 같아야 한다 → `__tests__/tokens.test.ts` 가 검사.
 * - 웹(PWA)은 1.1.0 전까지 `tokens-quiet-ink.css`(옛 값 사본)에 고정돼 있다 (계획 X1).
 */

// ─────────────────────────────────────────────────────
// Colors — Night Pool
// ─────────────────────────────────────────────────────

const dark = {
  // Background hierarchy
  bg: '#071B20',
  surface: '#0E252A',
  surfaceRaised: '#17343A',
  surfaceSunken: '#04141A',

  // Borders
  border: '#23444A',
  borderSubtle: '#183539',
  borderStrong: '#335A60',

  // Text
  textPrimary: '#F3FAF8',
  textSecondary: '#A9C2C0',
  textMuted: '#6F8E8C',
  textInverse: '#071B20', // lime·danger 채움 위 글자
  textPrimaryDim: 'rgba(243, 250, 248, 0.07)',

  // Brand — lime = 행동(저장·선택·주요 CTA·인생작), aqua = 길 안내(워드마크·현재 탭·링크·평가 선택·포커스)
  lime: '#D8F547',
  limeText: '#D8F547',
  limeDim: 'rgba(216, 245, 71, 0.14)',
  aqua: '#58DCCB',
  aquaText: '#58DCCB',
  aquaDim: 'rgba(88, 220, 203, 0.14)',
  aquaBorder: 'rgba(88, 220, 203, 0.30)',

  // Semantic
  danger: '#FF7A6B',
  dangerDim: 'rgba(255, 122, 107, 0.14)',
  dangerOverlay: 'rgba(255, 122, 107, 0.22)',
  warning: '#FFC857',
  warningDim: 'rgba(255, 200, 87, 0.14)',
  info: '#58DCCB',
  infoDim: 'rgba(88, 220, 203, 0.14)',
  success: '#D8F547', // DESIGN.md: success = 라임
  successDim: 'rgba(216, 245, 71, 0.14)',

  // Overlay — 청록 잉크 scrim (검정 아님)
  overlayLight: 'rgba(7, 27, 32, 0.4)',
  overlay: 'rgba(7, 27, 32, 0.7)',
  overlayHeavy: 'rgba(7, 27, 32, 0.85)',
  overlayDense: 'rgba(7, 27, 32, 0.92)',
  overlaySolid: 'rgba(7, 27, 32, 0.97)',
} as const;

type PaletteKey = keyof typeof dark;

const light: Record<PaletteKey, string> = {
  bg: '#EAF6F5',
  surface: '#FFFFFF',
  surfaceRaised: '#D8EBE9',
  surfaceSunken: '#DCEDEB',

  border: '#B9D4D2',
  borderSubtle: '#CFE3E1',
  borderStrong: '#98BAB7',

  textPrimary: '#0F2A2F',
  textSecondary: '#43626A',
  textMuted: '#6A858A', // 3.6:1 — 큰 글자·힌트 전용
  textInverse: '#0F2A2F',
  textPrimaryDim: 'rgba(15, 42, 47, 0.07)',

  lime: '#D8F547', // 채움 전용 (밝은 배경 위 글자 금지)
  limeText: '#4E6E00',
  limeDim: 'rgba(78, 110, 0, 0.12)',
  aqua: '#58DCCB',
  aquaText: '#007B72',
  aquaDim: 'rgba(0, 123, 114, 0.10)',
  aquaBorder: 'rgba(0, 123, 114, 0.30)',

  danger: '#C0392B',
  dangerDim: 'rgba(192, 57, 43, 0.10)',
  dangerOverlay: 'rgba(192, 57, 43, 0.18)',
  warning: '#8A6100',
  warningDim: 'rgba(138, 97, 0, 0.12)',
  info: '#007B72',
  infoDim: 'rgba(0, 123, 114, 0.10)',
  success: '#4E6E00',
  successDim: 'rgba(78, 110, 0, 0.12)',

  // scrim 은 라이트에서도 어두운 청록 잉크 (포스터 위 글자·모달 뒤 dim)
  overlayLight: 'rgba(15, 42, 47, 0.4)',
  overlay: 'rgba(15, 42, 47, 0.7)',
  overlayHeavy: 'rgba(15, 42, 47, 0.85)',
  overlayDense: 'rgba(15, 42, 47, 0.92)',
  overlaySolid: 'rgba(15, 42, 47, 0.97)',
};

export const palette = { dark, light } as const;
export type Palette = Record<PaletteKey, string>;

/**
 * 하위 호환 — 다크 팔레트의 순수 문자열 값. 웹 테스트·기타 소비처가 컴파일되도록 유지.
 * 네이티브는 이 객체 대신 `apps/native/lib/tokens.ts` 의 동적 `colors` 를 쓴다.
 */
export const colors = {
  ...dark,
  // Category badges (DECISIONS.md #26) — Quiet Ink 잔재. DESIGN.md 2026-11-26 에서 표 폐기,
  // 카테고리 확장 시 Night Pool 기준으로 다시 정한다. 웹 회귀 테스트가 값을 고정하므로 유지.
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

// 2026-05-19 — radius 정정 (native↔PWA 정합 audit T-1).
// 기존 native JS 상수 `lg:16 / xl:24` 가 `tokens.css`(`--radius-lg:12 --radius-xl:16`)
// 및 DESIGN.md L178-184 와 어긋나 native 가 모든 radius 를 한 단계씩 크게 렌더했다.
// tokens.css / DESIGN.md 정본 값으로 일치시킴. (web src 는 radius JS 상수를 import 하지
// 않고 CSS 변수만 사용 — `@neq/design` 내부 컴포넌트도 `var(--radius-*)` 만 사용 →
// 이 수정은 native 렌더에만 영향, web 영향 0.)
export const radius = {
  sm: 4,
  md: 8,
  lg: 12,                             // 카드, 버튼 (tokens.css --radius-lg)
  xl: 16,                             // 메인 카드, 바텀시트 (tokens.css --radius-xl)
  // Night Pool 위계 (DESIGN.md Layout & Shape) — 2단계 화면 적용에서 위 sm~xl 을 대체한다.
  badge: 8,
  thumb: 14,
  chip: 14,                           // 높이 28이면 full(알약형)
  toast: 14,
  save: 16,
  card: 24,
  sheet: 32,                          // 시트 상단
  full: 9999,
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

/**
 * shadows 토큰의 RN 변환 (2026-05-19 native↔PWA 정합 audit T-2).
 *
 * web 은 CSS box-shadow 문자열(`shadows`)을 그대로 쓰지만 RN 은
 * `shadowColor/shadowOffset/shadowOpacity/shadowRadius`(iOS) + `elevation`(Android)
 * 개별 prop 을 요구한다. native 컴포넌트가 그림자를 하드코딩하던 것을 단일 출처로 통합.
 *
 * - CSS box-shadow `offsetX offsetY blur rgba(r,g,b,a)` 를 1:1 매핑.
 *   shadowColor 는 alpha 를 제외한 검정(#000), shadowOpacity 가 alpha 를 담당.
 * - elevation(Android)은 blur 반경에 근사 — Android 그림자는 정밀 제어 불가.
 * - **순수 JS 객체** 반환 (react-native 타입/런타임 미import) → web 번들 영향 0.
 *   호출처(native)에서 `ViewStyle` 로 spread.
 *
 * 사용: `<View style={[styles.card, shadowsNative.lg]} />`
 */
export interface ShadowNativeStyle {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export const shadowsNative = {
  // 0 1px 3px rgba(0,0,0,0.20)
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  // 0 4px 16px rgba(0,0,0,0.30)
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  // 0 8px 32px rgba(0,0,0,0.50)
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 12,
  },
  // 0 4px 20px rgba(0,0,0,0.50)
  dropdown: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
  },
  // 0 2px 12px rgba(0,0,0,0.40)
  toast: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
} as const satisfies Record<string, ShadowNativeStyle>;

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
 * Night Pool 폰트 (DESIGN.md Typography). 모두 OFL, `apps/native/assets/fonts/` TTF 를
 * `app.json` expo-font 플러그인으로 빌드에 내장한다 (런타임 useFonts 없음).
 *
 * 값은 iOS 가 등록하는 PostScript 이름 (TTF name table 확인, 2026-11-27):
 *   SUIT-Regular / SUIT-SemiBold / SUIT-ExtraBold / SUIT-Heavy  (family "SUIT")
 *   Unbounded-Bold                                              (family "Unbounded")
 *   RecursiveMonoLnrSt-Regular / RecursiveMonoLnrSt-Med         (family "Recursive Mono Linear Static")
 * RN iOS 는 PostScript 이름 + fontWeight 를 받으면 같은 family 안에서 가장 가까운 굵기를 고른다.
 * SUIT 는 400·600·800·900 만 넣었으므로 700 같은 중간 값은 인접 굵기로 붙는다 — 굵기를 명시하려면 아래 키를 쓴다.
 *
 * - Unbounded 에는 한글이 없다 → 영문 원제·영문 숫자 강조에만.
 * - 웹은 6단계 전까지 tokens-quiet-ink.css 의 --font-* 를 그대로 쓴다.
 */
export const fontsV2 = {
  body: 'SUIT-Regular',          // 본문 400
  bodySemi: 'SUIT-SemiBold',     // 라벨·버튼 600
  bodyHeavy: 'SUIT-ExtraBold',   // 한글 제목 800
  title: 'SUIT-Heavy',           // 한글 제목 900 (시그니처)
  en: 'Unbounded-Bold',          // 영문 원제·영문 강조 700
  data: 'RecursiveMonoLnrSt-Regular',  // 숫자·데이터 (tabular)
  dataMedium: 'RecursiveMonoLnrSt-Med',
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

/**
 * Night Pool 모션 (DESIGN.md Motion & Touch). 위 `easings`/`durations` 는 웹이 1.1.0 전까지
 * 옛 값으로 쓰므로(X1) 건드리지 않고, 새 값은 여기 둔다. 2단계에서 네이티브가 이쪽으로 옮긴다.
 */
export const motion = {
  easing: {
    enter: [0.25, 1, 0.5, 1] as const,
    exit: [0.5, 0, 0.75, 0] as const,
    move: [0.45, 0, 0.55, 1] as const,
    jelly: [0.3, 1.6, 0.5, 1] as const,   // 젤리 프레스 복귀 (280ms)
    sheet: [0.32, 0.72, 0.24, 1] as const,
  },
  duration: {
    instant: 90,      // 젤리 프레스 찌그러짐
    quick: 150,
    moderate: 250,
    steady: 320,
    jellyRelease: 280,
    sheetEnter: 450,
    sheetExit: 350,
  },
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
export type ShadowsNative = typeof shadowsNative;
export type FontSize = typeof fontSize;
export type FontSizePx = typeof fontSizePx;
export type FontsV2 = typeof fontsV2;
export type Easings = typeof easings;
export type Durations = typeof durations;
export type Motion = typeof motion;
