/**
 * 네이티브 색 변환층 (Night Pool 계획 X4).
 *
 * `@neq/design` 의 순수 값 `palette.dark` / `palette.light` 를 iOS `DynamicColorIOS` 로 묶어
 * `colors` 로 내보낸다 → 기존 `StyleSheet.create` 호출부가 그대로 시스템 밝기를 따라
 * 재시작 없이 바뀐다 (0단계 스파이크에서 View·Text·react-native-svg·Image tintColor 확인).
 *
 * ⚠ Reanimated 규칙 (0단계 스파이크, Reanimated 4.1.7):
 *   - `Animated.*` 컴포넌트의 **정적 style** 에 `colors.*` (DynamicColorIOS) → 크래시
 *     "[Reanimated] Invalid color value".
 *   - `useAnimatedStyle` 이 `colors.*` 를 반환 → 크래시 없이 **아무것도 안 그려짐**.
 *   → `Animated.*` / `useAnimatedStyle` / worklet 에는 반드시 `useThemeColors()` 의 hex 문자열을 쓴다.
 *     StyleSheet 에 둔 색을 Animated.* 에 넘기던 곳은 색만 빼서 inline 으로 넣는다.
 *   expo-linear-gradient `colors` 도 같은 이유로 `useThemeColors()` 를 쓴다(동적 색 미검증).
 */
import { DynamicColorIOS, Platform, useColorScheme, type ColorValue } from 'react-native';
import { palette, colors as sharedColors, type Palette } from '@neq/design';

type PaletteKey = keyof Palette;

function buildColors(): Record<PaletteKey, ColorValue> {
  const out = {} as Record<PaletteKey, ColorValue>;
  for (const key of Object.keys(palette.dark) as PaletteKey[]) {
    out[key] =
      Platform.OS === 'ios'
        ? DynamicColorIOS({ light: palette.light[key], dark: palette.dark[key] })
        : palette.dark[key];
  }
  return out;
}

/**
 * 정적 스타일용 색. iOS 에서는 DynamicColorIOS 라 문자열이 아니다 —
 * 문자열 조작(알파 덧붙이기 등)·Reanimated·worklet 에는 쓰지 말 것.
 *
 * 타입은 `string` 으로 둔다: `color: string` prop(react-native-svg·자체 Icon 등)을 받는
 * 기존 호출부 ~600곳을 그대로 컴파일하기 위함. 실제 값은 RN 이 처리하는 ColorValue.
 */
export const colors = {
  ...(buildColors() as unknown as Record<PaletteKey, string>),
  // 카테고리 색은 테마 무관 (Quiet Ink 잔재, DESIGN.md 에서 표 폐기 — 재정의 전까지 유지)
  catMovie: sharedColors.catMovie,
  catSeries: sharedColors.catSeries,
  catVariety: sharedColors.catVariety,
} as const;

/** 현재 시스템 밝기의 hex 팔레트. Animated.* · useAnimatedStyle · worklet · LinearGradient 전용. */
export function useThemeColors(): Palette {
  return useColorScheme() === 'light' ? palette.light : palette.dark;
}

export {
  palette,
  spacing,
  radius,
  shadows,
  shadowsNative,
  fontSize,
  fontSizePx,
  fontsV2,
  easings,
  durations,
  motion,
  cubicBezierCss,
} from '@neq/design';
