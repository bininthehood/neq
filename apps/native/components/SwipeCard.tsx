import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import type { Recommendation } from '../lib/types';
import { getOTTIcon, getGenreLabels, friendMemo } from '@neq/core';
import { displayProviders } from '../lib/providers';
import { TAB_BAR_SPACE } from '../lib/tab-bar';
import { fontsV2 } from '@neq/design';
import { colors, palette, radius, shadowsNative, useThemeColors } from '../lib/tokens';

/**
 * 1.1.0 숏폼식 세로 피드 (2026-11-27) — 카드 위치를 UI 스레드에서 계산한다.
 *
 *   translateY = (index − pageSV) × feedH + dragY
 *
 * `index` 는 덱 안의 절대 위치라 React 가 "어느 카드를 마운트할지"(topIdx) 를 늦게 commit 해도
 * 위치가 바뀌지 않는다 → 빠르게 연속으로 넘겨도 카드가 튀지 않음 (영향 분석 §1 pageSV 권고).
 * 깊이 쌓기·좌 퇴장(dismissX)·이전 카드 오버레이(isPrev)·저장 흡수·드래그 스티커는 모두 이 한 식으로 대체됐다.
 *
 * 관심 없음 가라앉기: 가라앉는 카드는 제자리에서 작아지고(0.6) 어두워지며, 그 뒤 카드(index > sinkIdx)는
 * 한 칸 당겨 뒤에 깔린다. 숨김이 commit 되면 덱 인덱스가 하나씩 당겨져 같은 자리 그대로 → 튐 없음.
 */
interface Props {
  rec: Recommendation;
  /** 활성 덱 안 절대 위치 */
  index: number;
  isTop: boolean;
  pageSV: SharedValue<number>;
  feedH: SharedValue<number>;
  dragY: SharedValue<number>;
  /** 좌우(탭 이동) 끌기 예고 — 카드가 조금만 따라온다 */
  dragX: SharedValue<number>;
  immersive?: boolean;
  /** hold(long-press) 활성 펄스 0~1 — top 카드만 최대 4% 눌림 */
  holdSV?: SharedValue<number>;
  sinkCardIdSV: SharedValue<number>;
  sinkIdxSV: SharedValue<number>;
  sinkP: SharedValue<number>;
}

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
  index,
  isTop,
  pageSV,
  feedH,
  dragY,
  dragX,
  immersive = false,
  holdSV,
  sinkCardIdSV,
  sinkIdxSV,
  sinkP,
}: Props) {
  const t = useThemeColors(); // Animated.View 색은 hex 만 (lib/tokens.ts Reanimated 규칙)

  const cardStyle = useAnimatedStyle(() => {
    'worklet';
    // 2026-05-18 — Fabric `folly::ConversionError` SIGABRT 방어: 모든 결과를 finite 로.
    const safe = (n: number, fallback = 0): number => (Number.isFinite(n) ? n : fallback);
    const H = feedH.value > 0 ? feedH.value : 800;
    const isSinking = sinkCardIdSV.value === rec.tmdbId;
    const sinkIdx = sinkIdxSV.value;
    const eff = sinkIdx >= 0 && index > sinkIdx ? index - 1 : index;
    let ty = (eff - pageSV.value) * H + dragY.value;
    let scale = 1;
    let opacity = 1;
    if (isSinking) {
      // 관심 없음 퇴장 — 0.6 까지 작아지며 살짝 가라앉고, 끝 40% 에서 사라진다 (DESIGN.md Motion).
      const p = safe(sinkP.value);
      ty = 40 * p;
      scale = 1 - 0.4 * p;
      opacity = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
    }
    if (isTop && holdSV !== undefined) scale = scale * (1 - 0.04 * safe(holdSV.value));
    return {
      transform: [
        { translateX: safe(dragX.value) },
        { translateY: safe(ty) },
        { scale: safe(scale, 1) },
      ],
      opacity: safe(opacity, 1),
      // 가라앉는 카드가 뒤에서 당겨진 다음 카드 위에 (Fabric zIndex 는 정수)
      zIndex: isSinking ? 20 : 10,
    };
  });

  return (
    <Animated.View
      style={[styles.card, { backgroundColor: t.surface }, cardStyle]}
      // refresh-race-2026-06-06 spec 의 카드 시그니처 정확 매칭용
      testID={`swipe-card-${rec.tmdbId}`}
    >
      <CardInner rec={rec} immersive={immersive} />
      {isTop ? <SinkDim tmdbId={rec.tmdbId} sinkCardIdSV={sinkCardIdSV} sinkP={sinkP} /> : null}
    </Animated.View>
  );
}

/**
 * 더블탭 저장 "찜!" 팝 — 라임 채움, -6°, 0.6→1.1 (DESIGN.md Motion 스티커 규칙, 드래그 스티커 대체).
 * stickerP 0→1→0 를 호출자가 돌린다. reduced-motion 이면 스케일 없이 나타났다 사라짐. VoiceOver 숨김.
 */
export function SaveSticker({ stickerP, reduced }: { stickerP: SharedValue<number>; reduced: boolean }) {
  const style = useAnimatedStyle(() => {
    'worklet';
    const p = Number.isFinite(stickerP.value) ? stickerP.value : 0;
    return {
      opacity: p > 0.02 ? Math.min(1, p * 1.6) : 0,
      transform: [{ rotate: '-6deg' }, { scale: reduced ? 1 : 0.6 + 0.5 * p }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.dragSticker, styles.saveSticker, style]}
    >
      <Text style={styles.saveStickerText}>찜!</Text>
    </Animated.View>
  );
}

/** 가라앉기 어둡게 층. RN 은 흑백 필터가 없어 어둡게만 (계획 5단계). Animated 색은 문자열만. */
function SinkDim({
  tmdbId,
  sinkCardIdSV,
  sinkP,
}: {
  tmdbId: number;
  sinkCardIdSV: SharedValue<number>;
  sinkP: SharedValue<number>;
}) {
  const dimStyle = useAnimatedStyle(() => {
    'worklet';
    const p = sinkCardIdSV.value === tmdbId ? sinkP.value : 0;
    return { opacity: Number.isFinite(p) ? p * 0.7 : 0 };
  });
  return <Animated.View pointerEvents="none" style={[styles.sinkDim, dimStyle]} />;
}

/**
 * 2026-05-20 — PWA `CardVariantA` 정합 풀블리드 카드 내부 컴포넌트.
 * `SwipeCard` 와 `PrevCardOverlay` 양쪽에서 재사용 — 우 스와이프 도착 시점에
 * overlay → 새 top 으로 전환되어도 정보 영역이 100% 동일 → 깜빡임 0.
 */
// memo — 카드 교체 때 창 안의 남은 카드는 rec·immersive 가 그대로라 다시 그리지 않는다.
export const CardInner = memo(function CardInner({
  rec,
  immersive,
}: {
  rec: Recommendation;
  immersive: boolean;
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

      {(
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
  // 더블탭 저장 "찜!" 스티커 — 카드 위쪽 가운데. 색은 palette.dark 문자열(Animated 정적 style 규칙)
  dragSticker: {
    position: 'absolute',
    // 피드 카드(zIndex 10·가라앉는 카드 20) 위
    zIndex: 30,
    top: '30%',
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
  },
  saveSticker: { backgroundColor: ON_INK.lime },
  saveStickerText: { fontFamily: fontsV2.title, fontSize: 24, color: ON_INK.textInverse },
  sinkDim: { ...StyleSheet.absoluteFillObject, backgroundColor: '#041418' },
  ottChip: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
});
