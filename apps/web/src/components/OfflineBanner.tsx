"use client";

/**
 * OfflineBanner — D7 / Round 3 v2 N-01.
 *
 * navigator.onLine 을 구독해서 오프라인일 때 화면 최상단에 띄우는 비차단 배너.
 * - 캐시된 저장 작품은 그대로 동작한다는 정보 전달
 * - "다시 시도" 클릭 → window.location.reload()
 * - online 으로 복귀 시 자동 해제 + 자축 토스트 한 번
 *
 * 명세: neko-edge-cases.jsx OfflineBanner — slide-in 350ms, warning dot pulse,
 *      surface-2 배경, hair border-bottom, accent retry CTA.
 */

import { useEffect, useState } from "react";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    // setMounted + 초기 offline 검사를 한 번에 — cascading render 회피
    const initial = !navigator.onLine;
    requestAnimationFrame(() => {
      setMounted(true);
      setOffline(initial);
    });

    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (!mounted || !offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full flex items-center gap-2.5 px-5 py-2.5 shrink-0"
      style={{
        background: "var(--surface-raised)",
        borderBottom: "1px solid var(--border)",
        animation: "neqOfflineSlide 0.35s cubic-bezier(0.25, 1, 0.5, 1) both",
      }}
    >
      <span
        aria-hidden="true"
        className="inline-block w-2 h-2 rounded-full shrink-0"
        style={{
          background: "var(--warning)",
          animation: "neqOfflinePulse 1.6s ease-in-out infinite",
        }}
      />
      <p
        className="flex-1 text-xs leading-tight"
        style={{ color: "var(--text-primary)", letterSpacing: "-0.005em" }}
      >
        오프라인 모드.{" "}
        <span style={{ color: "var(--accent)" }}>저장한 작품</span>은 그대로
        있어요.
      </p>
      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined") window.location.reload();
        }}
        aria-label="네트워크 다시 시도"
        className="font-data text-[10px] uppercase tracking-widest active:scale-95 transition-transform shrink-0 px-2 py-1 rounded min-h-[44px] min-w-[44px] inline-flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
        style={{
          color: "var(--accent)",
          letterSpacing: "0.15em",
        }}
      >
        다시 시도
      </button>
      <style>{`
        @keyframes neqOfflineSlide {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
        @keyframes neqOfflinePulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
