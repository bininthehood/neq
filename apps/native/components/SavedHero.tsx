/**
 * SavedHero (native) — Preview(Coverflow) 모드.
 *
 * web `apps/web/src/components/saved/SavedHero.tsx` 의 RN 포팅.
 *   - 상단 hero: 포스터 (contentFit="contain", 비율 원본 유지) + 하단 그라디언트 메타
 *     (제목 / reason 2줄 / 평점 · reaction badge · OTT 아이콘 3개).
 *   - hero 탭 → onOpen (DetailSheet 진입).
 *   - 하단 가로 스크롤 carousel: 72×108 포스터, 화면 하단 absolute 고정.
 *     active 카드 amber 보더 + glow.
 *   - carousel 카드 탭 → onSelectPreview (hero 교체).
 *
 * 2026-05-29 — 사용자 요청: PWA 정합 + 모바일 가시성 + 영역 구분.
 *   - hero: marginHorizontal: spacing.lg + borderRadius: lg 복원 (PWA `mx-5 rounded-lg`).
 *     풀블리드 (5/20 변경) 회귀 — 사용자 피드백 "하단 레이아웃과 구분되게".
 *   - 포스터: contentFit "cover" → "contain" 회귀 — 사용자 피드백 "비율 원본 유지".
 *     PWA `object-contain` 정합.
 *   - carousel: 자연 흐름 → position: absolute bottom 으로 화면 하단 고정.
 *     사용자 피드백 "하단 스크롤 영역은 페이지 하단에 고정".
 *   - wrap paddingBottom = CAROUSEL_HEIGHT 로 hero 자연 흐름이 carousel 안 침범.
 *   - 카드 64×96 → 72×108 확대 (모바일 가시성).
 *
 * web 과의 의도적 차이:
 *   - web 의 "봤어요?" reaction 입력 overlay 는 제외 — native saved.tsx 에 reaction
 *     입력 경로(reportingId state + store removeWatchReport)가 아직 없음 (audit 4-A
 *     P2 별도 task). reaction *badge* 표시(읽기 전용)는 유지하여 정합.
 */

// carousel 영역 전체 높이 — 포스터(108) + label margin(4) + label fontSize(11) +
// paddingTop(spacing.md=16) + paddingBottom(spacing.md=16).
// wrap paddingBottom + carousel bottom:0 동기화에 사용.
const CAROUSEL_HEIGHT = 108 + 4 + 11 + 16 + 16;

import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { getOTTIcon } from '@neq/core';
import type { SavedItem, WatchReaction } from '../lib/types';
import { colors, radius, spacing, fontsV2 } from '../lib/tokens';

/** web SavedList REACTIONS 정합 — 라벨/색/배경. */
const REACTIONS: Record<
  WatchReaction,
  { label: string; color: string; bg: string }
> = {
  loved: { label: '인생작', color: colors.textPrimary, bg: colors.accentDim },
  good: { label: '재밌었어', color: colors.textSecondary, bg: colors.surfaceRaised },
  meh: { label: '그저 그래', color: colors.textMuted, bg: colors.surface },
  dropped: { label: '안 맞았어', color: colors.danger, bg: colors.dangerDim },
};

function ReactionBadge({ reaction }: { reaction: WatchReaction }) {
  const r = REACTIONS[reaction];
  return (
    <View style={[styles.reactionBadge, { backgroundColor: r.bg }]}>
      <Text style={[styles.reactionBadgeText, { color: r.color }]}>{r.label}</Text>
    </View>
  );
}

