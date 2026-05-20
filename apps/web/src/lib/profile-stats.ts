import type { getSaved, getWatchReports } from "@/lib/store";

/**
 * Profile 페이지 D6 — 실제 데이터 기반 분포 계산 (mock 금지).
 * 순수 함수 — 입력 = saved/reports, 출력 = 분포 row 또는 월별 buckets.
 */

export interface DistributionRow {
  label: string;
  value: number; // 0-100
  count: number;
  color: string;
}

/** type (movie/series/variety) 비중 — 2026-05-20 variety 3종 확장 */
export function calcTypeDistribution(
  saved: ReturnType<typeof getSaved>,
): DistributionRow[] {
  if (saved.length === 0) return [];
  let movie = 0;
  let series = 0;
  let variety = 0;
  for (const s of saved) {
    if (s.recommendation.type === "movie") movie += 1;
    else if (s.recommendation.type === "series") series += 1;
    else if (s.recommendation.type === "variety") variety += 1;
  }
  const total = movie + series + variety;
  if (total === 0) return [];
  const rows: DistributionRow[] = [
    {
      label: "영화",
      value: Math.round((movie / total) * 100),
      count: movie,
      color: "var(--cat-movie)",
    },
    {
      label: "시리즈",
      value: Math.round((series / total) * 100),
      count: series,
      color: "var(--cat-series)",
    },
  ];
  if (variety > 0) {
    rows.push({
      label: "예능",
      value: Math.round((variety / total) * 100),
      count: variety,
      color: "var(--cat-variety)",
    });
  }
  return rows;
}

/** OTT(provider) 분포 — 상위 5개 */
export function calcOTTDistribution(
  saved: ReturnType<typeof getSaved>,
): DistributionRow[] {
  if (saved.length === 0) return [];
  const counts = new Map<string, number>();
  for (const s of saved) {
    const providers = s.recommendation.providers ?? [];
    if (providers.length === 0) continue;
    // 첫 provider 만 카운트 (mood 그룹과 일치)
    const name = providers[0].name;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  if (counts.size === 0) return [];
  const max = Math.max(...counts.values());
  const palette = ["var(--accent)", "#9B8AE0", "#E08A6C", "#7BA08A", "#5B9BC4"];
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count], i) => ({
      label,
      value: Math.round((count / max) * 100),
      count,
      color: palette[i] ?? "var(--text-muted)",
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

/** 월별 시청 — 최근 12개월, 시청 리포트 reportedAt 기반 */
export function calcMonthlyWatch(
  reports: ReturnType<typeof getWatchReports>,
): MonthlyWatchResult {
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
