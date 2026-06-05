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
  /**
   * 2026-06-06 (P1 애니메이션 Fix B) — drag 추적 SharedValue 화.
   * 진단: `_workspace/02_p1_animation.md` §3 (root cause 2).
   *
   * 기존: number prop (React state). pan.onUpdate 가 매 frame `runOnJS(setDragX)` →
   *   React reconcile → SwipeCard re-render → 새 props → worklet 재계산. 60Hz
   *   loop 가 JS thread bottleneck 에 종속 → 빠른 swipe 시 카드가 손가락보다
   *   늦게 따라옴.
   * 변경: SharedValue<number>. worklet 안에서 `dragX.value` 직접 읽기 → UI thread
   *   만으로 매 frame 처리. JS thread 왕복 0 회 → 손가락 추적 안정.
   */
  dragX: SharedValue<number>;
  /** Stage 4 D1: 위/아래 스와이프 변위. 양수=아래(save), 음수=위(detail) */
  dragY?: SharedValue<number>;
  /**
   * @deprecated 2026-05-19 — 항목 4 정합 이후 미사용. PWA SwipeCard 정합으로
   * 드래그 중에도 정보 영역을 유지하므로 SwipeCard 내부에서 더 이상 참조하지 않는다.
   * prop 자체는 호출처(`index.tsx`) 호환을 위해 optional 로 보존.
   */
  isDragging?: boolean;
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
  /**
   * 2026-05-20 snap-back fix — 이 카드가 현재 dismiss 진행 중인 카드인지 표시.
   * 부모에서 `dismissingTmdbId === rec.tmdbId` 로 계산. true 일 때만 worklet 에서
   * dismissX 를 transform 으로 적용.
   *
   * 왜 필요한가: 기존 구조에서 dismissX 는 shared value 라 옛 top → 새 top 으로
   * isTop 이 전이될 때 React commit / UI 메시지 순서에 따라 옛 top 이 한 프레임
   * 중앙으로 snap 하거나 새 top 이 한 프레임 화면 밖으로 튀는 결함이 있었다.
   * `isDismissing` 으로 게이트하면 옛 top 만 dismissX 를 읽고, 새 top 은 dragX
   * (=0) 로 정상 위치 — 한 프레임 점프 0.
   */
  isDismissing?: boolean;
  /**
   * 2026-05-20 prev overlay 통합 — 이 카드가 prev overlay 모드인지.
   * true 면 worklet 이 depth/dragX/dismissX 모두 무시하고 prevOverlayX 만 적용.
   * zIndex 100 으로 stack 의 다른 카드들 위에 깔린다.
   *
   * 왜: 기존 `PrevCardOverlay` 와 stack 의 새 top `SwipeCard` 가 별개 component
   * instance → 별개 native view → BlurView/shadow/image 가 mount/unmount 사이클로
   * 한 프레임 어긋남(미세 깜빡임). 같은 SwipeCard 컴포넌트로 통합하면 prev →
   * 새 top 전환이 React key 기반 reconcile 로 *인스턴스 재활용* → native view
   * 보존 → 깜빡임 0.
   */
  isPrev?: boolean;
  /** prev overlay 모드 위치(translateX) sharedValue. isPrev=true 일 때만 사용. */
  prevOverlayX?: SharedValue<number>;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SPRING_BEZIER = Easing.bezier(...easings.spring);
