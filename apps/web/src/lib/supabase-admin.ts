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

/**
 * TMDB 미러 전용 Supabase 클라이언트 (2026-08-18 분리).
 *
 * 배경: 2026-08-17 Free 500MB 초과로 프로젝트 전체가 차단. 원인은 미러(약 400MB)가
 * 유저 데이터(약 3MB)와 같은 프로젝트에 있었던 것. 미러는 인증·RLS가 필요 없고
 * 서버에서만 읽으므로 별도 프로젝트로 뺀다. 프로젝트당 500MB 를 각각 받는다.
 *
 * 대상 테이블: tmdb_metadata / tmdb_catalog / tmdb_crawl_queue /
 *              tmdb_provider_snapshots, RPC: match_tmdb_by_embedding
 *
 * env 미설정 시 `supabaseAdmin()` 으로 fallback — 분리 전에도 이 코드가 그대로 돌고,
 * 문제가 생기면 env 두 개를 지우는 것만으로 즉시 롤백된다.
 */
let _mirror: SupabaseClient | null = null;

export function supabaseMirror(): SupabaseClient {
  if (_mirror) return _mirror;

  const url = process.env.MIRROR_SUPABASE_URL;
  const serviceKey = process.env.MIRROR_SUPABASE_SERVICE_ROLE_KEY;

  // 분리 전/롤백 시 — 기존 프로젝트를 그대로 사용.
  if (!url || !serviceKey) return supabaseAdmin();

  _mirror = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _mirror;
}
