"use client";

import { useState, useEffect } from "react";
import {
  getSaved,
  removeSaved,
  getWatchReport,
  addWatchReport,
  removeWatchReport,
  getWatchStats,
} from "@/lib/store";
import type { SavedItem, WatchReaction } from "@/lib/types";
import BottomNav from "@/components/BottomNav";

const REACTIONS: { key: WatchReaction; label: string; color: string; bg: string }[] = [
  { key: "loved", label: "인생작", color: "var(--accent)", bg: "var(--accent-dim)" },
  { key: "good", label: "재밌었어", color: "var(--text-secondary)", bg: "var(--surface-raised)" },
  { key: "meh", label: "그저 그래", color: "var(--text-muted)", bg: "var(--surface)" },
  { key: "dropped", label: "포기했어", color: "var(--danger)", bg: "var(--danger-dim)" },
];

function ReactionLabel({ reaction }: { reaction: WatchReaction }) {
  const r = REACTIONS.find((x) => x.key === reaction)!;
  return (
    <span
      className="px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: r.color, background: r.bg, borderRadius: "var(--radius-sm)" }}
    >
      {r.label}
    </span>
  );
}

export default function SavedPage() {
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [selected, setSelected] = useState<SavedItem | null>(null);
  const [reportingId, setReportingId] = useState<number | null>(null);
  const [reports, setReports] = useState<Record<number, WatchReaction>>({});
  const [stats, setStats] = useState({ total: 0, loved: 0, good: 0, meh: 0, dropped: 0 });

  const refreshData = () => {
    setSaved(getSaved());
    const allReports: Record<number, WatchReaction> = {};
    for (const s of getSaved()) {
      const r = getWatchReport(s.recommendation.tmdbId);
      if (r) allReports[s.recommendation.tmdbId] = r.reaction;
    }
    setReports(allReports);
    setStats(getWatchStats());
  };

  useEffect(() => { refreshData(); }, []);

  const handleRemove = (tmdbId: number) => {
    removeSaved(tmdbId);
    removeWatchReport(tmdbId);
    if (selected?.recommendation.tmdbId === tmdbId) setSelected(null);
    if (reportingId === tmdbId) setReportingId(null);
    refreshData();
  };

  const handleReport = (tmdbId: number, reaction: WatchReaction) => {
    addWatchReport(tmdbId, reaction);
    setReportingId(null);
    refreshData();
  };

  const handleUndoReport = (tmdbId: number) => {
    removeWatchReport(tmdbId);
    refreshData();
  };

  const handlePickTonight = () => {
    if (saved.length === 0) return;
    // 시청하지 않은 작품 중에서 골라줌
    const unwatched = saved.filter((s) => !reports[s.recommendation.tmdbId]);
    const pool = unwatched.length > 0 ? unwatched : saved;
    setSelected(pool[Math.floor(Math.random() * pool.length)]);
  };

  const watchedCount = Object.keys(reports).length;
  const unwatchedCount = saved.length - watchedCount;

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="px-5 pt-6 pb-2">
        <h1 className="font-display text-2xl font-bold">Saved</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          저장 {saved.length}편{watchedCount > 0 && ` · 시청 ${watchedCount}편`}
        </p>
      </div>

      {/* Watch Stats */}
      {stats.total > 0 && (
        <div className="mx-5 mt-2 mb-3">
          <div
            className="p-3 flex items-center gap-3"
            style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)" }}
          >
            <div className="flex-1">
              <div className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                시청 리포트
              </div>
              <div className="flex gap-3 mt-1.5">
                {stats.loved > 0 && (
                  <span className="text-xs" style={{ color: "var(--accent)" }}>
                    인생작 {stats.loved}
                  </span>
                )}
                {stats.good > 0 && (
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    재밌었어 {stats.good}
                  </span>
                )}
                {stats.meh > 0 && (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    그저 그래 {stats.meh}
                  </span>
                )}
                {stats.dropped > 0 && (
                  <span className="text-xs" style={{ color: "var(--danger)" }}>
                    포기 {stats.dropped}
                  </span>
                )}
              </div>
            </div>
            <div className="font-data text-2xl font-bold" style={{ color: "var(--accent)" }}>
              {stats.total}
            </div>
          </div>
        </div>
      )}

      {/* Tonight banner */}
      {saved.length > 0 && (
        <div className="mx-5 mt-1 mb-4">
          <button
            onClick={handlePickTonight}
            className="w-full p-4 flex items-center justify-between active:scale-[0.98] transition-transform"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}
          >
            <div className="text-left">
              <div className="font-display font-semibold">오늘 뭐 볼까?</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {unwatchedCount > 0
                  ? `안 본 ${unwatchedCount}편 중 하나를 골라드려요`
                  : "저장한 작품 중 하나를 골라드려요"}
              </div>
            </div>
            <div
              className="px-4 py-2 text-sm font-semibold"
              style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: "var(--radius-md)" }}
            >
              고르기
            </div>
          </button>
        </div>
      )}

      {/* Tonight pick */}
      {selected && (
        <div
          className="mx-5 mb-4 p-4 animate-fade-in"
          style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border-light)", borderRadius: "var(--radius-lg)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--accent)" }}>
            오늘의 선택
          </div>
          <div className="flex gap-3">
            {selected.recommendation.posterUrl && (
              <img
                src={selected.recommendation.posterUrl}
                alt={selected.recommendation.title}
                className="w-16 h-24 object-cover flex-shrink-0"
                style={{ borderRadius: "var(--radius-md)" }}
              />
            )}
            <div>
              <div className="font-display font-bold text-lg">{selected.recommendation.title}</div>
              <div className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                {selected.recommendation.reason}
              </div>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {selected.recommendation.providers.slice(0, 2).map((p) => (
                  <span key={p} className="px-2 py-0.5 text-xs" style={{ background: "var(--surface-raised)", borderRadius: "var(--radius-sm)" }}>
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Poster grid */}
      {saved.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2" style={{ color: "var(--text-muted)" }}>
          <span className="text-4xl">♡</span>
          <span>아직 저장한 작품이 없어요</span>
          <span className="text-sm">Discover에서 오른쪽으로 스와이프하세요</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-5 pb-4 flex-1 auto-rows-min">
          {saved.map((item, i) => {
            const tmdbId = item.recommendation.tmdbId;
            const report = reports[tmdbId];
            const isReporting = reportingId === tmdbId;

            return (
              <div
                key={tmdbId}
                className="relative group"
                style={{ height: i % 3 === 0 ? "240px" : "200px" }}
              >
                {/* Poster */}
                {item.recommendation.watchLink ? (
                  <a href={item.recommendation.watchLink} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                    {item.recommendation.posterUrl ? (
                      <img src={item.recommendation.posterUrl} alt={item.recommendation.title} className="w-full h-full object-cover" style={{ borderRadius: "var(--radius-lg)" }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs p-2 text-center" style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", color: "var(--text-muted)" }}>
                        {item.recommendation.title}
                      </div>
                    )}
                  </a>
                ) : (
                  item.recommendation.posterUrl ? (
                    <img src={item.recommendation.posterUrl} alt={item.recommendation.title} className="w-full h-full object-cover" style={{ borderRadius: "var(--radius-lg)" }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs p-2 text-center" style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", color: "var(--text-muted)" }}>
                      {item.recommendation.title}
                    </div>
                  )
                )}

                {/* Watched overlay — 시청 완료 시 반투명 오버레이 */}
                {report && !isReporting && (
                  <div
                    className="absolute inset-0 flex items-end justify-center pointer-events-none"
                    style={{ borderRadius: "var(--radius-lg)" }}
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        background: "var(--bg-overlay-light)",
                        borderRadius: "var(--radius-lg)",
                      }}
                    />
                  </div>
                )}

                {/* Bottom info */}
                <div
                  className="absolute bottom-0 left-0 right-0 p-2 pointer-events-none"
                  style={{ background: "linear-gradient(transparent, var(--bg-overlay-heavy))", borderRadius: "0 0 var(--radius-lg) var(--radius-lg)" }}
                >
                  <div className="text-xs font-medium truncate">{item.recommendation.title}</div>
                  <div className="flex items-center gap-2">
                    <span className="font-data text-[11px]" style={{ color: "var(--text-muted)" }}>⭐ {item.recommendation.rating.toFixed(1)}</span>
                    {report && <ReactionLabel reaction={report} />}
                    {!report && item.recommendation.watchLink && (
                      <span className="text-[11px]" style={{ color: "var(--accent)" }}>지금 보기 →</span>
                    )}
                  </div>
                </div>

                {/* Report button — 시청 리포트 안 한 작품에만 표시 */}
                {!report && !isReporting && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReportingId(tmdbId); }}
                    className="absolute top-1.5 left-1.5 px-2 py-1 text-[11px] font-medium active:scale-90 transition-transform"
                    style={{
                      background: "var(--bg-overlay)",
                      backdropFilter: "blur(4px)",
                      borderRadius: "var(--radius-full)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    봤어요?
                  </button>
                )}

                {/* Report badge — 시청 리포트 완료 시 */}
                {report && !isReporting && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUndoReport(tmdbId); }}
                    className="absolute top-1.5 left-1.5 px-2 py-1 text-[11px] font-medium active:scale-90 transition-transform"
                    style={{
                      background: "var(--bg-overlay)",
                      backdropFilter: "blur(4px)",
                      borderRadius: "var(--radius-full)",
                      color: REACTIONS.find((x) => x.key === report)?.color,
                    }}
                    title="리포트 취소"
                  >
                    ✓ 시청
                  </button>
                )}

                {/* Inline reaction picker */}
                {isReporting && (
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 animate-fade-in z-10"
                    style={{
                      background: "var(--bg-overlay-dense)",
                      backdropFilter: "blur(8px)",
                      borderRadius: "var(--radius-lg)",
                    }}
                  >
                    <div className="text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                      어땠어요?
                    </div>
                    {REACTIONS.map((r) => (
                      <button
                        key={r.key}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleReport(tmdbId, r.key); }}
                        className="w-28 py-2 text-xs font-medium active:scale-95 transition-transform"
                        style={{
                          background: r.bg,
                          color: r.color,
                          borderRadius: "var(--radius-md)",
                        }}
                      >
                        {r.label}
                      </button>
                    ))}
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReportingId(null); }}
                      className="mt-1 text-[11px] py-1 active:scale-95 transition-transform"
                      style={{ color: "var(--text-muted)" }}
                    >
                      닫기
                    </button>
                  </div>
                )}

                {/* Remove button */}
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemove(tmdbId); }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center text-xs sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  style={{ background: "var(--bg-overlay)", borderRadius: "var(--radius-full)" }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      <BottomNav active="saved" />
    </div>
  );
}
