/**
 * SavedHero (native) — Preview(Coverflow) 모드.
 *
 * web `apps/web/src/components/saved/SavedHero.tsx` 의 RN 포팅.
 *   - 상단 hero: 큰 포스터 (contentFit="contain", 비율 유지) + 하단 그라디언트 메타
 *     (제목 / reason 2줄 / 평점 · reaction badge · OTT 아이콘 3개).
 *   - hero 탭 → onOpen (DetailSheet 진입).
 *   - 하단 가로 스크롤 carousel: 64×96 포스터. active 카드 amber 보더 + glow.
 *   - carousel 카드 탭 → onSelectPreview (hero 교체).
 *
 * web 과의 의도적 차이:
 *   - web 의 "봤어요?" reaction 입력 overlay 는 제외 — native saved.tsx 에 reaction
 *     입력 경로(reportingId state + store removeWatchReport)가 아직 없음 (audit 4-A
 *     P2 별도 task). reaction *badge* 표시(읽기 전용)는 유지하여 정합.
 */

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
            contentFit="contain"
            transition={200}
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

      {/* 가로 스크롤 carousel — 64×96 포스터. active = amber 보더 + glow. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carousel}
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
                    transition={150}
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
  wrap: { flex: 1, minHeight: 0 },
  hero: {
    flex: 1,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    minHeight: 0,
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
  carousel: {
    flexDirection: 'row',
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  carouselItem: {
    width: 64,
  },
  carouselPoster: {
    width: 64,
    height: 96,
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
