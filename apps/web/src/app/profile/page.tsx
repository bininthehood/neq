"use client";

import { useState, useEffect, useRef, startTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
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
import SubscribedOttSection from "@/components/profile/SubscribedOttSection";
import PersonaSurveyController from "@/components/onboarding/PersonaSurveyController";
import { buildProfilePersonasForDisplay } from "./profile-display";

const PERSONA_SURVEY_V2_ENABLED =
  process.env.NEXT_PUBLIC_PERSONA_SURVEY_V2_ENABLED === "true";

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
  const personasForDisplay = useMemo(
    () => buildProfilePersonasForDisplay({
      personas: persona.personas,
      tasteItems,
      savedItems: savedRaw,
    }),
    [persona.personas, tasteItems, savedRaw],
  );

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
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: "-0.025em",
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
          personas={personasForDisplay}
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

        {/* 2026-06-15 (build 27 follow-up) — 구독 OTT 변경 섹션 (native 정합).
            데이터 레이어 재사용 (account-prefs), 토글 즉시 저장. */}
        <SubscribedOttSection />

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

      {/* 새 페르소나 진입점 — flag 분기 (Persona v2 LLM 동적 설문)
          flag OFF (기본) — 기존 NewPersonaSheet (작품 픽 only)
          flag ON — PersonaSurveyController (컨텍스트 + LLM 설문 + 통합 요약).
                    favorites 는 PR 2-b 범위에서 [] 로 생성. 후속에서 통합 예정. */}
      {showNewPersona && !PERSONA_SURVEY_V2_ENABLED && (
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

      {showNewPersona && PERSONA_SURVEY_V2_ENABLED && (
        <div
          className="fixed inset-0 z-50"
          style={{ background: "var(--bg)" }}
          role="dialog"
          aria-modal="true"
          aria-label="새 취향 만들기"
        >
          <PersonaSurveyController
            onComplete={(personaId) => {
              setShowNewPersona(false);
              persona.refresh();
              setToast({ kind: "ok", msg: "새 취향이 추가됐어요" });
              track("persona_created", { name: personaId, source: "v2_survey" });
            }}
            onCancel={() => setShowNewPersona(false)}
          />
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

    </div>
  );
}
