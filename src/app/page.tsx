"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { hasOnboarded } from "@/lib/store";

export default function Home() {
  const router = useRouter();
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
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
      className="flex-1 flex flex-col items-center justify-center gap-3 transition-opacity duration-400"
      style={{ opacity: fadeOut ? 0 : 1, background: "var(--bg)" }}
    >
      <img src="/icon-512.png" alt="Neko" className="w-20 h-20" style={{ borderRadius: "var(--radius-xl)" }} />
      <div>
        <span className="font-display text-3xl font-bold" style={{ color: "var(--accent)" }}>Neko</span>
      </div>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>오늘 뭐 볼까?</p>
    </div>
  );
}
