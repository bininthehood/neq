import { memo, useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Text } from './Text';
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
import { getOTTIcon, getGenreLabels, friendMemo } from '@neq/core';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { displayProviders } from '../lib/providers';
import { TAB_BAR_SPACE } from '../lib/tab-bar';
import { fontsV2, easings, durations } from '@neq/design';
import { colors, palette, radius, shadowsNative, useThemeColors } from '../lib/tokens';

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
  /**
   * 2026-07-10 — hold(long-press) 눌림 램프 (0~1). top 카드만 scale 로 반영 —
   * hold 대기 450ms 동안 서서히 눌리는 active 피드백 (케밥 메뉴 오픈 예고).
   */
  holdSV?: SharedValue<number>;
  /**
   * Night Pool 5단계 — 관심 없음 가라앉기. sinkCardIdSV 가 이 카드 tmdbId 면 sinkP(0→1) 로
   * 작아지며(0.6) 살짝 가라앉고 어둡게 사라진다.
   */
  sinkCardIdSV?: SharedValue<number>;
  sinkP?: SharedValue<number>;
}

/** 스티커가 다 붙는 거리 (세로 스와이프 임계 100 과 같게) */
const STICKER_FULL_PX = 100;

function stickerFrame(y: number, reduced: boolean) {
  'worklet';
  const p = Number.isFinite(y) ? Math.min(1, Math.max(0, y / STICKER_FULL_PX)) : 0;
  return {
    opacity: p > 0.05 ? Math.min(1, p * 1.6) : 0,
    transform: [{ rotate: '-6deg' }, { scale: reduced ? 1 : 0.6 + 0.5 * p }],
  };
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

// 카드 하단 청록 잉크 (DESIGN.md Color — 검정 아님). 포스터 위라 테마 무관.
const CARD_INK = ['rgba(4,20,24,0)', 'rgba(4,20,24,0.82)', 'rgba(4,20,24,0.96)'] as const;
// 포스터·잉크 위 글자는 테마 무관 밝은 값 (라이트 모드에서도 어두운 잉크 위)
const ON_INK = palette.dark;
// 2026-11-27 카드 유리 테두리 (제임스 요청 "카드가 너무 평면"). 포스터 위에 GlassView 를 올리지 않고
// 가장자리만 유리처럼: 밝은 림 + 안쪽 잉크 헤어라인(두께감) + 위쪽 반사광. 전부 정적 뷰라 스와이프 중
// 추가 렌더 비용이 없다 (움직이는 카드 위 실제 유리는 매 프레임 뒤를 다시 샘플링 + 2026-06 깜빡임 이력).
const GLASS_SHEEN = ['rgba(214,255,248,0.16)', 'rgba(214,255,248,0)'] as const;
const HANGUL = /[\u3131-\uD79D]/;
/** 액션바(64)와 떠 있는 탭바가 카드 아래를 덮으므로 정보 영역을 그만큼 올린다 (index.tsx·SkeletonCard 와 공유). */
export const CARD_BOTTOM_OVERLAY = 64 + TAB_BAR_SPACE;
/** 친구 메모 위치 — 발견 화면 케밥(top 60, 44) 바로 아래. index.tsx CARD_MENU_TOP 과 맞춤. */
const MEMO_TOP = 60 + 44 + 14;

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
  holdSV,
  sinkCardIdSV,
  sinkP,
}: Props) {
  const reduced = useReducedMotion();
  const t = useThemeColors(); // Animated.View 색은 hex 만 (lib/tokens.ts Reanimated 규칙)
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
    // 위 끌기(관심 없음)는 카드를 올리지 않는다 — 올리면 카드 위 친구 메모가 고정된 케밥 밑으로 들어감.
    // 대신 살짝 작아지며 "가라앉기" 를 예고한다 (아래 scale 분기).
    let ty = isTop ? Math.max(0, dragYSafe) * 0.6 + yOffset : yOffset;
    // 회전 — dismiss 중이면 dismissX, 아니면 dragX 기준
    const rotSource = isDismissing ? dismissXSafe : dragXSafe;
    let rot = (isDismissing || isTop) && rotSource < 0 ? Math.max(rotSource * 0.06, -15) : 0;
    let scale = baseScale;
    let opacity = 1;
    const isSinking =
      sinkCardIdSV !== undefined && sinkP !== undefined && sinkCardIdSV.value === rec.tmdbId;
    if (isSinking) {
      // 관심 없음 퇴장 — 손 뗀 높이에서 0.6 까지 작아지며 살짝 가라앉고, 끝에서 사라진다.
      const p = safe(sinkP!.value);
      ty = 40 * p;
      tx = 0;
      rot = 0;
      scale = 1 - 0.4 * p;
      opacity = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
    } else if (isTop && dragYSafe < -10) {
      scale = Math.max(0.95, 1 + (dragYSafe + 10) * 0.0005);
    } else if (isTop && dragYSafe > 30) {
      scale = Math.max(0.94, 1 - (dragYSafe - 30) * 0.0008);
    }
    // 2026-07-10 — hold 눌림 램프: top 카드가 hold 대기 동안 최대 4% 축소.
    if (isTop && holdSV !== undefined) {
      scale = scale * (1 - 0.04 * safe(holdSV.value));
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
      style={[styles.card, { backgroundColor: t.surface }, cardStyle]}
      // 2026-06-06 (B-3 E2E 결정성) — refresh-race-2026-06-06.test.ts 가 page source
      // 의 title StaticText 휴리스틱으로 카드 시그니처를 비교했었음. testID 도입 후
      // refresh-race spec 의 snapshotCardSignatures 가 swipe-card-{tmdbId} 정확 매칭
      // 으로 전환. 다른 spec 의 인터랙션엔 영향 없음 (label 기반 tap 유지).
      testID={`swipe-card-${rec.tmdbId}`}
    >
      <CardInner rec={rec} immersive={immersive} depth={depth} />
      {isTop && dragY !== undefined ? (
        <DragOverlays
          tmdbId={rec.tmdbId}
          dragY={dragY}
          reduced={reduced}
          sinkCardIdSV={sinkCardIdSV}
          sinkP={sinkP}
        />
      ) : null}
    </Animated.View>
  );
}

