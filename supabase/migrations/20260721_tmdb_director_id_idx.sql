-- TMDB related 미러 보강 Phase 2: director_tmdb_id 인덱스
--
-- 배경:
--   Phase 2 트랙1 — /api/tmdb/related 의 directorWorks 를 TMDB getPersonCredits 직접호출
--   에서 tmdb_metadata(director_tmdb_id 매칭) 미러 조회로 치환.
--   route: apps/web/src/app/api/tmdb/related/route.ts resolveDirectorWorks()
--     SELECT ... FROM tmdb_metadata WHERE media_type = ? AND director_tmdb_id = ? LIMIT 60
--
--   Phase 1 마이그레이션(20260715)은 "related 라우트는 PK 단건 조회만" 이라 director_tmdb_id
--   인덱스를 의도적으로 보류했다. Phase 2 에서 director_tmdb_id 를 필터 술어로 쓰기 시작하므로
--   그 후속 인덱스가 이 파일이다.
--
--   실측(2026-07-21, prod REST, 봉준호 dir_id=21684, ~50K movie 행):
--     인덱스 없음(seq-scan): cold 1270ms → warm 130~330ms (페이지 워밍 의존, cold spike 큼)
--   btree (media_type, director_tmdb_id) 인덱스 시 index-scan 으로 한 자릿수 ms 예상.
--   directorWorks 는 매 related 호출 경로라 인덱스 부재 = 상시 seq-scan → Phase 2 latency
--   목표(100~200ms) 를 이 트랙 혼자 초과할 수 있음.
--
-- partial WHERE director_tmdb_id IS NOT NULL:
--   조회는 항상 특정 dir_id(=NOT NULL) 매칭이고, TV/감독미상 다수 행이 NULL 이라
--   partial 로 인덱스 크기 축소 + 대상 행만 인덱싱.
--
-- ⚠️ 적용: 인프라/사용자 직접 영역. 본 파일은 작성만 — prod 적용은 사용자.
--   멱등(IF NOT EXISTS). CONCURRENTLY 는 트랜잭션 밖이어야 하므로 단일 statement 로 실행.
--   Supabase SQL Editor:
--     CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metadata_director_tmdb_id
--       ON tmdb_metadata (media_type, director_tmdb_id)
--       WHERE director_tmdb_id IS NOT NULL;
--   (에디터 timeout 시 psql 직결 — 인덱스 규모 작아(≈100K 이하) 문제 소지 낮음)

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metadata_director_tmdb_id
  ON tmdb_metadata (media_type, director_tmdb_id)
  WHERE director_tmdb_id IS NOT NULL;

-- 검증 (적용 후):
--   EXPLAIN ANALYZE
--   SELECT tmdb_id, title, poster_path, release_date, rating
--   FROM tmdb_metadata
--   WHERE media_type = 'movie' AND director_tmdb_id = 21684
--   LIMIT 60;
--   → "Index Scan using idx_metadata_director_tmdb_id" 가 plan 에 나타나면 성공
--     (기존 "Seq Scan on tmdb_metadata ... Filter: director_tmdb_id = 21684" 대체).
