import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, radius, spacing } from '../lib/tokens';

interface Props {
  isSaved: boolean;
  onShare: () => void;
  onRefresh: () => void;
  onToggleSave: () => void;
}

export default function ActionBar({
  isSaved,
  onShare,
  onRefresh,
  onToggleSave,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.left}>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          onPress={onShare}
          accessibilityLabel="공유"
          hitSlop={8}
        >
          <Text style={styles.iconText}>⤴</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          onPress={onRefresh}
          accessibilityLabel="새 추천"
          hitSlop={8}
        >
          <Text style={styles.iconText}>⟳</Text>
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.saveBtn,
          isSaved && styles.saveBtnActive,
          pressed && styles.pressed,
        ]}
        onPress={onToggleSave}
        accessibilityLabel={isSaved ? '저장 해제' : '저장'}
      >
        <Text
          style={[styles.saveIcon, isSaved && styles.saveIconActive]}
        >
          {isSaved ? '♥' : '♡'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  left: {
    flexDirection: 'row',
    gap: spacing.sm + 4,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: colors.textMuted,
    fontSize: 18,
  },
  saveBtn: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.xl,
  },
  saveBtnActive: {
    backgroundColor: colors.accent,
  },
  saveIcon: {
    color: colors.textMuted,
    fontSize: 22,
  },
  saveIconActive: {
    color: colors.bg,
  },
  pressed: {
    transform: [{ scale: 0.9 }],
  },
});
