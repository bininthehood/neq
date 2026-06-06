-- Phase B-3.1 (2026-06-06) — generateCandidates SQL statement timeout 회피
--
-- 배경:
--   Phase B-1 의 generateCandidates (apps/web/src/lib/candidate-generation.ts) 가
--   tmdb_metadata 에서 다음 패턴으로 후보 풀을 조회:
--     WHERE media_type = ?           -- 'movie' / 'tv'
--       AND providers IS NOT NULL    -- KR 가용 (~17K / 113K = 15%)
--       AND genre_ids && [..]        -- GIN (idx_metadata_genres) 존재
--       AND release_date BETWEEN ?   -- 선택적
--       AND country @> ARRAY['KR']   -- 선택적 (origin=kr)
--     ORDER BY rating DESC
--     LIMIT 1000
--
--   1차 로컬 dev 측정 (2026-06-06): code=57014 statement_timeout
--   원인: rating 정렬용 인덱스 부재 + media_type 인덱스 부재 → full scan + sort
--
-- 조치:
--   부분 인덱스 (providers IS NOT NULL) + (media_type, rating DESC) 복합.
--   prod 안전 — CONCURRENTLY (lock 없음). IF NOT EXISTS — 멱등.
--
-- 회귀 위험:
--   - 인덱스 추가만 — 기존 쿼리 동작 변경 0
--   - 부분 인덱스 size = ~17K row × 2 컬럼 = 수 MB 수준. write 시 maintenance 비용 미미
--
-- 적용 방법 (사용자 직접):
--   Supabase Dashboard → SQL Editor 에 본 파일 내용 붙여넣고 실행.
--   CONCURRENTLY 는 transaction 밖에서 실행되어야 하므로 BEGIN/COMMIT 없이 raw SQL.

-- Phase B 핵심 인덱스 — media_type 필터 + rating 정렬 동시 처리
-- (providers IS NOT NULL 부분 인덱스라 KR 가용 universe 17K 만 인덱싱)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metadata_kr_rating_media
  ON tmdb_metadata (media_type, rating DESC NULLS LAST)
  WHERE providers IS NOT NULL;

-- country @> ARRAY['KR'] (origin=kr 필터) 가속용 GIN
-- 사용자 필터 origin 이 자주 적용되지 않으면 효과 미미하지만 safety net
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metadata_country
  ON tmdb_metadata USING GIN (country)
  WHERE providers IS NOT NULL;
