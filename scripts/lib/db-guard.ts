/**
 * DB 크기 가드 — 크롤 파이프라인의 자기 제한 장치.
 *
 * 배경: 2026-08-17 밤 Supabase Free 500MB 초과로 프로젝트 전체가 HTTP 402 차단.
 * 크롤이 유입만 있고 상한·방출이 없어 4개월 만에 한도에 닿은 구조적 사고였다.
 * 모든 크롤 스크립트가 실행 앞에서 이 가드를 물어보고 스스로 멈춘다.
 *
 * 단계:
 *   ok        — 정상 진행
 *   refreshOnly — 신규 유입 중단, 갱신(TTL)만 수행. 180일 재fetch 는 TMDB 라이선스
 *                 의무라 여기서도 멈추지 않는다.
 *   halt      — 전부 중단
 *
 * 임계는 Free 500MB 기준. 유료 전환 시 env 로 올린다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const MB = 1024 * 1024;

/** 신규 유입 중단선 (기본 420MB = 한도의 84%) */
export const REFRESH_ONLY_BYTES =
  Number(process.env.DB_GUARD_REFRESH_ONLY_MB ?? "420") * MB;

/** 전면 중단선 (기본 460MB = 한도의 92%) */
export const HALT_BYTES = Number(process.env.DB_GUARD_HALT_MB ?? "460") * MB;

export type GuardLevel = "ok" | "refreshOnly" | "halt";

export type GuardResult = {
  level: GuardLevel;
  bytes: number | null;
  /** 로그용 사람이 읽는 요약 */
  summary: string;
};

function mb(bytes: number): string {
  return `${(bytes / MB).toFixed(1)}MB`;
}

/**
 * 현재 DB 크기를 조회해 진행 단계를 판정한다.
 *
 * 조회 실패 시 `ok` 로 degrade — 가드가 크롤을 막는 원인이 되면 안 된다.
 * (RPC 미적용 환경, 일시적 네트워크 오류 등. 실패는 로그로 남긴다.)
 */
export async function checkDbGuard(
  admin: SupabaseClient,
  tag: string,
): Promise<GuardResult> {
  const { data, error } = await admin.rpc("db_size_bytes");

  if (error || typeof data !== "number") {
    const reason = error?.message ?? `예상치 못한 응답: ${JSON.stringify(data)}`;
    console.warn(
      `[${tag}] DB 크기 조회 실패 — 가드 없이 진행 (${reason}). ` +
        `supabase/migrations/20260818_db_size_guard.sql 적용 여부 확인 필요.`,
    );
    return { level: "ok", bytes: null, summary: "크기 미상 (가드 skip)" };
  }

  const bytes = data;
  const level: GuardLevel =
    bytes >= HALT_BYTES ? "halt" : bytes >= REFRESH_ONLY_BYTES ? "refreshOnly" : "ok";

  const summary =
    level === "halt"
      ? `${mb(bytes)} ≥ ${mb(HALT_BYTES)} — 전면 중단`
      : level === "refreshOnly"
        ? `${mb(bytes)} ≥ ${mb(REFRESH_ONLY_BYTES)} — 신규 유입 중단, 갱신만`
        : `${mb(bytes)} / 유입 한계 ${mb(REFRESH_ONLY_BYTES)}`;

  return { level, bytes, summary };
}

/**
 * 신규 유입 스크립트용 헬퍼 — `refreshOnly` 이상이면 종료해야 한다.
 * 종료 사유를 로그로 남기고 boolean 반환 (호출부에서 `return` 하도록).
 */
export async function shouldSkipIngest(
  admin: SupabaseClient,
  tag: string,
): Promise<boolean> {
  const guard = await checkDbGuard(admin, tag);
  console.log(`[${tag}] db-guard: ${guard.summary}`);
  if (guard.level === "ok") return false;
  console.warn(
    `[${tag}] 신규 유입 skip — DB 크기 임계 도달. 방출/정리 후 재개할 것.`,
  );
  return true;
}
