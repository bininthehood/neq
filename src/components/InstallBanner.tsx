"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { IconClose } from "./Icons";

export default function InstallBanner() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const deferredPrompt = useRef<Event | null>(null);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    const dismissed = localStorage.getItem("neq_install_dismissed");
    if (dismissed && Date.now() - Number(dismissed) < 24 * 60 * 60 * 1000) return;

    const ua = navigator.userAgent;
    const nav = navigator as Navigator & { standalone?: boolean };
    if (/iPhone|iPad|iPod/.test(ua) && !nav.standalone) {
      setPlatform("ios");
      setShow(true);
    } else if (/Android/.test(ua)) {
      setPlatform("android");
      const handler = (e: Event) => {
        e.preventDefault();
        deferredPrompt.current = e;
        setCanInstall(true);
        setShow(true);
      };
      window.addEventListener("beforeinstallprompt", handler);
      const timer = setTimeout(() => setShow(true), 3000);
      return () => {
        window.removeEventListener("beforeinstallprompt", handler);
        clearTimeout(timer);
      };
    }
  }, []);

  const handleInstall = async () => {
    if (platform === "android" && deferredPrompt.current) {
      const prompt = deferredPrompt.current as Event & { prompt: () => Promise<void> };
      await prompt.prompt();
      deferredPrompt.current = null;
    }
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem("neq_install_dismissed", String(Date.now()));
  };

  if (!show) return null;

  return (
    <div
      className="fixed bottom-20 left-4 right-4 z-40 p-4 flex items-start gap-3 animate-fade-in max-w-[480px] mx-auto bg-surface border border-border rounded-lg"
      style={{
        boxShadow: "0 8px 32px rgba(12,10,9,0.6)",
      }}
    >
      <Image src="/icon-192.png" alt="neq" width={48} height={48} className="flex-shrink-0 rounded-md" unoptimized />
      <div className="flex-1 min-w-0">
        <div className="font-display font-bold text-sm">neq, 앱으로 열기</div>
        {platform === "ios" ? (
          <p className="text-xs mt-1 text-secondary">
            하단 <span className="text-foreground">공유(↑)</span> 버튼 → <span className="text-foreground">홈 화면에 추가</span>
          </p>
        ) : (
          <p className="text-xs mt-1 text-secondary">
            홈 화면에 추가하면 앱처럼 사용할 수 있어요
          </p>
        )}
        {platform === "android" && canInstall && (
          <button
            onClick={handleInstall}
            className="mt-2 px-4 py-1.5 text-xs font-semibold active:scale-95 transition-transform bg-accent text-background rounded-full"
          >
            설치하기
          </button>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 w-11 h-11 flex items-center justify-center text-muted"
      >
        <IconClose size={14} />
      </button>
    </div>
  );
}
