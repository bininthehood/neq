-- 20260623 — tmdb_metadata candidates 쿼리 가속용 복합 인덱스 (1.0.4 latency cycle 트랙 A)
--
-- 문제: /api/recommend 정상 경로의 candidate-generation.ts buildQuery 는
--   `media_type = ? AND providers IS NOT NULL [AND genre_ids && ?] ORDER BY rating DESC LIMIT N`
--   형태로 113K+ 행을 조회한다. 기존 인덱스는 idx_metadata_genres (GIN genre_ids) /
--   idx_metadata_title_trgm / idx_metadata_fetched 뿐이라, genre 필터가 없거나 약한
--   사용자는 `rating DESC` 정렬을 위해 사실상 풀 seq scan + top-N sort 를 수행.
--   게이트 0(6/22) 측정: candidates 단계 p50 ~5.6s.
--
-- 해법: providers 가용(=KR 스트리밍 모집단, 전체의 ~15%) 행만 담는 partial 복합 인덱스.
--   (media_type, rating DESC) 정렬 인덱스로 ORDER BY rating DESC LIMIT N 을 인덱스 스캔으로 처리.
--   WHERE providers IS NOT NULL partial 조건이 인덱스 크기를 ~6.6배 축소(113K→17K) + 모든
--   candidates 쿼리가 동일 predicate 를 항상 포함하므로 planner 가 무조건 활용 가능.
--
-- genre 필터 케이스(genre_ids && ?)는 기존 GIN(genre_ids) 인덱스가 bitmap scan 으로
--   처리하고, 그 결과를 이 인덱스의 정렬과 결합(bitmap + sort)하거나 planner 가 비용 기준으로
--   택일한다. genre 필터 없는 사용자(풀 seq scan 경로)가 이 인덱스의 1차 수혜 대상.
--
-- ⚠️ CONCURRENTLY: 운영 테이블 락 최소화를 위해 사용. CONCURRENTLY 는 트랜잭션 블록 안에서
--   실행 불가하므로, 이 파일은 단일 스테이트먼트로만 구성한다(BEGIN/COMMIT 없음).
--   IF NOT EXISTS 로 멱등 보장(재실행 안전).
--
-- ⚠️ 적용은 인프라/사용자 영역 — 본 파일은 작성만. prod 적용 안 함.
--   적용 명령:
--     psql "$SUPABASE_DB_URL" -f supabase/migrations/20260623_tmdb_metadata_candidates_index.sql
--   또는 Supabase SQL Editor 에 아래 한 줄 실행(CONCURRENTLY 는 Editor 의 단일 statement 권장):
--     CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metadata_candidates
--       ON tmdb_metadata (media_type, rating DESC) WHERE providers IS NOT NULL;
--   적용 후 검증:
--     EXPLAIN ANALYZE SELECT tmdb_id FROM tmdb_metadata
--       WHERE media_type = 'movie' AND providers IS NOT NULL
--       ORDER BY rating DESC LIMIT 1000;
--   → "Index Scan using idx_metadata_candidates" 가 plan 에 나타나면 성공.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metadata_candidates
  ON tmdb_metadata (media_type, rating DESC)
  WHERE providers IS NOT NULL;
