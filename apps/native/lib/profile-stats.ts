import type { WatchReport, SavedItem } from './types';
import { colors } from './tokens';

/**
 * Profile 화면 — 실제 데이터 기반 분포 계산 (mock 금지).
 * web `apps/web/src/lib/profile-stats.ts` 와 1:1 정합 (`calcMonthlyWatch`,
 * `calcTypeDistribution`, `calcOTTDistribution`).
 *
 * 순수 함수 — 입력 = reports/saved, 출력 = 월별 buckets 또는 분포 row.
 *
 * 색상 차이: web 은 `DistributionRow.color` 에 CSS 변수 문자열("var(--accent)")
 * 을 담지만, RN 은 CSS 변수를 해석하지 못한다. native 는 `lib/tokens.ts` 의
 * 실제 hex/rgba 값을 담는다 — 분포 의미(영화/시리즈/OTT 순위)는 동일.
 */

export interface DistributionRow {
  label: string;
  value: number; // 0-100
  count: number;
  color: string;
}

/**
 * type (movie/series) 비중 — web `calcTypeDistribution` 정합.
 * web 은 "시리즈" 에 `#9B8AE0` 를 직접 하드코딩 — native 도 동일 hex 사용
 * (tokens 에 해당 보라색 토큰 없음 — web 정본 색을 그대로 따름).
 */
export function calcTypeDistribution(saved: SavedItem[]): DistributionRow[] {
  if (saved.length === 0) return [];
  let movie = 0;
  let series = 0;
  for (const s of saved) {
    if (s.recommendation.type === 'movie') movie += 1;
    else if (s.recommendation.type === 'series') series += 1;
  }
  const total = movie + series;
  if (total === 0) return [];
  return [
    {
      label: '영화',
      value: Math.round((movie / total) * 100),
      count: movie,
      color: colors.accent,
    },
    {
      label: '시리즈',
      value: Math.round((series / total) * 100),
      count: series,
      color: '#9B8AE0',
    },
  ];
}

/**
 * OTT(provider) 분포 — 상위 5개. web `calcOTTDistribution` 정합.
 * web palette = ["var(--accent)", "#9B8AE0", "#E08A6C", "#7BA08A", "#5B9BC4"]
 * → native 는 첫 색만 tokens.accent, 나머지는 web 하드코딩 hex 그대로.
 */
export function calcOTTDistribution(saved: SavedItem[]): DistributionRow[] {
  if (saved.length === 0) return [];
  const counts = new Map<string, number>();
  for (const s of saved) {
    const providers = s.recommendation.providers ?? [];
    if (providers.length === 0) continue;
    // 첫 provider 만 카운트 (web 정본과 일치)
    const name = providers[0].name;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  if (counts.size === 0) return [];
  const max = Math.max(...counts.values());
  const palette = [colors.accent, '#9B8AE0', '#E08A6C', '#7BA08A', '#5B9BC4'];
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count], i) => ({
      label,
      value: Math.round((count / max) * 100),
      count,
      color: palette[i] ?? colors.textMuted,
    }));
}

export interface MonthlyBucket {
  month: string;
  count: number;
  isCurrent: boolean;
}

export interface MonthlyWatchResult {
  buckets: MonthlyBucket[];
  total: number;
}

/** 월별 시청 — 최근 12개월, 시청 리포트 reportedAt 기반. */
export function calcMonthlyWatch(reports: WatchReport[]): MonthlyWatchResult {
  const now = new Date();
  const buckets: MonthlyBucket[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      month: String(d.getMonth() + 1),
      count: 0,
      isCurrent: i === 0,
    });
  }
  for (const r of reports) {
    const reported = new Date(r.reportedAt);
    const monthsAgo =
      (now.getFullYear() - reported.getFullYear()) * 12 +
      (now.getMonth() - reported.getMonth());
    if (monthsAgo >= 0 && monthsAgo <= 11) {
      const idx = 11 - monthsAgo;
      buckets[idx].count += 1;
    }
  }
  return {
    buckets,
    total: buckets.reduce((s, b) => s + b.count, 0),
  };
}
