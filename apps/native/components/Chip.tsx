/**
 * 공용 칩 (Night Pool, DESIGN.md Layout & Shape / Color).
 * - 알약형(높이 32, hitSlop 으로 터치 44), SUIT 600 13px.
 * - 선택 = 라임 채움 + textInverse. 선택된 칩 그룹은 라임 1개로 센다(anti-slop #11).
 * - 기본 = raised 면 + 1px border. `glass` 면 카드 위에 뜨는 칩 — 리퀴드 글래스(대체 시 같은 raised 모양).
 * - 젤리 프레스.
 */
import { type ReactNode } from 'react';
import { StyleSheet, View, type AccessibilityRole, type AccessibilityState } from 'react-native';
import { Text } from './Text';
import { GlassSurface } from './GlassSurface';
import { JellyPressable } from './JellyPressable';
import { colors, fontsV2, radius, spacing } from '../lib/tokens';

type Props = {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  testID?: string;
  /** 카드 위에 뜨는 칩(발견 필터 줄) — 선택 안 된 동안 유리. 선택되면 라임 채움. */
  glass?: boolean;
};

export function Chip({ label, selected = false, disabled, onPress, leading, trailing, glass, ...a11y }: Props) {
  const onGlass = glass && !selected;
  return (
    <JellyPressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole={a11y.accessibilityRole ?? 'button'}
      accessibilityState={a11y.accessibilityState ?? { selected, disabled }}
      accessibilityLabel={a11y.accessibilityLabel}
      testID={a11y.testID}
      style={[styles.chip, onGlass && styles.chipGlass, selected && styles.chipSelected]}
    >
      {onGlass && <GlassSurface radius={CHIP_HEIGHT / 2} />}
      {leading && <View style={disabled && styles.textDisabled}>{leading}</View>}
      <Text style={[styles.text, selected && styles.textSelected, disabled && styles.textDisabled]} numberOfLines={1}>
        {label}
      </Text>
      {trailing && <View style={disabled && styles.textDisabled}>{trailing}</View>}
    </JellyPressable>
  );
}

/** 선택 칩 위 아이콘 색 / 기본 칩 위 아이콘 색 (유리 위는 text 색 — DESIGN.md Material) */
export const chipIconColor = (selected: boolean) => (selected ? colors.textInverse : colors.textPrimary);

const CHIP_HEIGHT = 32;

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: CHIP_HEIGHT,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  chipSelected: {
    backgroundColor: colors.lime,
    borderColor: colors.lime,
  },
  // 유리 칩 — 배경·테두리는 GlassSurface 가 그린다
  chipGlass: { backgroundColor: 'transparent', borderWidth: 0 },
  // 비활성은 글자만 흐리게 — 유리 조상에 opacity 를 걸면 유리가 안 그려진다(GlassSurface 주석)
  textDisabled: { opacity: 0.5 },
  text: {
    fontFamily: fontsV2.bodySemi,
    fontSize: 13,
    color: colors.textPrimary,
  },
  textSelected: { color: colors.textInverse },
});
