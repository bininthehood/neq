-- P1 백필 가속 — providers≠null 키셋 페이지네이션용 partial 인덱스
--
-- 문제: scripts/tmdb-embed-sync.ts 의 pull 이
--   `WHERE providers IS NOT NULL AND tmdb_id > cursor ORDER BY tmdb_id, media_type LIMIT 1000`.
--   providers 는 인덱스 없는 JSONB 이고 providers≠null 은 전체의 ~15%(17K/113K)로 흩어져 있어,
--   한 페이지(1000) 채우려 ~6700행 heap 스캔 → 단일 쿼리 statement timeout 초과(백필 1800~2000건에서 실패).
--
-- 해법: providers≠null 행만 (tmdb_id, media_type) 순으로 담는 partial 복합 인덱스.
--   keyset 쿼리가 이 인덱스로 정확히 1000 엔트리만 범위 스캔 → 밀도 무관, tail 페이지도 즉시.
--   파셜이라 ~17K 만 인덱싱(소형, 빌드 수초).
--
-- ⚠️ 적용 순서: 이 인덱스 → 백필(`scripts/tmdb-embed-sync.ts`) → embedding hnsw 인덱스.
--   적용(Supabase SQL Editor, 단일 statement):

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metadata_providers_keyset
  ON tmdb_metadata (tmdb_id, media_type)
  WHERE providers IS NOT NULL;

-- 검증:
--   EXPLAIN ANALYZE
--   SELECT tmdb_id FROM tmdb_metadata
--   WHERE providers IS NOT NULL AND tmdb_id > 0
--   ORDER BY tmdb_id, media_type LIMIT 1000;
--   → "Index Scan using idx_metadata_providers_keyset" 면 성공.
