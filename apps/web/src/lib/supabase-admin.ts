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
 * 서버에서만 읽으므로 별도 프로젝트로 뺀다. 장애 범위 분리가 목적이며,
 * 무료 용량 증가는 보장되지 않는다 (조직 합산 Fair Use 제한 확인 필요).
 *
 * 대상 테이블: tmdb_metadata / tmdb_catalog / tmdb_crawl_queue,
 *              RPC: match_tmdb_by_embedding
 * tmdb_provider_snapshots 는 메인 프로젝트에 둔다 (saved_items 파생).
 *
 * env 미설정 시 메인 프로젝트로 fallback — 분리 전에도 이 코드가 그대로 돌고,
 * 문제가 생기면 env 두 개를 지우는 것만으로 즉시 롤백된다.
 */
let _mirror: SupabaseClient | null = null;

/**
 * 벡터 RPC 상한. 인덱스가 있으면 1초 안에 끝난다. 2026-08-18 호스팅 인덱스 DROP 이후
 * 매 호출이 함수의 15s statement_timeout 까지 매달린 뒤에야 fallback 으로 넘어갔다.
 * ponytail: 클라이언트만 끊는다 — DB 쪽 문장은 자체 statement_timeout 까지 계속 돈다.
 */
const VECTOR_RPC_TIMEOUT_MS = 3000;

const mirrorFetch =
  (stripRestPrefix: boolean): typeof fetch =>
  (input, init) => {
    let url = input instanceof Request ? input.url : String(input);
    // supabase-js 는 항상 `/rest/v1` 을 붙인다. 단독 PostgREST 는 루트에서 서빙하므로 떼어 낸다.
    if (stripRestPrefix) url = url.replace("/rest/v1/", "/");
    if (!url.includes("/rpc/match_tmdb_by_embedding")) return fetch(url, init);
    const timeout = AbortSignal.timeout(VECTOR_RPC_TIMEOUT_MS);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetch(url, { ...init, signal });
  };

export function supabaseMirror(): SupabaseClient {
  if (_mirror) return _mirror;
  const auth = { persistSession: false, autoRefreshToken: false };
  // 명시된 미러가 응답하지 않을 때의 상한. AbortError 라 postgrest-js 재시도(1·2·4s)를 타지 않는다.
  // 추천의 대체 SQL 이 정상일 때도 2.9s 걸려(1.6MB) 벡터 RPC 보다 길게 잡는다.
  const db = { timeout: Number(process.env.MIRROR_TIMEOUT_MS ?? "8000") };

  // 2026-11-23 — 로컬 미러 직접 서빙: 읽기 전용 PostgREST(scripts/local-mirror-serve.sh)를
  // Cloudflare Tunnel 로 노출. 설정 시 MIRROR_SUPABASE_* 보다 우선한다.
  const restUrl = process.env.MIRROR_POSTGREST_URL;
  const restToken = process.env.MIRROR_POSTGREST_TOKEN;
  if (restUrl && restToken) {
    _mirror = createClient(restUrl, restToken, { auth, db, global: { fetch: mirrorFetch(true) } });
    return _mirror;
  }

  const url = process.env.MIRROR_SUPABASE_URL;
  const serviceKey = process.env.MIRROR_SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) {
    _mirror = createClient(url, serviceKey, { auth, db, global: { fetch: mirrorFetch(false) } });
    return _mirror;
  }

  // 분리 전/롤백 시 — 기존 프로젝트를 그대로 사용. 벡터 RPC 외에는 제한을 두지 않는다 (기존 거동).
  const mainUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const mainKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!mainUrl || !mainKey) return supabaseAdmin(); // env 누락 → throw
  _mirror = createClient(mainUrl, mainKey, { auth, global: { fetch: mirrorFetch(false) } });
  return _mirror;
}
