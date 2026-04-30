/**
 * Illust — Quiet Ink 빈 상태 일러 (네이티브 포팅).
 *
 * 본 D9 1차 구현 — react-native-svg 의존성 부재 상태에서의 placeholder.
 *
 * 현재 상태:
 *   - react-native-svg는 apps/native/package.json에 미설치 (D9 위임 prompt 명시: 설치 X, 보고만)
 *   - 본 파일은 web (`packages/design/src/Illust.tsx`)와 **동일 API**를 노출하지만,
 *     실제 SVG path 렌더링 대신 amber accent 색상 + name 라벨의 시각 placeholder를 표시.
 *   - StatusScreens 통합 시점 (Stage 4 D5 native 진입)이나 D9-native 위임에서 react-native-svg 설치 후
 *     web Illust.tsx의 SVG body를 1:1 변환하는 작업이 필요.
 *
 * 변환 규칙 (후속 위임 참조):
 *   <svg viewBox="0 0 200 200">  →  <Svg viewBox="0 0 200 200" width={px} height={px}>
 *   <path d="..."/>             →  <Path d="..." />
 *   <circle/>, <rect/>, <line/>, <ellipse/>  →  RN-SVG 동명 컴포넌트
 *   transform="rotate(...)" →  rotation prop or transform attribute
 *   strokeWidth, strokeLinecap 등은 동일
 *   <defs> + <filter> (letterpress) → 본 위임 스코프 외 (editorial로 fallback)
 *
 * 색상은 `apps/native/lib/tokens.ts`의 colors export 사용.
 */

import { View, Text, StyleSheet, type ViewStyle } from "react-native";
import { colors, radius } from "../lib/tokens";

// ─────────────────────────────────────────────────────
// Types — web Illust와 동일
// ─────────────────────────────────────────────────────

export type IllustName =
  | "welcome"
  | "emptyDiscover"
  | "emptySaved"
  | "noResults"
  | "calibrating"
  | "error"
  | "onboarding"
  | "archive";

export type IllustStyle = "geometric" | "editorial" | "letterpress" | "lineart";

export type IllustSize = "sm" | "md" | "lg";

export interface IllustProps {
  name: IllustName;
  /** default: 'editorial' */
  style?: IllustStyle;
  /** sm 64 / md 96 / lg 128 px (default 'md') */
  size?: IllustSize;
  /** 스크린리더 라벨 */
  accessibilityLabel?: string;
  containerStyle?: ViewStyle;
}

// ─────────────────────────────────────────────────────
// Pure logic — web과 동기화
// ─────────────────────────────────────────────────────

export const ILLUST_NAMES: readonly IllustName[] = [
  "welcome",
  "emptyDiscover",
  "emptySaved",
  "noResults",
  "calibrating",
  "error",
  "onboarding",
  "archive",
];

export const ILLUST_STYLES: readonly IllustStyle[] = [
  "geometric",
  "editorial",
  "letterpress",
  "lineart",
];

export function illustSizePx(size: IllustSize = "md"): number {
  switch (size) {
    case "sm":
      return 64;
    case "lg":
      return 128;
    case "md":
    default:
      return 96;
  }
}

export function resolveIllustStyle(style: IllustStyle): IllustStyle {
  if (style === "letterpress" || style === "lineart") {
    return "editorial";
  }
  return style;
}

/** name → 한글 라벨. placeholder 단계에서 어떤 일러인지 시각 식별 용도. */
const NAME_LABEL: Record<IllustName, string> = {
  welcome: "환영",
  emptyDiscover: "탐색 시작",
  emptySaved: "빈 책장",
  noResults: "결과 없음",
  calibrating: "취향 분석",
  error: "오류",
  onboarding: "안내",
  archive: "아카이브",
};

// ─────────────────────────────────────────────────────
// Component — placeholder (react-native-svg 설치 후 SVG로 교체)
// ─────────────────────────────────────────────────────

export function Illust({
  name,
  style = "editorial",
  size = "md",
  accessibilityLabel,
  containerStyle,
}: IllustProps) {
  const px = illustSizePx(size);
  resolveIllustStyle(style); // letterpress/lineart fallback (현재는 사용처 없음)
  const label = NAME_LABEL[name] ?? name;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.container,
        {
          width: px,
          height: px,
        },
        containerStyle,
      ]}
    >
      {/* amber accent dot — "여기 일러가 들어감" 시각 신호 */}
      <View style={[styles.accentDot, { width: px * 0.42, height: px * 0.42 }]} />
      <Text style={[styles.label, { fontSize: Math.max(10, px * 0.11) }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accentDot: {
    backgroundColor: colors.accentDim,
    borderRadius: 9999,
    borderWidth: 1.5,
    borderColor: colors.accent,
    marginBottom: 6,
  },
  label: {
    color: colors.textMuted,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
});
