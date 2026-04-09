"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { hasOnboarded } from "@/lib/store";
import { NekoLogo } from "@/components/Icons";

export default function Home() {
  const router = useRouter();
  const [fadeOut, setFadeOut] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    // 로고 진입 애니메이션
    requestAnimationFrame(() => setEntered(true));
    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => {
        router.replace(hasOnboarded() ? "/discover" : "/onboarding");
      }, 400);
    }, 1400);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div
      className="flex-1 flex flex-col items-center justify-center gap-4 transition-opacity duration-400 bg-background"
      style={{ opacity: fadeOut ? 0 : 1 }}
    >
      <div
        className="transition-all duration-700 ease-out"
        style={{
          transform: entered ? "scale(1) translateY(0)" : "scale(0.8) translateY(12px)",
          opacity: entered ? 1 : 0,
        }}
      >
        <NekoLogo size={72} />
      </div>
      <div
        className="flex flex-col items-center gap-1 transition-all duration-500 ease-out"
        style={{
          transform: entered ? "translateY(0)" : "translateY(8px)",
          opacity: entered ? 1 : 0,
          transitionDelay: "150ms",
        }}
      >
        <span className="font-display text-3xl font-bold text-accent">Neko</span>
        <p className="text-sm text-muted">오늘 뭐 볼까?</p>
      </div>
    </div>
  );
}
