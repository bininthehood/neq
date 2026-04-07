"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getFavorites,
  getRecommendations,
  setRecommendations,
  clearAllRecommendations,
  addSaved,
  removeSaved,
  hasOnboarded,
  getWatchReports,
  getSaved,
} from "@/lib/store";
import type { Recommendation } from "@/lib/types";
import BottomNav from "@/components/BottomNav";
import { IconSave, IconClose, IconRefresh, IconStar, IconFilm, IconDetail } from "@/components/Icons";
import { getOTTLink, getOTTIcon } from "@/lib/ott-links";

type FilterType = "all" | "movie" | "series";
type FilterOrigin = "all" | "kr" | "foreign";
const OTT_OPTIONS = ["Netflix", "Disney Plus", "Watcha", "wavve", "Coupang Play", "TVING", "Apple TV Plus"];

export default function DiscoverPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [topIdx, setTopIdx] = useState(0); // 덱 맨 위 카드 인덱스
  const [loading, setLoading] = useState(true);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterOrigin, setFilterOrigin] = useState<FilterOrigin>("all");
  const [filterOTT, setFilterOTT] = useState<string>("all");

  // 부채꼴 덱 — 맨 앞 카드의 드래그 오프셋
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [swiping, setSwiping] = useState(false); // exit 애니메이션 중
  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const dirLock = useRef<"h" | "v" | null>(null);

  // 디테일 scroll-snap
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    if (!hasOnboarded()) { router.replace("/onboarding"); return; }
    loadRecs("all", "all");
    setSavedIds(new Set(getSaved().map((s) => s.recommendation.tmdbId)));
  }, [router]);

  const loadRecs = async (ft: FilterType, fo: FilterOrigin) => {
    const cached = getRecommendations(ft, fo);
    if (cached.length > 0) { setRecs(cached); setTopIdx(0); setLoading(false); return; }
    setLoading(true);
    const favorites = getFavorites();
    const filter: any = {};
    if (ft !== "all") filter.type = ft;
    if (fo !== "all") filter.origin = fo;
    const reports = getWatchReports();
    const savedItems = getSaved();
    const feedback: { loved: string[]; good: string[]; meh: string[]; dropped: string[] } = { loved: [], good: [], meh: [], dropped: [] };
    for (const r of reports) {
      const item = savedItems.find((s) => s.recommendation.tmdbId === r.tmdbId);
      if (!item) continue;
      const t = item.recommendation.title;
      if (r.reaction === "loved") feedback.loved.push(t);
      else if (r.reaction === "good") feedback.good.push(t);
      else if (r.reaction === "meh") feedback.meh.push(t);
      else if (r.reaction === "dropped") feedback.dropped.push(t);
    }
    const hasFeedback = feedback.loved.length + feedback.good.length + feedback.meh.length + feedback.dropped.length > 0;
    const res = await fetch("/api/recommend", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorites, filter, ...(hasFeedback ? { feedback } : {}) }),
    });
    const data = await res.json();
    setRecommendations(data.recommendations ?? [], ft, fo);
    setRecs(data.recommendations ?? []); setTopIdx(0); setLoading(false);
  };

  const handleFilterChange = (t: FilterType, o: FilterOrigin) => {
    setFilterType(t); setFilterOrigin(o); setFilterOTT("all");
    scrollRef.current?.scrollTo({ top: 0 });
    loadRecs(t, o);
  };

  const refreshRecommendations = async () => {
    setRecommendations([], filterType, filterOrigin);
    await loadRecs(filterType, filterOrigin);
  };

  const filtered = filterOTT === "all" ? recs : recs.filter((r) => r.providers.some((p) => p.name === filterOTT));
  const current = filtered[topIdx];

  // 맨 앞 카드를 치우기
  const dismissCard = useCallback((dirX: number) => {
    if (swiping || topIdx >= filtered.length - 1) return;
    setSwiping(true);
    // exit 방향으로 날리기
    setDragX(dirX > 0 ? 500 : -500);
    setDragY(-80);
    setTimeout(() => {
      setTopIdx((i) => i + 1);
      setDragX(0); setDragY(0);
      setSwiping(false);
      scrollRef.current?.scrollTo({ top: 0 });
    }, 280);
  }, [swiping, topIdx, filtered.length]);

  // 이전 카드로 (덱 되감기)
  const undoCard = useCallback(() => {
    if (swiping || topIdx <= 0) return;
    setTopIdx((i) => i - 1);
  }, [swiping, topIdx]);

  // 터치 — 맨 앞 카드만 드래그
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (swiping) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    dragging.current = true;
    dirLock.current = null;
  }, [swiping]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (!dirLock.current) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) dirLock.current = "h";
      else if (Math.abs(dy) > 10) { dirLock.current = "v"; dragging.current = false; return; }
      else return;
    }
    if (dirLock.current === "h") {
      e.preventDefault();
      setDragX(dx);
      setDragY(Math.abs(dx) * -0.15); // 약간 위로 들어올림
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!dragging.current || dirLock.current !== "h") { dragging.current = false; dirLock.current = null; return; }
    dragging.current = false; dirLock.current = null;
    if (Math.abs(dragX) > 80) {
      dismissCard(dragX);
    } else {
      // 스냅백
      setDragX(0); setDragY(0);
    }
  }, [dragX, dismissCard]);

  // 키보드
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") undoCard();
      else if (e.key === "ArrowRight") dismissCard(1);
      else if (e.key === "ArrowUp") scrollRef.current?.scrollTo({ top: scrollRef.current.clientHeight, behavior: "smooth" });
      else if (e.key === "ArrowDown" || e.key === "Escape") scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [dismissCard, undoCard]);

  // 전체 이미지 프리로드
  useEffect(() => {
    filtered.forEach((r) => { if (r.posterUrl) { const img = new Image(); img.src = r.posterUrl; } });
  }, [filtered]);

  const metaInfo = (r: Recommendation) => [
    r.country?.length > 0 ? r.country.join("/") : null,
    r.date ? r.date.slice(0, 4) : null,
    r.runtime ? `${r.runtime}분` : null,
    r.seasons ? `시즌 ${r.seasons}` : null,
  ].filter(Boolean).join(" · ");

  const filterLabel = [
    filterOrigin === "kr" ? "국내" : filterOrigin === "foreign" ? "해외" : "",
    filterType === "movie" ? "영화" : filterType === "series" ? "시리즈" : "",
  ].filter(Boolean).join(" ");

  const FilterChips = () => (
    <div className="flex gap-2 px-4 pb-2 shrink-0 overflow-x-auto">
      {(["all", "movie", "series"] as const).map((t) => (
        <button key={t} onClick={() => { handleFilterChange(t, filterOrigin); }} disabled={loading}
          className="px-3 py-2.5 text-xs whitespace-nowrap transition-colors disabled:opacity-50"
          style={{ background: filterType === t ? "var(--accent)" : "var(--surface)", color: filterType === t ? "var(--bg)" : "var(--text-secondary)", borderRadius: "var(--radius-full)", border: filterType === t ? "none" : "1px solid var(--border)" }}>
          {t === "all" ? "전체" : t === "movie" ? "영화" : "시리즈"}
        </button>
      ))}
      <div style={{ width: 1, background: "var(--border)", margin: "4px 0" }} />
      {(["all", "kr", "foreign"] as const).map((o) => (
        <button key={o} onClick={() => { handleFilterChange(filterType, o); }} disabled={loading}
          className="px-3 py-2.5 text-xs whitespace-nowrap transition-colors disabled:opacity-50"
          style={{ background: filterOrigin === o ? "var(--accent)" : "var(--surface)", color: filterOrigin === o ? "var(--bg)" : "var(--text-secondary)", borderRadius: "var(--radius-full)", border: filterOrigin === o ? "none" : "1px solid var(--border)" }}>
          {o === "all" ? "전체" : o === "kr" ? "국내" : "해외"}
        </button>
      ))}
      {recs.length > 0 && (
        <>
          <div style={{ width: 1, background: "var(--border)", margin: "4px 0" }} />
          {["all", ...OTT_OPTIONS.filter((ott) => recs.some((r) => r.providers.some((p) => p.name === ott)))].map((ott) => (
            <button key={ott} onClick={() => { setFilterOTT(ott); setTopIdx(0); }}
              className="px-3 py-2.5 text-xs whitespace-nowrap transition-colors flex items-center gap-1.5"
              style={{ background: filterOTT === ott ? "var(--accent)" : "var(--surface)", color: filterOTT === ott ? "var(--bg)" : "var(--text-secondary)", borderRadius: "var(--radius-full)", border: filterOTT === ott ? "none" : "1px solid var(--border)" }}>
              {ott === "all" ? "모든 OTT" : (<><img src={getOTTIcon(ott) ?? ""} alt={ott} className="w-4 h-4 object-contain" style={{ borderRadius: "2px" }} />{ott}</>)}
            </button>
          ))}
        </>
      )}
    </div>
  );

  if (!mounted || loading) return (
    <div className="h-dvh flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 shrink-0"><span className="font-display text-lg" style={{ color: "var(--accent)" }}>Neko</span></div>
      <FilterChips />
      <div className="flex-1 flex flex-col items-center justify-center gap-5">
        <div className="w-10 h-10 animate-spin" style={{ border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "var(--radius-full)" }} />
        <div className="text-center">
          <h2 className="font-display text-lg">{filterLabel ? `${filterLabel} 추천 생성 중` : "취향을 분석하고 있어요"}</h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>잠시만 기다려주세요</p>
        </div>
      </div>
      <BottomNav active="discover" />
    </div>
  );

  if (filtered.length === 0) {
    const hasF = filterType !== "all" || filterOrigin !== "all" || filterOTT !== "all";
    return (
      <div className="h-dvh flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 shrink-0"><span className="font-display text-lg" style={{ color: "var(--accent)" }}>Neko</span><button onClick={() => router.push("/reset")} className="text-xs px-2 py-2" style={{ color: "var(--text-muted)" }}>재설정</button></div>
        <FilterChips />
        <div className="flex-1 flex flex-col px-8 justify-center"><div className="space-y-5">
          <IconFilm size={36} color="var(--text-muted)" />
          <div><p className="font-display text-lg font-semibold">{hasF ? "해당 조건의 결과가 없어요" : "추천을 만들지 못했어요"}</p><p className="text-sm mt-1.5" style={{ color: "var(--text-secondary)" }}>{hasF ? "다른 필터를 시도해보세요" : "잠시 후 다시 시도해보세요"}</p></div>
          <div className="flex gap-3">
            {hasF && <button onClick={() => { handleFilterChange("all", "all"); setFilterOTT("all"); }} className="px-5 py-2.5 text-sm font-medium active:scale-95 transition-transform" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-full)" }}>필터 초기화</button>}
            <button onClick={refreshRecommendations} className="px-5 py-2.5 text-sm font-medium flex items-center gap-2 active:scale-95 transition-transform" style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: "var(--radius-full)" }}><IconRefresh size={14} /> 다시 시도</button>
          </div>
        </div></div>
        <BottomNav active="discover" />
      </div>
    );
  }

  // 카드 덱: topIdx부터 최대 3장 역순 렌더 (뒤→앞)
  const deckCards = filtered.slice(topIdx, topIdx + 3).reverse();

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        <span className="font-display text-lg" style={{ color: "var(--accent)" }}>Neko</span>
        <div className="flex items-center gap-3">
          <span className="font-data text-sm" style={{ color: "var(--text-muted)" }}>{topIdx + 1}/{filtered.length}</span>
          <button onClick={() => router.push("/reset")} className="text-xs px-2 py-2" style={{ color: "var(--text-muted)" }}>재설정</button>
        </div>
      </div>
      <FilterChips />

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto" style={{ scrollSnapType: "y mandatory", overscrollBehavior: "none" }}>

        {/* Snap 1: 카드 덱 */}
        <div className="relative px-3 pb-2" style={{ height: "100%", scrollSnapAlign: "start" }}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          {deckCards.map((rec, stackIdx) => {
            const isTop = stackIdx === deckCards.length - 1;
            const depth = deckCards.length - 1 - stackIdx; // 0=맨앞, 1=그다음, 2=맨뒤

            // 부채꼴 오프셋: 뒤 카드일수록 작고, 아래로 살짝
            const scaleVal = 1 - depth * 0.04;
            const yOffset = depth * 12;

            // 맨 앞 카드만 드래그 적용
            const tx = isTop ? dragX : 0;
            const ty = isTop ? dragY + yOffset : yOffset;
            const rot = isTop ? dragX * 0.06 : 0;

            return (
              <div key={rec.tmdbId} className="absolute overflow-hidden will-change-transform"
                style={{
                  top: 0, bottom: "8px", left: "12px", right: "12px",
                  transform: `translateX(${tx}px) translateY(${ty}px) rotate(${rot}deg) scale(${scaleVal})`,
                  transition: isTop && !dragging.current ? "transform 0.3s ease-out" : (isTop ? "none" : "transform 0.3s ease-out"),
                  borderRadius: "var(--radius-xl)",
                  zIndex: 10 - depth,
                }}>
                {rec.posterUrl ? (
                  <img src={rec.posterUrl} alt={rec.title} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ background: "var(--surface)" }}>
                    <span className="font-display text-5xl" style={{ color: "var(--text-muted)" }}>N</span>
                  </div>
                )}
                {isTop && (
                  <>
                    <div className="absolute top-4 right-4 backdrop-blur-sm px-3 py-1.5 flex items-center gap-1.5" style={{ background: "var(--bg-overlay)", borderRadius: "var(--radius-md)" }}>
                      <IconStar size={13} color="var(--accent)" /><span className="font-data font-semibold" style={{ color: "var(--accent)" }}>{rec.rating.toFixed(1)}</span>
                    </div>
                    <div className="absolute top-4 left-4 backdrop-blur-sm px-3 py-1.5 text-sm" style={{ background: "var(--bg-overlay)", borderRadius: "var(--radius-md)" }}>
                      {rec.type === "series" ? "시리즈" : "영화"}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-5 pt-24" style={{ background: "linear-gradient(transparent, var(--bg-overlay-heavy) 40%, var(--bg))" }}>
                      <h2 className="font-display text-2xl font-bold">{rec.title}</h2>
                      {metaInfo(rec) && <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{metaInfo(rec)}</p>}
                      <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{rec.reason}</p>
                      <div className="flex gap-1.5 mt-3 items-center">
                        {rec.providers.slice(0, 4).map((p) => (
                          <img key={p.name} src={getOTTIcon(p.name) ?? p.logoUrl ?? ""} alt={p.name} className="w-8 h-8 object-contain" style={{ borderRadius: "var(--radius-md)", background: "var(--surface)" }} />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Snap 2: 디테일 */}
        {current && (
          <div className="px-5 pt-4 pb-8" style={{ minHeight: "100%", scrollSnapAlign: "start", background: "var(--bg)" }}>
            <div className="flex justify-center mb-3"><div className="w-10 h-1" style={{ background: "var(--border)", borderRadius: "var(--radius-full)" }} /></div>
            <button className="absolute right-5 w-11 h-11 flex items-center justify-center z-10" style={{ background: "var(--surface)", borderRadius: "var(--radius-full)" }}
              onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}>
              <IconClose size={16} color="var(--text-secondary)" />
            </button>
            <h2 className="font-display text-xl font-bold pr-14">{current.title}</h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>{current.titleEn} · {metaInfo(current)}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <IconStar size={13} color="var(--accent)" />
              <span className="font-data text-sm font-semibold" style={{ color: "var(--accent)" }}>{current.rating.toFixed(1)}</span>
            </div>
            {current.backdrop && <img src={current.backdrop} alt="" className="w-full h-40 object-cover mt-4" style={{ borderRadius: "var(--radius-md)" }} />}
            <div className="mt-4"><div className="px-3 py-2 text-sm" style={{ background: "var(--accent-dim)", borderRadius: "var(--radius-md)" }}>{current.reason}</div></div>
            {(current.director || current.cast?.length > 0) && (
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
                {current.director && <div><span className="text-xs" style={{ color: "var(--text-muted)" }}>감독 </span><span className="text-sm">{current.director}</span></div>}
                {current.cast?.length > 0 && <div><span className="text-xs" style={{ color: "var(--text-muted)" }}>출연 </span><span className="text-sm">{current.cast.join(", ")}</span></div>}
              </div>
            )}
            {current.overview && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>줄거리</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{current.overview}</p>
              </div>
            )}
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>시청 가능</h3>
              <div className="flex flex-col gap-2">
                {current.providers.map((p) => {
                  const u = getOTTLink(p.name, current.title);
                  return (
                    <a key={p.name} href={u ?? current.watchLink ?? "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 text-sm font-medium active:scale-[0.98] transition-transform" style={{ background: "var(--surface-raised)", borderRadius: "var(--radius-md)" }}>
                      <img src={getOTTIcon(p.name) ?? p.logoUrl ?? ""} alt={p.name} className="w-8 h-8 object-contain flex-shrink-0" style={{ borderRadius: "var(--radius-sm)", background: "var(--surface)" }} />
                      <span className="flex-1">{p.name}</span>
                      <span className="text-xs" style={{ color: "var(--accent)" }}>열기</span>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 하단 */}
      <div className="px-4 pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5 flex-1 mr-3 items-center justify-center">
            {filtered.map((_, i) => (
              <div key={i} className="transition-all" style={{ width: i === topIdx ? 16 : 6, height: 6, background: i === topIdx ? "var(--accent)" : i < topIdx ? "var(--text-muted)" : "var(--border)", borderRadius: "var(--radius-full)" }} />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.clientHeight, behavior: "smooth" })} aria-label="상세보기" className="w-12 h-12 flex items-center justify-center active:scale-90 transition-transform" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-full)" }}>
              <IconDetail size={18} color="var(--text-secondary)" />
            </button>
            <button onClick={() => {
              if (!current) return;
              const id = current.tmdbId;
              if (savedIds.has(id)) { removeSaved(id); setSavedIds((s) => { const n = new Set(s); n.delete(id); return n; }); }
              else { addSaved(current); setSavedIds((s) => new Set(s).add(id)); }
            }} aria-label="저장" className="w-12 h-12 flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: current && savedIds.has(current.tmdbId) ? "var(--accent-dim)" : "var(--surface)", border: `1px solid ${current && savedIds.has(current.tmdbId) ? "var(--accent-border)" : "var(--border)"}`, borderRadius: "var(--radius-full)" }}>
              <IconSave size={20} color={current && savedIds.has(current.tmdbId) ? "var(--accent)" : "var(--text-muted)"} filled={!!(current && savedIds.has(current.tmdbId))} />
            </button>
          </div>
        </div>
      </div>
      <BottomNav active="discover" />
    </div>
  );
}
