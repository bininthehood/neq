-- title_en 동등조회 인덱스 — match 미러-우선 매칭(resolveFavoritesFromMirror)의
-- `.or(title.in.(...), title_en.in.(...))` 중 title_en 분기가 무인덱스 seq scan(113k 행,
-- ~580~750ms)이라 srv_match_ms 가 기대(수십 ms) 대비 통째로 상쇄됨(2026-06-29 측정).
-- title 은 이미 idx_metadata_title_trgm(GIN trgm)이 동등조회를 서비스(~38ms) → title_en 도 동일 패턴 미러링.
-- prod 적용은 쓰기 락 회피 위해 CONCURRENTLY 권장(아래 주석). 본 멱등 버전은 신규 환경/재실행용.
CREATE INDEX IF NOT EXISTS idx_metadata_title_en_trgm
  ON tmdb_metadata USING GIN (title_en gin_trgm_ops);

-- prod 라이브 적용(크롤 동시 쓰기 중 락 회피):
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metadata_title_en_trgm
--     ON tmdb_metadata USING GIN (title_en gin_trgm_ops);
--   (CONCURRENTLY 는 트랜잭션 밖에서만 실행 가능 — Supabase SQL 에디터에 단독 실행)
