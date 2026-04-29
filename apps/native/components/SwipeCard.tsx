import { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { Recommendation } from '../lib/types';
import { buildMetaInfo, getOTTIcon } from '@neq/core';
import { fonts, easings, durations } from '@neq/design';
import { colors, radius, spacing } from '../lib/tokens';

interface Props {
  rec: Recommendation;
  isTop: boolean;
  depth: number;
  dragX: number;
  /** Stage 4 D1: 위/아래 스와이프 변위. 양수=아래(save), 음수=위(detail) */
  dragY?: number;
  isDragging: boolean;
  immersive?: boolean;
  /**
   * Stage 4 D1: save 흡수 모션 트리거.
   * `true` 가 되면 카드는 우측하단 save 버튼 위치로 scale 0.12 + 이동 + 페이드아웃.
   */
  absorbing?: boolean;
  /** save 버튼 화면 좌표 (절대 위치). 흡수 목표점. 미지정 시 우측하단 기본값. */
  saveTargetPoint?: { x: number; y: number } | null;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SPRING_BEZIER = Easing.bezier(...easings.spring);

export default function SwipeCard({
  rec,
  isTop,
  depth,
  dragX,
  dragY = 0,
  isDragging,
  immersive = false,
  absorbing = false,
  saveTargetPoint,
}: Props) {
  const animatedDepth = useSharedValue(depth);
  const absorbProgress = useSharedValue(0); // 0=normal, 1=fully absorbed

  useEffect(() => {
    animatedDepth.value = withSpring(depth, { damping: 14, stiffness: 180 });
  }, [depth, animatedDepth]);

  useEffect(() => {
    if (absorbing && isTop) {
      absorbProgress.value = withTiming(1, {
        duration: durations.steady,
        easing: SPRING_BEZIER,
      });
    } else {
      absorbProgress.value = 0;
    }
  }, [absorbing, isTop, absorbProgress]);

  const cardStyle = useAnimatedStyle(() => {
    const d = animatedDepth.value;
    const baseScale = 1 - d * 0.04;
    const yOffset = d * 12;

    // Stage 4 D1: 4방향 + save 흡수
    // tx/ty: top 카드만 drag 반영 (좌=다음, 우는 이전 오버레이가 처리, 위=detail, 아래=save 진행)
    let tx = isTop ? dragX : 0;
    // 아래로 끌 때 카드가 살짝 따라감 (0.6 댐핑) — save 진입 신호
    let ty = isTop ? dragY * 0.6 + yOffset : yOffset;
    // 좌 드래그만 회전 (좌=next 시각 신호)
    let rot = isTop && dragX < 0 ? Math.max(dragX * 0.04, -8) : 0;
    let scale = baseScale;
    let opacity = 1;
    // 아래 끌 때 살짝 축소 (흡수 예고)
    if (isTop && dragY > 30) {
      scale = Math.max(0.94, 1 - (dragY - 30) * 0.0008);
    }

    // 흡수 모션 활성: 카드 중심 → save 버튼 좌표로 보간
    if (isTop && absorbing) {
      const target = saveTargetPoint ?? {
        x: SCREEN_W - 48,
        y: SCREEN_H - 80,
      };
      // 카드의 화면상 중심 (대략): 카드는 absolute fill — 화면 중앙 근처 가정
      const cardCenterX = SCREEN_W / 2;
      const cardCenterY = SCREEN_H / 2;
      const dx = target.x - cardCenterX;
      const dy = target.y - cardCenterY;
      const p = absorbProgress.value;
      tx = dx * p;
      ty = dy * p;
      scale = baseScale - (baseScale - 0.12) * p;
      rot = -3 * p;
      opacity = 1 - p;
    }

    return {
      transform: [
        { translateX: tx },
        { translateY: ty },
        { scale },
        { rotate: `${rot}deg` },
      ],
      opacity,
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

      <Text style={styles.ratingText}>★ {rec.rating.toFixed(1)}</Text>
      <Text style={styles.typeText}>
        {rec.type === 'series' ? '시리즈' : '영화'}
      </Text>

      {depth <= 1 && (
        <>
          <LinearGradient
            colors={['transparent', 'rgba(18,17,14,0.6)', colors.bg]}
            locations={[0, 0.5, 1]}
            style={[styles.infoGradient, { opacity: isTop && !isDragging && !immersive ? 1 : 0 }]}
            pointerEvents="none"
          />
          <View
            style={[styles.infoContent, { opacity: isTop && !isDragging && !immersive ? 1 : 0 }]}
            pointerEvents="none"
          >
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
        </>
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
  ratingText: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    color: colors.accent,
    fontFamily: fonts.data,
    fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  typeText: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    color: colors.textPrimary,
    fontSize: 13,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  infoGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 280,
  },
  infoContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 30,
    fontFamily: fonts.display,
    lineHeight: 36,
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
    fontFamily: fonts.dataReg,
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
    backgroundColor: colors.surface,
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
