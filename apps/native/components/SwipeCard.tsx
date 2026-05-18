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
  type SharedValue,
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
  /**
   * 사이클 2: pass dismiss worklet 곡선용 sharedValue.
   * 0 = idle, 음수값 = 좌측 dismiss 진행. 부모(`index.tsx`)에서 `withTiming` 으로 구동.
   * 지정 시 worklet 안에서 `dragX` 대신 이 값을 사용 (JS state 의존성 제거 → 60fps).
   */
  dismissX?: SharedValue<number>;
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
  dismissX,
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
    'worklet';
    // 2026-05-18 — Fabric `folly::ConversionError` SIGABRT crash 방어.
    // worklet sharedValue 가 어떤 path 에서든 NaN/Infinity 가 되면 Fabric 의
    // RawValue<double> → long long 변환이 abort. 모든 transform/opacity 결과를
    // finite number 로 강제. (가시적 동작 동일, 단 NaN race 시 안전한 0 fallback.)
    const safe = (n: number, fallback = 0): number => (Number.isFinite(n) ? n : fallback);

    const d = safe(animatedDepth.value);
    const baseScale = 1 - d * 0.04;
    const yOffset = d * 12;

    // 사이클 2: dismissX worklet 값이 활성화 (≠0) 면 dragX 대신 사용.
    const dismissRaw = dismissX !== undefined ? safe(dismissX.value) : 0;
    const dragXSafe = safe(dragX);
    const dragYSafe = safe(dragY);
    const dismissActive = dismissRaw !== 0;
    const effectiveDragX = dismissActive ? dismissRaw : dragXSafe;

    // tx/ty: top 카드만 drag 반영
    let tx = isTop ? effectiveDragX : 0;
    let ty = isTop ? dragYSafe * 0.6 + yOffset : yOffset;
    let rot = isTop && effectiveDragX < 0 ? Math.max(effectiveDragX * 0.04, -8) : 0;
    let scale = baseScale;
    let opacity = 1;
    if (isTop && dragYSafe > 30) {
      scale = Math.max(0.94, 1 - (dragYSafe - 30) * 0.0008);
    }

    // 흡수 모션 활성: 카드 중심 → save 버튼 좌표로 보간
    if (isTop && absorbing) {
      const target = saveTargetPoint ?? {
        x: SCREEN_W - 48,
        y: SCREEN_H - 80,
      };
      const cardCenterX = SCREEN_W / 2;
      const cardCenterY = SCREEN_H / 2;
      const dx = target.x - cardCenterX;
      const dy = target.y - cardCenterY;
      const p = safe(absorbProgress.value);
      tx = dx * p;
      ty = dy * p;
      scale = baseScale - (baseScale - 0.12) * p;
      rot = -3 * p;
      opacity = 1 - p;
    }

    return {
      transform: [
        { translateX: safe(tx) },
        { translateY: safe(ty) },
        { scale: safe(scale, 1) },
        { rotate: `${safe(rot)}deg` },
      ],
      opacity: safe(opacity, 1),
      // 2026-05-18 — SIGABRT 진짜 원인: Fabric `zIndex` prop 은 `std::optional<int>`.
      // `10 - d` (d=animatedDepth.value, withSpring 결과 = double) 가 9.9 같은 비정수면
      // folly::to<long long, double> 변환 실패 → ConversionError → cloneShadow abort.
      // Math.round 로 정수 강제.
      zIndex: Math.round(10 - d),
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
