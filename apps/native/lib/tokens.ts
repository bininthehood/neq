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
