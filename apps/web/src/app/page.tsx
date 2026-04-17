"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasOnboarded, getSaved } from "@/lib/store";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const saved = getSaved();
    if (!hasOnboarded() && saved.length === 0) {
      router.replace("/onboarding");
    } else {
      router.replace("/discover");
    }
  }, [router]);

  return <div className="h-dvh" style={{ background: "var(--background)" }} />;
}
