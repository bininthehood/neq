import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useFocusEffect, router } from 'expo-router';
import Constants from 'expo-constants';
import {
  getSaved,
  getWatchReports,
  getWatchStats,
  getDeviceId,
  clearAllUserData,
} from '../lib/store';
import { wipeCloudData } from '../lib/sync';
import {
  calcMonthlyWatch,
  calcTypeDistribution,
  calcOTTDistribution,
  type MonthlyWatchResult,
} from '../lib/profile-stats';
import type { WatchReport, SavedItem } from '../lib/types';
import { colors, radius, spacing, fontsV2, shadowsNative } from '../lib/tokens';
import { usePersona } from '../contexts/PersonaContext';
import PersonaSection from '../components/PersonaSection';
import SearchSheet from '../components/SearchSheet';
import DistributionChart from '../components/DistributionChart';
import { IconClose, IconSearch } from '../components/Icons';
import { track } from '../lib/analytics';

/**
 * Persona v2 (2026-05-24 design) — LLM 동적 취향 설문 flag.
 * web `apps/web/src/app/profile/page.tsx:28` 정합. EAS Build 시점에 인라인되므로
 * 환경별 동작을 바꾸려면 Vercel/EAS env 양쪽 동기화 필수.
 */
const PERSONA_SURVEY_V2_ENABLED =
  process.env.EXPO_PUBLIC_PERSONA_SURVEY_V2_ENABLED === 'true';

interface Stats {
  total: number;
  loved: number;
  good: number;
  meh: number;
  dropped: number;
}

/**
 * 2026-05-20 PWA 정합 — 월별 시청 막대 진입 애니메이션.
 *
 * PWA `InsightSections.tsx:218` 의 `transition: height 0.5s cubic-bezier(0.16, 1, 0.3, 1)`
 * 정합. native 는 정적 height 였던 결함 → 0 → heightPx 보간으로 부드러운 진입.
 *
 * heightPx 변경 시 (예: 데이터 refresh) 자동 재보간.
 */
const MONTHLY_BAR_EASING = Easing.bezier(0.16, 1, 0.3, 1);

function MonthlyBar({
  heightPx,
  color,
}: {
  heightPx: number;
  color: string;
}) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withTiming(heightPx, {
      duration: 500,
      easing: MONTHLY_BAR_EASING,
    });
  }, [heightPx, h]);
  const animStyle = useAnimatedStyle(() => ({
    height: h.value,
  }));
  return (
    <Animated.View
      style={[styles.monthlyBar, { backgroundColor: color }, animStyle]}
    />
  );
}

