import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import type { Recommendation } from '../lib/types';
import { buildMetaInfo, getOTTIcon } from '@neq/core';
import { colors, radius, spacing } from '../lib/tokens';

interface Props {
  rec: Recommendation;
  isTop: boolean;
  depth: number;
  dragX: number;
  isDragging: boolean;
}

export default function SwipeCard({ rec, isTop, depth, dragX, isDragging }: Props) {
  const animatedDepth = useSharedValue(depth);

  useEffect(() => {
    animatedDepth.value = withSpring(depth, { damping: 14, stiffness: 180 });
  }, [depth, animatedDepth]);

  const cardStyle = useAnimatedStyle(() => {
    const d = animatedDepth.value;
    const scale = 1 - d * 0.04;
    const yOffset = d * 12;
    // top 카드만 drag 반영, 좌 드래그만 회전 (좌=next)
    const tx = isTop ? dragX : 0;
    const rot = isTop && dragX < 0 ? Math.max(dragX * 0.04, -8) : 0;
    return {
      transform: [
        { translateX: tx },
        { translateY: yOffset },
        { scale },
        { rotate: `${rot}deg` },
      ],
      zIndex: 10 - d,
    };
  });

  const cardContent = (
    <>
      {rec.posterUrl ? (
        <Image
          source={{ uri: rec.posterUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallback]}>
          <Text style={styles.fallbackText}>N</Text>
        </View>
      )}

      <View style={styles.ratingBadge}>
        <Text style={styles.ratingText}>★ {rec.rating.toFixed(1)}</Text>
      </View>
      <View style={styles.typeBadge}>
        <Text style={styles.typeText}>{rec.type === 'series' ? '시리즈' : '영화'}</Text>
      </View>

      {depth <= 1 && (
        <View style={[styles.infoOverlay, { opacity: isTop && !isDragging ? 1 : 0 }]}>
          <Text style={styles.title}>{rec.title}</Text>
          <View style={styles.metaRow}>
            {buildMetaInfo(rec) ? (
              <Text style={styles.metaText}>{buildMetaInfo(rec)}</Text>
            ) : null}
            {rec.providers.length > 0 && (
              <View style={styles.providerIcons}>
                {rec.providers.slice(0, 4).map((p) => {
                  const iconUrl = getOTTIcon(p.name) ?? p.logoUrl;
                  return iconUrl ? (
                    <Image
                      key={p.name}
                      source={{ uri: iconUrl }}
                      style={styles.providerIcon}
                      contentFit="contain"
                      transition={0}
                    />
                  ) : null;
                })}
              </View>
            )}
          </View>
          <View style={styles.reasonBox}>
            <Text style={styles.reasonText}>{rec.reason}</Text>
          </View>
        </View>
      )}
    </>
  );

  return <Animated.View style={[styles.card, cardStyle]}>{cardContent}</Animated.View>;
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
  ratingBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  ratingText: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 13,
  },
  typeBadge: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  typeText: {
    color: colors.textPrimary,
    fontSize: 13,
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 6,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  providerIcons: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  providerIcon: {
    width: 20,
    height: 20,
    borderRadius: 3,
    backgroundColor: colors.surface,
  },
  reasonBox: {
    marginTop: spacing.sm + 4,
    backgroundColor: colors.accentDim,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  reasonText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
});
