import { View, Text, StyleSheet } from 'react-native';
import type { DistributionRow } from '../lib/profile-stats';
import { colors, spacing, fontsV2 } from '../lib/tokens';

/**
 * DistributionChart — Profile 인사이트의 가로 막대 분포 차트.
 *
 * web `apps/web/src/components/profile/InsightSections.tsx` 의
 * "Library · 작품 비중"(typeDist) / "Channels · 자주 모인 OTT"(ottDist)
 * 두 섹션이 동일 구조라 재사용 컴포넌트로 통합.
 *
 * web 정본 구조: [라벨] [가로 막대 트랙] [우측 값]
 *  - typeDist : 우측 값 = `${value}%`
 *  - ottDist  : 우측 값 = `count` (작품 수)
 *
 * native 기존 월별 차트(`profile.tsx` monthlyBars)와 시각 일관:
 *  - 섹션 헤더 = 10px Geist Mono uppercase + letterSpacing (월별 monthlyHeader 동일)
 *  - borderTop borderSubtle 로 섹션 구분 (monthlySection 동일)
 *  - pure View 막대 (외부 차트 라이브러리 없음)
 *
 * 빈 데이터(rows.length === 0)는 부모가 조건부 렌더 — 컴포넌트는 가정하지 않음.
 */

interface DistributionChartProps {
  /** 섹션 헤더 — 예: "Library · 작품 비중" */
  title: string;
  rows: DistributionRow[];
  /** 우측 값 표기 방식 — 'percent' = `${value}%`, 'count' = count */
  valueMode: 'percent' | 'count';
  /** 라벨 컬럼 너비 — type 은 짧고(48) OTT 는 길다(72) */
  labelWidth: number;
}

export default function DistributionChart({
  title,
  rows,
  valueMode,
  labelWidth,
}: DistributionChartProps) {
  return (
    <View style={[styles.section, styles.distSection]}>
      <Text style={styles.distHeader}>{title}</Text>
      <View style={styles.rows}>
        {rows.map((row) => (
          <View key={row.label} style={styles.row}>
            <Text
              style={[styles.label, { width: labelWidth }]}
              numberOfLines={1}
            >
              {row.label}
            </Text>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {
                    // value 0-100 → 트랙 너비 비율. 최소 2% 로 0편이어도 흔적은 남김.
                    width: `${Math.max(row.value, 2)}%`,
                    backgroundColor: row.color,
                  },
                ]}
              />
            </View>
            <Text style={styles.value}>
              {valueMode === 'percent' ? `${row.value}%` : row.count}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // monthlySection 과 동일 — borderTop 으로 인사이트 섹션 구분.
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  distSection: {
    paddingTop: spacing.lg - spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  // monthlyHeader 와 완전 동일한 시각 — 인사이트 섹션 헤더 통일.
  distHeader: {
    color: colors.textSecondary,
    fontSize: 10,
    fontFamily: fontsV2.data,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: spacing.sm + 4,
  },
  rows: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: 4,
  },
  label: {
    color: colors.textPrimary,
    fontSize: 12,
  },
  // web 의 h-1.5 트랙 (6px) + surface 배경 정합.
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  value: {
    width: 40,
    textAlign: 'right',
    color: colors.textSecondary,
    fontSize: 10,
    fontFamily: fontsV2.data,
  },
});
