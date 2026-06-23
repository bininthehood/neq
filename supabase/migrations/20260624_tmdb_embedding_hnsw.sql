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

-- ⚠️ SQL Editor upstream(프록시) timeout 주의: 25K+ 벡터 HNSW 빌드는 에디터 HTTP 제한을
--   초과할 수 있음(CONCURRENTLY 여도 에디터는 완료까지 대기 → 잘림). 두 경로 중 택1:
--
--   [A] IVFFlat (에디터 친화 — 빌드 수초, 권장 단기):
--       25K 규모는 IVFFlat 로 충분. lists≈sqrt(N)≈160. 쿼리 시 SET ivfflat.probes = 10.
CREATE INDEX IF NOT EXISTS idx_metadata_embedding_ivf
  ON tmdb_metadata USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 160)
  WHERE providers IS NOT NULL;

--   [B] HNSW (더 높은 recall — 직접 연결 필요): 에디터 대신 psql 직결(프록시 timeout 없음).
--       psql "postgresql://postgres:[DB_PASSWORD]@db.<ref>.supabase.co:5432/postgres" \
--         -c "SET maintenance_work_mem='1GB';" \
--         -c "CREATE INDEX CONCURRENTLY idx_metadata_embedding_hnsw \
--             ON tmdb_metadata USING hnsw (embedding vector_cosine_ops) \
--             WITH (m=16, ef_construction=64) WHERE providers IS NOT NULL;"
--   P2 에서 retrieval recall/latency 측정 후 IVFFlat→HNSW 승격 결정. (둘 중 하나만 있으면 됨)

-- 검증: 임베딩 retrieval 이 인덱스를 타는지
--   EXPLAIN ANALYZE
--   SELECT tmdb_id FROM tmdb_metadata
--   WHERE providers IS NOT NULL
--   ORDER BY embedding <=> (SELECT embedding FROM tmdb_metadata WHERE tmdb_id = <seed> LIMIT 1)
--   LIMIT 100;
--   → "Index Scan using idx_metadata_embedding_hnsw" 가 plan 에 나타나면 성공.
