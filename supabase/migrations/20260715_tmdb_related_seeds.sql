-- TMDB related 미러 보강 Phase 1: seeds 컬럼 추가
--
-- 배경:
--   /api/tmdb/related (DetailSheet 관련작) 가 seeds 단계에서 TMDB detail+credits 를
--   직접 호출(belongs_to_collection.id + 감독 person id 추출)해 왕복이 2단(seeds→related).
--   seeds 를 미러(tmdb_metadata)에서 읽으면 왕복 2→1 로 단축(0.7~1.8s → 0.4~0.9s 기대).
--   설계: _workspace/03_content_related-mirror-p1-2026-07-15.md
--
-- 사용법:
--   Supabase Dashboard → SQL Editor에 paste → Run (멱등, 재실행 안전)
--
-- 주의(적용 순서): 이 마이그레이션을 먼저 적용한 뒤 scripts/lib/tmdb-fetch.ts 변경을
--   배포할 것. 컬럼이 없으면 bulk-crawl upsert 가 실패한다.

ALTER TABLE tmdb_metadata
  -- movie 의 belongs_to_collection.id (TV 는 항상 NULL — TMDB 가 collection 미지원)
  ADD COLUMN IF NOT EXISTS collection_id BIGINT,
  -- crew[job=Director]|department=Directing 첫 항목의 person id
  ADD COLUMN IF NOT EXISTS director_tmdb_id BIGINT,
  -- seeds 확보 완료 마커. providers_fetched_at 과 동일 패턴.
  -- NULL = 아직 백필 전 → related 라우트가 TMDB 직접 경로로 fallback.
  -- NOT NULL 이면 collection_id/director_tmdb_id 가 (NULL 이더라도) "확정된 값" — 미러 hit.
  --   (TV 는 감독 미상 → 둘 다 NULL 이 정상이므로 마커로 miss 와 구분해야 fallback 를 피함)
  ADD COLUMN IF NOT EXISTS related_seeds_fetched_at TIMESTAMPTZ;

COMMENT ON COLUMN tmdb_metadata.collection_id IS
  'TMDB belongs_to_collection.id (movie 전용). related 라우트 seeds 미러화용.';
COMMENT ON COLUMN tmdb_metadata.director_tmdb_id IS
  'TMDB 감독 person id (crew job=Director). related 라우트 seeds 미러화용.';
COMMENT ON COLUMN tmdb_metadata.related_seeds_fetched_at IS
  'related seeds(collection_id/director_tmdb_id) 백필/크롤 완료 시각. NULL = 미백필 → 라우트 fallback.';

-- 인덱스 불필요: related 라우트는 PK(tmdb_id, media_type) 단건 조회만 함.
-- 백필 스크립트는 related_seeds_fetched_at IS NULL 필터 + tmdb_id 커서(keyset) 페이징 —
-- PK 순회로 충분(별도 인덱스 없이도 O(page)). 필요 시 후속 마이그레이션에서 추가.
