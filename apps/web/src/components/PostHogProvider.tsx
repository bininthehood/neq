"use client";

import { useEffect, useRef } from "react";
import posthog from "posthog-js";
import { getDeviceId } from "@/lib/device-id";

/**
 * PostHog 초기화 + deviceId를 distinct_id로 연결.
 * 나중에 계정 시스템이 생기면 posthog.identify(userId)로 deviceId를 실제 사용자에 연결할 수 있음.
 */
export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  const initedRef = useRef(false);

  useEffect(() => {
    if (initedRef.current) return; // React Strict Mode 이중 실행 방지
    initedRef.current = true;

    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return; // 키가 없으면 초기화 안 함 (개발/테스트 환경)

    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      person_profiles: "identified_only", // 익명 사용자는 프로필 생성 안 함 (비용 절감)
      capture_pageview: true,
      capture_pageleave: true,
      loaded: (ph) => {
        // 익명 deviceId를 distinct_id로 사용 (세션 간 유지)
        const deviceId = getDeviceId();
        if (deviceId && ph.get_distinct_id() !== deviceId) {
          ph.identify(deviceId);
        }
      },
    });
  }, []);

  return <>{children}</>;
}
