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
import { IconClose, IconShare } from './Icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
  Easing,
} from 'react-native-reanimated';
import type {
  CastMember,
  Recommendation,
  RelatedWork,
  RelatedWorksResponse,
} from '../lib/types';
import { getOTTLink, getOTTIcon } from '@neq/core';
import { fonts, fontsV2, easings, durations } from '@neq/design';
import { colors, radius, spacing } from '../lib/tokens';
import { track } from '../lib/analytics';
import { env } from '../lib/env';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.9;
const CLOSE_THRESHOLD = SHEET_MAX_HEIGHT * 0.3; // 30% 드래그 시 닫기

/**
 * DetailSheet morph 모션 — Handoff v2 D3 + Phase C 정합.
 * web (`useDetailSheet`: DETAIL_ENTER_MS=450, DETAIL_EXIT_MS=350,
 * cubic-bezier(0.32, 0.72, 0.24, 1)) 와 정확 일치.
 *
 * 채택 결정 (frontend-builder, Phase C-3):
 *   - 옵션 A) spring damping/stiffness 튜닝으로 ~450ms 만들기 → 미세 오버슈트가 남아
 *     web 의 단방향 감속(0.32, 0.72, 0.24, 1)과 다른 인지를 줌. 기각.
 *   - 옵션 B) **Easing.bezier(0.32, 0.72, 0.24, 1) + withTiming(450/350)** → 채택.
 *     이유: 단일 소스(packages/design durations.detailEnter/Exit, easings.detailMorph) +
 *     web 과 인지 100% 정합 + 100ms+ 인지 차이 즉시 해소.
 */
const DETAIL_BEZIER = Easing.bezier(...easings.detailMorph);
const DETAIL_ENTER_MS = durations.detailEnter; // 450
const DETAIL_EXIT_MS = durations.detailExit;   // 350

interface Props {
  rec: Recommendation | null;
  visible: boolean;
  onClose: () => void;
  /**
   * 위임 O #1.2 — Cast 셀 클릭 시 호출. 부모(`apps/native/app/index.tsx`)는
   * 이 콜백을 받아 SearchSheet 를 열고 인물 이름을 자동 검색.
   * (web `apps/web/src/components/discover/DetailSheet.tsx` onSearchPerson prop 동등.)
   * 콜백 미지정 시 Cast 셀은 비클릭 View — 회귀 0.
   */
  onSearchPerson?: (name: string) => void;
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

export default function DetailSheet({
  rec: initialRec,
  visible,
  onClose,
  onSearchPerson,
}: Props) {
  const translateY = useSharedValue(SHEET_MAX_HEIGHT);
  const scrollRef = useRef<ScrollView>(null);
  // 2026-05-29 — 사용자 요청: detail sheet 스크롤 상단일 때만 swipe-down dismiss.
  // 스크롤 중간일 때는 일반 스크롤 유지. scrollY 추적 + pan gesture 조건 분기.
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  // 관련 작품 카드 클릭 시 sheet 내부에서 rec 을 교체. F3 spec — 새 sheet 교체 단순화.
  const [relatedRec, setRelatedRec] = useState<Recommendation | null>(null);
  const [hydratingRelated, setHydratingRelated] = useState(false);
  const rec = relatedRec ?? initialRec;

  // 위임 O #1.3 (위임 P #3 동기화) — Cast 사진 lazy fetch.
  // mirror cache 경로 rec 은 castMembers 가 빈 배열 → 사진 안 보임.
  // sheet 가 visible 이고 rec 의 cast/director 정보가 있는데 *Member 는 비어있으면
  // /api/tmdb/credits 1회 호출해 사진 채움. 이미 *Member 가 있는 hydrate 경로는 fetch X.
  const [lazyDirectorMember, setLazyDirectorMember] = useState<CastMember | null>(null);
  const [lazyCastMembers, setLazyCastMembers] = useState<CastMember[]>([]);

  const [related, setRelated] = useState<RelatedWorksResponse | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);

