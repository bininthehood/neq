import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import {
  getSaved,
  getWatchReports,
  getWatchStats,
  getDeviceId,
  clearAllUserData,
} from '../lib/store';
import { wipeCloudData } from '../lib/sync';
import { calcMonthlyWatch, type MonthlyWatchResult } from '../lib/profile-stats';
import type { WatchReport } from '../lib/types';
import { colors, radius, spacing } from '../lib/tokens';
import { fonts } from '@neq/design';
import { usePersona } from '../contexts/PersonaContext';
import PersonaSection from '../components/PersonaSection';
import { track } from '../lib/analytics';

interface Stats {
  total: number;
  loved: number;
  good: number;
  meh: number;
  dropped: number;
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
  const [deviceId, setDeviceId] = useState('');

  const refresh = useCallback(async () => {
    const [saved, reports, s, did] = await Promise.all([
      getSaved(),
      getWatchReports(),
      getWatchStats(),
      getDeviceId(),
    ]);

    setSavedCount(saved.length);
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

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
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
          },
        },
      ],
    );
  }

  const appVersion = Constants.expoConfig?.version ?? '0.1.0';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
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
          personas={persona.personas}
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
          onCreate={(name) => {
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
                  재밌었어 {stats.good}
                </Text>
              )}
              {stats.meh > 0 && (
                <Text style={[styles.reactionText, styles.reactionMeh]}>
                  그저 그래 {stats.meh}
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
                      <View
                        style={[
                          styles.monthlyBar,
                          {
                            height: heightPx,
                            backgroundColor: b.isCurrent
                              ? colors.accent
                              : colors.accentDim,
                          },
                        ]}
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
            <Text style={styles.resetIcon}>✕</Text>
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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    fontFamily: fonts.display,
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
  statCard: {
    flex: 1,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  statValue: {
    color: colors.accent,
    fontSize: 28,
    fontFamily: fonts.data,
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
    fontFamily: fonts.data,
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
    fontFamily: fonts.data,
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
});
