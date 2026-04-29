import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Dimensions,
  Linking,
  Share,
} from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import type {
  Recommendation,
  RelatedWork,
  RelatedWorksResponse,
} from '../lib/types';
import { getOTTLink, getOTTIcon } from '@neq/core';
import { fonts } from '@neq/design';
import { colors, radius, spacing } from '../lib/tokens';
import { track } from '../lib/analytics';
import { env } from '../lib/env';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.9;
const CLOSE_THRESHOLD = SHEET_MAX_HEIGHT * 0.3; // 30% 드래그 시 닫기

interface Props {
  rec: Recommendation | null;
  visible: boolean;
  onClose: () => void;
}

function metaInfo(r: Recommendation): string {
  return [
    r.date ? r.date.slice(0, 4) : null,
    r.runtime ? `${r.runtime}분` : null,
    r.seasons ? `시즌 ${r.seasons}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export default function DetailSheet({ rec: initialRec, visible, onClose }: Props) {
  const translateY = useSharedValue(SHEET_MAX_HEIGHT);
  const scrollRef = useRef<ScrollView>(null);

  // 관련 작품 카드 클릭 시 sheet 내부에서 rec 을 교체. F3 spec — 새 sheet 교체 단순화.
  const [relatedRec, setRelatedRec] = useState<Recommendation | null>(null);
  const [hydratingRelated, setHydratingRelated] = useState(false);
  const rec = relatedRec ?? initialRec;

  const [related, setRelated] = useState<RelatedWorksResponse | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 20, stiffness: 160 });
      if (initialRec) {
        track('detail_opened', {
          tmdb_id: initialRec.tmdbId,
          title: initialRec.title,
          providers_count: initialRec.providers.length,
          source: 'native_detail_sheet',
        });
      }
    } else {
      translateY.value = withTiming(SHEET_MAX_HEIGHT, { duration: 280 });
      // sheet 닫힘 → state reset
      setRelatedRec(null);
      setRelated(null);
    }
    // initialRec 의존성은 의도적으로 제외 — visible 토글 시점에만 발사
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, translateY]);

  // 관련 작품 fetch — 화면 rec 변경 시 마다.
  useEffect(() => {
    if (!visible || !rec?.tmdbId) {
      setRelated(null);
      return;
    }
    let cancelled = false;
    setRelatedLoading(true);
    setRelated(null);
    const type = rec.type === 'series' ? 'series' : 'movie';
    fetch(`${env.API_BASE_URL}/api/tmdb/related?work_id=${rec.tmdbId}&type=${type}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: RelatedWorksResponse | null) => {
        if (cancelled) return;
        setRelated(data ?? { collection: null, directorWorks: [], directorName: null });
      })
      .catch(() => {
        if (cancelled) return;
        setRelated({ collection: null, directorWorks: [], directorName: null });
      })
      .finally(() => {
        if (!cancelled) setRelatedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, rec?.tmdbId, rec?.type]);

  const handleRelatedClick = useCallback(
    async (work: RelatedWork, source: 'collection' | 'director') => {
      if (!rec) return;
      track('detail_related_clicked', {
        tmdb_id: rec.tmdbId,
        related_id: work.id,
        source,
        title: work.title,
      });
      setHydratingRelated(true);
      try {
        const t = work.mediaType === 'tv' ? 'series' : 'movie';
        const res = await fetch(
          `${env.API_BASE_URL}/api/tmdb/hydrate?id=${work.id}&type=${t}`,
        );
        if (res.ok) {
          const next: Recommendation = await res.json();
          setRelatedRec(next);
          // 새 작품으로 교체했으니 본문 스크롤 위로
          scrollRef.current?.scrollTo({ y: 0, animated: false });
        }
      } catch {
        // hydrate 실패 — 무시
      } finally {
        setHydratingRelated(false);
      }
    },
    [rec],
  );

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
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

  async function handleShare() {
    if (!rec) return;
    try {
      await Share.share({
        message: `${rec.title} (${rec.titleEn}) — Neko 추천`,
      });
    } catch {
      /* user dismissed */
    }
  }

  async function openProvider(providerName: string, watchLink: string | null) {
    if (!rec) return;
    // 네이티브는 항상 모바일 → 앱 딥링크 우선
    const url =
      getOTTLink(providerName, rec.title, true) ||
      watchLink ||
      `https://www.google.com/search?q=${encodeURIComponent(providerName + ' ' + rec.title)}`;

    // 클릭 이벤트는 실제 deeplink 시도 직전에 발사 (canOpenURL 결과와 무관하게 의도 측정)
    track('ott_link_clicked', {
      tmdb_id: rec.tmdbId,
      title: rec.title,
      provider: providerName,
      url,
      providers_count: rec.providers.length,
      source: 'native_detail_sheet',
    });

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        // 딥링크 미지원 시 google 검색으로 fallback (이미 watchLink가 fallback이지만 한 번 더 안전망)
        const fallback = `https://www.google.com/search?q=${encodeURIComponent(providerName + ' ' + rec.title)}`;
        await Linking.openURL(fallback);
      }
    } catch {
      // openURL 실패 — 무시 (사용자가 명시적으로 닫았거나 OS 거부)
    }
  }

  if (!rec) return null;

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[styles.dim, dimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, sheetStyle]}>
            <View style={styles.handleRow}>
              <View style={styles.handleBar} />
              <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
                <Text style={styles.closeIcon}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              ref={scrollRef}
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.title}>{rec.title}</Text>
              <Text style={styles.subtitle}>
                {rec.titleEn}
                {metaInfo(rec) ? ` · ${metaInfo(rec)}` : ''}
              </Text>

              <View style={styles.ratingRow}>
                <Text style={styles.ratingText}>★ {rec.rating.toFixed(1)}</Text>
              </View>

              {rec.backdrop && (
                <View style={styles.backdropWrap}>
                  <Image
                    source={{ uri: rec.backdrop }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={200}
                  />
                </View>
              )}

              <View style={styles.reasonBox}>
                <Text style={styles.reasonText}>{rec.reason}</Text>
              </View>

              {(rec.director || rec.cast.length > 0) && (
                <View style={styles.peopleRow}>
                  {rec.director && (
                    <Text style={styles.peopleText}>
                      <Text style={styles.peopleLabel}>감독 </Text>
                      {rec.director}
                    </Text>
                  )}
                  {rec.cast.length > 0 && (
                    <Text style={styles.peopleText}>
                      <Text style={styles.peopleLabel}>출연 </Text>
                      {rec.cast.join(', ')}
                    </Text>
                  )}
                </View>
              )}

              {rec.overview ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>줄거리</Text>
                  <Text style={styles.overview}>{rec.overview}</Text>
                </View>
              ) : null}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>시청 가능</Text>
                {rec.providers.length === 0 ? (
                  <Text style={styles.noProviders}>
                    현재 한국 OTT에서 제공 정보를 찾지 못했어요
                  </Text>
                ) : (
                  <View style={styles.providerList}>
                    {rec.providers.map((p) => {
                      const iconUrl = getOTTIcon(p.name) ?? p.logoUrl;
                      return (
                        <Pressable
                          key={p.name}
                          style={styles.providerRow}
                          onPress={() => openProvider(p.name, rec.watchLink)}
                        >
                          <View style={styles.providerIcon}>
                            {iconUrl ? (
                              <Image
                                source={{ uri: iconUrl }}
                                style={StyleSheet.absoluteFill}
                                contentFit="contain"
                              />
                            ) : null}
                          </View>
                          <Text style={styles.providerName}>{p.name}</Text>
                          <Text style={styles.providerOpen}>열기</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* 관련 작품 — F3 spec. collection (시리즈) + director 작품 가로 카로셀 */}
              {related === null && relatedLoading && (
                <View style={styles.relatedSkeletonRow}>
                  {[0, 1, 2, 3].map((i) => (
                    <View key={i} style={styles.relatedSkeletonCard} />
                  ))}
                </View>
              )}

              {related?.collection && related.collection.works.length > 0 && (
                <RelatedRow
                  label={`${related.collection.name} 시리즈`}
                  works={related.collection.works}
                  source="collection"
                  disabled={hydratingRelated}
                  onPressItem={handleRelatedClick}
                />
              )}

              {related && related.directorWorks.length > 0 && (
                <RelatedRow
                  label={
                    related.directorName
                      ? `${related.directorName} 감독의 다른 작품`
                      : '감독의 다른 작품'
                  }
                  works={related.directorWorks}
                  source="director"
                  disabled={hydratingRelated}
                  onPressItem={handleRelatedClick}
                />
              )}

              <Pressable style={styles.shareBtn} onPress={handleShare}>
                <Text style={styles.shareText}>공유하기</Text>
              </Pressable>
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

/**
 * 관련 작품 가로 스크롤 — neko-detail-sheet.jsx SimilarStrip 매핑.
 * 카드 90×132, 간격 10. label 은 amber accent + uppercase tracking.
 */
function RelatedRow({
  label,
  works,
  source,
  disabled,
  onPressItem,
}: {
  label: string;
  works: RelatedWork[];
  source: 'collection' | 'director';
  disabled?: boolean;
  onPressItem: (work: RelatedWork, source: 'collection' | 'director') => void;
}) {
  return (
    <View style={styles.relatedSection}>
      <Text style={styles.relatedSectionTitle}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.relatedRowContent}
      >
        {works.map((w) => (
          <Pressable
            key={w.id}
            disabled={disabled}
            style={({ pressed }) => [
              styles.relatedCard,
              pressed && { opacity: 0.7 },
              disabled && { opacity: 0.5 },
            ]}
            onPress={() => onPressItem(w, source)}
          >
            <View style={styles.relatedPosterWrap}>
              {w.posterUrl ? (
                <Image
                  source={{ uri: w.posterUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <View style={styles.relatedPosterFallback}>
                  <Text style={styles.relatedPosterFallbackText}>◇</Text>
                </View>
              )}
            </View>
            <Text style={styles.relatedTitle} numberOfLines={2}>
              {w.title}
            </Text>
            {w.year ? <Text style={styles.relatedYear}>{w.year}</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  handleBar: {
    position: 'absolute',
    top: spacing.md,
    left: '50%',
    marginLeft: -20,
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  closeIcon: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 24,
    fontFamily: fonts.display,
    paddingRight: 56,
    lineHeight: 30,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  ratingRow: {
    marginTop: spacing.sm,
  },
  ratingText: {
    color: colors.accent,
    fontSize: 14,
    fontFamily: fonts.data,
  },
  backdropWrap: {
    width: '100%',
    height: 160,
    marginTop: spacing.md,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  reasonBox: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.accentDim,
    borderRadius: radius.md,
  },
  reasonText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  peopleRow: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  peopleText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  peopleLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  section: {
    marginTop: spacing.md + 4,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  overview: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  noProviders: {
    color: colors.textMuted,
    fontSize: 14,
    paddingVertical: spacing.sm,
  },
  providerList: {
    gap: spacing.sm,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
  },
  providerIcon: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    flexShrink: 0,
  },
  providerName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  providerOpen: {
    color: colors.accent,
    fontSize: 12,
  },
  shareBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  shareText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '500',
  },
  // 관련 작품 (F3) — neko-detail-sheet.jsx SimilarStrip
  relatedSkeletonRow: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
    marginTop: spacing.md + 4,
  },
  relatedSkeletonCard: {
    width: 90,
    height: 132,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    opacity: 0.5,
  },
  relatedSection: {
    marginTop: spacing.md + 4,
  },
  relatedSectionTitle: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  relatedRowContent: {
    gap: spacing.sm + 2,
    paddingRight: spacing.lg, // 마지막 카드 오른쪽 여백 — 카드 부분 노출 효과
  },
  relatedCard: {
    width: 90,
  },
  relatedPosterWrap: {
    width: 90,
    height: 132,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 6,
  },
  relatedPosterFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  relatedPosterFallbackText: {
    color: colors.textMuted,
    fontSize: 20,
  },
  relatedTitle: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
  },
  relatedYear: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
    fontFamily: fonts.data,
  },
});
