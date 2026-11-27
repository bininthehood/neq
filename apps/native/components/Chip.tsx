/**
 * 공용 칩 (Night Pool, DESIGN.md Layout & Shape / Color).
 * - 알약형(높이 32, hitSlop 으로 터치 44), SUIT 600 13px.
 * - 선택 = 라임 채움 + textInverse. 선택된 칩 그룹은 라임 1개로 센다(anti-slop #11).
 * - 기본 = raised 면 + 1px border — 4단계 리퀴드 글래스가 들어오기 전 iOS 26 미만 대체와 같은 모양.
 * - 젤리 프레스.
 */
import { type ReactNode } from 'react';
import { StyleSheet, type AccessibilityRole, type AccessibilityState } from 'react-native';
import { Text } from './Text';
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
};

export function Chip({ label, selected = false, disabled, onPress, leading, trailing, ...a11y }: Props) {
  return (
    <JellyPressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole={a11y.accessibilityRole ?? 'button'}
      accessibilityState={a11y.accessibilityState ?? { selected, disabled }}
      accessibilityLabel={a11y.accessibilityLabel}
      testID={a11y.testID}
      style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}
    >
      {leading}
      <Text style={[styles.text, selected && styles.textSelected]} numberOfLines={1}>
        {label}
      </Text>
      {trailing}
    </JellyPressable>
  );
}

/** 선택 칩 위 아이콘 색 / 기본 칩 위 아이콘 색 */
export const chipIconColor = (selected: boolean) => (selected ? colors.textInverse : colors.textSecondary);

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 32,
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
  chipDisabled: { opacity: 0.5 },
  text: {
    fontFamily: fontsV2.bodySemi,
    fontSize: 13,
    color: colors.textPrimary,
  },
  textSelected: { color: colors.textInverse },
});
