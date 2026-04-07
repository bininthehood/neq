"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
import { IconStar, IconClose, IconCheck, IconHeart } from "@/components/Icons";
import { getOTTLink, getOTTIcon } from "@/lib/ott-links";

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
  const [detailItem, setDetailItem] = useState<SavedItem | null>(null);
  const [detailY, setDetailY] = useState(100);
  const [detailAnimating, setDetailAnimating] = useState(false);
  const detailStartY = useRef(0);
  const detailDragging = useRef(false);
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

  const snapDetail = useCallback((target: number) => {
    setDetailAnimating(true);
    setDetailY(target);
    setTimeout(() => {
      setDetailAnimating(false);
      if (target === 100) setDetailItem(null);
    }, 300);
  }, []);

  const openDetailFor = useCallback((item: SavedItem) => {
    setDetailItem(item);
    setDetailY(100);
    requestAnimationFrame(() => snapDetail(0));
  }, [snapDetail]);

  const closeDetail = useCallback(() => {
    snapDetail(100);
  }, [snapDetail]);

  const onDetailTouchStart = useCallback((e: React.TouchEvent) => {
    detailStartY.current = e.touches[0].clientY;
    detailDragging.current = true;
  }, []);

  const onDetailTouchMove = useCallback((e: React.TouchEvent) => {
    if (!detailDragging.current) return;
    const dy = e.touches[0].clientY - detailStartY.current;
    if (dy > 0) {
      e.preventDefault();
      setDetailY(Math.min(100, (dy / window.innerHeight) * 120));
    }
  }, []);

  const onDetailTouchEnd = useCallback(() => {
    detailDragging.current = false;
    if (detailY > 30) snapDetail(100);
    else snapDetail(0);
  }, [detailY, snapDetail]);

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
          className="mx-5 mb-4 p-4 animate-fade-in cursor-pointer active:scale-[0.98] transition-transform"
          style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border-light)", borderRadius: "var(--radius-lg)" }}
          onClick={() => { if (selected) openDetailFor(selected); }}
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
              <div className="flex gap-1 mt-2">
                {selected.recommendation.providers.slice(0, 3).map((p) => (
                  <img key={p.name} src={getOTTIcon(p.name) ?? p.logoUrl ?? ""} alt={p.name} className="w-6 h-6 object-contain" style={{ borderRadius: "var(--radius-sm)", background: "var(--surface)" }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Poster grid */}
      {saved.length === 0 ? (
        <div className="flex-1 flex flex-col justify-center px-8" style={{ color: "var(--text-muted)" }}>
          <IconHeart size={32} />
          <p className="mt-4 font-display text-lg font-semibold" style={{ color: "var(--text-primary)" }}>아직 저장한 작품이 없어요</p>
          <p className="text-sm mt-1.5">Discover에서 오른쪽으로 스와이프하면 여기에 모여요</p>
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
                className="relative group cursor-pointer"
                style={{ height: i % 3 === 0 ? "240px" : "200px" }}
                onClick={() => openDetailFor(item)}
              >
                {/* Poster */}
                {item.recommendation.posterUrl ? (
                  <img src={item.recommendation.posterUrl} alt={item.recommendation.title} className="w-full h-full object-cover" style={{ borderRadius: "var(--radius-lg)" }} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs p-2 text-center" style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", color: "var(--text-muted)" }}>
                    {item.recommendation.title}
                  </div>
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
                    <span className="font-data text-[11px] flex items-center gap-0.5" style={{ color: "var(--text-muted)" }}><IconStar size={10} />{item.recommendation.rating.toFixed(1)}</span>
                    {report && <ReactionLabel reaction={report} />}
                    {!report && item.recommendation.providers.slice(0, 2).map((p) => (
                      <img key={p.name} src={getOTTIcon(p.name) ?? p.logoUrl ?? ""} alt={p.name} className="w-4 h-4 object-contain" style={{ borderRadius: "var(--radius-sm)" }} />
                    ))}
                  </div>
                </div>

                {/* Report button — 시청 리포트 안 한 작품에만 표시 */}
                {!report && !isReporting && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReportingId(tmdbId); }}
                    className="absolute top-1.5 left-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center px-2 text-[11px] font-medium active:scale-90 transition-transform"
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
                    className="absolute top-1.5 left-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center px-2 text-[11px] font-medium active:scale-90 transition-transform"
                    style={{
                      background: "var(--bg-overlay)",
                      backdropFilter: "blur(4px)",
                      borderRadius: "var(--radius-full)",
                      color: REACTIONS.find((x) => x.key === report)?.color,
                    }}
                    title="리포트 취소"
                  >
                    <IconCheck size={11} /> 시청
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
                      className="mt-1 text-[11px] min-h-[44px] px-4 flex items-center active:scale-95 transition-transform"
                      style={{ color: "var(--text-muted)" }}
                    >
                      닫기
                    </button>
                  </div>
                )}

                {/* Remove button */}
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemove(tmdbId); }}
                  className="absolute top-1.5 right-1.5 w-8 h-8 flex items-center justify-center text-xs sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  style={{ background: "var(--bg-overlay)", borderRadius: "var(--radius-full)" }}
                >
                  <IconClose size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail bottom sheet — 제스처 기반 */}
      {detailItem && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          onClick={closeDetail}
        >
          <div className="absolute inset-0" style={{ background: "var(--bg-overlay-heavy)", opacity: 1 - detailY / 100, transition: detailAnimating ? "opacity 0.3s ease-out" : "none" }} />
          <div
            className="relative w-full max-w-[480px] max-h-[85dvh] overflow-y-auto p-5 pb-8"
            style={{
              background: "var(--bg)",
              borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
              transform: `translateY(${detailY}%)`,
              transition: detailAnimating ? "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
              touchAction: "pan-y",
            }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={onDetailTouchStart}
            onTouchMove={onDetailTouchMove}
            onTouchEnd={onDetailTouchEnd}
          >
            {/* Handle bar */}
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1" style={{ background: "var(--border)", borderRadius: "var(--radius-full)" }} />
            </div>

            <button
              className="absolute top-4 right-4 w-11 h-11 flex items-center justify-center"
              style={{ background: "var(--surface)", borderRadius: "var(--radius-full)" }}
              onClick={closeDetail}
            >
              <IconClose size={16} color="var(--text-secondary)" />
            </button>

            {/* 스틸컷 */}
            {detailItem.recommendation.backdrop && (
              <img src={detailItem.recommendation.backdrop} alt="" className="w-full h-40 object-cover mb-4 -mt-1" style={{ borderRadius: "var(--radius-md)" }} />
            )}

            {/* Poster + Title */}
            <div className="flex gap-4">
              {detailItem.recommendation.posterUrl && (
                <img
                  src={detailItem.recommendation.posterUrl}
                  alt={detailItem.recommendation.title}
                  className="w-24 h-36 object-cover flex-shrink-0"
                  style={{ borderRadius: "var(--radius-md)" }}
                />
              )}
              <div className="flex-1 min-w-0 pt-1">
                <h2 className="font-display text-xl font-bold">{detailItem.recommendation.title}</h2>
                <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {detailItem.recommendation.titleEn}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {[
                    detailItem.recommendation.country?.join("/"),
                    detailItem.recommendation.date?.slice(0, 4),
                    detailItem.recommendation.runtime ? `${detailItem.recommendation.runtime}분` : null,
                    detailItem.recommendation.seasons ? `시즌 ${detailItem.recommendation.seasons}` : null,
                  ].filter(Boolean).join(" · ")}
                </p>
                <div className="flex items-center gap-1.5 mt-2">
                  <IconStar size={13} color="var(--accent)" />
                  <span className="font-data text-sm font-semibold" style={{ color: "var(--accent)" }}>{detailItem.recommendation.rating.toFixed(1)}</span>
                </div>
                {reports[detailItem.recommendation.tmdbId] && (
                  <div className="mt-2">
                    <ReactionLabel reaction={reports[detailItem.recommendation.tmdbId]} />
                  </div>
                )}
              </div>
            </div>

            {/* Reason */}
            <div className="mt-5">
              <div className="px-3 py-2 text-sm" style={{ background: "var(--accent-dim)", borderRadius: "var(--radius-md)" }}>
                {detailItem.recommendation.reason}
              </div>
            </div>

            {/* Credits */}
            {(detailItem.recommendation.director || detailItem.recommendation.cast?.length > 0) && (
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
                {detailItem.recommendation.director && (
                  <div>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>감독 </span>
                    <span className="text-sm">{detailItem.recommendation.director}</span>
                  </div>
                )}
                {detailItem.recommendation.cast?.length > 0 && (
                  <div>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>출연 </span>
                    <span className="text-sm">{detailItem.recommendation.cast.join(", ")}</span>
                  </div>
                )}
              </div>
            )}

            {/* Overview */}
            {detailItem.recommendation.overview && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>줄거리</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{detailItem.recommendation.overview}</p>
              </div>
            )}

            {/* OTT links */}
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>시청 가능</h3>
              <div className="flex flex-col gap-2">
                {detailItem.recommendation.providers.map((p) => {
                  const ottUrl = getOTTLink(p.name, detailItem.recommendation.title);
                  return (
                    <a
                      key={p.name}
                      href={ottUrl ?? detailItem.recommendation.watchLink ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 text-sm font-medium active:scale-[0.98] transition-transform"
                      style={{ background: "var(--surface-raised)", borderRadius: "var(--radius-md)" }}
                    >
                      <img src={getOTTIcon(p.name) ?? p.logoUrl ?? ""} alt={p.name} className="w-8 h-8 object-contain flex-shrink-0" style={{ borderRadius: "var(--radius-sm)", background: "var(--surface)" }} />
                      <span className="flex-1">{p.name}</span>
                      <span className="text-xs" style={{ color: "var(--accent)" }}>열기</span>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <BottomNav active="saved" />
    </div>
  );
}
