/**
 * 네이티브 앱 환경 설정.
 * `app.config.ts`의 `extra`나 `EXPO_PUBLIC_*` 환경변수로 오버라이드 가능.
 *
 * 2026-05-27 — root cause fix: metro bundler 의 EXPO_PUBLIC inline plugin 은
 * **literal access (`process.env.EXPO_PUBLIC_*`)** 만 빌드 시점에 실제 값으로
 * 변환. 기존 코드의 dynamic key (`process.env[`EXPO_PUBLIC_${key}`]`) 는
 * production build 에서 inline 안 되어 runtime 에 undefined → Supabase
 * createClient throw → SIGABRT. 모든 변수를 명시적 literal 로 capture 후
 * lookup table 로 사용.
 */
import Constants from 'expo-constants';

// Metro 가 빌드 시점에 각 right-hand side 를 실제 값으로 변환.
// EAS Build 의 build profile env (또는 environment) 가 worker 에 inject 한 값 사용.
const ENV_VARS: Record<string, string | undefined> = {
  API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY,
  POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
};

function pick(key: keyof typeof ENV_VARS, fallback: string): string {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const fromExtra = typeof extra?.[key] === 'string' ? (extra[key] as string) : undefined;
  return fromExtra || ENV_VARS[key] || fallback;
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
