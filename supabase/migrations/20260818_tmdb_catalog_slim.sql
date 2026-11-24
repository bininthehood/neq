-- tmdb_catalog 슬림화 (2026-08-18)
--
-- 배경: 2026-08-17 Free 500MB 초과 사고. tmdb_catalog 가 TMDB 우주 전체
-- (약 140만 행, 270MB)를 보관하고 있었는데, 요청 경로에서 이 테이블을 읽는 곳은
-- `api/tmdb/genre-top` 과 `api/tmdb/related` 두 곳뿐이고 둘 다
-- **이미 미러에 있는 작품의 popularity** 만 조회한다. 140만 행을 숫자 한 칸 때문에
-- 들고 있던 셈.
--
-- 역할 재정의: "TMDB 에 존재하는 모든 작품" → "미러가 보유(또는 큐에 예약)한
-- 작품의 popularity". 우주 전체는 TMDB Daily Export 를 매일 스트림으로 읽는다
-- (scripts/tmdb-catalog-sync.ts, 2026-08-18 재작성).
--
-- 사고 대응 시 운영 DB 에는 아래와 동등한 작업을 이미 수행했다 (270MB → 9.7MB):
--   CREATE TABLE tmdb_catalog_slim AS
--     SELECT c.tmdb_id, c.media_type, c.popularity
--     FROM tmdb_catalog c JOIN tmdb_metadata m USING (tmdb_id, media_type);
--   DROP TABLE tmdb_catalog;
--   ALTER TABLE tmdb_catalog_slim RENAME TO tmdb_catalog;
--
-- 이 파일은 신규 환경(미러 프로젝트 등)에서 20260424_tmdb_mirror.sql 다음에
-- 실행해 같은 형태를 만든다.

ALTER TABLE tmdb_catalog
  DROP COLUMN IF EXISTS adult,
  DROP COLUMN IF EXISTS last_export,
  DROP COLUMN IF EXISTS deleted;

-- genre-top / related 의 조회 패턴: media_type 고정 + tmdb_id IN (...)
CREATE INDEX IF NOT EXISTS idx_catalog_lookup
  ON tmdb_catalog (media_type, tmdb_id);

COMMENT ON TABLE tmdb_catalog IS
  '미러 보유/예약 작품의 popularity. TMDB 우주 전체가 아니다 — 유입은 '
  'scripts/tmdb-catalog-sync.ts 가 Daily Export 스트림에서 상위 N개만 채택한다.';
