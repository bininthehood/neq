import { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import type { Recommendation } from '../../lib/types';
import { env } from '../../lib/env';
import { track } from '../../lib/analytics';
import { colors, spacing, radius, fontSizePx } from '../../lib/tokens';
import DetailSheet from '../../components/DetailSheet';
import ApertureBreathLoader from '../../components/feedback/ApertureBreathLoader';

/**
 * Universal Link 진입 화면 — `https://<domain>/share/<id>?type=movie|series` 매칭.
 *
 * PR2 (2026-06-01) 리라이트:
 *  - hero/title/meta/Credits/OTT/CTA 인라인 코드 전부 제거.
 *  - hydrate 후 `<DetailSheet rec mode="share" visible onClose={() => router.replace('/')} />` 단일 마운트.
 *  - DetailSheet 의 'share' mode 가 좌상단 X, sticky bottom CTA (amber 저장 + ghost 추천보기),
 *    Hero 풀폭 + 3-stop gradient + title overlay (Instrument Serif), Cast/related/synopsis 풀스펙 흡수.
 *
 * W7 자격증명 발급 후 (`associatedDomains`, `intentFilters`) UL 활성. 라우트 자체는 사전 등록.
 */
export default function ShareScreen() {
  const params = useLocalSearchParams<{ id: string; type?: string }>();

  const tmdbId = Number(params.id);
  // displayType: UI 노출용 3종 ('variety' 보존). tmdbType: TMDB API 호출용 2종
  // (variety 는 TMDB 에서 TV 로 취급). web `apps/web/src/app/share/[id]/page.tsx` 정합.
  const displayType: 'movie' | 'series' | 'variety' =
    params.type === 'series' || params.type === 'variety' ? params.type : 'movie';
  const type: 'movie' | 'series' = displayType === 'movie' ? 'movie' : 'series';

  const [rec, setRec] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // hydrate — web fetchWork 동등. `/api/tmdb/hydrate` 는 Recommendation 풀 객체를 반환.
  useEffect(() => {
    if (!tmdbId || isNaN(tmdbId)) {
      setError('유효하지 않은 작품이에요');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${env.API_BASE_URL}/api/tmdb/hydrate?id=${tmdbId}&type=${type}`,
        );
        if (!res.ok) {
          if (!cancelled) {
            setError('작품을 찾지 못했어요');
            setLoading(false);
          }
          return;
        }
        const data = (await res.json()) as Recommendation;
        if (cancelled) return;
        setRec(data);
        setLoading(false);
        track('share_viewed', { tmdb_id: data.tmdbId, title: data.title });
      } catch {
        if (!cancelled) {
          setError('네트워크 오류가 발생했어요');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tmdbId, type]);

  const handleClose = useCallback(() => {
    router.replace('/');
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <ApertureBreathLoader size={64} />
      </View>
    );
  }

  if (error || !rec) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.errorText}>{error ?? '작품을 찾지 못했어요'}</Text>
        <Pressable style={styles.errorButton} onPress={handleClose}>
          <Text style={styles.errorButtonText}>추천 보기</Text>
        </Pressable>
      </View>
    );
  }

  // PR2 — DetailSheet 'share' mode 단일 마운트. visible=true 항상 (라우트 자체가 진입).
  // onClose = router.replace('/') 로 Discover 복귀 (기존 handleGoDiscover 동등).
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DetailSheet rec={rec} visible onClose={handleClose} mode="share" />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  errorText: { color: colors.textMuted, fontSize: fontSizePx.base },
  errorButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  errorButtonText: { color: colors.textPrimary, fontWeight: '600' },
});
