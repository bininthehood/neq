import { useEffect } from 'react';
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
import type { Recommendation } from '../lib/types';
import { getOTTLink, getOTTIcon } from '@neq/core';
import { fonts } from '@neq/design';
import { colors, radius, spacing } from '../lib/tokens';

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

export default function DetailSheet({ rec, visible, onClose }: Props) {
  const translateY = useSharedValue(SHEET_MAX_HEIGHT);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 20, stiffness: 160 });
    } else {
      translateY.value = withTiming(SHEET_MAX_HEIGHT, { duration: 280 });
    }
  }, [visible, translateY]);

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

  function openProvider(providerName: string, watchLink: string | null) {
    if (!rec) return;
    // 네이티브는 항상 모바일 → 앱 딥링크 우선
    const url =
      getOTTLink(providerName, rec.title, true) ||
      watchLink ||
      `https://www.google.com/search?q=${encodeURIComponent(providerName + ' ' + rec.title)}`;
    Linking.openURL(url).catch(() => {});
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
});
