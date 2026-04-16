/**
 * Quiet Ink 디자인 토큰 — 공유 색상/간격/반경.
 * 웹은 CSS 변수로, 네이티브는 JS 상수로 사용.
 */

export const colors = {
  bg: '#12110E',
  surface: '#1A1916',
  surfaceRaised: '#24231E',
  border: '#2E2D27',

  textPrimary: '#EDEDEF',
  textSecondary: '#8E8F9A',
  textMuted: '#6B6C75',

  accent: '#C4A35A',
  accentDim: 'rgba(196, 163, 90, 0.12)',
  accentBorder: 'rgba(196, 163, 90, 0.25)',

  danger: '#E05A4F',
  dangerDim: 'rgba(224, 90, 79, 0.14)',

  overlayLight: 'rgba(18, 17, 14, 0.4)',
  overlay: 'rgba(18, 17, 14, 0.7)',
  overlayHeavy: 'rgba(18, 17, 14, 0.85)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 16,
  xl: 24,
} as const;

/**
 * 폰트 패밀리 키 — 네이티브는 expo-font로 로드한 이름을 사용.
 * 웹은 CSS 변수(--font-display 등)로 별도 매핑.
 * 로드 실패/미완료 시 시스템 폴백으로 degrade.
 */
export const fonts = {
  display: 'Fraunces_700Bold',
  displayReg: 'Fraunces_400Regular',
  data: 'Outfit_600SemiBold',
  dataReg: 'Outfit_400Regular',
} as const;

export type Colors = typeof colors;
export type Spacing = typeof spacing;
export type Radius = typeof radius;
export type Fonts = typeof fonts;