  // GH-3 #7 — Synopsis 더보기/접기 (web 동기화).
  // 200자 이상이면 numberOfLines=5 로 클램프 + "더보기" 버튼.
  // rec 변경 시 자동 접힘.
  const SYNOPSIS_THRESHOLD = 200;
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  useEffect(() => {
    setSynopsisExpanded(false);
  }, [rec?.tmdbId]);

  useEffect(() => {
    if (visible) {
      // Phase C-3: web (DETAIL_ENTER_MS=450, cubic-bezier(0.32, 0.72, 0.24, 1)) 와 정합.
      translateY.value = withTiming(0, {
        duration: DETAIL_ENTER_MS,
        easing: DETAIL_BEZIER,
      });
      // W5 Task C 7.1 — `detail_opened` 발사는 호출처가 담당.
      // (web 정본 `apps/web/src/components/discover/DetailSheet.tsx` 와 동일하게
      // sheet 컴포넌트 내부에서는 발사하지 않는다. source 분기를 호출처가 정확히
      // 알기 때문 — card_tap / action_bar / saved_tap 등.)
      // 이전 native 구현은 source='native_detail_sheet' 로 중복 발사 → 제거.
    } else {
      // Phase C-3: web (DETAIL_EXIT_MS=350) 와 정합.
      translateY.value = withTiming(SHEET_MAX_HEIGHT, {
        duration: DETAIL_EXIT_MS,
        easing: DETAIL_BEZIER,
      });
      // sheet 닫힘 → state reset
      setRelatedRec(null);
      setRelated(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, translateY]);

  // 위임 O #1.3 — Cast 사진 lazy fetch.
  // sheet 가 visible 이고 rec.castMembers 가 비어있으면 /api/tmdb/credits 1회 호출.
  // hydrate 경로 (관련작/검색) 는 이미 *Member 보유 → 호출 X (무거운 fetch 회피).
  useEffect(() => {
    if (!visible || !rec?.tmdbId) {
      setLazyDirectorMember(null);
      setLazyCastMembers([]);
      return;
    }
    const hasCastMembers = (rec.castMembers?.length ?? 0) > 0;
    const hasDirectorMember = rec.directorMember != null;
    const hasCastNames = rec.cast.length > 0;
    const hasDirectorName = rec.director != null;

    // 이미 *Member 다 있거나, 이름조차 없으면 fetch 불필요.
    if (hasCastMembers && hasDirectorMember) return;
    if (!hasCastNames && !hasDirectorName) return;

    let cancelled = false;
    const controller = new AbortController();
    // 2026-05-20 — variety 는 TMDB 에서 TV(series). movie 외 모두 series 로 매핑.
    const type = rec.type === 'movie' ? 'movie' : 'series';
    fetch(
      `${env.API_BASE_URL}/api/tmdb/credits?id=${rec.tmdbId}&type=${type}`,
      { signal: controller.signal },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (data: { directorMember: CastMember | null; castMembers: CastMember[] } | null) => {
          if (cancelled || !data) return;
          setLazyDirectorMember(data.directorMember);
          setLazyCastMembers(data.castMembers ?? []);
        },
      )
      .catch(() => {
        // abort or network error — 이름 fallback 유지
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [visible, rec?.tmdbId, rec?.type, rec?.castMembers, rec?.directorMember, rec?.director, rec?.cast]);

  // 관련 작품 fetch — 화면 rec 변경 시 마다.
  useEffect(() => {
    if (!visible || !rec?.tmdbId) {
      setRelated(null);
      return;
    }
    let cancelled = false;
    setRelatedLoading(true);
    setRelated(null);
    // 2026-05-20 — variety 는 TMDB 에서 TV(series). movie 외 모두 series 로 매핑.
    const type = rec.type === 'movie' ? 'movie' : 'series';
    fetch(`${env.API_BASE_URL}/api/tmdb/related?work_id=${rec.tmdbId}&type=${type}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: RelatedWorksResponse | null) => {
        if (cancelled) return;
        setRelated(
          data ?? { collection: null, recommendations: [], directorWorks: [], directorName: null },
        );
      })
      .catch(() => {
        if (cancelled) return;
        setRelated({ collection: null, recommendations: [], directorWorks: [], directorName: null });
      })
      .finally(() => {
        if (!cancelled) setRelatedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, rec?.tmdbId, rec?.type]);

  const handleRelatedClick = useCallback(
    async (
      work: RelatedWork,
      source: 'collection' | 'director' | 'recommendations',
    ) => {
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
    // 2026-05-29 v2 — v1 회귀 fix (build 12):
    //   v1: activeOffsetY([8, 9999]) + failOffsetY([-1, 7]) 의 임계가 충돌 —
    //   translation 이 7px 도달 시점에 failOffsetYEnd=7 이 먼저 발동 → pan 이
    //   activate(8px) 도달 전에 fail. 결과: 핸들 드래그 + scroll-top swipe-down
    //   모두 불응답.
    //   v2: activeOffsetY(8) 단일 (downward 8px+ 만 active, upward 는 pan 진입
    //   안 함 → ScrollView 가 자연스럽게 스크롤 처리). failOffsetX 로 수평 carousel
    //   간섭만 차단.
    //   onUpdate / onEnd 안 scrollY > 0 가드 유지 — 스크롤 중간 swipe 차단.
    .activeOffsetY(8)
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      'worklet';
      if (scrollY.value > 0) return;
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      'worklet';
      if (scrollY.value > 0) return;
      if (e.translationY > CLOSE_THRESHOLD || e.velocityY > 1000) {
        // Phase C-3: drag close 도 web exit 정량과 정합.
        translateY.value = withTiming(
          SHEET_MAX_HEIGHT,
          { duration: DETAIL_EXIT_MS, easing: DETAIL_BEZIER },
          () => {
            runOnJS(onClose)();
          },
        );
      } else {
        // 스냅백은 짧게 — drag 도중 손을 뗀 경우라 snappy 한 복귀가 자연스럽음.
        // web 도 동일하게 transition transform (450ms) 로 복귀하지만, 드래그 미달 케이스라
        // 변위가 작아 시간 차이 인지가 작음. 일관 유지 위해 enter 정량 사용.
        translateY.value = withTiming(0, {
          duration: DETAIL_ENTER_MS,
          easing: DETAIL_BEZIER,
        });
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
      <View
        style={StyleSheet.absoluteFill}
        accessibilityViewIsModal
        accessibilityLabel={`${rec.title} 상세 정보`}
      >
        <Animated.View style={[styles.dim, dimStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityLabel="닫기"
            accessibilityRole="button"
          />
        </Animated.View>

        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, sheetStyle]}>
            <View style={styles.handleRow}>
              <View style={styles.handleBar} />
              <Pressable
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={8}
                accessibilityLabel="닫기"
                accessibilityRole="button"
              >
                <IconClose size={20} color={colors.textPrimary} />
              </Pressable>
            </View>

            <Animated.ScrollView
              ref={scrollRef as React.RefObject<Animated.ScrollView>}
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
              // 2026-05-29 — scrollY 추적 → pan gesture 가 scrollY > 0 이면
              // sheet swipe-down 차단 (일반 스크롤 우선).
              onScroll={scrollHandler}
              scrollEventThrottle={16}
            >
              <Text style={styles.title} accessibilityRole="header">
                {rec.title}
              </Text>
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
                    // 2026-05-20 PWA 정합 — Next/Image placeholder=empty (no fade) 기본.
                    transition={0}
                  />
                </View>
              )}

              <View style={styles.reasonBox}>
                <Text style={styles.reasonText}>{rec.reason}</Text>
              </View>

              {/* 위임 O #1.1 / #1.2 — Cast 가로 스크롤 행.
                  director/cast (이름 fallback) → directorMember/castMembers (사진) →
                  lazyDirectorMember/lazyCastMembers (mirror cache 보완) 우선순위로 결합.
                  onSearchPerson 가 있으면 셀이 Pressable, 없으면 비클릭 View. */}
              <CastRow
                director={rec.director}
                cast={rec.cast}
                directorMember={rec.directorMember ?? lazyDirectorMember ?? null}
                castMembers={
                  rec.castMembers && rec.castMembers.length > 0
                    ? rec.castMembers
                    : lazyCastMembers
                }
                onSearchPerson={onSearchPerson}
              />

              {rec.overview ? (() => {
                // GH-3 #7 — 200자 이상이면 numberOfLines=5 로 클램프 + 토글.
                // 2026-05-20 PWA 정합 — ChapterMark "Synopsis · 줄거리" + 본문 탭으로도
                // 토글 (PWA DetailBody.tsx:214 "사용자 요청: 버튼뿐 아니라 synopsis 영역
                // 자체 클릭 시 토글" 정합).
                const isLong = rec.overview.length >= SYNOPSIS_THRESHOLD;
                const collapsed = isLong && !synopsisExpanded;
                const toggle = () => setSynopsisExpanded((v) => !v);
                return (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Synopsis · 줄거리</Text>
                    {isLong ? (
                      <Pressable
                        onPress={toggle}
                        accessibilityRole="button"
                        accessibilityLabel={
                          synopsisExpanded ? '줄거리 접기' : '줄거리 더보기'
                        }
                        accessibilityState={{ expanded: synopsisExpanded }}
                      >
                        <Text
                          style={styles.overview}
                          numberOfLines={collapsed ? 5 : undefined}
                        >
                          {rec.overview}
                        </Text>
                        <View style={styles.synopsisToggle}>
                          <Text style={styles.synopsisToggleText}>
                            {synopsisExpanded ? '접기' : '더보기'}
                          </Text>
                        </View>
                      </Pressable>
                    ) : (
                      <Text style={styles.overview}>{rec.overview}</Text>
                    )}
                  </View>
                );
              })() : null}

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
                  label={related.collection.name}
                  works={related.collection.works}
                  source="collection"
                  disabled={hydratingRelated}
                  onPressItem={handleRelatedClick}
                />
              )}

              {related?.recommendations && related.recommendations.length > 0 && (
                <RelatedRow
                  label="비슷한 작품"
                  works={related.recommendations}
                  source="recommendations"
                  disabled={hydratingRelated}
                  onPressItem={handleRelatedClick}
                />
              )}

              {related?.directorWorks && related.directorWorks.length > 0 && (
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

              <Pressable
                style={styles.shareBtn}
                onPress={handleShare}
                accessibilityRole="button"
                accessibilityLabel={`${rec.title} 공유하기`}
              >
                <IconShare size={16} color={colors.textSecondary} />
                <Text style={styles.shareText}>공유하기</Text>
              </Pressable>
            </Animated.ScrollView>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

/**
 * CastRow — director + cast 가로 스크롤 행. (web `CastRow` 동기화)
 *
 * 위임 O #1.1 #1.2 — native 동등:
 *  - directorMember/castMembers (TMDB profile_path) 있으면 expo-image 64×64 원형.
 *    구버전 rec(이름만) 또는 profileUrl null 인 경우 이니셜 fallback 유지.
 *  - onSearchPerson 콜백 주어지면 Pressable 로 래핑 → 클릭 시 검색 진입.
 *    콜백 미지정 시 비클릭 View 폴백 (회귀 0).
 *  - 길이/순서: director(1) → cast(최대 4) → 항상 5개 이하.
 */
function CastRow({
  director,
  cast,
  directorMember,
  castMembers,
  onSearchPerson,
}: {
  director: string | null;
  cast: string[];
  directorMember: CastMember | null;
  castMembers: CastMember[];
  onSearchPerson?: (name: string) => void;
}) {
  type Item = {
    name: string;
    role: '감독' | '출연';
    profileUrl: string | null;
    keyId: string;
  };
  const items: Item[] = [];

  if (directorMember) {
    items.push({
      name: directorMember.name,
      role: '감독',
      profileUrl: directorMember.profileUrl,
      keyId: `d-${directorMember.tmdbId}`,
    });
  } else if (director) {
    items.push({
      name: director,
      role: '감독',
      profileUrl: null,
      keyId: `d-${director}`,
    });
  }

  if (castMembers && castMembers.length > 0) {
    for (const m of castMembers) {
      items.push({
        name: m.name,
        role: '출연',
        profileUrl: m.profileUrl,
        keyId: `c-${m.tmdbId}`,
      });
    }
  } else {
    for (let i = 0; i < cast.length; i++) {
      items.push({
        name: cast[i],
        role: '출연',
        profileUrl: null,
        keyId: `c-${cast[i]}-${i}`,
      });
    }
  }

  if (items.length === 0) return null;

  return (
    <View style={styles.castSection}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.castRowContent}
      >
        {items.map((p) => (
          <CastItem
            key={p.keyId}
            name={p.name}
            role={p.role}
            profileUrl={p.profileUrl}
            onSearchPerson={onSearchPerson}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function CastItem({
  name,
  role,
  profileUrl,
  onSearchPerson,
}: {
  name: string;
  role: '감독' | '출연';
  profileUrl: string | null;
  onSearchPerson?: (name: string) => void;
}) {
  const Avatar = (
    <View style={styles.castAvatar}>
      {profileUrl ? (
        <Image
          source={{ uri: profileUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          // 2026-05-20 PWA Next/Image 정합 — no fade.
          transition={0}
        />
      ) : (
        <Text style={styles.castAvatarFallback}>{name.charAt(0)}</Text>
      )}
    </View>
  );
  const Label = (
    <>
      <Text style={styles.castName} numberOfLines={2}>
        {name}
      </Text>
      <Text style={styles.castRole}>{role}</Text>
    </>
  );

  if (onSearchPerson) {
    return (
      <Pressable
        onPress={() => {
          track('detail_cast_clicked', { name, role });
          onSearchPerson(name);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${name} ${role} 검색`}
        style={({ pressed }) => [
          styles.castCell,
          pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
        ]}
      >
        {Avatar}
        {Label}
      </Pressable>
    );
  }
  return (
    <View style={styles.castCell}>
      {Avatar}
      {Label}
    </View>
  );
}

/**
 * 작품 제목을 이중 줄로 분할 — web `PosterFallback.splitTitle` 정확 포팅.
 * 4자 이하면 단행, 공백 있으면 어절 절반 분할, 없으면 글자 중간 분할.
 */
function splitTitle(title: string): { line1: string; line2?: string } {
  const trimmed = title.trim();
  if (trimmed.length <= 4) return { line1: trimmed };
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const mid = Math.ceil(parts.length / 2);
    return {
      line1: parts.slice(0, mid).join(' '),
      line2: parts.slice(mid).join(' '),
    };
  }
  const mid = Math.ceil(trimmed.length / 2);
  return { line1: trimmed.slice(0, mid), line2: trimmed.slice(mid) };
}

/**
 * RelatedRow 포스터 폴백 — web `<PosterFallback size="xs" />` 정본 포팅.
 * D-1 (2026-05-19 정합 audit): 단일 `N` 글자 → 작품 제목 typographic fallback.
 * dashed border + surface-sunken 면 + Instrument Serif italic 제목(이중행)
 * + Geist Mono uppercase eyebrow "poster · n/a".
 * web `PosterFallback.tsx` SIZE_MAP.xs: titleSize text-base(16), eyebrow 9px,
 * padding 6, gap 4.
 */
function RelatedPosterFallback({ title }: { title: string }) {
  const { line1, line2 } = splitTitle(title);
  return (
    <View style={styles.relatedPosterFallback}>
      <Text style={styles.relatedFallbackTitle}>
        {line1}
        {line2 ? '\n' + line2 : ''}
      </Text>
      <Text style={styles.relatedFallbackEyebrow}>POSTER · N/A</Text>
    </View>
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
  source: 'collection' | 'director' | 'recommendations';
  disabled?: boolean;
  onPressItem: (
    work: RelatedWork,
    source: 'collection' | 'director' | 'recommendations',
  ) => void;
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
                  // 2026-05-20 PWA Next/Image 정합 — no fade.
                  transition={0}
                />
              ) : (
                <RelatedPosterFallback title={w.title} />
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
  // 2026-05-20 PWA 정합 — PWA DetailSheet handle bar `rounded-full` (= radius:9999).
  // 기존 borderRadius:2 는 약간 깎인 모서리. height 4 의 완전 원형 = radius:2 도 가능하지만
  // Tailwind rounded-full 은 height/2 가 아닌 999 (full pill).
  handleBar: {
    position: 'absolute',
    top: spacing.md,
    left: '50%',
    marginLeft: -20,
    width: 40,
    height: 4,
    borderRadius: 999,
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
    // 2026-05-18 Fix B — fontsV2 적용 (Instrument Serif). web 정합.
    fontFamily: fontsV2.display,
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
  // anti-slop #6 예외 2 + 2026-05-02 amber 누적 분배 정책 — reason 박스는
  // 면(accentDim) 금지 → 선(borderLeft 2px accent). web DESIGN.md L36 정합.
  // V-2 (2026-05-19 정합 audit) — web DetailBody `pl-3 py-1 text-sm` 정확 정합:
  // paddingLeft 16→12, paddingVertical 4 추가, reasonText fontSize 14→13.
  reasonBox: {
    marginTop: spacing.md,
    paddingLeft: 12,
    paddingVertical: 4,
    borderLeftWidth: 2,
    borderLeftColor: colors.accentBorder,
  },
  // D-2 (2026-05-19 정합 audit) — web `text-sm` line-height 1.45 (DESIGN.md L101).
  // 13 × 1.45 ≈ 18.85 → 19. 기존 20 은 약 6% 큼.
  reasonText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  // 위임 O #1.1 — Cast row 가로 스크롤 (web CastRow 시각 정합).
  // 64×64 원형 + 이름(11px line-clamp 2) + 역할(11px muted), 셀 너비 64.
  castSection: {
    marginTop: spacing.md,
    marginRight: -spacing.lg, // 마지막 셀 우측 fade — relatedRowContent 와 동일 패턴
  },
  castRowContent: {
    gap: spacing.sm + 2,
    paddingRight: spacing.lg,
  },
  castCell: {
    width: 64,
    minHeight: 44,
    alignItems: 'center',
  },
  castAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  castAvatarFallback: {
    color: colors.textSecondary,
    fontSize: 22,
    // Italic 변형 (web 정본 OS-mediated italic 과 일치)
    fontFamily: fontsV2.displayItalic,
    lineHeight: 22,
  },
  castName: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
    textAlign: 'center',
    width: '100%',
  },
  castRole: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
    fontFamily: fonts.data,
  },
  section: {
    marginTop: spacing.md + 4,
  },
  // 2026-05-20 PWA 정합 — PWA ChapterMark `font-data text-xs (12px) font-medium uppercase`.
  // 기존 native: fontSize 11, fontWeight 600 → PWA: 12, 500 정합.
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  overview: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  synopsisToggle: {
    marginTop: spacing.xs,
    minHeight: 44,
    paddingVertical: spacing.sm,
    alignSelf: 'flex-start',
  },
  synopsisToggleText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
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
  // B-6 (2026-05-19 정합 audit) — web DetailSheet 공유 버튼 정합:
  // surface-raised bg + 1px border + text-secondary (amber 박탈 — 보조 액션 amber
  // 금지 정책 DESIGN.md L38) + radius-lg + IconShare + py-3 px-4 + text-sm 500.
  shareBtn: {
    marginTop: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  shareText: {
    color: colors.textSecondary,
    fontSize: 13,
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
  // D-1 (2026-05-19 정합 audit) — web `<PosterFallback size="xs" />` 정본 포팅.
  // dashed border + surface-sunken 면 + 작품 제목 typographic fallback.
  // web PosterFallback.tsx SIZE_MAP.xs: padding 6(p-1.5), gap 4(gap-1).
  relatedPosterFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 6,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  // 제목 — Instrument Serif italic, text-base(16), weight 500,
  // letterSpacing -0.02em(≈-0.32), lineHeight 1.05(≈17). web PosterFallback 정합.
  relatedFallbackTitle: {
    fontFamily: fontsV2.displayItalic,
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.32,
    lineHeight: 17,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  // eyebrow — Geist Mono uppercase "POSTER · N/A", 9px, tracking 0.15em(≈1.35).
  // web PosterFallback xs eyebrowSize text-[9px] 정본 그대로 (aria-hidden 장식).
  relatedFallbackEyebrow: {
    fontFamily: fontsV2.data,
    fontSize: 9,
    letterSpacing: 1.35,
    color: colors.textMuted,
    textAlign: 'center',
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
