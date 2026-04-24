import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 서버 전용 Supabase 클라이언트 (service_role key).
 * RLS를 bypass하므로 절대 브라우저로 노출하지 말 것.
 * cron / 관리자 API에서만 사용.
 */
let _admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "supabaseAdmin: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락",
    );
  }
  _admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