/**
 * Night Pool 5단계 — 세로 끌기 스티커(아래 "찜!" 라임 / 위 "관심 없음" 청록 반투명) +
 * 가라앉기 어둡게 층. top 카드에만 붙는다. RN 은 흑백 필터가 없어 어둡게만 (계획 5단계).
 * Animated.* 색은 hex/rgba 문자열만 (0단계 — DynamicColorIOS 금지). 포스터 위라 테마 무관.
 */
function DragOverlays({
  tmdbId,
  dragY,
  reduced,
  sinkCardIdSV,
  sinkP,
}: {
  tmdbId: number;
  dragY: SharedValue<number>;
  reduced: boolean;
  sinkCardIdSV?: SharedValue<number>;
  sinkP?: SharedValue<number>;
}) {
  // 0.6 → 1.1 로 붙는다 (DESIGN.md Motion). reduced-motion 이면 스케일 없이 바로.
  const saveSticker = useAnimatedStyle(() => stickerFrame(dragY.value, reduced));
  const hideSticker = useAnimatedStyle(() => stickerFrame(-dragY.value, reduced));
  const dimStyle = useAnimatedStyle(() => {
    'worklet';
    const on = sinkCardIdSV !== undefined && sinkP !== undefined && sinkCardIdSV.value === tmdbId;
    const p = on ? sinkP!.value : 0;
    return { opacity: Number.isFinite(p) ? p * 0.7 : 0 };
  });
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.sinkDim, dimStyle]} />
      <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.dragSticker, styles.saveSticker, saveSticker]}>
        <Text style={styles.saveStickerText}>찜!</Text>
      </Animated.View>
      <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.dragSticker, styles.hideSticker, hideSticker]}>
        <Text style={styles.hideStickerText}>관심 없음</Text>
      </Animated.View>
    </>
  );
}

/**
 * 2026-05-20 — PWA `CardVariantA` 정합 풀블리드 카드 내부 컴포넌트.
 * `SwipeCard` 와 `PrevCardOverlay` 양쪽에서 재사용 — 우 스와이프 도착 시점에
 * overlay → 새 top 으로 전환되어도 정보 영역이 100% 동일 → 깜빡임 0.
 */
