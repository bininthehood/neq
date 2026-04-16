import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../lib/tokens';

interface Props {
  visible: boolean;
}

/**
 * 발견 첫 3장에 표시되는 "탭하여 상세" 힌트.
 * 카드 중앙에 반투명 pill로 오버레이.
 */
export default function TutorialOverlay({ visible }: Props) {
  if (!visible) return null;
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.pill}>
        <Text style={styles.text}>탭하여 상세보기</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 15,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.overlayLight,
  },
  text: {
    color: colors.textSecondary,
    fontSize: 12,
    opacity: 0.85,
  },
});
