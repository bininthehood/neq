"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasOnboarded } from "@/lib/store";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(hasOnboarded() ? "/discover" : "/onboarding");
  }, [router]);

  return null;
}
