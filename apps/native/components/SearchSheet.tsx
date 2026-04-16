import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  Keyboard,
  Modal,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { searchTMDB, type SearchResult } from '../lib/api';
import { colors, radius, spacing } from '../lib/tokens';
import { fonts } from '@neq/design';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.9;
const CLOSE_THRESHOLD = SHEET_MAX_HEIGHT * 0.3;

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function SearchSheet({ visible, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const translateY = useSharedValue(SHEET_MAX_HEIGHT);

  const runSearch = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await searchTMDB(q, ctrl.signal);
      if (!ctrl.signal.aborted) setResults(data);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(e instanceof Error ? e.message : '검색 오류');
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 350);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 20, stiffness: 160 });
    } else {
      translateY.value = withTiming(SHEET_MAX_HEIGHT, { duration: 280 });
      // 닫을 때 쿼리/결과 리셋
      setQuery('');
      setResults([]);
    }
  }, [visible, translateY]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > CLOSE_THRESHOLD || e.velocityY > 1000) {
        translateY.value = withTiming(SHEET_MAX_HEIGHT, { duration: 220 }, () => {
          runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 180 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const dimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, SHEET_MAX_HEIGHT],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <Modal visible={visible} animationType="none" transparent statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[styles.dim, dimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, sheetStyle]}>
            <View style={styles.handleRow}>
              <View style={styles.handleBar} />
            </View>

            <View style={styles.searchBox}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="영화·시리즈 제목"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                autoCorrect={false}
                autoFocus
                returnKeyType="search"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery('')} hitSlop={10}>
                  <Text style={styles.clear}>✕</Text>
                </Pressable>
              )}
            </View>

            {loading && (
              <View style={styles.centered}>
                <ActivityIndicator color={colors.accent} />
              </View>
            )}
            {error && !loading && (
              <View style={styles.centered}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            {!loading && !error && query.trim() !== '' && results.length === 0 && (
              <View style={styles.centered}>
                <Text style={styles.hint}>결과가 없어요</Text>
              </View>
            )}
            {!loading && query.trim() === '' && (
              <View style={styles.centered}>
                <Text style={styles.hint}>보고 싶은 작품을 검색해보세요</Text>
              </View>
            )}

            <FlatList
              data={results}
              keyExtractor={(r) => `${r.mediaType}-${r.id}`}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <View style={styles.row}>
                  {item.posterUrl ? (
                    <Image
                      source={{ uri: item.posterUrl }}
                      style={styles.poster}
                      contentFit="cover"
                      transition={150}
                    />
                  ) : (
                    <View style={[styles.poster, styles.posterFallback]}>
                      <Text style={styles.posterFallbackText}>N</Text>
                    </View>
                  )}
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {item.mediaType === 'tv' ? '시리즈' : '영화'}
                      {item.year ? ` · ${item.year}` : ''}
                      {item.rating > 0 ? ` · ★ ${item.rating.toFixed(1)}` : ''}
                    </Text>
                  </View>
                </View>
              )}
            />
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlayHeavy,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_MAX_HEIGHT,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    paddingVertical: spacing.sm + 4,
  },
  clear: { color: colors.textMuted, fontSize: 18, paddingHorizontal: 6 },
  centered: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  hint: { color: colors.textMuted, fontSize: 14 },
  errorText: { color: colors.danger, fontSize: 14 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  poster: {
    width: 56,
    height: 84,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  posterFallback: { alignItems: 'center', justifyContent: 'center' },
  posterFallbackText: {
    color: colors.textMuted,
    fontSize: 24,
    fontFamily: fonts.display,
  },
  rowInfo: { flex: 1 },
  rowTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  rowMeta: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
});
