/**
 * PostHogProvider — neko 네이티브용 wrapper.
 *
 * - 환경 변수에 키가 없으면 children만 그대로 렌더 (no-op).
 * - 키가 있으면 PostHog client를 한 번만 만들어 lib/analytics.ts 에 주입.
 *   이후 어디서든 `track('event', { ... })` 호출이 그 client 로 캡처된다.
 * - autocapture 는 SDK 기본값 (captureScreens=true, captureTouches=false,
 *   captureAppLifecycleEvents=true). Stage4 위임 D7 단계에서는 별도 튜닝 안 함.
 */
import { useEffect, useMemo } from 'react';
import {
  PostHog,
  PostHogProvider as RNPostHogProvider,
} from 'posthog-react-native';
import { env } from '../lib/env';
import { attachPostHogInstance, detachPostHogInstance } from '../lib/analytics';

interface Props {
  children: React.ReactNode;
}

export default function PostHogProvider({ children }: Props): React.ReactElement {
  const client = useMemo<PostHog | null>(() => {
    if (!env.POSTHOG_KEY) return null;
    try {
      return new PostHog(env.POSTHOG_KEY, {
        host: env.POSTHOG_HOST,
        // 익명 사용자는 person profile 생성 안 함 (web과 동일 정책 — 비용 절감)
        enableSessionReplay: false,
      });
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!client) return;
    attachPostHogInstance(client);
    return () => {
      detachPostHogInstance();
    };
  }, [client]);

  if (!client) {
    // 키 미설정 → analytics no-op. provider 없이 children만 렌더.
    return <>{children}</>;
  }

  return <RNPostHogProvider client={client}>{children}</RNPostHogProvider>;
}
