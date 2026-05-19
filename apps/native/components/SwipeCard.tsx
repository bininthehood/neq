import { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import type { Recommendation } from '../lib/types';
import { getOTTIcon } from '@neq/core';
import { fontsV2, easings, durations } from '@neq/design';
import { colors, radius, shadowsNative } from '../lib/tokens';
import { IconStar } from './Icons';

/**
 * hex(#RRGGBB) → rgba 문자열 변환. CatChip 보더의 25% alpha 처리용.
 * web CatChip 은 `color-mix(in srgb, ${color} 25%, transparent)` 를 쓰지만 RN 은
 * color-mix 미지원 → 카테고리 색을 직접 alpha 적용. (2026-05-19 정합 audit)
 */
function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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
// M-1 (2026-05-19 정합 audit) — depth 전환 곡선. PWA SwipeCard 는 depth 를 스프링으로
// 애니메이션하지 않고 단순 `transform 0.3s ease-out` 으로 보간한다. native 도 동일하게
// withTiming + ease-move (대칭 가속-감속) 으로 — `withSpring(damping:14)` 의 과한
// 오버슈트("디용~") 제거.
const DEPTH_BEZIER = Easing.bezier(...easings.move);

// ─────────────────────────────────────────────────────
// CardVariantA RN 포팅 — 2026-05-19 native↔PWA 정합 audit C-1.
// 정본: apps/web/src/components/cards/CardVariantA.tsx + cards/parts.tsx.
// 기존 native cardContent(자체 레이아웃)를 폐기하고 PWA 풀블리드 카드를 1:1 포팅.
// 카테고리 라벨/색 (web cards/types.ts CAT_LABEL / CAT_COLOR_VAR 정합).
// movie/series/variety 3종 — variety(예능) 누락 시 카드가 "영화"로 오표기된다.
// ─────────────────────────────────────────────────────

type CardCategory = 'movie' | 'series' | 'variety';

const CAT_LABEL: Record<CardCategory, string> = {
  movie: '영화',
  series: '시리즈',
  variety: '예능',
};
const CAT_COLOR: Record<CardCategory, string> = {
  movie: colors.catMovie,
  series: colors.catSeries,
  variety: colors.catVariety,
};

/** 카테고리 칩 — bg-overlay + cat 색 + 1px 보더(cat 색 25% alpha). web CatChip 정합.
 *  web `parts.tsx` 의 `color-mix(in srgb, ${color} 25%, transparent)` 를 RN alpha 로 변환. */
function CatChip({ type }: { type: CardCategory }) {
  const color = CAT_COLOR[type];
  return (
    <BlurView intensity={20} tint="dark" style={styles.catChip}>
      <Text
        style={[
          styles.catChipText,
          { color, borderColor: hexAlpha(color, 0.25) },
        ]}
      >
        {CAT_LABEL[type]}
      </Text>
    </BlurView>
  );
}

/** 평점 칩 — bg-overlay + radius-sm + blur. web Rating(IconStar + tabular-nums) 정합. */
function RatingChip({ value }: { value: number }) {
  return (
    <BlurView intensity={20} tint="dark" style={styles.ratingChip}>
      <IconStar size={11} color={colors.accent} />
      <Text style={styles.ratingText}>{value.toFixed(1)}</Text>
    </BlurView>
  );
}

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
    // M-1 — depth 전환은 timing(ease-move). PWA 와 동일하게 오버슈트 없는 보간.
    animatedDepth.value = withTiming(depth, {
      duration: durations.steady,
      easing: DEPTH_BEZIER,
    });
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
    // M-3 (2026-05-19 정합 audit) — 좌 스와이프 회전을 PWA 정합으로.
    // 계수 0.04→0.06, 상한 -8→-15deg. (우 방향은 native prevOverlay 모델이라 0 유지.)
    let rot = isTop && effectiveDragX < 0 ? Math.max(effectiveDragX * 0.06, -15) : 0;
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
      // `10 - d` (d=animatedDepth.value, withTiming 결과 = double) 가 9.9 같은 비정수면
      // folly::to<long long, double> 변환 실패 → ConversionError → cloneShadow abort.
      // Math.round 로 정수 강제.
      zIndex: Math.round(10 - d),
    };
  });

  // C-1 — CardVariantA 풀블리드 레이아웃 RN 포팅.
  // 신규-2 (2026-05-19 재검증) — 카테고리 3종 매핑. Recommendation.type 은 현재
  // 'movie'|'series' 2종이나(@neq/core), variety(예능) 가 데이터 모델에 추가될
  // 경우 카드가 'movie' 로 흡수되지 않도록 3종 매핑으로 선반영. web cards/types.ts
  // CardCategory 3종 정본 정합.
  const type: CardCategory =
    rec.type === 'series'
      ? 'series'
      : (rec.type as string) === 'variety'
        ? 'variety'
        : 'movie';
  const year = rec.date ? rec.date.slice(0, 4) : '';
  const titleEn = rec.titleEn || rec.title;
  // subscription provider 우선 (web mapRecToWork 정합), 최대 6개.
  const otts = rec.providers
    .filter((p) => !p.category || p.category === 'subscription')
    .slice(0, 6);
  const infoVisible = isTop && !isDragging && !immersive;

  const cardContent = (
    <>
      {/* full-bleed poster */}
      {rec.posterUrl ? (
        <Image
          source={{ uri: rec.posterUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition="top"
          transition={200}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallback]}>
          <Text style={styles.fallbackText}>N</Text>
        </View>
      )}

      {/* bottom gradient overlay — 텍스트 가독. CardVariantA 정합 3-stop:
          50% transparent → 92% bg-overlay-heavy → 100% bg-overlay-solid.
          RN LinearGradient 는 첫 stop 이전 구간을 첫 색으로 평탄 채움 →
          0~50% transparent 는 stop 명시 불필요(PWA 3-stop 구조와 동일). */}
      <LinearGradient
        colors={['transparent', colors.overlayHeavy, colors.overlaySolid]}
        locations={[0.5, 0.92, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {depth <= 1 && (
        <>
          {/* top row — cat chip(좌) + rating chip(우) */}
          <View
            style={[styles.topRow, { opacity: infoVisible ? 1 : 0 }]}
            pointerEvents="none"
          >
            <CatChip type={type} />
            <RatingChip value={rec.rating} />
          </View>

          {/* bottom — year·titleEn / title / reason / otts */}
          <View
            style={[styles.bottomInfo, { opacity: infoVisible ? 1 : 0 }]}
            pointerEvents="none"
          >
            <Text style={styles.subTitle} numberOfLines={1}>
              {year ? `${year} · ${titleEn}` : titleEn}
            </Text>
            <Text style={styles.title}>{rec.title}</Text>
            <Text style={styles.reason} numberOfLines={3}>
              {rec.reason}
            </Text>
            {otts.length > 0 && (
              <View style={styles.ottRow}>
                {otts.map((p) => {
                  const iconUrl = getOTTIcon(p.name) ?? p.logoUrl;
                  return iconUrl ? (
                    <Image
                      key={p.name}
                      source={{ uri: iconUrl }}
                      style={styles.ottChip}
                      contentFit="contain"
                      transition={0}
                    />
                  ) : null;
                })}
              </View>
            )}
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
    borderRadius: radius.xl, // T-1 정정 후 16px (PWA --radius-xl 정합)
    overflow: 'hidden',
    backgroundColor: colors.surface,
    // C-2 / T-2 — CardVariantA boxShadow var(--shadow-lg). shadowsNative 헬퍼 경유.
    ...shadowsNative.lg,
  },
  fallback: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    fontFamily: fontsV2.display, // PosterFallback: font-display 'N' (web parts.tsx)
    color: colors.textMuted,
    fontSize: 48,
  },
  // top row — CardVariantA: top/left/right 14, space-between, align-items flex-start
  topRow: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  // CatChip — padding 4×10, radius-sm, bg-overlay(BlurView), text-xs 600
  catChip: {
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  catChipText: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.05,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  // Rating 칩 — padding 4×10, radius-sm, bg-overlay(BlurView)
  ratingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  ratingText: {
    fontFamily: fontsV2.data, // Geist Mono tabular-nums (web Rating 정합)
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  // bottom info — CardVariantA: left/right 18, bottom 16
  bottomInfo: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 16,
  },
  // year · titleEn — Instrument Serif italic, text-sm(13), accent, letterSpacing 0.02em
  subTitle: {
    fontFamily: fontsV2.displayItalic,
    fontStyle: 'italic',
    fontSize: 13,
    color: colors.accent,
    letterSpacing: 0.26,
    marginBottom: 6,
  },
  // title — font-body(Pretendard→RN system) 700, text-2xl(28), letterSpacing -0.025em,
  // lineHeight 1.15. native 가 거꾸로 세리프를 쓰던 오류 정정 → 시스템 폰트 700.
  title: {
    fontFamily: fontsV2.body, // undefined → RN system font (iOS San Francisco)
    fontWeight: '700',
    fontSize: 28,
    color: colors.textPrimary,
    letterSpacing: -0.7,
    lineHeight: 32,
    marginBottom: 10,
  },
  // reason — font-body 400, text-sm(13), rgba(237,237,239,0.85), lineHeight 1.4, maxWidth 85%
  reason: {
    fontFamily: fontsV2.body,
    fontWeight: '400',
    fontSize: 13,
    color: 'rgba(237,237,239,0.85)',
    lineHeight: 18,
    marginBottom: 12,
    maxWidth: '85%',
  },
  // OTT — gap 6, OttChip 22×22 radius-sm
  ottRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  ottChip: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
});