// memo — 카드 교체 때 stack 의 남은 카드는 rec·immersive·depth 가 그대로라 다시 그리지 않는다.
export const CardInner = memo(function CardInner({
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
  // 친구 메모 스티커 (packages/core 규칙 기반). null 이면 생략.
  const memoText = friendMemo(rec);

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
        colors={CARD_INK}
        locations={[0.45, 0.8, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LinearGradient colors={GLASS_SHEEN} style={styles.glassSheen} pointerEvents="none" />
      <View style={styles.glassRim} pointerEvents="none" />
      <View style={styles.glassRimInner} pointerEvents="none" />

      {depth <= 1 && (
        <>
          {memoText && infoVisible ? (
            <View style={styles.memoSticker} pointerEvents="none" testID={`friend-memo-${rec.tmdbId}`}>
              <Text style={styles.memoText} numberOfLines={1}>{memoText}</Text>
            </View>
          ) : null}
          {/* bottom — year·titleEn / title+badges / reason / otts.
              4차-2 (2026-07-10) 피드백: 필을 타이틀 블록 최상단이 아닌 작품명 헤더
              오른쪽 인라인으로 (포스터 가림 최소화, 사용자 선택 A안). 제목이 길어
              내부 줄바꿈되면 필은 마지막 줄 우측에 하단 정렬로 앉음. */}
          <View
            style={[styles.bottomInfo, { opacity: infoVisible ? 1 : 0 }]}
            pointerEvents="none"
          >
            <Text style={styles.subTitle} numberOfLines={1}>
              {year ? <Text style={styles.subYear}>{year} · </Text> : null}
              {/* Unbounded 에는 한글이 없다 — 한글이 섞인 제목은 SUIT 로 */}
              <Text style={HANGUL.test(titleEn) ? styles.subKo : styles.subEn}>{titleEn}</Text>
            </Text>
            {/* 2026-06-06 B-3 — refresh-race spec testID 정확 매칭 (root 와 동일 tmdbId). */}
            <Text style={styles.title} numberOfLines={2} testID={`swipe-card-title-${rec.tmdbId}`}>
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
});

const styles = StyleSheet.create({
  // 카드 radius 24, 좌우 6 (DESIGN.md Layout — 카드가 화면을 거의 채운다)
  card: {
    position: 'absolute',
    top: 0,
    bottom: 6,
    left: 6,
    right: 6,
    borderRadius: radius.card,
    overflow: 'hidden',
    // backgroundColor 는 inline (useThemeColors) — Animated.View 정적 style 에 동적 색 금지
    ...shadowsNative.lg,
  },
  // 카드 유리 테두리 — 테마 무관(포스터 위). 림 1.5 + 안쪽 잉크 1 = 유리 두께, 위 72 반사광.
  glassRim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: 'rgba(200,255,245,0.32)',
  },
  glassRimInner: {
    ...StyleSheet.absoluteFillObject,
    margin: 1.5,
    borderRadius: radius.card - 1.5,
    borderWidth: 1,
    borderColor: 'rgba(4,20,24,0.35)',
  },
  glassSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 72,
  },
  fallback: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    fontFamily: fontsV2.en,
    color: colors.textMuted,
    fontSize: 48,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    marginBottom: 10,
  },
  // 뱃지 radius 8, 청록 잉크 받침
  ratingPill: {
    height: 24,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: radius.badge,
    backgroundColor: 'rgba(4,20,24,0.55)',
  },
  ratingPillText: {
    color: ON_INK.textPrimary,
    fontSize: 12,
    fontFamily: fontsV2.dataMedium,
  },
  typePill: {
    height: 24,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: radius.badge,
    backgroundColor: 'rgba(4,20,24,0.55)',
  },
  typePillText: {
    color: ON_INK.textSecondary,
    fontSize: 12,
    fontFamily: fontsV2.bodySemi,
  },
  bottomInfo: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: CARD_BOTTOM_OVERLAY + 12,
  },
  subTitle: {
    fontSize: 12,
    color: ON_INK.aqua,
    marginBottom: 6,
  },
  subYear: { fontFamily: fontsV2.data },
  // 영문 원제 Unbounded 700 + 0.02em
  subEn: { fontFamily: fontsV2.en, letterSpacing: 0.24 },
  subKo: { fontFamily: fontsV2.bodySemi, fontSize: 13 },
  // 카드 한글 제목 — SUIT 900, 34 / 1.15 / -0.035em (시그니처)
  title: {
    fontFamily: fontsV2.title,
    fontSize: 34,
    lineHeight: 39,
    letterSpacing: -1.2,
    color: ON_INK.textPrimary,
  },
  reason: {
    fontFamily: fontsV2.body,
    fontSize: 14,
    color: 'rgba(243,250,248,0.86)',
    lineHeight: 20,
    marginBottom: 12,
    maxWidth: '88%',
  },
  ottRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  // 친구 메모 — 카드 우상단(케밥 44 아래), 라임 채움, SUIT 800 12, -6°, radius 12 (DESIGN.md States)
  memoSticker: {
    position: 'absolute',
    top: MEMO_TOP,
    right: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: ON_INK.lime,
    transform: [{ rotate: '-6deg' }],
  },
  memoText: {
    fontFamily: fontsV2.bodyHeavy,
    fontSize: 12,
    color: ON_INK.textInverse,
  },
  // 세로 끌기 스티커 — 카드 위쪽 가운데. 색은 palette.dark 문자열(Animated 정적 style 규칙)
  dragSticker: {
    position: 'absolute',
    top: '30%',
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
  },
  saveSticker: { backgroundColor: ON_INK.lime },
  saveStickerText: { fontFamily: fontsV2.title, fontSize: 24, color: ON_INK.textInverse },
  hideSticker: {
    backgroundColor: 'rgba(7,27,32,0.72)',
    borderWidth: 1.5,
    borderColor: ON_INK.aqua,
  },
  hideStickerText: { fontFamily: fontsV2.title, fontSize: 22, color: ON_INK.textPrimary },
  sinkDim: { ...StyleSheet.absoluteFillObject, backgroundColor: '#041418' },
  ottChip: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
});
