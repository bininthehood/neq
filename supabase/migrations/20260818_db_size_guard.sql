-- DB 크기 가드 (2026-08-18)
--
-- 배경: 2026-08-17 밤 Supabase Free 500MB 한도 초과로 프로젝트가 `exceed_db_size_quota`
-- 제한을 받아 데이터 API 전체가 HTTP 402 로 차단됨. 크롤 파이프라인이 유입만 있고
-- 방출·상한이 없어 발생한 구조적 사고.
--
-- 이 함수는 크롤 스크립트가 "지금 더 받아도 되는지" 를 매 실행 앞에서 스스로 판단하게
-- 한다. PostgREST 로는 임의 SQL 을 돌릴 수 없어 RPC 로 노출한다.
--
-- 적용: Supabase SQL Editor 에 이 파일 내용을 붙여 실행.
-- 검증: SELECT public.db_size_bytes();  → bigint (byte)

CREATE OR REPLACE FUNCTION public.db_size_bytes()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT pg_database_size(current_database());
$$;

COMMENT ON FUNCTION public.db_size_bytes() IS
  '현재 데이터베이스 총 크기(byte). 크롤 스크립트의 유입 가드용 — scripts/lib/db-guard.ts';

-- service_role 만 호출 (크롤 스크립트 전용). anon/authenticated 는 알 필요 없음.
REVOKE ALL ON FUNCTION public.db_size_bytes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.db_size_bytes() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.db_size_bytes() TO service_role;
