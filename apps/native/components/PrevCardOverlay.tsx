import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import type { Recommendation } from '../lib/types';
import { colors, radius, spacing } from '../lib/tokens';
import type { SharedValue } from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  rec: Recommendation;
  overlayX: SharedValue<number>;
}

// 이전 카드는 화면 왼쪽 바깥에서 우 스와이프 시 오버레이로 덮어온다.
// overlayX: -SCREEN_WIDTH = 완전 가림(시작), 0 = 완전히 도착
export default function PrevCardOverlay({ rec, overlayX }: Props) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: overlayX.value }],
  }));

  return (
    <Animated.View style={[styles.card, style]}>
      {rec.posterUrl ? (
        <Image
          source={{ uri: rec.posterUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={0}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallback]}>
          <Text style={styles.fallbackText}>N</Text>
        </View>
      )}
      <View style={styles.infoOverlay}>
        <Text style={styles.title}>{rec.title}</Text>
        <Text style={styles.subtitle}>{rec.titleEn}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    top: 0,
    bottom: 8,
    left: 12,
    right: 12,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    zIndex: 100,
  },
  fallback: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: colors.textMuted,
    fontSize: 64,
    fontWeight: '700',
  },
  infoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingTop: spacing['2xl'],
    backgroundColor: colors.overlayHeavy,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
});

export { SCREEN_WIDTH };
