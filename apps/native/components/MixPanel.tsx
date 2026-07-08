import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import { Image } from 'expo-image';
import type { Recommendation, RelatedWork } from '../lib/types';
import { mixLabelOf, mixCaptionOf } from '../lib/mix-utils';
import ApertureBreathLoader from './feedback/ApertureBreathLoader';
import { colors, spacing, radius } from '../lib/tokens';

/**
 * Seeded Mix MVP (2026-07-08) — Discover stack 영역을 덮는 후보 패널.
 *
 * MIX 탭 → "<작품명> 믹스" 라벨 + related 기반 후보 그리드 (최대 12).
 * 덱 주입 대신 패널 표시가 MVP 범위 — 덱 주입은 load()/prefetch/recHistory
 * 파이프라인과의 충돌 리스크로 후속 과제 (기획 문서 5단계 대안 경로).
 *
 * Quiet Ink — amber 사용 0, overlay/보더 계열만. 후보 탭 → 호출부가 hydrate
 * 후 DetailSheet 진입 (기존 관련작 클릭 경로 재사용).
 */
interface Props {
  seed: Recommendation;
  /** null = 후보 로딩 중 */
  items: RelatedWork[] | null;
  /** 후보 탭 → hydrate 진행 중 (중복 탭 가드는 호출부, 여기선 시각 dim 만) */
  hydrating: boolean;
  onClose: () => void;
  onItemPress: (work: RelatedWork) => void;
}

export default function MixPanel({ seed, items, hydrating, onClose, onItemPress }: Props) {
  return (
    <View style={styles.panel} testID="mix-panel">
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {mixLabelOf(seed.title)}
          </Text>
          <Text style={styles.caption} numberOfLines={1}>
            {mixCaptionOf(seed.title)}
            {items && items.length > 0 ? ` · ${items.length}편` : ''}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="믹스 닫기"
          style={styles.closeBtn}
          testID="mix-close"
        >
          <Text style={styles.closeText}>닫기</Text>
        </Pressable>
      </View>

      {items === null && (
        <View style={styles.centered} accessibilityLiveRegion="polite">
          <ApertureBreathLoader size={56} message="믹스 후보를 고르고 있어요" />
        </View>
      )}

      {items !== null && items.length === 0 && (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>이어볼 후보를 찾지 못했어요</Text>
          <Text style={styles.emptyHint}>다른 작품으로 믹스를 시작해보세요</Text>
        </View>
      )}

      {items !== null && items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={(w) => `${w.mediaType}:${w.id}`}
          numColumns={3}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          style={hydrating ? styles.gridHydrating : undefined}
          renderItem={({ item }) => (
            <Pressable
              style={styles.item}
              onPress={() => onItemPress(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title} 믹스 후보`}
            >
              {item.posterUrl ? (
                <Image source={{ uri: item.posterUrl }} style={styles.poster} contentFit="cover" transition={0} />
              ) : (
                <View style={[styles.poster, styles.posterFallback]}>
                  <Text style={styles.posterFallbackText}>N</Text>
                </View>
              )}
              <Text style={styles.itemTitle} numberOfLines={1}>
                {item.title}
              </Text>
              {!!item.year && <Text style={styles.itemYear}>{item.year}</Text>}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // stackWrap 내부 absolute fill — 카드/제스처 영역을 덮어 믹스 동안 덱 인터랙션 정지.
  panel: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    paddingTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  headerText: { flex: 1, marginRight: spacing.sm },
  title: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  caption: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  // Ghost variant — 배경 투명 + 보더 (DESIGN.md §Buttons, amber 금지).
  closeBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  closeText: { color: colors.textPrimary, fontSize: 12, fontWeight: '500' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '500' },
  emptyHint: { color: colors.textMuted, fontSize: 13 },
  gridContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  gridRow: { gap: spacing.sm },
  gridHydrating: { opacity: 0.6 },
  item: { flex: 1 / 3, marginBottom: spacing.md },
  poster: {
    aspectRatio: 2 / 3,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  posterFallback: { alignItems: 'center', justifyContent: 'center' },
  posterFallbackText: { color: colors.textMuted, fontSize: 24 },
  itemTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 6,
  },
  itemYear: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
});
