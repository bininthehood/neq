"use client";

import { useState, useEffect, useRef, useCallback, startTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  getSaved,
  getWatchReports,
  getWatchStats,
  clearAllUserData,
} from "@/lib/store";
import { getDeviceId } from "@/lib/device-id";
import { wipeCloudData } from "@/lib/sync";
import { track } from "@/lib/analytics";
import { usePersona } from "@/contexts/PersonaContext";
import BottomNav from "@/components/BottomNav";
import { IconClose, IconCheck, IconSearch } from "@/components/Icons";
import SearchSheet from "@/components/discover/SearchSheet";
import { useDetailSheet } from "@/hooks/useDetailSheet";

interface MiniSearchResult {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
}

const MINI_FALLBACK: MiniSearchResult[] = [
  { id: 496243, title: "기생충", posterUrl: "https://image.tmdb.org/t/p/w200/jjHccoFjbqlfr4VGLVLT7yek0Xn.jpg", year: "2019" },
  { id: 278, title: "쇼생크 탈출", posterUrl: "https://image.tmdb.org/t/p/w200/oAt6OtpwYCdJI76AVtVKW1eorYx.jpg", year: "1994" },
  { id: 157336, title: "인터스텔라", posterUrl: "https://image.tmdb.org/t/p/w200/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", year: "2014" },
  { id: 238, title: "대부", posterUrl: "https://image.tmdb.org/t/p/w200/I1fkNd5CeJGv56mhrTDoOeMc2r.jpg", year: "1972" },
  { id: 372058, title: "너의 이름은.", posterUrl: "https://image.tmdb.org/t/p/w200/wJsOzBoMSdkLJEFwpPIl0GTvPaJ.jpg", year: "2016" },
  { id: 550, title: "파이트 클럽", posterUrl: "https://image.tmdb.org/t/p/w200/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg", year: "1999" },
  { id: 129, title: "센과 치히로의 행방불명", posterUrl: "https://image.tmdb.org/t/p/w200/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg", year: "2001" },
  { id: 578, title: "라라랜드", posterUrl: "https://image.tmdb.org/t/p/w200/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg", year: "2016" },
  { id: 680, title: "펄프 픽션", posterUrl: "https://image.tmdb.org/t/p/w200/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg", year: "1994" },
];

// ──────────────────────────────────────────────────────
// D6 helpers — 실제 데이터 기반 분포 계산 (mock 금지)
// ──────────────────────────────────────────────────────
interface DistributionRow {
  label: string;
  value: number; // 0-100
  count: number;
  color: string;
}

/** type (movie/series) 비중 */
function calcTypeDistribution(
  saved: ReturnType<typeof getSaved>,
): DistributionRow[] {
  if (saved.length === 0) return [];
  let movie = 0;
  let series = 0;
  for (const s of saved) {
    if (s.recommendation.type === "movie") movie += 1;
    else if (s.recommendation.type === "series") series += 1;
  }
  const total = movie + series;
  if (total === 0) return [];
  return [
    {
      label: "영화",
      value: Math.round((movie / total) * 100),
      count: movie,
      color: "var(--accent)",
    },
    {
      label: "시리즈",
      value: Math.round((series / total) * 100),
      count: series,
      color: "#9B8AE0",
    },
  ];
}

