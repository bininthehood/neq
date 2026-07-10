import { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
// 2026-06-10 (Phase C #3) — BlurView 제거. CatChip/RatingChip 가 `--bg-overlay` solid 면으로 회귀.
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import type { Recommendation } from '../lib/types';
import { getOTTIcon, getGenreLabels } from '@neq/core';
import { displayProviders } from '../lib/providers';
import { fontsV2, easings, durations } from '@neq/design';
import { colors, radius, shadowsNative } from '../lib/tokens';

// 2026-06-10 swipe anim 재설계 (`_workspace/07_redesign-spec-swipe-anim-2026-06-10.md`):
//   - dismissX / isDismissing prop 폐기. dragX 단일 SharedValue 로 PWA 정합.
//   - animatedDepth useSharedValue + useEffect(DEPTH_MS) 폐기. baseScale=1 고정, depth 시각 단서 페기.
//   - DEPTH_BEZIER / DEPTH_MS 상수 폐기.
//   - worklet 의 dismissRaw/dismissActive/effectiveDragX 폐기 → `tx = isTop ? dragX.value : 0`.
//   - zIndex 는 depth prop 직접 사용 (Math.round(10 - depth)).
//   - PWA `apps/web/src/hooks/useSwipeGesture.ts:205-208` + `SwipeCard.tsx:68-89` 1:1 포팅.

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
   * 2026-05-20 prev overlay 통합 — 이 카드가 prev overlay 모드인지.
   * true 면 worklet 이 depth/dragX 모두 무시하고 prevOverlayX 만 적용.
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
  /**
   * 2026-06-10 swipe anim 재설계 v3 — dismiss 모션 SharedValue 분리.
   *
   * v2 결함: 좌 swipe trigger 시 dragX 를 -SCREEN_W 까지 보간 + 360ms 후 dragX=0.
   * 옛 top 이 isTop=true + dragX=0 변경에 worklet 재평가 → -SCREEN_W → 0 (중앙)
   * 점프 후 unmount → 사용자 인지 "옛 카드 1회 깜빡임".
   *
   * v3: 옛 top 의 slide-out 모션을 dragX 와 분리. dismissX SharedValue 가 dismiss
   * 진행 카드 전용. worklet 안에서 `dismissCardIdSV.value === rec.tmdbId` 매칭으로
   * 해당 카드만 dismissX 적용. 새 top / 비탑 카드는 영향 0.
   *
   * 식별을 SharedValue 로 — React state isDismissing prop (이전 wave 패턴) 의
   * commit 전이 race 없음. UI thread 단일 처리.
   */
  dismissX?: SharedValue<number>;
  /** dismiss 진행 중인 카드의 tmdbId. -1 = idle. SharedValue 라 race 0. */
  dismissCardIdSV?: SharedValue<number>;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SPRING_BEZIER = Easing.bezier(...easings.spring);
// 2026-06-10 swipe anim 재설계 — DEPTH_BEZIER / DEPTH_MS / animatedDepth 트랙 전부 폐기.
// baseScale 1 hard + depth prop 직접 zIndex 사용. PWA 정합 (`SwipeCard.tsx:68-89`).

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
  isPrev = false,
  prevOverlayX,
  dismissX,
  dismissCardIdSV,
}: Props) {
  const absorbProgress = useSharedValue(0); // 0=normal, 1=fully absorbed

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

    // 2026-05-20 prev overlay 모드 — depth/dragX 모두 무시하고
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

    // 2026-06-10 swipe anim 재설계 — baseScale 1 hard, yOffset 0.
    // 사용자 결정: stack 깊이감 (depth scale 0.96/0.92) 폐기. depth 시각 단서는
    // zIndex 만으로 충분. PWA `SwipeCard.tsx:68-89` 의 baseTx=isTop?dragX:0 와 1:1.
    const baseScale = 1;
    const yOffset = 0;

    // 2026-06-10 swipe anim v3 — dismiss 모션 SharedValue 분리.
    // dragX 는 drag 추적 전용. 옛 top 의 slide-out 은 dismissX (별도 SharedValue).
    // dismissCardIdSV.value === rec.tmdbId 매칭으로 옛 top 만 dismissX 적용.
    // 새 top / 비탑 카드는 dragX 만 → dismissX 변경 영향 0.
    // 식별 가드를 SharedValue 로 (React state 가 아닌) → commit 전이 race 0.
    const dragXSafe = safe(dragX.value);
    const dragYSafe = dragY !== undefined ? safe(dragY.value) : 0;
    const isDismissing =
      dismissCardIdSV !== undefined && dismissCardIdSV.value === rec.tmdbId;
    const dismissXSafe =
      isDismissing && dismissX !== undefined ? safe(dismissX.value) : 0;

    // tx/ty: dismiss 진행 카드는 dismissX 만. 그 외 isTop 만 dragX 반영.
    let tx = isDismissing ? dismissXSafe : isTop ? dragXSafe : 0;
    let ty = isTop ? dragYSafe * 0.6 + yOffset : yOffset;
    // 회전 — dismiss 중이면 dismissX, 아니면 dragX 기준
    const rotSource = isDismissing ? dismissXSafe : dragXSafe;
    let rot = (isDismissing || isTop) && rotSource < 0 ? Math.max(rotSource * 0.06, -15) : 0;
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
      // 2026-06-10 swipe anim 재설계 — animatedDepth 폐기. depth prop 직접 사용.
      // Fabric `zIndex` 는 정수 필수 → Math.round 유지. depth 가 number 이므로
      // Reanimated 가 Animated.View props 변경 시 worklet 자동 재평가 (React commit
      // 후 매 frame 이 아닌 prop 변경 시점).
      zIndex: Math.round(10 - depth),
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
  // 표시용 provider — allowlist + subscription (displayProviders). 구 저장 스냅샷의
  // Crunchyroll 류 비지원 provider 치유 포함. 최대 6개.
  const otts = displayProviders(rec.providers).slice(0, 6);
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
          {/* bottom — year·titleEn / title+badges / reason / otts.
              4차-2 (2026-07-10) 피드백: 필을 타이틀 블록 최상단이 아닌 작품명 헤더
              오른쪽 인라인으로 (포스터 가림 최소화, 사용자 선택 A안). 제목이 길어
              내부 줄바꿈되면 필은 마지막 줄 우측에 하단 정렬로 앉음. */}
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
            {/* 4차-3 (2026-07-10) — 필을 타이틀 아래 고정 row 로. 인라인(A안)은 제목
                길이에 따라 필 위치가 요동쳐 폐기 (사용자 피드백).
                4차-4 — 장르 필 추가 (상위 2개, DetailSheet 동일). genres 미보유
                구 데이터는 자연 생략. */}
            <View style={styles.badgeRow}>
              <View style={styles.ratingPill}>
                <Text style={styles.ratingPillText}>★ {rec.rating.toFixed(1)}</Text>
              </View>
              <View style={styles.typePill}>
                <Text style={styles.typePillText}>{CAT_LABEL[type]}</Text>
              </View>
              {getGenreLabels(rec.genres).slice(0, 2).map((g) => (
                <View key={g} style={styles.typePill}>
                  <Text style={styles.typePillText}>{g}</Text>
                </View>
              ))}
            </View>
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
  // 배지 row — 타이틀 아래 고정 (제목 길이와 무관한 일정 위치).
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    marginBottom: 10,
  },
  // DetailSheet heroBadges 정본 (DetailSheet.tsx styles.ratingPill/typePill 동일값):
  // bg rgba(0,0,0,0.5), radius-sm, padding 10×4, fontSize 11, Geist Mono, ls 0.2.
  ratingPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  ratingPillText: {
    color: colors.accent,
    fontSize: 11,
    fontFamily: fontsV2.data,
    letterSpacing: 0.2,
  },
  typePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  typePillText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontFamily: fontsV2.data,
    letterSpacing: 0.2,
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
