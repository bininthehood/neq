"use client";

import type { DistributionRow, MonthlyWatchResult } from "@/lib/profile-stats";

/**
 * InsightSections — Profile 페이지의 데이터 인사이트 4 섹션 묶음.
 *
 * 1) 좋아한 작품 (loved/good 작품 타이틀 chip)
 * 2) 시청 기록 (savedCount + watch stats grid)
 * 3) Library — 작품 비중 (movie/series typeDist)
 * 4) Channels — 자주 모인 OTT (ottDist top 5)
 * 5) 월간 시청 (최근 12개월 bar chart)
 *
 * 모든 데이터는 부모 page 가 useMemo 로 계산해 prop 전달. 빈 데이터는 자동 숨김.
 */

interface WatchStats {
  total: number;
  loved: number;
  good: number;
  meh: number;
  dropped: number;
}

interface InsightSectionsProps {
  tasteItems: string[];
  savedCount: number;
  stats: WatchStats;
  typeDist: DistributionRow[];
  ottDist: DistributionRow[];
  monthly: MonthlyWatchResult;
}

export default function InsightSections({
  tasteItems,
  savedCount,
  stats,
  typeDist,
  ottDist,
  monthly,
}: InsightSectionsProps) {
  return (
    <>
      {/* 좋아한 작품 (loved/good 타이틀 chip) */}
      <section className="px-5 mb-6">
        <h2 className="text-xs uppercase tracking-wider text-muted font-semibold mb-2">좋아한 작품</h2>
        {tasteItems.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {tasteItems.slice(0, 10).map((title) => (
              <span
                key={title}
                className="px-3 py-1.5 text-xs bg-surface rounded-lg text-secondary"
              >
                {title}
              </span>
            ))}
            {tasteItems.length > 10 && (
              <span className="px-3 py-1.5 text-xs text-muted">
                +{tasteItems.length - 10}편
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">
            저장한 작품에 시청 리포트를 남기면 취향이 쌓여요
          </p>
        )}
      </section>

      {/* 시청 기록 — savedCount + reaction breakdown */}
      <section className="px-5 mb-6">
        <h2 className="text-xs uppercase tracking-wider text-muted font-semibold mb-3">시청 기록</h2>
        <div className="grid grid-cols-2 gap-3">
          <div
            className="p-4 bg-surface rounded-lg"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <div className="font-data text-2xl font-bold text-accent">{savedCount}</div>
            <div className="text-xs text-muted mt-1">저장한 작품</div>
          </div>
          <div
            className="p-4 bg-surface rounded-lg"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <div className="font-data text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted mt-1">시청 리포트</div>
          </div>
        </div>
        {stats.total > 0 && (
          <div className="flex gap-4 mt-3 text-xs">
            {stats.loved > 0 && <span className="text-secondary">인생작 {stats.loved}</span>}
            {stats.good > 0 && <span className="text-secondary">재밌었어 {stats.good}</span>}
            {stats.meh > 0 && <span className="text-muted">그저 그래 {stats.meh}</span>}
            {stats.dropped > 0 && <span className="text-danger">포기 {stats.dropped}</span>}
          </div>
        )}
      </section>

      {/* D6 — 작품 비중 (실제 saved 데이터 기반) */}
      {typeDist.length > 0 && (
        <section
          className="px-5 mb-6 pt-5"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <div
            className="font-data text-[10px] font-medium uppercase mb-3"
            style={{ color: "var(--text-secondary)", letterSpacing: "0.12em" }}
          >
            Library · 작품 비중
          </div>
          <div className="space-y-1">
            {typeDist.map((row) => (
              <div key={row.label} className="flex items-center gap-2.5 py-1">
                <div className="w-12 text-xs" style={{ color: "var(--text-primary)" }}>
                  {row.label}
                </div>
                <div
                  className="flex-1 h-1.5 overflow-hidden rounded-sm"
                  style={{ background: "var(--surface)" }}
                >
                  <div
                    className="h-full rounded-sm transition-[width] duration-500"
                    style={{
                      width: `${row.value}%`,
                      background: row.color,
                      transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
                    }}
                  />
                </div>
                <div
                  className="w-10 text-right font-data text-[10px]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {row.value}%
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* D6 — OTT 분포 (상위 5) */}
      {ottDist.length > 0 && (
        <section
          className="px-5 mb-6 pt-5"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <div
            className="font-data text-[10px] font-medium uppercase mb-3"
            style={{ color: "var(--text-secondary)", letterSpacing: "0.12em" }}
          >
            Channels · 자주 모인 OTT
          </div>
          <div className="space-y-1">
            {ottDist.map((row) => (
              <div key={row.label} className="flex items-center gap-2.5 py-1">
                <div
                  className="w-16 text-xs truncate"
                  style={{ color: "var(--text-primary)" }}
                  title={row.label}
                >
                  {row.label}
                </div>
                <div
                  className="flex-1 h-1.5 overflow-hidden rounded-sm"
                  style={{ background: "var(--surface)" }}
                >
                  <div
                    className="h-full rounded-sm transition-[width] duration-500"
                    style={{
                      width: `${row.value}%`,
                      background: row.color,
                      transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
                    }}
                  />
                </div>
                <div
                  className="w-8 text-right font-data text-[10px]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {row.count}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* D6 — 월별 시청 (실제 reportedAt 기반, 최근 12개월) */}
      {monthly.total > 0 && (
        <section
          className="px-5 mb-6 pt-5"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <div
            className="font-data text-[10px] font-medium uppercase mb-3"
            style={{ color: "var(--text-secondary)", letterSpacing: "0.12em" }}
          >
            {new Date().getFullYear()} · 월간 시청
          </div>
          <div className="flex items-end gap-1.5 h-20 mb-2">
            {monthly.buckets.map((b, i) => {
              const max = Math.max(...monthly.buckets.map((x) => x.count), 1);
              const h = (b.count / max) * 100;
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center gap-1"
                  title={`${b.month}월 · ${b.count}편`}
                >
                  <div
                    className="w-full rounded-sm"
                    style={{
                      height: `${Math.max(h, 4)}%`,
                      background: b.isCurrent
                        ? "var(--accent)"
                        : "var(--accent-dim)",
                      transition: "height 0.5s cubic-bezier(0.16,1,0.3,1)",
                    }}
                  />
                  <div
                    className="font-data text-[10px] uppercase"
                    style={{
                      color: b.isCurrent ? "var(--accent)" : "var(--text-muted)",
                      letterSpacing: "0.12em",
                    }}
                  >
                    {b.month}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted leading-relaxed">
            {new Date().getFullYear()}년 · 총{" "}
            <span className="text-accent font-semibold">{monthly.total}편</span>{" "}
            시청 기록
          </p>
        </section>
      )}
    </>
  );
}
