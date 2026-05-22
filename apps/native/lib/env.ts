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

// 2026-05-22 — TASTE_GENRES_ENABLED / OTT_WEAK_SIGNAL / ONBOARDING_V2 는
// default ON 으로 전환됨 (flag 분기 자체 제거). EAS Build env 미등록 시에도 ON.
// 후속 flag 추가 시 본 파일에 명시 readFlag 패턴 추가.
