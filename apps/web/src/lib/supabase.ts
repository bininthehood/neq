import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

let _authReady: Promise<void> | null = null;

/**
 * 익명 인증 세션 보장.
 * 세션이 없으면 signInAnonymously()로 자동 생성.
 * 이미 세션이 있으면 (이전 anonymous 또는 향후 실명 계정) 그대로 유지.
 */
export function ensureAuth(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (_authReady) return _authReady;

  _authReady = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return;

    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error("[supabase] anonymous sign-in failed:", error.message);
      _authReady = null;
    }
  })();

  return _authReady;
}

/** 현재 인증된 사용자의 uid (auth.uid()와 동일) */
export async function getAuthUid(): Promise<string | null> {
  await ensureAuth();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}
