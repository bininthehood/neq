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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { searchTMDB, type SearchResult } from '../lib/api';
import { colors, radius, spacing } from '../lib/tokens';
import { fonts } from '@neq/design';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

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

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 350);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>검색</Text>
      </View>

      <View style={styles.searchBox}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="영화·시리즈 제목"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoCorrect={false}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { color: colors.textPrimary, fontSize: 22, fontFamily: fonts.display },
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
  posterFallbackText: { color: colors.textMuted, fontSize: 24, fontWeight: '700' },
  rowInfo: { flex: 1 },
  rowTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  rowMeta: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
});
