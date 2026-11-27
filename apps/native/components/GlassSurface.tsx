/**
 * 리퀴드 글래스 면 (Night Pool 4단계, DESIGN.md Material).
 *
 * - iOS 26 + Liquid Glass API 가용 + 투명도 줄이기 꺼짐 → `GlassView` (틴트·테두리 = palette glassTint/glassBorder).
 * - 그 밖(iOS 26 미만, 투명도 줄이기, Android) → 같은 모양의 불투명 `surfaceRaised` + 1px `border`.
 *   가짜 블러로 흉내 내지 않는다.
 * - 가용성은 OS 버전이 아니라 API 로 판단(DESIGN.md 구현 메모).
 *
 * 쓰는 법: 누르는 요소 안쪽 첫 자식으로 `<GlassSurface radius={…} />` 를 깔고, 요소 자체 style 에는
 * 배경·테두리를 두지 않는다. 같은 줄의 유리는 `<GlassGroup>` 하나로 묶는다(D9, 발견 화면 4묶음 이하).
 *
 * ⚠ 유리의 조상에 opacity 애니메이션(특히 0 에서 시작)을 걸지 않는다 — 유리가 그려지지 않는다.
 *   등장·퇴장은 transform 으로. 비활성 표시는 아이콘·글자에만 opacity.
 * ⚠ 색은 useThemeColors() hex — GlassView tintColor 는 문자열만 받는다.
 */
import { useSyncExternalStore, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassContainer, GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { colors, useThemeColors } from '../lib/tokens';

// ponytail: 대체 표현 강제 스위치. 설치된 시뮬 런타임이 iOS 26.x 뿐이라
// `EXPO_PUBLIC_GLASS_FALLBACK=1 npx expo start` 로 iOS 26 미만 화면을 본다.
const FORCE_FALLBACK = process.env.EXPO_PUBLIC_GLASS_FALLBACK === '1';

function detectGlassApi(): boolean {
  if (FORCE_FALLBACK || Platform.OS !== 'ios') return false;
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}
const GLASS_API = detectGlassApi();

// 투명도 줄이기 — 앱 전체 한 번만 구독. 새로 마운트되는 유리가 매번 켜졌다 꺼지는 깜빡임 방지.
let reduceTransparency = false;
const listeners = new Set<() => void>();
if (GLASS_API) {
  const set = (v: boolean) => {
    reduceTransparency = v;
    listeners.forEach((l) => l());
  };
  AccessibilityInfo.isReduceTransparencyEnabled().then(set).catch(() => {});
  AccessibilityInfo.addEventListener('reduceTransparencyChanged', set);
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** 지금 유리를 그릴지. 투명도 줄이기 설정을 실시간으로 따른다. */
export function useGlassEnabled(): boolean {
  const reduced = useSyncExternalStore(subscribe, () => reduceTransparency);
  return GLASS_API && !reduced;
}

/** 부모를 채우는 유리(또는 대체) 배경 층. 터치는 통과한다. */
export function GlassSurface({ radius, style }: { radius: number; style?: StyleProp<ViewStyle> }) {
  const glass = useGlassEnabled();
  const t = useThemeColors();
  if (!glass) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fallback, { borderRadius: radius }, style]} />;
  }
  return (
    <GlassView
      pointerEvents="none"
      glassEffectStyle="regular"
      tintColor={t.glassTint}
      style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1, borderColor: t.glassBorder }, style]}
    />
  );
}

/** 같은 줄의 유리 묶음. 유리가 꺼져 있으면 평범한 View. */
export function GlassGroup({
  children,
  style,
  spacing,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  spacing?: number;
}) {
  const glass = useGlassEnabled();
  if (!glass) return <View style={style}>{children}</View>;
  return (
    <GlassContainer spacing={spacing} style={style}>
      {children}
    </GlassContainer>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
