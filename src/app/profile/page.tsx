"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getFavorites,
  getSaved,
  getWatchStats,
  clearAllUserData,
} from "@/lib/store";
import { getDeviceId } from "@/lib/device-id";
import BottomNav from "@/components/BottomNav";
import { IconClose } from "@/components/Icons";

export default function ProfilePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, loved: 0, good: 0, meh: 0, dropped: 0 });
  const [deviceId, setDeviceId] = useState("");
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const refresh = () => {
    setFavorites(getFavorites());
    setSavedCount(getSaved().length);
    setStats(getWatchStats());
    setDeviceId(getDeviceId());
  };

  useEffect(() => {
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
    setConfirmReset(false);
    refresh();
    setToast({ kind: "ok", msg: "모든 데이터가 초기화됐어요" });
    setTimeout(() => router.push("/onboarding"), 1500);
  };

  if (!mounted) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <h1 className="font-display text-2xl font-bold">Profile</h1>
      </div>

      {/* 내 취향 */}
      <section className="px-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs uppercase tracking-wider text-muted font-semibold">내 취향</h2>
          <button
            onClick={() => router.push("/reset")}
            className="text-xs text-accent"
          >
            재설정
          </button>
        </div>
        {favorites.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {favorites.map((f) => (
              <span
                key={f}
                className="px-3 py-1.5 text-xs bg-surface rounded-lg text-secondary"
              >
                {f}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">기반 작품이 없어요</p>
        )}
      </section>

      {/* 통계 */}
      <section className="px-5 mb-6">
        <h2 className="text-xs uppercase tracking-wider text-muted font-semibold mb-3">시청 기록</h2>
        <div className="grid grid-cols-2 gap-3">
          <div
            className="p-4 bg-surface rounded-lg"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }}
          >
            <div className="font-data text-2xl font-bold text-accent">{savedCount}</div>
            <div className="text-xs text-muted mt-1">저장한 작품</div>
          </div>
          <div
            className="p-4 bg-surface rounded-lg"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }}
          >
            <div className="font-data text-2xl font-bold text-accent">{stats.total}</div>
            <div className="text-xs text-muted mt-1">시청 리포트</div>
          </div>
        </div>
        {stats.total > 0 && (
          <div className="flex gap-4 mt-3 text-xs">
            {stats.loved > 0 && <span className="text-accent">인생작 {stats.loved}</span>}
            {stats.good > 0 && <span className="text-secondary">재밌었어 {stats.good}</span>}
            {stats.meh > 0 && <span className="text-muted">그저 그래 {stats.meh}</span>}
            {stats.dropped > 0 && <span className="text-danger">포기 {stats.dropped}</span>}
          </div>
        )}
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
      </section>

      {/* 초기화 확인 모달 */}
      {confirmReset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6 animate-fade-in"
          style={{ background: "var(--bg-overlay-heavy)" }}
          onClick={() => setConfirmReset(false)}
        >
          <div
            className="w-full max-w-[320px] p-5 bg-surface-raised rounded-xl"
            style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-bold">정말 초기화할까요?</h3>
            <p className="text-sm text-secondary mt-2">
              저장한 작품 {savedCount}편, 시청 기록 {stats.total}편이 모두 사라져요. 이 동작은 되돌릴 수 없어요.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setConfirmReset(false)}
                className="flex-1 py-3 text-sm bg-surface rounded-lg text-secondary"
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
              boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
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

      <BottomNav active="profile" />
    </div>
  );
}