export default function ProfileScreen() {
  const persona = usePersona();
  const [tasteItems, setTasteItems] = useState<string[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    loved: 0,
    good: 0,
    meh: 0,
    dropped: 0,
  });
  const [reportsRaw, setReportsRaw] = useState<WatchReport[]>([]);
  // 타입/OTT 분포 차트용 원본 saved 배열 (web `profile/page.tsx:37` savedRaw 정합).
  const [savedRaw, setSavedRaw] = useState<SavedItem[]>([]);
  const [deviceId, setDeviceId] = useState('');
  // 헤더 search 버튼 → SearchSheet 자체 마운트 (web `profile/page.tsx` 정합).
  const [searchOpen, setSearchOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [saved, reports, s, did] = await Promise.all([
      getSaved(),
      getWatchReports(),
      getWatchStats(),
      getDeviceId(),
    ]);

    setSavedCount(saved.length);
    setSavedRaw(saved);
    setStats(s);
    setReportsRaw(reports);
    setDeviceId(did);

    // 좋아한 작품: loved/good reaction + saved에 있는 것
    const lovedGoodIds = new Set(
      reports
        .filter((r) => r.reaction === 'loved' || r.reaction === 'good')
        .sort((a, b) => b.reportedAt - a.reportedAt)
        .map((r) => r.tmdbId),
    );
    const titles = saved
      .filter((s) => lovedGoodIds.has(s.recommendation.tmdbId))
      .map((s) => s.recommendation.title);
    setTasteItems(titles);
  }, []);

  // W5 Task F — 월별 시청 분포 (web `apps/web/src/app/profile/page.tsx:72` 정합).
  // 최근 12개월 buckets — reportedAt 기반. 0 편이면 섹션 숨김.
  const monthly: MonthlyWatchResult = useMemo(
    () => calcMonthlyWatch(reportsRaw),
    [reportsRaw],
  );

  // 타입/OTT 분포 — web `profile/page.tsx:70-71` 정합. saved 기반, 빈 배열이면 섹션 숨김.
  const typeDist = useMemo(() => calcTypeDistribution(savedRaw), [savedRaw]);
  const ottDist = useMemo(() => calcOTTDistribution(savedRaw), [savedRaw]);

  // 2026-05-20 — default persona 의 favorites 자동 표시 fix.
  //
  // 회귀: native 의 default persona 는 onboarding step 에서 saved 만 시드되고
  // persona.favorites 는 빈 배열 유지 (`OnboardingStepFavorites.tsx:28` 주석:
  // "saved 가 favorites 신호"). 그래서 PersonaSection 의 default 페르소나가 항상
  // '아직 5픽이 없어요' 로 표시되는 결함 (사용자 보고: 시청 리포트 5개 작성해도
  // 동일 메시지).
  //
  // 해결: PersonaSection 에 전달 직전 default persona 의 favorites 가 비어 있으면
  // 시청 시그널 (loved/good + saved 교집합) → 그 외 saved 상위 5개 순서로 자동 채움.
  // 사용자가 명시 생성한 다른 persona 는 그대로.
  //
  // 2026-05-28 — 시드 페르소나 제거 후 'default' id 비교 → 첫 페르소나(personas[0])
  // 로 의미 재정의. minimal name-only 플로우로 만든 첫 페르소나도 favorites 비어
  // 있을 수 있으므로 동일 보정 적용.
  const personasForDisplay = useMemo(() => {
    const firstId = persona.personas[0]?.id;
    return persona.personas.map((p) => {
      const isFirst = p.id === firstId;
      if (!isFirst || p.favorites.length > 0) return p;
      if (tasteItems.length > 0) {
        return { ...p, favorites: tasteItems.slice(0, 5) };
      }
      if (savedRaw.length > 0) {
        return {
          ...p,
          favorites: savedRaw.slice(0, 5).map((s) => s.recommendation.title),
        };
      }
      return p;
    });
  }, [persona.personas, tasteItems, savedRaw]);

  // 03_p0-1 fix: persona 객체 통째를 의존성으로 받으면 PersonaContext value
  // (useMemo 없음) 의 매-렌더-새-reference 가 useCallback 을 무한 invalidate →
  // ProfileScreen 무한 re-render → SearchSheet 의 200ms debounce fetch 응답
  // setData 가 stale closure 로 drop. persona.refresh 함수 reference 만 추출.
  const personaRefresh = persona.refresh;
  useFocusEffect(
    useCallback(() => {
      refresh();
      // taste-survey 라우트에서 신규 페르소나 생성 후 router.replace('/profile')
      // 로 복귀할 때 PersonaContext 의 stale state 가 PersonaSection 에 표시되는
      // 회귀 (iOS QA). 명시 refresh 로 AsyncStorage 재read.
      void personaRefresh();
    }, [refresh, personaRefresh]),
  );

  function handleReset() {
    Alert.alert(
      '정말 초기화할까요?',
      `저장한 작품 ${savedCount}편, 시청 기록 ${stats.total}편이 모두 사라져요. 이 동작은 되돌릴 수 없어요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '초기화',
          style: 'destructive',
          onPress: async () => {
            // W5 Task E — local + cloud 동시 정리.
            // local 만 비우면 다음 sync 의 pull 단계에서 서버 데이터가 부활하므로
            // web `apps/web/src/app/profile/page.tsx:89-93` 와 동일하게 wipeCloudData 함께 호출.
            // wipeCloudData 는 silent (실패 시 console.error 만) — 사용자 알림은 local 기준.
            await clearAllUserData();
            void wipeCloudData();
            await refresh();
            // 전역 PersonaContext 도 갱신 — clearAllUserData 가 neq_personas 를
            // 비우지만 Provider state 는 stale 이라, refresh 없이는 Discover 헤더
            // 페르소나 chip 이 삭제된 페르소나 기준으로 계속 노출됨 (WARN-E).
            await persona.refresh();
            // web `profile/page.tsx:98` 정합 — 초기화 후 빈 Profile 에 머물지 않고
            // Discover 로 이동. expo-router 는 `/` 가 Discover 탭(index.tsx).
            // replace — 초기화된 Profile 을 뒤로가기 스택에 남기지 않음.
            router.replace('/');
          },
        },
      ],
    );
  }

  const appVersion = Constants.expoConfig?.version ?? '0.1.0';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 헤더 — 좌:title / 우:search. web profile/page.tsx 헤더 정합 (3탭 공통 search). */}
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <Pressable
          style={styles.searchBtn}
          onPress={() => {
            // web profile/page.tsx:122 정합 — search_opened 이벤트 발사.
            track('search_opened');
            setSearchOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="검색 열기"
          hitSlop={8}
        >
          <IconSearch size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* W5 Task G — 페르소나 (web `profile/page.tsx:135-151` 정합).
            web 의 PersonaSection 과 동등하지만 native 는 metadata-only 모델 +
            minimal create flow (이름만). favorites 픽 풍부한 UX 는 디자인 확정 후. */}
        <PersonaSection
          personas={personasForDisplay}
          activePersonaId={persona.activePersonaId}
          onSwitch={(id) => {
            void persona.switchPersona(id);
            track('persona_switched', { persona_id: id });
            void refresh();
          }}
          onDelete={(id) => {
            void persona.deletePersona(id);
            track('persona_deleted', { persona_id: id });
          }}
          useV2Flow={PERSONA_SURVEY_V2_ENABLED}
          onCreate={(name) => {
            if (PERSONA_SURVEY_V2_ENABLED) {
              // v2 flow: PersonaSurveyController 라우트로 위임 — name 인자는 무시
              // (controller 가 autoName 또는 사용자 입력으로 채움).
              // expo-router typedRoutes 가 dev/CI 환경에서 stale 한 경우가 있어
              // (`.expo/types/router.d.ts` 는 git ignore — expo start 시 재생성)
              // 신규 라우트는 untyped 캐스팅으로 통과. 빌드 시 자동 검증.
              (router.push as (href: string) => void)('/onboarding/taste-survey');
              return;
            }
            void persona.createPersona(name, [], []).then((id) => {
              if (id) {
                void persona.switchPersona(id);
                track('persona_created', { name });
              }
            });
          }}
        />

        {/* 좋아한 작품 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>좋아한 작품</Text>
          {tasteItems.length > 0 ? (
            <View style={styles.chipRow}>
              {tasteItems.slice(0, 10).map((title) => (
                <View key={title} style={styles.chip}>
                  <Text style={styles.chipText}>{title}</Text>
                </View>
              ))}
              {tasteItems.length > 10 && (
                <View style={styles.chipPlus}>
                  <Text style={styles.chipPlusText}>+{tasteItems.length - 10}편</Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.empty}>
              저장한 작품에 시청 리포트를 남기면 취향이 쌓여요
            </Text>
          )}
        </View>

        {/* 시청 기록 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>시청 기록</Text>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{savedCount}</Text>
              <Text style={styles.statLabel}>저장한 작품</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.total}</Text>
              <Text style={styles.statLabel}>시청 리포트</Text>
            </View>
          </View>
          {stats.total > 0 && (
            <View style={styles.reactionRow}>
              {stats.loved > 0 && (
                <Text style={[styles.reactionText, styles.reactionLoved]}>
                  인생작 {stats.loved}
                </Text>
              )}
              {stats.good > 0 && (
                <Text style={[styles.reactionText, styles.reactionGood]}>
                  괜찮았어 {stats.good}
                </Text>
              )}
              {stats.meh > 0 && (
                <Text style={[styles.reactionText, styles.reactionMeh]}>
                  별로였어 {stats.meh}
                </Text>
              )}
              {stats.dropped > 0 && (
                <Text style={[styles.reactionText, styles.reactionDropped]}>
                  포기 {stats.dropped}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* 작품 비중 — type(영화/시리즈) 분포 (web `InsightSections.tsx:99-140` 정합).
            saved 0편이거나 type 집계 0일 때 빈 배열 → 섹션 숨김.
            우측 값 = 퍼센트. 라벨 폭 좁음(48). */}
        {typeDist.length > 0 && (
          <DistributionChart
            title="Library · 작품 비중"
            rows={typeDist}
            valueMode="percent"
            labelWidth={48}
          />
        )}

        {/* OTT 분포 — provider 상위 5 (web `InsightSections.tsx:142-187` 정합).
            providers 있는 saved 0건이면 빈 배열 → 섹션 숨김.
            우측 값 = 작품 수(count). 라벨 폭 넓음(72, OTT 이름 김). */}
        {ottDist.length > 0 && (
          <DistributionChart
            title="Channels · 자주 모인 OTT"
            rows={ottDist}
            valueMode="count"
            labelWidth={72}
          />
        )}

        {/* W5 Task F — 월별 시청 분포 (web `InsightSections.tsx:189-240` 정합).
            최근 12개월 막대 차트. reports.total === 0 일 때 섹션 숨김.
            pure View 기반 — 외부 차트 라이브러리 없음 (디자인 확정 시 교체 가능). */}
        {monthly.total > 0 && (
          <View style={[styles.section, styles.monthlySection]}>
            <Text style={styles.monthlyHeader}>
              {new Date().getFullYear()} · 월간 시청
            </Text>
            <View style={styles.monthlyBars}>
              {monthly.buckets.map((b, i) => {
                const max = Math.max(
                  ...monthly.buckets.map((x) => x.count),
                  1,
                );
                // bar 영역 80 기준 4~80px 범위. minimal 막대 차트.
                const heightPx = Math.max((b.count / max) * 80, 4);
                return (
                  <View key={i} style={styles.monthlyBucket}>
                    <View style={styles.monthlyBarFrame}>
                      <MonthlyBar
                        heightPx={heightPx}
                        color={b.isCurrent ? colors.accent : colors.accentDim}
                      />
                    </View>
                    <Text
                      style={[
                        styles.monthlyMonthLabel,
                        b.isCurrent && styles.monthlyMonthLabelCurrent,
                      ]}
                    >
                      {b.month}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.monthlyFooter}>
              {new Date().getFullYear()}년 · 총{' '}
              <Text style={styles.monthlyFooterAccent}>{monthly.total}편</Text>{' '}
              시청 기록
            </Text>
          </View>
        )}

        {/* 설정 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>설정</Text>
          <Pressable style={styles.resetBtn} onPress={handleReset}>
            <IconClose size={18} color={colors.danger ?? '#d54e4e'} />
            <View style={styles.resetBody}>
              <Text style={styles.resetTitle}>모든 데이터 초기화</Text>
              <Text style={styles.resetSub}>
                저장한 작품, 시청 기록, 취향이 모두 사라져요
              </Text>
            </View>
          </Pressable>
        </View>

        {/* 앱 정보 */}
        <View style={[styles.section, styles.lastSection]}>
          <Text style={styles.sectionTitle}>앱 정보</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>버전</Text>
            <Text style={styles.infoValue}>{appVersion}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>디바이스 ID</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {deviceId.slice(0, 8)}…
            </Text>
          </View>
          {/* TMDB attribution — TMDB 라이선스 의무 (앱 내 표기 필수).
              web profile/page.tsx:198-201 문구 그대로. */}
          <Text style={styles.attribution}>
            This product uses TMDB and the TMDB APIs but is not endorsed,
            certified, or otherwise approved by TMDB.
          </Text>
        </View>
      </ScrollView>

      {/* SearchSheet — Profile 페이지 자체 마운트. 헤더 search 버튼으로 진입.
          2026-05-29 — Profile 은 DetailSheet 자체 마운트하지 않음 (build 10 정합).
          새 마운트 추가 시 SearchSheet 의 fetch 와 race 회귀 (사용자 보고: Profile
          검색 결과 0건). 검색 컨텍스트 유지 fix 는 Discover / Saved 에만 적용. */}
      <SearchSheet
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  // 2026-05-20 — Saved/Discover 헤더와 통일 (사용자 보고: 3탭 헤더 위치 불일치).
  // 기존: paddingTop spacing.lg + paddingBottom spacing.md → ~84px (검색 버튼 44 포함).
  // Saved/Discover 는 height: 48 고정. Profile 도 동일하게 맞춰 3탭 헤더 좌표 일치.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    height: 48,
  },
  // Saved 정합 — fontSize 28 + Instrument Serif + fontWeight 500 + letterSpacing -0.7.
  // lineHeight 36 으로 ascender 클리핑 방지 (Saved 와 동일 fix).
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '500',
    letterSpacing: -0.7,
    lineHeight: 36,
    fontFamily: fontsV2.display,
  },
  searchBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xl },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  lastSection: { marginBottom: spacing['2xl'] },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm + 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  chipPlus: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
  },
  chipPlusText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm + 4,
  },
  // 2026-05-20 PWA 정합 — PWA profile/page.tsx `boxShadow: "var(--shadow-sm)"`.
  // native 는 그림자 없어 평면적 인지. shadowsNative.sm 으로 정합.
  statCard: {
    flex: 1,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    ...shadowsNative.sm,
  },
  statValue: {
    color: colors.accent,
    fontSize: 28,
    // 2026-04-29 fontsV2 — data = Geist Mono. web 통계 숫자 정합.
    fontFamily: fontsV2.data,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm + 4,
  },
  reactionText: {
    fontSize: 12,
  },
  reactionLoved: { color: colors.accent },
  reactionGood: { color: colors.textSecondary },
  reactionMeh: { color: colors.textMuted },
  reactionDropped: { color: colors.danger },
  // W5 Task F — 월별 시청 분포 (minimal 막대 차트).
  // web `InsightSections.tsx` 의 borderTop / accent / accentDim 색상 정합.
  monthlySection: {
    paddingTop: spacing.lg - spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  monthlyHeader: {
    color: colors.textSecondary,
    fontSize: 10,
    fontFamily: fontsV2.data,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: spacing.sm + 4,
  },
  monthlyBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginBottom: spacing.sm,
  },
  monthlyBucket: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.xs,
  },
  // 80px 고정 영역 안에서 bar 가 bottom 정렬되도록 frame 분리.
  monthlyBarFrame: {
    width: '100%',
    height: 80,
    justifyContent: 'flex-end',
  },
  monthlyBar: {
    width: '100%',
    borderRadius: 2,
  },
  monthlyMonthLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: fontsV2.data,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  monthlyMonthLabelCurrent: {
    color: colors.accent,
  },
  monthlyFooter: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  monthlyFooterAccent: {
    color: colors.accent,
    fontWeight: '600',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    backgroundColor: colors.dangerDim,
    borderRadius: radius.md,
  },
  resetIcon: {
    color: colors.danger,
    fontSize: 18,
    width: 18,
    textAlign: 'center',
  },
  resetBody: { flex: 1 },
  resetTitle: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '500',
  },
  resetSub: {
    color: colors.danger,
    opacity: 0.7,
    fontSize: 12,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  infoValue: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  // TMDB attribution — web profile/page.tsx:198 의 mt-4 pt-3 border-t 정합.
  attribution: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: spacing.md,
    paddingTop: spacing.sm + 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
