import type { WatchReport } from './types';

/**
 * Profile 화면 D6 — 실제 데이터 기반 분포 계산 (mock 금지).
 * web `apps/web/src/lib/profile-stats.ts` 의 `calcMonthlyWatch` 와 1:1 정합.
 *
 * 순수 함수 — 입력 = reports, 출력 = 월별 buckets (최근 12개월).
 * native 는 saved 의 type/OTT 분포 표기 면적이 좁아 (`calcTypeDistribution`,
 * `calcOTTDistribution`) 포팅하지 않고 월별만 포팅. 필요 시 동일 패턴으로 추가.
 */

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
