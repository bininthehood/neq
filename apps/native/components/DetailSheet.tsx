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
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconClose, IconShare } from './Icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withTiming,
  cancelAnimation,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import type {
  CastMember,
  Recommendation,
  RelatedWork,
  RelatedWorksResponse,
} from '../lib/types';
import { getOTTLink, getOTTIcon, getPrimaryCountryName } from '@neq/core';
import { fonts, fontsV2, easings, durations } from '@neq/design';
import { colors, radius, spacing } from '../lib/tokens';
import { track } from '../lib/analytics';
import { env } from '../lib/env';
import { addSaved, isSaved } from '../lib/store';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
// PR2 (2026-06-01) — 풀스크린 Modal 전환. swipe-down dismiss 임계는 화면 높이의 30%.
const CLOSE_THRESHOLD = SCREEN_HEIGHT * 0.25;
// Hero 440px (C3 명세 — Share 480 + safe area top 합산 시 본문 노출 영역 확보 위해 살짝 축소).
const HERO_HEIGHT = 440;

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

/**
 * PR2 (2026-06-01) — mode 분기.
 * - 'detail' (default): in-app 진입 (Discover/Saved 카드 탭). 좌상단 X + 우상단 공유.
 *   sticky bottom CTA = ghost 공유 1개 (저장은 외부 ActionBar 가 담당).
 * - 'share': Universal Link 진입 (`/share/[id]`). 좌상단 X 만. sticky bottom CTA =
 *   amber "저장하기" + ghost "추천 더 보기" 2개. Cast 진입(onSearchPerson) 자동 비활성.
 */
type DetailMode = 'detail' | 'share';

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
  /**
   * PR2 — 'detail' (default) | 'share'. Share UL 진입은 'share' 로 마운트.
   */
  mode?: DetailMode;
}

