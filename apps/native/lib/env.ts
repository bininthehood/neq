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
} as const;
