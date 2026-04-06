"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasOnboarded } from "@/lib/store";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (hasOnboarded()) {
      router.replace("/discover");
    } else {
      router.replace("/onboarding");
    }
  }, [router]);

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-2xl font-bold">🐱 Neko</div>
    </div>
  );
}
