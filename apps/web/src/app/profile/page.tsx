"use client";

import { useState, useEffect, useRef, startTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  getSaved,
  getWatchReports,
  getWatchStats,
  clearAllUserData,
  exportUserData,
  importUserData,
} from "@/lib/store";
import { getDeviceId } from "@/lib/device-id";
import { wipeCloudData } from "@/lib/sync";
import { track } from "@/lib/analytics";
import { usePersona } from "@/contexts/PersonaContext";
import { IconClose, IconSearch } from "@/components/Icons";
import SearchSheet from "@/components/discover/SearchSheet";
import { useDetailSheet } from "@/hooks/useDetailSheet";
import {
  calcTypeDistribution,
  calcOTTDistribution,
  calcMonthlyWatch,
} from "@/lib/profile-stats";
import PersonaSection from "@/components/profile/PersonaSection";
import InsightSections from "@/components/profile/InsightSections";
import NewPersonaSheet from "@/components/profile/NewPersonaSheet";

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
  const [pendingImport, setPendingImport] = useState<unknown | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trackedRef = useRef(false);

  const [showNewPersona, setShowNewPersona] = useState(false);

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

  const handleExport = () => {
    try {
      const data = exportUserData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `neq-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      track("data_exported", {
        version: data.version,
        saved_count: data.data.saved.length,
        personas_count: data.data.personas?.length ?? 0,
      });
      setToast({ kind: "ok", msg: "데이터를 내보냈어요" });
    } catch {
      setToast({ kind: "error", msg: "내보내기에 실패했어요" });
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 같은 파일 재선택 가능하도록 value 리셋
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const parsed = JSON.parse(text);
        setPendingImport(parsed);
      } catch {
        setToast({ kind: "error", msg: "JSON 파일을 읽을 수 없어요" });
      }
    };
    reader.onerror = () => {
      setToast({ kind: "error", msg: "파일을 읽는 데 실패했어요" });
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = () => {
    if (!pendingImport) return;
    const result = importUserData(pendingImport);
    if (result.ok) {
      const parsed = pendingImport as { version?: number; data?: { personas?: unknown[] } };
      track("data_imported", {
        version: typeof parsed.version === "number" ? parsed.version : 0,
        saved_count: result.counts?.saved ?? 0,
        favorites_count: result.counts?.favorites ?? 0,
        personas_count: Array.isArray(parsed.data?.personas) ? parsed.data!.personas!.length : 0,
      });
      setPendingImport(null);
      setToast({ kind: "ok", msg: "데이터를 가져왔어요" });
      // import 는 드물고 stale 컴포넌트 회피를 위해 reload 가 가장 안전
      setTimeout(() => window.location.reload(), 800);
    } else {
      setPendingImport(null);
      setToast({ kind: "error", msg: result.error ?? "가져오기에 실패했어요" });
    }
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

        <PersonaSection
          personas={persona.personas}
          activePersonaId={persona.activePersonaId}
          onSwitch={(id) => {
            persona.switchPersona(id);
            track("persona_switched", { persona_id: id });
            refresh();
          }}
          onDelete={(id) => {
            persona.deletePersona(id);
            track("persona_deleted", { persona_id: id });
          }}
          onCreateClick={() => {
            if (persona.personas.length >= 3) return;
            setShowNewPersona(true);
          }}
        />

        <InsightSections
          tasteItems={tasteItems}
          savedCount={savedCount}
          stats={stats}
          typeDist={typeDist}
          ottDist={ottDist}
          monthly={monthly}
        />

        {/* 데이터 백업 — W5 디바이스 격리 전략 c 선반영. export/import 페어. */}
        <section className="px-5 mb-6">
          <h2 className="text-xs uppercase tracking-wider text-muted font-semibold mb-3">데이터 백업</h2>
          <p className="text-xs text-muted mb-3 leading-relaxed">
            기기 간 데이터 이동에 사용해요
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleExport}
              aria-label="데이터 내보내기"
              className="flex-1 py-3 min-h-[44px] text-sm rounded-lg active:scale-[0.98] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              style={{ background: "var(--surface-raised)", color: "var(--text-primary)" }}
            >
              데이터 내보내기
            </button>
            <button
              type="button"
              onClick={handleImportClick}
              aria-label="데이터 가져오기"
              className="flex-1 py-3 min-h-[44px] text-sm rounded-lg active:scale-[0.98] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              style={{ background: "var(--surface-raised)", color: "var(--text-primary)" }}
            >
              데이터 가져오기
            </button>
          </div>
          {/* hidden file input — 가져오기 버튼 클릭으로 트리거 */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileSelected}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />
        </section>

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
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-reset-title"
        >
          <div
            className="w-full max-w-[320px] p-5 bg-surface-raised rounded-xl"
            style={{ boxShadow: "var(--shadow-lg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-reset-title" className="font-display text-lg font-bold">정말 초기화할까요?</h3>
            <p className="text-sm text-secondary mt-2">
              저장한 작품 {savedCount}편, 시청 기록 {stats.total}편이 모두 사라져요. 이 동작은 되돌릴 수 없어요.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setConfirmReset(false)}
                className="flex-1 py-3 min-h-[44px] text-sm bg-surface rounded-lg text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                취소
              </button>
              <button
                onClick={handleReset}
                className="flex-1 py-3 text-sm font-semibold rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                style={{ background: "var(--danger)", color: "var(--text-inverse)" }}
              >
                초기화
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 가져오기 확인 모달 — 기존 데이터 완전 덮어쓰기 경고 */}
      {pendingImport !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6 animate-fade-in"
          style={{ background: "var(--bg-overlay-heavy)" }}
          onClick={() => setPendingImport(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-import-title"
        >
          <div
            className="w-full max-w-[320px] p-5 bg-surface-raised rounded-xl"
            style={{ boxShadow: "var(--shadow-lg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-import-title" className="font-display text-lg font-bold">기존 데이터를 대체해요</h3>
            <p className="text-sm text-secondary mt-2">
              현재 저장된 작품·페르소나·시청 기록이 모두 새 데이터로 바뀌어요. 계속할까요?
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setPendingImport(null)}
                className="flex-1 py-3 min-h-[44px] text-sm bg-surface rounded-lg text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                취소
              </button>
              <button
                onClick={handleConfirmImport}
                className="flex-1 py-3 text-sm font-semibold rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                style={{ background: "var(--danger)", color: "var(--text-inverse)" }}
              >
                가져오기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast — DESIGN.md L168: 성공=role=status polite, 에러=role=alert assertive */}
      {toast && (
        <div
          className="fixed top-16 left-0 right-0 z-40 flex justify-center px-4 animate-fade-in"
          role={toast.kind === "error" ? "alert" : "status"}
          aria-live={toast.kind === "error" ? "assertive" : "polite"}
          aria-atomic="true"
        >
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
              aria-hidden="true"
            />
            {toast.msg}
          </div>
        </div>
      )}

      {/* 새 취향 바텀시트 */}
      {showNewPersona && (
        <NewPersonaSheet
          onClose={() => setShowNewPersona(false)}
          onSubmit={(name, items) => {
            const id = persona.createPersona(
              name,
              items.map((s) => s.title),
              items.map((s) => ({ id: s.id, title: s.title, posterUrl: s.posterUrl })),
            );
            if (id) {
              persona.switchPersona(id);
              setToast({ kind: "ok", msg: `'${name}' 취향이 추가됐어요` });
              track("persona_created", { name });
            }
            setShowNewPersona(false);
          }}
        />
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

    </div>
  );
}