// 2026-05-20 정합 재교정 — depth 전환 곡선. M-1 (5/19) 가 ease-move 로 바꿨으나
// 대칭 가속-감속은 초반이 느려 새 top 카드가 "settle/loading" 처럼 인지된다.
// PWA `transform 0.3s ease-out` 진짜 정합으로 단방향 감속(빠른 시작 → 부드러운 안착)
// 으로 교체. CSS `ease-out` = `cubic-bezier(0, 0, 0.58, 1)`.
const DEPTH_BEZIER = Easing.bezier(0, 0, 0.58, 1);
// PWA 와 동일한 300ms (durations.steady=350 은 바텀시트용, depth 보간엔 50ms 과함).
const DEPTH_MS = 300;

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
  dragY,
  // isDragging — 항목 4 정합 이후 미참조 (Props 에서 @deprecated). destructure 생략.
  immersive = false,
  absorbing = false,
  saveTargetPoint,
  dismissX,
  isDismissing = false,
  isPrev = false,
  prevOverlayX,
}: Props) {
  const animatedDepth = useSharedValue(depth);
  const absorbProgress = useSharedValue(0); // 0=normal, 1=fully absorbed

  useEffect(() => {
    // 2026-06-06 (P1 애니메이션 Fix A) — 새 top 카드 (depth=0) 진입은 즉시 적용.
    // 진단: `_workspace/02_p1_animation.md` §2 (root cause 1).
    //
    // 기존 결함: pass dismiss 직후 새 top 카드의 depth prop 1→0 전환에 withTiming
    //   300ms 가 매번 처음부터 다시 보간 → scale 0.96→1, yOffset 12→0 이 ease-out
    //   초반 (변화량 작은 구간) 으로 인지되며 "한 박자 뒤에 앞으로 나오는 딜레이"
    //   체감. PWA 는 동일 곡선이지만 CSS transition 이 GPU 합성으로 즉시 → 인지 0.
    //
    // 수정: depth===0 진입 (= 새 top) 은 보간 없이 즉시. 다른 depth (뒤로 빠지는
    //   카드) 는 기존 ease-out 300ms 그대로 → stack 의 "뒤로 빠지는 카드" 시각만
    //   부드럽고 새 top 은 즉시 도착 → PWA 와 인지 동등.
    if (depth === 0) {
      animatedDepth.value = 0;
    } else {
      animatedDepth.value = withTiming(depth, {
        duration: DEPTH_MS,
        easing: DEPTH_BEZIER,
      });
    }
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

    // 2026-05-20 prev overlay 모드 — depth/dragX/dismissX 모두 무시하고
    // prevOverlayX 만 translateX 로 적용. scale 1, zIndex 100.
    // 도착 후 isPrev=false 로 전환 시 dragX=0 → translateX=0, zIndex=10 → 같은
    // 위치 유지 (translateX 0=0). 인스턴스 재활용으로 native view 보존.
    if (isPrev && prevOverlayX !== undefined) {
      return {
        transform: [{ translateX: safe(prevOverlayX.value) }],
        opacity: 1,
        zIndex: 100,
      };
    }

    const d = safe(animatedDepth.value);
    const baseScale = 1 - d * 0.04;
    const yOffset = d * 12;

    // 2026-05-20 — isDismissing 게이트 추가. 이 카드가 dismiss 진행 중일 때만
    // dismissX 를 transform 으로 적용. 그 외엔 dragX 만 사용 → 옛 top → 새 top
    // 전이 시 한 프레임 점프 차단.
    // 2026-06-06 (P1 애니메이션 Fix B) — dragX/dragY 는 SharedValue. worklet 안에서
    // 직접 `.value` 읽기로 JS thread 왕복 제거. 비탑 카드는 isTop=false 라
    // 아래 분기에서 tx=0 이 되므로 dragX 값을 읽어도 영향 없음.
    const dismissRaw =
      isDismissing && dismissX !== undefined ? safe(dismissX.value) : 0;
    const dragXSafe = safe(dragX.value);
    const dragYSafe = dragY !== undefined ? safe(dragY.value) : 0;
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

  return (
    <Animated.View
      style={[styles.card, cardStyle]}
      // 2026-06-06 (B-3 E2E 결정성) — refresh-race-2026-06-06.test.ts 가 page source
      // 의 title StaticText 휴리스틱으로 카드 시그니처를 비교했었음. testID 도입 후
      // refresh-race spec 의 snapshotCardSignatures 가 swipe-card-{tmdbId} 정확 매칭
      // 으로 전환. 다른 spec 의 인터랙션엔 영향 없음 (label 기반 tap 유지).
      testID={`swipe-card-${rec.tmdbId}`}
    >
      <CardInner rec={rec} immersive={immersive} depth={depth} />
    </Animated.View>
  );
}

/**
 * 2026-05-20 — PWA `CardVariantA` 정합 풀블리드 카드 내부 컴포넌트.
 * `SwipeCard` 와 `PrevCardOverlay` 양쪽에서 재사용 — 우 스와이프 도착 시점에
 * overlay → 새 top 으로 전환되어도 정보 영역이 100% 동일 → 깜빡임 0.
 */
export function CardInner({
  rec,
  immersive,
  depth,
}: {
  rec: Recommendation;
  immersive: boolean;
  depth: number;
}) {
  // 2026-05-20 — Recommendation.type 3종 (`'movie' | 'series' | 'variety'`) 확장 완료.
  // 서버 enrichment 가 TV + Reality/Talk 장르 통과 시 'variety' 라벨. as string 캐스팅
  // 제거하고 직접 매핑.
  const type: CardCategory =
    rec.type === 'series'
      ? 'series'
      : rec.type === 'variety'
        ? 'variety'
        : 'movie';
  const year = rec.date ? rec.date.slice(0, 4) : '';
  const titleEn = rec.titleEn || rec.title;
  // subscription provider 우선 (web mapRecToWork 정합), 최대 6개.
  const otts = rec.providers
    .filter((p) => !p.category || p.category === 'subscription')
    .slice(0, 6);
  const infoVisible = !immersive;

  return (
    <>
      {/* full-bleed poster */}
      {rec.posterUrl ? (
        <Image
          source={{ uri: rec.posterUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition="top"
          // 2026-05-20 PWA 정합 — Next/Image 는 placeholder=empty (no fade) 기본.
          // expo-image transition={200} 은 첫 paint 에 fade-in 발동 → 우 스와이프
          // prev overlay 진행 중 image 가 점점 진해지는 게 "깜빡임" 으로 인지됐다.
          // 0 으로 통일해 PWA 와 동일하게 즉시 표시.
          transition={0}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallback]}>
          <Text style={styles.fallbackText}>N</Text>
        </View>
      )}

      {/* bottom gradient overlay — 텍스트 가독. CardVariantA 정합 3-stop:
          50% transparent → 92% bg-overlay-heavy → 100% bg-overlay-solid. */}
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
            {/* 2026-06-06 B-3 — refresh-race spec testID 정확 매칭 (root 와 동일 tmdbId). */}
            <Text style={styles.title} testID={`swipe-card-title-${rec.tmdbId}`}>
              {rec.title}
            </Text>
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