/** OTT(provider) 분포 — 상위 5개 */
function calcOTTDistribution(
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

/** 월별 시청 — 최근 12개월, 시청 리포트 reportedAt 기반 */
function calcMonthlyWatch(reports: ReturnType<typeof getWatchReports>): {
  buckets: { month: string; count: number; isCurrent: boolean }[];
  total: number;
} {
  const now = new Date();
  const buckets: { month: string; count: number; isCurrent: boolean }[] = [];
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

export default function ProfilePage() {
  const router = useRouter();
  const persona = usePersona();
  // 헤더 search 버튼 → SearchSheet 자체 마운트. cancel 시 Profile 페이지 그대로 유지.
  const searchSheet = useDetailSheet();
  const [searchInitialQuery, setSearchInitialQuery] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  const [tasteItems, setTasteItems] = useState<string[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, loved: 0, good: 0, meh: 0, dropped: 0 });
  const [savedRaw, setSavedRaw] = useState<ReturnType<typeof getSaved>>([]);
  const [reportsRaw, setReportsRaw] = useState<ReturnType<typeof getWatchReports>>([]);
  const [deviceId, setDeviceId] = useState("");
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const trackedRef = useRef(false);

  const [showNewPersona, setShowNewPersona] = useState(false);
  const [newName, setNewName] = useState("");
  const [miniQuery, setMiniQuery] = useState("");
  const [miniResults, setMiniResults] = useState<MiniSearchResult[]>([]);
  const [miniSelected, setMiniSelected] = useState<MiniSearchResult[]>([]);
  const [miniSuggestions, setMiniSuggestions] = useState<MiniSearchResult[]>(MINI_FALLBACK);
  const [miniSearching, setMiniSearching] = useState(false);
  const [miniLoadingSuggestions, setMiniLoadingSuggestions] = useState(false);
  const miniTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetTouchRef = useRef<{ startY: number; currentY: number } | null>(null);

  const refresh = () => {
    setDeviceId(getDeviceId());

    startTransition(() => {
      const savedItems = getSaved();
      const reports = getWatchReports();
      setSavedRaw(savedItems);
      setReportsRaw(reports);
      setSavedCount(savedItems.length);
      setStats(getWatchStats());
      // 취향 프로필: loved/good 작품 타이틀 (최근 순)
      const lovedGood = reports
        .filter((r) => r.reaction === "loved" || r.reaction === "good")
        .sort((a, b) => b.reportedAt - a.reportedAt)
        .map((r) => {
          const item = savedItems.find((s) => s.recommendation.tmdbId === r.tmdbId);
          return item?.recommendation.title;
        })
        .filter((t): t is string => !!t);
      setTasteItems(lovedGood);
    });
  };

  // D6 — 분포 메모 (계산 비용 ↓)
  const typeDist = useMemo(() => calcTypeDistribution(savedRaw), [savedRaw]);
  const ottDist = useMemo(() => calcOTTDistribution(savedRaw), [savedRaw]);
  const monthly = useMemo(() => calcMonthlyWatch(reportsRaw), [reportsRaw]);

  const miniSearch = useCallback(async (q: string) => {
    if (q.length < 1) { setMiniResults([]); return; }
    setMiniSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) { setMiniResults([]); setMiniSearching(false); return; }
      const data = await res.json();
      setMiniResults(Array.isArray(data) ? data : []);
    } catch { setMiniResults([]); }
    setMiniSearching(false);
  }, []);

  const handleMiniInput = (value: string) => {
    setMiniQuery(value);
    if (miniTimerRef.current) clearTimeout(miniTimerRef.current);
    miniTimerRef.current = setTimeout(() => miniSearch(value), 300);
  };

  const toggleMiniSelect = (item: MiniSearchResult) => {
    if (miniSelected.some((s) => s.id === item.id)) {
      setMiniSelected(miniSelected.filter((s) => s.id !== item.id));
    } else if (miniSelected.length < 5) {
      setMiniSelected([...miniSelected, item]);
    }
  };

  const fetchMiniTrending = async () => {
    setMiniLoadingSuggestions(true);
    try {
      const res = await fetch("/api/trending");
      const data = await res.json();
      if (data.length > 0) setMiniSuggestions(data);
    } catch { /* fallback */ }
    setMiniLoadingSuggestions(false);
  };

  const handleCreatePersona = () => {
    if (newName.trim().length === 0 || miniSelected.length < 3) return;
    const id = persona.createPersona(
      newName.trim(),
      miniSelected.map((s) => s.title),
      miniSelected.map((s) => ({ id: s.id, title: s.title, posterUrl: s.posterUrl })),
    );
    if (id) {
      persona.switchPersona(id);
      setToast({ kind: "ok", msg: `'${newName.trim()}' 취향이 추가됐어요` });
      track("persona_created", { name: newName.trim() });
    }
    setShowNewPersona(false);
    setNewName("");
    setMiniQuery("");
    setMiniResults([]);
    setMiniSelected([]);
  };

  const openNewPersonaSheet = () => {
    if (persona.personas.length >= 3) return;
    setShowNewPersona(true);
    fetchMiniTrending();
  };

  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    track("profile_viewed");
    setMounted(true);
    refresh();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleReset = () => {
    clearAllUserData();
    // localStorage 만 비우면 다음 pullFromServer 가 cloud(saved_items/watch_reports/seen_titles/
    // archived_items + profiles.onboarding_picks) 를 다시 끌어와 데이터가 복원되는 회귀가 있었음.
    // cloud 도 함께 wipe — 비동기지만 sync 토큰 만료/오프라인 시에도 silent 실패라 UI 흐름은 영향 X.
    void wipeCloudData();
    track("data_reset");
    setConfirmReset(false);
    refresh();
    setToast({ kind: "ok", msg: "모든 데이터가 초기화됐어요" });
    setTimeout(() => router.push("/discover"), 1500);
  };

  if (!mounted) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header — Discover 와 동일한 좁은 height (h-12 = 48px) 패턴. */}
      <div className="flex items-center justify-between px-5 h-12 shrink-0">
        <h1
          className="font-display"
          style={{
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "var(--text-primary)",
            lineHeight: 1,
          }}
        >
          Profile
        </h1>
        <button
          type="button"
          onClick={() => {
            track("search_opened");
            setSearchInitialQuery("");
            searchSheet.openDetail();
          }}
          aria-label="검색 열기"
          className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none rounded-md"
        >
          <IconSearch size={18} color="var(--text-muted)" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">

      {/* 취향 페르소나 */}
      <section className="px-5 mb-6">
        <h2 className="text-xs uppercase tracking-wider text-muted font-semibold mb-3">취향</h2>
        <div className="space-y-2">
          {persona.personas.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (p.id !== persona.activePersonaId) {
                  persona.switchPersona(p.id);
                  track("persona_switched", { persona_id: p.id });
                  refresh();
                }
              }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.currentTarget.click(); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg active:scale-[0.98] transition-transform cursor-pointer"
              style={{
                background: "var(--surface)",
                border: p.id === persona.activePersonaId ? "1px solid var(--accent-border)" : "1px solid var(--border-subtle)",
              }}
            >
              <div className="flex-1 text-left">
                <div className="text-sm font-medium" style={{ color: p.id === persona.activePersonaId ? "var(--accent)" : "var(--text-primary)" }}>
                  {p.name}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  {p.favorites.slice(0, 3).join(", ")}
                  {p.favorites.length > 3 && ` 외 ${p.favorites.length - 3}편`}
                </div>
              </div>
              {p.id === persona.activePersonaId && (
                <IconCheck size={16} color="var(--accent)" />
              )}
              {p.id !== "default" && p.id !== persona.activePersonaId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    persona.deletePersona(p.id);
                    track("persona_deleted", { persona_id: p.id });
                  }}
                  className="w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-transform"
                  style={{ background: "var(--danger-dim)" }}
                >
                  <IconClose size={12} color="var(--danger)" />
                </button>
              )}
            </div>
          ))}
        </div>
        {persona.personas.length < 3 ? (
          <button
            onClick={openNewPersonaSheet}
            className="w-full mt-2 flex items-center justify-center gap-1 px-4 py-3 rounded-lg text-sm active:scale-[0.98] transition-transform"
            style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px dashed var(--border)" }}
          >
            + 새 취향 추가
          </button>
        ) : (
          <p className="text-xs text-muted mt-2 px-1">최대 3개까지 만들 수 있어요</p>
        )}
      </section>

      {/* 내 취향 */}
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

      {/* 통계 */}
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
                    className="font-data text-[9px]"
                    style={{
                      color: b.isCurrent ? "var(--accent)" : "var(--text-muted)",
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

      {/* 설정 */}
      <section className="px-5 mb-6">
        <h2 className="text-xs uppercase tracking-wider text-muted font-semibold mb-3">설정</h2>
        <button
          onClick={() => setConfirmReset(true)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg active:scale-[0.98] transition-transform"
          style={{ background: "var(--danger-dim)" }}
        >
          <IconClose size={18} color="var(--danger)" />
          <div className="flex-1 text-left">
            <div className="text-sm text-danger">모든 데이터 초기화</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--danger)", opacity: 0.7 }}>
              저장한 작품, 시청 기록, 취향이 모두 사라져요
            </div>
          </div>
        </button>
      </section>

      {/* About */}
      <section className="px-5 mb-8">
        <h2 className="text-xs uppercase tracking-wider text-muted font-semibold mb-3">앱 정보</h2>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted">버전</span>
            <span className="font-data text-secondary">0.2.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">디바이스 ID</span>
            <span
              className="font-data text-secondary truncate max-w-[180px]"
              title={deviceId}
            >
              {deviceId.slice(0, 8)}…
            </span>
          </div>
        </div>
        <p className="mt-4 pt-3 border-t border-border text-[11px] leading-relaxed text-muted">
          This product uses TMDB and the TMDB APIs but is not endorsed,
          certified, or otherwise approved by TMDB.
        </p>
      </section>
      </div>

      {/* 초기화 확인 모달 */}
      {confirmReset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6 animate-fade-in"
          style={{ background: "var(--bg-overlay-heavy)" }}
          onClick={() => setConfirmReset(false)}
        >
          <div
            className="w-full max-w-[320px] p-5 bg-surface-raised rounded-xl"
            style={{ boxShadow: "var(--shadow-lg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-bold">정말 초기화할까요?</h3>
            <p className="text-sm text-secondary mt-2">
              저장한 작품 {savedCount}편, 시청 기록 {stats.total}편이 모두 사라져요. 이 동작은 되돌릴 수 없어요.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setConfirmReset(false)}
                className="flex-1 py-3 min-h-[44px] text-sm bg-surface rounded-lg text-secondary"
              >
                취소
              </button>
              <button
                onClick={handleReset}
                className="flex-1 py-3 text-sm font-semibold rounded-lg"
                style={{ background: "var(--danger)", color: "var(--text-primary)" }}
              >
                초기화
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-0 right-0 z-40 flex justify-center px-4 animate-fade-in">
          <div
            className="px-4 py-2.5 text-sm rounded-lg flex items-center gap-2"
            style={{
              background: "var(--surface-raised)",
              color: "var(--text-primary)",
              boxShadow: "var(--shadow-toast)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: toast.kind === "ok" ? "var(--accent)" : "var(--danger)" }}
            />
            {toast.msg}
          </div>
        </div>
      )}

      {/* 새 취향 바텀시트 */}
      {showNewPersona && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "var(--bg-overlay-heavy)" }}
          onClick={() => setShowNewPersona(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl flex flex-col animate-slide-up"
            style={{
              background: "var(--surface)",
              maxHeight: "80vh",
            }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              sheetTouchRef.current = { startY: e.touches[0].clientY, currentY: e.touches[0].clientY };
            }}
            onTouchMove={(e) => {
              if (sheetTouchRef.current) sheetTouchRef.current.currentY = e.touches[0].clientY;
            }}
            onTouchEnd={() => {
              if (sheetTouchRef.current) {
                const dy = sheetTouchRef.current.currentY - sheetTouchRef.current.startY;
                if (dy > window.innerHeight * 0.3) setShowNewPersona(false);
                sheetTouchRef.current = null;
              }
            }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mt-2 mb-3" style={{ background: "var(--border)" }} />
            <div className="px-5 pb-3 shrink-0">
              <h3 className="font-display text-lg font-bold">새 취향 추가</h3>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="이 취향의 이름은?"
                maxLength={12}
                className="w-full px-4 py-3 mt-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors bg-surface-sunken border border-border rounded-lg text-foreground text-sm"
              />
              {miniSelected.length > 0 && (
                <div className="flex gap-2 mt-3">
                  {miniSelected.map((item) => (
                    <button key={item.id} onClick={() => toggleMiniSelect(item)} className="flex-shrink-0 relative">
                      {item.posterUrl ? (
                        <Image src={item.posterUrl} alt={item.title} width={44} height={64} className="object-cover rounded-md" sizes="44px" />
                      ) : (
                        <div className="w-11 h-16 flex items-center justify-center text-xs bg-surface rounded-md text-muted">{item.title.slice(0, 2)}</div>
                      )}
                      <div className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center bg-danger rounded-full">
                        <IconClose size={8} color="var(--text-primary)" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <input
                type="text"
                value={miniQuery}
                onChange={(e) => handleMiniInput(e.target.value)}
                placeholder="작품을 검색하세요"
                className="w-full px-4 py-3 mt-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors bg-surface-sunken border border-border rounded-lg text-foreground text-sm"
              />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
              {miniSearching && <div className="text-center py-4 text-muted text-sm">검색 중...</div>}
              {miniQuery.length === 0 && miniResults.length === 0 && (
                <div>
                  <p className="text-xs text-muted mb-2">이런 작품은 어때요?</p>
                  <div className="grid grid-cols-2 gap-2" style={{ gridAutoRows: "auto" }}>
                    {miniSuggestions.slice(0, 8).map((item, i) => {
                      const isSelected = miniSelected.some((s) => s.id === item.id);
                      const isLarge = i % 3 === 0;
                      return (
                        <button
                          key={item.id}
                          onClick={() => toggleMiniSelect(item)}
                          className={`relative overflow-hidden transition-all active:scale-95 rounded-md${isLarge ? " col-span-2" : ""}`}
                          style={{
                            outline: isSelected ? "2px solid var(--accent)" : "none",
                            outlineOffset: "-2px",
                            aspectRatio: isLarge ? "4/3" : "2/3",
                          }}
                        >
                          {item.posterUrl ? (
                            <Image src={item.posterUrl} alt={item.title} fill className="object-cover" sizes="(max-width: 480px) 33vw, 120px" />
                          ) : (
                            <div className="w-full h-full bg-surface" />
                          )}
                          <div className="absolute bottom-0 left-0 right-0 p-1" style={{ background: "linear-gradient(transparent, var(--bg-overlay-heavy))" }}>
                            <div className="text-xs truncate">{item.title}</div>
                          </div>
                          {isSelected && (
                            <div className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center bg-accent rounded-full">
                              <IconCheck size={10} color="var(--bg)" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={fetchMiniTrending}
                    disabled={miniLoadingSuggestions}
                    className="w-full mt-3 py-2 min-h-[44px] text-xs font-medium transition-colors disabled:opacity-30 text-muted active:scale-[0.98]"
                  >
                    {miniLoadingSuggestions ? "로딩..." : "다른 작품 보기"}
                  </button>
                </div>
              )}
              {miniResults.map((item) => {
                const isSelected = miniSelected.some((s) => s.id === item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleMiniSelect(item)}
                    className="w-full flex items-center gap-3 p-2.5 transition-colors rounded-lg"
                    style={{
                      background: isSelected ? "var(--accent-dim)" : "transparent",
                      border: isSelected ? "1px solid var(--accent-border)" : "1px solid transparent",
                    }}
                  >
                    {item.posterUrl ? (
                      <Image src={item.posterUrl} alt={item.title} width={40} height={60} className="object-cover flex-shrink-0 rounded-md" sizes="40px" />
                    ) : (
                      <div className="w-10 h-15 flex-shrink-0 bg-surface rounded-md" />
                    )}
                    <div className="text-left flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.title}</div>
                      <div className="text-xs text-muted">{item.year}</div>
                    </div>
                    {isSelected && <IconCheck size={16} color="var(--accent)" />}
                  </button>
                );
              })}
            </div>
            <div className="px-5 pb-6 pt-3 shrink-0" style={{ background: "linear-gradient(transparent, var(--surface) 30%)" }}>
              <button
                onClick={handleCreatePersona}
                disabled={newName.trim().length === 0 || miniSelected.length < 3}
                className="w-full py-3.5 text-sm font-semibold transition-all active:scale-[0.98] rounded-lg"
                style={{
                  background: newName.trim().length > 0 && miniSelected.length >= 3 ? "var(--accent)" : "var(--surface-raised)",
                  color: newName.trim().length > 0 && miniSelected.length >= 3 ? "var(--bg)" : "var(--text-muted)",
                  cursor: newName.trim().length > 0 && miniSelected.length >= 3 ? "pointer" : "not-allowed",
                }}
              >
                {miniSelected.length < 3
                  ? `${3 - miniSelected.length}개만 더 골라주세요`
                  : "취향 추가하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SearchSheet — Profile 페이지 자체 마운트. 헤더 search 버튼으로 진입. */}
      <SearchSheet
        show={searchSheet.showDetail}
        sheetY={searchSheet.detailY}
        animating={searchSheet.detailAnimating}
        bodyRef={searchSheet.detailBodyRef}
        onClose={searchSheet.closeDetail}
        onTouchStart={searchSheet.onDetailTouchStart}
        onTouchMove={searchSheet.onDetailTouchMove}
        onTouchEnd={searchSheet.onDetailTouchEnd}
        initialQuery={searchInitialQuery}
      />

      <BottomNav active="profile" />
    </div>
  );
}