function metaInfo(r: Recommendation): string {
  // PR2 — 국가 포함 (Share 패턴 흡수). getPrimaryCountryName 이 null 이면 join 에서 자동 제외.
  return [
    getPrimaryCountryName(r.country),
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
  mode = 'detail',
}: Props) {
  const insets = useSafeAreaInsets();
  // PR2 — translateY 는 swipe-down dismiss 변위. 평소 0, drag 중 양수.
  // Modal animationType="slide" 가 진입 자체 슬라이드 처리 → 시트 진입 변위는 OS 가 담당.
  const translateY = useSharedValue(0);
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

  // PR2 — share mode 의 sticky CTA 저장 상태. mode='detail' 에서는 미사용.
  const [shareSaved, setShareSaved] = useState(false);
  useEffect(() => {
    if (mode !== 'share' || !visible || !rec?.tmdbId) {
      setShareSaved(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const s = await isSaved(rec.tmdbId);
      if (!cancelled) setShareSaved(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, visible, rec?.tmdbId]);

  useEffect(() => {
    if (visible) {
      // PR2 — 풀스크린 Modal animationType="slide" 가 진입 슬라이드 처리. translateY 는 0 고정 (swipe-down dismiss 변위만).
      translateY.value = 0;
      // W5 Task C 7.1 — `detail_opened` 발사는 호출처가 담당.
    } else {
      // sheet 닫힘 → state reset. translateY 다시 0으로 (다음 진입 대비).
      translateY.value = 0;
      setRelatedRec(null);
      setRelated(null);
    }
    // Reanimated 4 Fabric crash 메모리 정합 — unmount 시 worklet cleanup.
    return () => {
      cancelAnimation(translateY);
    };
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
        // PR2 — 풀스크린 dismiss: 화면 끝까지 슬라이드 후 onClose 호출. Modal animationType="slide"
        // 가 다음 닫힘 슬라이드 처리, translateY 는 다음 진입 위해 0 으로 복귀.
        translateY.value = withTiming(
          SCREEN_HEIGHT,
          { duration: DETAIL_EXIT_MS, easing: DETAIL_BEZIER },
          () => {
            runOnJS(onClose)();
          },
        );
      } else {
        // 스냅백 — 변위가 작아 시간 차이 인지가 작음. 일관 유지 위해 enter 정량 사용.
        translateY.value = withTiming(0, {
          duration: DETAIL_ENTER_MS,
          easing: DETAIL_BEZIER,
        });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
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

  // PR2 — share mode CTA (저장하기). mode='detail' 에서는 미사용.
  const handleShareSave = useCallback(async () => {
    if (!rec || shareSaved) return;
    await addSaved(rec);
    setShareSaved(true);
    track('share_saved', { tmdb_id: rec.tmdbId, title: rec.title });
  }, [rec, shareSaved]);

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
      // PR2 — source 는 mode 기준 분기. share UL 진입 시 native_share.
      source: mode === 'share' ? 'native_share' : 'native_detail_sheet',
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

  const heroSrc = rec.backdrop || rec.posterUrl;
  // titleEn === title 회피 (Share line 190 조건 흡수 — 영문 작품 중복 노출 방지).
  const showTitleEn = !!rec.titleEn && rec.titleEn !== rec.title;
  const typeBadge =
    rec.type === 'series' ? '시리즈' : rec.type === 'variety' ? '예능' : '영화';
  // sticky CTA 높이 추정 (mode='share' 시 2개 풀폭 row, mode='detail' 시 1개 ghost) — 본문 paddingBottom 보정.
  const stickyCtaHeight = mode === 'share' ? 56 + insets.bottom + 24 : 52 + insets.bottom + 24;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={styles.root}
        accessibilityViewIsModal
        accessibilityLabel={`${rec.title} 상세 정보`}
      >
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, sheetStyle]}>
            <Animated.ScrollView
              ref={scrollRef as React.RefObject<Animated.ScrollView>}
              style={styles.body}
              contentContainerStyle={[
                styles.bodyContent,
                { paddingBottom: stickyCtaHeight },
              ]}
              showsVerticalScrollIndicator={false}
              // 2026-05-29 — scrollY 추적 → pan gesture 가 scrollY > 0 이면 swipe-down 차단.
              onScroll={scrollHandler}
              scrollEventThrottle={16}
            >
              {/* PR2 Hero 440px — 풀폭 + 3-stop gradient + title overlay */}
              <View style={styles.hero}>
                {heroSrc ? (
                  <Image
                    source={{ uri: heroSrc }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={0}
                  />
                ) : null}
                <LinearGradient
                  colors={['transparent', 'rgba(18,17,14,0.4)', colors.bg]}
                  locations={[0, 0.5, 1]}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <View style={styles.heroBody}>
                  <View style={styles.heroBadges}>
                    <View style={styles.ratingPill}>
                      <Text style={styles.ratingPillText}>★ {rec.rating.toFixed(1)}</Text>
                    </View>
                    <View style={styles.typePill}>
                      <Text style={styles.typePillText}>{typeBadge}</Text>
                    </View>
                  </View>
                  <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
                    {rec.title}
                  </Text>
                  {showTitleEn ? (
                    <Text style={styles.titleEn} numberOfLines={1}>
                      {rec.titleEn}
                    </Text>
                  ) : null}
                  {!!metaInfo(rec) && <Text style={styles.meta}>{metaInfo(rec)}</Text>}
                </View>
              </View>

              {/* Reason 박스 — borderLeft 2px amber, 면 금지 */}
              {rec.reason ? (
                <View style={styles.reasonBox}>
                  <Text style={styles.reasonText}>{rec.reason}</Text>
                </View>
              ) : null}

              {/* Synopsis — 첫 ChapterMark (amber 단독, anti-slop 1개 규칙) */}
              {rec.overview ? (() => {
                const isLong = rec.overview.length >= SYNOPSIS_THRESHOLD;
                const collapsed = isLong && !synopsisExpanded;
                const toggle = () => setSynopsisExpanded((v) => !v);
                return (
                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, styles.sectionTitleAmber]}>
                      Synopsis · 시놉시스
                    </Text>
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

              {/* Cast — ChapterMark + 가로 스크롤. share mode 에서는 onSearchPerson 비활성. */}
              {(rec.director || rec.cast.length > 0) && (
                <>
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Cast · 캐스트</Text>
                  </View>
                  <CastRow
                    director={rec.director}
                    cast={rec.cast}
                    directorMember={rec.directorMember ?? lazyDirectorMember ?? null}
                    castMembers={
                      rec.castMembers && rec.castMembers.length > 0
                        ? rec.castMembers
                        : lazyCastMembers
                    }
                    onSearchPerson={mode === 'detail' ? onSearchPerson : undefined}
                  />
                </>
              )}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Where to watch · 시청 가능</Text>
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
                          {/* PR2 C5 — "열기" amber → textSecondary (보조 액션 amber 금지) */}
                          <Text style={styles.providerOpen}>열기</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* 관련 작품 — F3 spec */}
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
            </Animated.ScrollView>

            {/* 좌상단 X 버튼 — 풀스크린 1차 dismiss. hero 위 absolute, 44×44 터치 타겟. */}
            <View
              pointerEvents="box-none"
              style={[
                styles.topNav,
                { paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.md },
              ]}
            >
              <Pressable
                style={styles.topNavBtn}
                onPress={onClose}
                hitSlop={12}
                accessibilityLabel="닫기"
                accessibilityRole="button"
              >
                <IconClose size={20} color={colors.textPrimary} />
              </Pressable>
              {mode === 'detail' ? (
                <Pressable
                  style={styles.topNavBtn}
                  onPress={handleShare}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={`${rec.title} 공유하기`}
                >
                  <IconShare size={18} color={colors.textPrimary} />
                </Pressable>
              ) : null}
            </View>

            {/* Sticky bottom CTA — mode 분기 */}
            <View
              pointerEvents="box-none"
              style={[
                styles.stickyCta,
                { paddingBottom: insets.bottom + spacing.md },
              ]}
            >
              {mode === 'share' ? (
                <View style={styles.shareCtaRow}>
                  <Pressable
                    style={[
                      styles.ctaPrimary,
                      shareSaved && styles.ctaPrimaryDisabled,
                    ]}
                    onPress={handleShareSave}
                    disabled={shareSaved}
                    accessibilityRole="button"
                    accessibilityLabel={shareSaved ? '이미 저장됨' : '저장하기'}
                  >
                    <Text
                      style={[
                        styles.ctaPrimaryText,
                        shareSaved && styles.ctaPrimaryDisabledText,
                      ]}
                    >
                      {shareSaved ? '저장됨' : '저장하기'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.ctaGhost}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel="추천 더 보기"
                  >
                    <Text style={styles.ctaGhostText}>추천 더 보기</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={styles.shareBtn}
                  onPress={handleShare}
                  accessibilityRole="button"
                  accessibilityLabel={`${rec.title} 공유하기`}
                >
                  <IconShare size={16} color={colors.textSecondary} />
                  <Text style={styles.shareText}>공유하기</Text>
                </Pressable>
              )}
            </View>
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
  // PR2 — 풀스크린 Modal root. 시트/dim 폐기, Modal animationType="slide" 가 진입 처리.
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  // 좌상단 X (+ 우상단 공유 mode='detail' 시) — hero 위 absolute, scroll 무관.
  topNav: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  topNavBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  bodyContent: {
    // hero 는 풀폭 — paddingHorizontal 은 hero 안에서 직접 처리.
    paddingHorizontal: 0,
  },
  // PR2 Hero 440px — backdrop 풀폭 + 3-stop gradient + title overlay.
  hero: {
    width: '100%',
    height: HERO_HEIGHT,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    position: 'relative',
  },
  heroBody: {
    position: 'absolute',
    left: spacing.lg - 2,  // 22
    right: spacing.lg - 2, // 22
    bottom: spacing.lg,
  },
  heroBadges: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    marginBottom: spacing.sm,
  },
  // C3 — rating pill hero bottom badges row inline.
  ratingPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  ratingPillText: {
    color: colors.accent,
    fontSize: 11,
    fontFamily: fontsV2.data,
    letterSpacing: 0.2,
  },
  typePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  typePillText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontFamily: fontsV2.data,
    letterSpacing: 0.2,
  },
  // C3 — title Instrument Serif 28/32 overlay
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontFamily: fontsV2.display,
    lineHeight: 32,
    letterSpacing: -0.56, // -0.02em on 28
  },
  // C3 — titleEn Fraunces italic 15 별행
  titleEn: {
    color: colors.textMuted,
    fontSize: 15,
    fontFamily: fontsV2.displayItalic,
    fontStyle: 'italic',
    letterSpacing: -0.15,
    marginTop: 4,
  },
  // C3 — meta GeistMono 11 + 국가 포함
  meta: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fontsV2.data,
    letterSpacing: 0.2,
    marginTop: 8,
  },
  // anti-slop #6 예외 2 — reason 박스는 면 금지, 선(borderLeft 2px accent) 만.
  // PR2 — hero 가 풀폭이므로 marginHorizontal 22 로 직접 위치.
  reasonBox: {
    marginTop: spacing.lg,
    marginHorizontal: 22,
    paddingLeft: 12,
    paddingVertical: 4,
    borderLeftWidth: 2,
    borderLeftColor: colors.accentBorder,
  },
  // PR2 — reason text: Fraunces italic 13 (anti-slop #6 예외 2 정합), 13 × 1.45 ≈ 19.
  reasonText: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fontsV2.displayItalic,
    fontStyle: 'italic',
  },
  // 위임 O #1.1 — Cast row 가로 스크롤. PR2 hero 풀폭이라 left 22 으로 직접 indent.
  castSection: {
    marginTop: spacing.md,
    marginLeft: 22,
    marginRight: 0,
  },
  castRowContent: {
    gap: spacing.sm + 2,
    paddingRight: 22,
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
    marginHorizontal: 22,
  },
  // PR2 — ChapterMark: GeistMono 10px uppercase letterSpacing 0.12em (정본 정합).
  // 기본 = textSecondary. Synopsis 한 곳만 amber (sectionTitleAmber merge).
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 10,
    fontFamily: fontsV2.data,
    fontWeight: '500',
    letterSpacing: 1.2, // ≈ 0.12em on 10
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  sectionTitleAmber: {
    color: colors.accent,
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
  // PR2 C5 — "열기" amber 박탈 (DESIGN.md L38 보조 액션 amber 금지). textSecondary 로 위계만 표현.
  providerOpen: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: fontsV2.data,
  },
  // PR2 — sticky bottom CTA 컨테이너. mode='detail' = ghost 공유 1개, mode='share' = amber + ghost 2개.
  stickyCta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 22,
    paddingTop: spacing.sm,
    backgroundColor: colors.bg,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderSubtle,
  },
  // detail mode — ghost 공유 1개 (현행 패턴 유지).
  shareBtn: {
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
  // share mode — amber 저장 (full width) + ghost 추천 더 보기 (full width). 세로 stack (모바일 풀폭).
  shareCtaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ctaPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    minHeight: 48,
  },
  ctaPrimaryDisabled: {
    backgroundColor: colors.surface,
  },
  ctaPrimaryText: {
    color: colors.textInverse,
    fontWeight: '700',
    fontSize: 14,
  },
  ctaPrimaryDisabledText: {
    color: colors.textMuted,
  },
  ctaGhost: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 48,
  },
  ctaGhostText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  // 관련 작품 (F3) — neko-detail-sheet.jsx SimilarStrip
  relatedSkeletonRow: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
    marginTop: spacing.md + 4,
    marginHorizontal: 22,
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
    marginLeft: 22,
  },
  // PR2 — ChapterMark amber 1개 규칙 정합. 관련작 label 은 textSecondary 강등.
  relatedSectionTitle: {
    color: colors.textSecondary,
    fontSize: 10,
    fontFamily: fontsV2.data,
    fontWeight: '500',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  relatedRowContent: {
    gap: spacing.sm + 2,
    paddingRight: 22, // 마지막 카드 우측 여백
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
