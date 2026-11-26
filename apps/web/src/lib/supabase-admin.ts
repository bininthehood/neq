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

/**
 * 집 미러(로컬 PostgREST)가 응답하지 않을 때 호스팅(메인 프로젝트)의 미러 테이블로 넘긴다.
 * Mac 꺼짐·로그인 대기는 Cloudflare 530, 터널만 살아 있으면 502, 그 밖에 무응답·연결 거부.
 * 우회가 없으면 호출처 fallback(TMDB/LLM)으로 추천이 20~55초까지 늘어난다 (2026-11-25 실측).
 *
 * - 응답 헤더까지 3초 안에 오지 않거나 5xx·네트워크 오류면 같은 요청을 호스팅으로 보낸다.
 * - 한 번 실패하면 60초 동안 집 미러를 건너뛴다. 그 뒤 첫 요청이 다시 집 미러를 시도한다.
 * - 4xx(토큰·권한 오류)와 호출자 취소는 넘기지 않는다. 설정 오류는 드러나야 한다.
 * - 벡터 RPC 는 넘기지 않고 바로 실패시킨다 (아래 toMain 참고).
 * ponytail: 인스턴스별 메모리 상태 — 인스턴스마다 첫 요청 하나는 실패를 직접 겪는다.
 */
const HOME_HEADERS_TIMEOUT_MS = 3000;
const HOME_SKIP_MS = 60_000;
let homeDownUntil = 0;

const homeWithFailover =
  (mainUrl: string, mainKey: string): typeof fetch =>
  async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const toMain = () => {
      // 호스팅에는 벡터 인덱스가 없어(2026-08-18 DROP) 3초를 더 기다린 뒤 실패할 뿐이다.
      // 바로 오류를 내면 호출처가 대체 SQL 로 넘어간다. POST 라 postgrest-js 재시도도 없다.
      if (url.includes("/rpc/match_tmdb_by_embedding")) {
        return Promise.reject(new Error("home mirror down; hosted mirror has no vector index"));
      }
      const headers = new Headers(init?.headers);
      headers.set("apikey", mainKey);
      headers.set("Authorization", `Bearer ${mainKey}`);
      return mirrorFetch(false)(mainUrl + url.slice(url.indexOf("/rest/v1/")), { ...init, headers });
    };
    if (Date.now() < homeDownUntil) return toMain();

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error("home mirror headers timeout")), HOME_HEADERS_TIMEOUT_MS);
    const signal = init?.signal ? AbortSignal.any([init.signal, ac.signal]) : ac.signal;
    let reason: string;
    try {
      const res = await mirrorFetch(true)(input, { ...init, signal });
      if (res.status < 500) return res;
      await res.body?.cancel();
      reason = `HTTP ${res.status}`;
    } catch (err) {
      if (init?.signal?.aborted) throw err;
      reason = String(err);
    } finally {
      clearTimeout(timer);
    }
    homeDownUntil = Date.now() + HOME_SKIP_MS;
    console.warn(`[mirror] 집 미러 실패(${reason}) → ${HOME_SKIP_MS / 1000}초간 호스팅 미러 사용`);
    return toMain();
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
  const mainUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const mainKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (restUrl && restToken) {
    // 메인 env 가 없으면 우회할 곳이 없으므로 집 미러만 쓴다.
    const fetch = mainUrl && mainKey ? homeWithFailover(mainUrl, mainKey) : mirrorFetch(true);
    _mirror = createClient(restUrl, restToken, { auth, db, global: { fetch } });
    return _mirror;
  }

  const url = process.env.MIRROR_SUPABASE_URL;
  const serviceKey = process.env.MIRROR_SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) {
    _mirror = createClient(url, serviceKey, { auth, db, global: { fetch: mirrorFetch(false) } });
    return _mirror;
  }

  // 분리 전/롤백 시 — 기존 프로젝트를 그대로 사용. 벡터 RPC 외에는 제한을 두지 않는다 (기존 거동).
  if (!mainUrl || !mainKey) return supabaseAdmin(); // env 누락 → throw
  _mirror = createClient(mainUrl, mainKey, { auth, global: { fetch: mirrorFetch(false) } });
  return _mirror;
}
