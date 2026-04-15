import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { getSaved, removeSaved } from '../lib/store';
import type { SavedItem } from '../lib/types';
import { colors, radius, spacing } from '../lib/tokens';

const COLS = 2;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_W = (SCREEN_WIDTH - spacing.md * (COLS + 1)) / COLS;

export default function SavedScreen() {
  const [items, setItems] = useState<SavedItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      getSaved().then(setItems);
    }, []),
  );

  async function handleRemove(tmdbId: number) {
    await removeSaved(tmdbId);
    setItems((prev) => prev.filter((s) => s.recommendation.tmdbId !== tmdbId));
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>저장한 작품</Text>
        <Text style={styles.counter}>{items.length}개</Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>아직 저장한 작품이 없어요</Text>
          <Text style={styles.emptyHint}>발견 탭에서 ♡ 좋아요를 눌러보세요</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(s) => String(s.recommendation.tmdbId)}
          numColumns={COLS}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
          columnWrapperStyle={{ gap: spacing.md }}
          renderItem={({ item, index }) => {
            const tall = index % 3 === 0;
            return (
              <Pressable
                style={[styles.card, { width: CARD_W, height: tall ? 240 : 200 }]}
                onLongPress={() => handleRemove(item.recommendation.tmdbId)}
              >
                {item.recommendation.posterUrl ? (
                  <Image
                    source={{ uri: item.recommendation.posterUrl }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <View style={[StyleSheet.absoluteFill, styles.fallback]}>
                    <Text style={styles.fallbackText}>N</Text>
                  </View>
                )}
                <View style={styles.label}>
                  <Text style={styles.labelText} numberOfLines={1}>
                    {item.recommendation.title}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  counter: { color: colors.textMuted, fontSize: 13 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  emptyHint: { color: colors.textMuted, fontSize: 13 },
  card: {
    borderRadius: radius.lg,
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
    fontSize: 40,
    fontWeight: '700',
  },
  label: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    backgroundColor: colors.overlayHeavy,
  },
  labelText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
});
