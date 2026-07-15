-- related seeds 백필용 pending partial index
--
-- 배경:
--   tmdb-backfill-related-seeds.ts 의 pull 쿼리
--     WHERE related_seeds_fetched_at IS NULL AND tmdb_id > cursor
--     ORDER BY tmdb_id, media_type LIMIT 500
--   가 인덱스 없이는 PostgREST statement timeout (dry-run 첫 pull 부터 실패 실측).
--   embedding 백필의 idx_metadata_providers_keyset 과 동일 패턴.
--
-- 특성:
--   partial index 라 백필이 진행될수록 자동 축소, 완주 후엔 사실상 빈 인덱스 (유지비 ~0).
--   백필 완료 후 DROP 해도 무방하나 마커 NULL 잔존 확인 쿼리에도 쓰이므로 유지 권장.
--
-- 사용법: Supabase SQL Editor 또는 psql 로 실행 (멱등).

CREATE INDEX IF NOT EXISTS idx_metadata_related_seeds_pending
  ON tmdb_metadata (tmdb_id, media_type)
  WHERE related_seeds_fetched_at IS NULL;
