/**
 * 공용 버튼 (Night Pool).
 * - primary: 라임 채움 + textInverse — 주요 CTA 전용. 한 화면 라임 채움 3개 이하(anti-slop #11).
 * - secondary: raised 면 + 1px border — 4단계 유리 전 대체 모양.
 * - ghost: 투명 + 1px border.
 * 높이 44(sm 36 + hitSlop), 알약형, SUIT 600. 젤리 프레스.
 */
import { type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { JellyPressable } from './JellyPressable';
import { colors, fontsV2, radius, spacing } from '../lib/tokens';

type Variant = 'primary' | 'secondary' | 'ghost';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'md' | 'sm';
  disabled?: boolean;
  loading?: boolean;
  leading?: ReactNode;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = 'secondary',
  size = 'md',
  disabled,
  loading,
  leading,
  style,
  containerStyle,
  accessibilityLabel,
  testID,
}: Props) {
  const fg = variant === 'primary' ? colors.textInverse : colors.textPrimary;
  return (
    <JellyPressable
      size={size === 'md' && variant === 'primary' ? 'large' : 'default'}
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={size === 'sm' ? 4 : 0}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      testID={testID}
      containerStyle={containerStyle}
      style={[styles.base, styles[size], styles[variant], disabled && styles.disabled, style]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : leading}
      <Text style={[styles.label, size === 'sm' && styles.labelSm, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </JellyPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  md: { minHeight: 44, paddingHorizontal: spacing.lg },
  sm: { minHeight: 36, paddingHorizontal: spacing.md },
  primary: { backgroundColor: colors.lime, borderColor: colors.lime },
  secondary: { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent', borderColor: colors.border },
  disabled: { opacity: 0.45 },
  label: { fontFamily: fontsV2.bodySemi, fontSize: 15 },
  labelSm: { fontSize: 13 },
});