export default function SavedHero({
  items,
  selectedPreviewId,
  reports,
  onSelectPreview,
  onOpen,
}: {
  items: SavedItem[];
  selectedPreviewId: number | null;
  reports: Record<number, WatchReaction>;
  onSelectPreview: (tmdbId: number) => void;
  onOpen: (rec: SavedItem['recommendation']) => void;
}) {
  const heroItem =
    items.find((item) => item.recommendation.tmdbId === selectedPreviewId) ??
    items[0];
  const heroRec = heroItem.recommendation;
  const heroReport = reports[heroRec.tmdbId];

  return (
    <View style={styles.wrap}>
      {/* Hero — 포스터 비율 유지 (contain). flex:1 로 가용 height 가득. */}
      <Pressable
        style={({ pressed }) => [
          styles.hero,
          pressed && { opacity: 0.92 },
        ]}
        onPress={() => onOpen(heroRec)}
        accessibilityRole="button"
        accessibilityLabel={`${heroRec.title} 상세보기`}
      >
        {heroRec.posterUrl ? (
          <Image
            source={{ uri: heroRec.posterUrl }}
            style={StyleSheet.absoluteFill}
            // 2026-05-29 — 사용자 요청: 비율 원본 유지 (PWA object-contain 정합).
            // 5/20 의 cover (영역 가득) → contain 회귀. 좌우 빈 공간 가능하지만 포스터
            // 원본 비율(2:3) 유지로 작품 시각 정합성 우선.
            contentFit="contain"
            transition={0}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.heroFallback]}>
            <Text style={styles.heroFallbackText}>N</Text>
          </View>
        )}
        {/* 하단 그라디언트 메타 — 단색 overlayHeavy 면. */}
        <View style={styles.heroMeta} pointerEvents="none">
          <Text style={styles.heroTitle} numberOfLines={2}>
            {heroRec.title}
          </Text>
          {!!heroRec.reason && (
            <Text style={styles.heroReason} numberOfLines={2}>
              {heroRec.reason}
            </Text>
          )}
          <View style={styles.heroMetaRow}>
            {/* native saved ListCard 와 동일한 `★` 텍스트 — Icons.tsx 에 IconStar
                미정의(SVG 아이콘 정합은 별도 트랙). 화면 내부 일관 우선. */}
            <Text style={styles.heroRatingText}>
              ★ {heroRec.rating.toFixed(1)}
            </Text>
            {heroReport && <ReactionBadge reaction={heroReport} />}
            {heroRec.providers.slice(0, 3).map((p) => {
              const iconUrl = getOTTIcon(p.name) ?? p.logoUrl;
              return iconUrl ? (
                <Image
                  key={p.name}
                  source={{ uri: iconUrl }}
                  style={styles.heroOttIcon}
                  contentFit="contain"
                  transition={0}
                />
              ) : null;
            })}
          </View>
        </View>
      </Pressable>

      {/* 가로 스크롤 carousel — 72×108 포스터. active = amber 보더 + glow.
          2026-05-29 — position: absolute bottom 으로 화면 하단 고정 (사용자 피드백
          "하단 스크롤 영역은 페이지 하단에 고정"). wrap paddingBottom 으로 hero 와
          영역 분리 — overlay 가 아니라 고정 footer 패턴. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.carouselScroll}
        contentContainerStyle={styles.carouselContent}
        accessibilityRole="tablist"
        accessibilityLabel="작품 목록"
      >
        {items.map((item) => {
          const id = item.recommendation.tmdbId;
          const isActive = id === selectedPreviewId;
          return (
            <Pressable
              key={id}
              onPress={() => onSelectPreview(id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${item.recommendation.title}${
                isActive ? ' (현재 미리보기)' : ''
              }`}
              style={({ pressed }) => [
                styles.carouselItem,
                pressed && { transform: [{ scale: 0.95 }] },
              ]}
            >
              <View
                style={[
                  styles.carouselPoster,
                  isActive && styles.carouselPosterActive,
                ]}
              >
                {item.recommendation.posterUrl ? (
                  <Image
                    source={{ uri: item.recommendation.posterUrl }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={0}
                  />
                ) : (
                  <View style={[StyleSheet.absoluteFill, styles.heroFallback]}>
                    <Text style={styles.carouselFallbackText}>N</Text>
                  </View>
                )}
              </View>
              <Text
                style={[
                  styles.carouselLabel,
                  isActive && styles.carouselLabelActive,
                ]}
                numberOfLines={1}
              >
                {item.recommendation.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // 2026-05-29 — carousel(absolute bottom) 컨테이너. paddingBottom 으로 hero(flex:1)
  // 자연 흐름이 carousel 영역 안 침범.
  wrap: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    paddingBottom: CAROUSEL_HEIGHT,
  },
  // 2026-05-29 — PWA 정합 복원: marginHorizontal + borderRadius 로 hero 를 카드처럼
  // 시각 구분. 풀블리드 (5/20) 회귀 — 사용자 피드백 "하단 레이아웃과 구분되게".
  // PWA: `flex-1 mx-5 rounded-lg overflow-hidden`.
  hero: {
    flex: 1,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    minHeight: 0,
    overflow: 'hidden',
  },
  heroFallback: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroFallbackText: {
    color: colors.textMuted,
    fontSize: 56,
    fontFamily: fontsV2.display,
  },
  heroMeta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    backgroundColor: colors.overlayHeavy,
  },
  heroTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontFamily: fontsV2.display,
    marginBottom: 4,
  },
  heroReason: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  heroRatingText: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fontsV2.data,
  },
  heroOttIcon: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
  },
  reactionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  reactionBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  // 2026-05-29 — carousel 컨테이너 (ScrollView 자체) 의 절대 위치 + 배경.
  // 화면 하단 고정 (사용자 피드백). 배경 colors.bg 으로 hero 와 시각 구분.
  carouselScroll: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: CAROUSEL_HEIGHT,
    backgroundColor: colors.bg,
  },
  // contentContainerStyle — 가로 흐름 + 내부 패딩. PWA `flex gap-3 px-5 mt-4 pb-4` 정합.
  carouselContent: {
    flexDirection: 'row',
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  carouselItem: {
    width: 72,
  },
  carouselPoster: {
    width: 72,
    height: 108,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  carouselPosterActive: {
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  carouselFallbackText: {
    color: colors.textMuted,
    fontSize: 24,
    fontFamily: fontsV2.display,
  },
  carouselLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  carouselLabelActive: {
    color: colors.textPrimary,
  },
});
