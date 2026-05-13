/**
 * 네이티브 앱 환경 설정.
 * `app.config.ts`의 `extra`나 `EXPO_PUBLIC_*` 환경변수로 오버라이드 가능.
 */
import Constants from 'expo-constants';

function pick(key: string, fallback: string): string {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const fromExtra = typeof extra?.[key] === 'string' ? (extra[key] as string) : undefined;
  const fromEnv = process.env[`EXPO_PUBLIC_${key}`];
  return fromExtra || fromEnv || fallback;
}

export const env = {
  // Vercel에 배포된 Next.js API 서버
  API_BASE_URL: pick('API_BASE_URL', 'https://neko-ecru.vercel.app'),
  SUPABASE_URL: pick('SUPABASE_URL', ''),
  SUPABASE_ANON_KEY: pick('SUPABASE_ANON_KEY', ''),
  // PostHog — 키가 비어 있으면 analytics는 no-op 처리 (개발/테스트 안전)
  POSTHOG_KEY: pick('POSTHOG_KEY', ''),
  POSTHOG_HOST: pick('POSTHOG_HOST', 'https://us.i.posthog.com'),
} as const;

// ─────────────────────────────────────────────
// Feature Flags — Onboarding V2 (P0-1, P0-2 위임 D4b)
//
// web `apps/web/src/lib/env.ts` 의 readFlag 패턴과 동일.
// EXPO_PUBLIC_* 는 빌드 타임에 인라인되므로 명시적 분기 사용.
// 기본값 모두 OFF — V1 동작 100% 보존.
//
// 스펙: _workspace/onboarding-v2-spec.md §5
// ─────────────────────────────────────────────

function readFlag(name: string): boolean {
  switch (name) {
    case 'EXPO_PUBLIC_ONBOARDING_V2':
      return process.env.EXPO_PUBLIC_ONBOARDING_V2 === 'true';
    case 'EXPO_PUBLIC_TASTE_GENRES_ENABLED':
      return process.env.EXPO_PUBLIC_TASTE_GENRES_ENABLED === 'true';
    case 'EXPO_PUBLIC_OTT_WEAK_SIGNAL':
      return process.env.EXPO_PUBLIC_OTT_WEAK_SIGNAL === 'true';
    default:
      return false;
  }
}

export function isTasteGenresEnabled(): boolean {
  return readFlag('EXPO_PUBLIC_TASTE_GENRES_ENABLED');
}

export function isOttWeakSignalEnabled(): boolean {
  return readFlag('EXPO_PUBLIC_OTT_WEAK_SIGNAL');
}
