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
import Constants from 'expo-constants';
import { AccessibilityInfo, Platform } from 'react-native';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
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
        // 2026-11-27 (1.1.0) — 세션 리플레이. posthog-react-native-session-replay 네이티브 모듈 필요(새 빌드).
        // 마스킹은 SDK 기본값을 명시해 고정 (기본이 바뀌어도 꺼지지 않게). 콘솔 로그는 수집 안 함 —
        // 작품 제목 등 track 페이로드가 dev 로그에 찍히므로.
        enableSessionReplay: env.POSTHOG_REPLAY_SAMPLE_RATE > 0,
        sessionReplayConfig: {
          maskAllTextInputs: true,
          maskAllImages: true,
          maskAllSandboxedViews: true,
          captureLog: false,
          captureNetworkTelemetry: true,
          throttleDelayMs: 1000,
          sampleRate: env.POSTHOG_REPLAY_SAMPLE_RATE,
        },
        // 2026-11-27 — 모든 이벤트에 앱 버전·빌드. SDK 는 expo-application(미설치, 네이티브 모듈)이
        // 있을 때만 채우므로 빌드에 내장된 app.json 값으로 보강 → 1.1.0 vs 1.0.4 비교용.
        customAppProperties: (props) => ({
          ...props,
          $app_version: props.$app_version ?? Constants.expoConfig?.version ?? null,
          $app_build: props.$app_build ?? Constants.expoConfig?.ios?.buildNumber ?? null,
        }),
      });
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!client) return;
    attachPostHogInstance(client);
    // 2026-11-27 — 내부 사용자 표시. dev 빌드(__DEV__)만 확실히 판별된다 (스토어 빌드는 설정 안 함).
    // TestFlight 는 스토어와 같은 production 바이너리라 JS·빌드 env 로 구분 불가 (계획 결정 기록 참조).
    // 네이티브 익명 사용자는 사람 프로필이 없어 사람 속성이 저장되지 않는다 → 모든 이벤트에 붙는 슈퍼 속성으로.
    if (__DEV__) client.register({ is_internal_build: true });
    // 2026-11-27 — 실기기에서 유리가 실제로 켜졌는지 (1.1.0(49) "평평해 보임" 피드백).
    // glass_available = isLiquidGlassAvailable() 원값(iOS 26 + Xcode 26 빌드), 투명도 줄이기면 대체 면이 그려진다.
    // 슈퍼 속성이라 매 실행 덮어씀 — OS 업데이트·설정 변경도 따라간다.
    if (Platform.OS === 'ios') {
      let glass = false;
      try {
        glass = isLiquidGlassAvailable();
      } catch {}
      client.register({ glass_available: glass });
      AccessibilityInfo.isReduceTransparencyEnabled()
        .then((v) => client.register({ reduce_transparency: v }))
        .catch(() => {});
    }
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
