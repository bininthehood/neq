-- P1 추천 리팩토링 — tmdb_metadata 임베딩 HNSW 인덱스
--
-- ⚠️ 적용 순서: 20260624_tmdb_embedding_column.sql → scripts/tmdb-embed-sync.ts 백필 완료 → **이 파일**.
--   빈 컬럼에 인덱스 생성은 무의미 + 백필 중 인덱스 유지비용 회피 → 백필 후 1회 생성.
--
-- 파라미터: pgvector 문서 기본값(m=16, ef_construction=64)에서 출발 — 검증된 튜닝값 아님.
--   백필 후 recall@k vs latency 실측해 m / hnsw.ef_search 조정.
--   설계: _workspace/09_p1-embedding-infra-plan-2026-06-23.md §5
--
-- partial: providers IS NOT NULL (KR 스트리밍 모집단 ~17K 만 인덱싱 → 크기 축소,
--   모든 추천 쿼리가 동일 predicate 포함하므로 planner 활용 보장).
--
-- 적용 명령(Supabase SQL Editor, 단일 statement — CONCURRENTLY 는 트랜잭션 밖):
--   CREATE INDEX CONCURRENTLY ...  (아래 그대로 Run)
-- 적용 후 쿼리 세션에서: SET hnsw.ef_search = 40;  (recall/latency 트레이드, 실측 튜닝)

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metadata_embedding_hnsw
  ON tmdb_metadata USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE providers IS NOT NULL;

-- 검증: 임베딩 retrieval 이 인덱스를 타는지
--   EXPLAIN ANALYZE
--   SELECT tmdb_id FROM tmdb_metadata
--   WHERE providers IS NOT NULL
--   ORDER BY embedding <=> (SELECT embedding FROM tmdb_metadata WHERE tmdb_id = <seed> LIMIT 1)
--   LIMIT 100;
--   → "Index Scan using idx_metadata_embedding_hnsw" 가 plan 에 나타나면 성공.
