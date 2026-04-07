"use client";

import { useState, useEffect, useRef } from "react";
import { IconClose } from "./Icons";

export default function InstallBanner() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const deferredPrompt = useRef<any>(null);

  useEffect(() => {
    // 이미 앱으로 실행 중이면 표시 안 함
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    // 이미 닫았으면 표시 안 함 (24시간 동안)
    const dismissed = localStorage.getItem("neko_install_dismissed");
    if (dismissed && Date.now() - Number(dismissed) < 24 * 60 * 60 * 1000) return;

    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua) && !("standalone" in navigator && (navigator as any).standalone)) {
      setPlatform("ios");
      setShow(true);
    } else if (/Android/.test(ua)) {
      setPlatform("android");
      // Android: beforeinstallprompt 이벤트 대기
      const handler = (e: Event) => {
        e.preventDefault();
        deferredPrompt.current = e;
        setShow(true);
      };
      window.addEventListener("beforeinstallprompt", handler);
      // 이벤트가 안 오더라도 3초 후 표시
      const timer = setTimeout(() => setShow(true), 3000);
      return () => {
        window.removeEventListener("beforeinstallprompt", handler);
        clearTimeout(timer);
      };
    }
  }, []);

  const handleInstall = async () => {
    if (platform === "android" && deferredPrompt.current) {
      deferredPrompt.current.prompt();
      deferredPrompt.current = null;
    }
    // iOS는 안내만 표시 (네이티브 설치 API 없음)
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem("neko_install_dismissed", String(Date.now()));
  };

  if (!show) return null;

  return (
    <div
      className="fixed bottom-20 left-4 right-4 z-40 p-4 flex items-start gap-3 animate-fade-in max-w-[480px] mx-auto"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 8px 32px rgba(12,10,9,0.6)",
      }}
    >
      <img src="/icon-192.png" alt="Neko" className="w-12 h-12 flex-shrink-0" style={{ borderRadius: "var(--radius-md)" }} />
      <div className="flex-1 min-w-0">
        <div className="font-display font-bold text-sm">Neko 앱으로 열기</div>
        {platform === "ios" ? (
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            하단 <span style={{ color: "var(--text-primary)" }}>공유(↑)</span> 버튼 → <span style={{ color: "var(--text-primary)" }}>홈 화면에 추가</span>
          </p>
        ) : (
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            홈 화면에 추가하면 앱처럼 사용할 수 있어요
          </p>
        )}
        {platform === "android" && deferredPrompt.current && (
          <button
            onClick={handleInstall}
            className="mt-2 px-4 py-1.5 text-xs font-semibold active:scale-95 transition-transform"
            style={{ background: "var(--accent)", color: "var(--bg)", borderRadius: "var(--radius-full)" }}
          >
            설치하기
          </button>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 w-11 h-11 flex items-center justify-center"
        style={{ color: "var(--text-muted)" }}
      >
        <IconClose size={14} />
      </button>
    </div>
  );
}
