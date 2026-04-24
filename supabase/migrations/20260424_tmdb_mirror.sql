-- TMDB 미러 Phase 1: 스키마 + RLS
--
-- 배경:
--   /api/recommend 파이프라인의 enrich 단계가 TMDB API 3개 엔드포인트 호출로
--   4.8~12.3초를 소모. DB 미러로 치환하면 ~100ms로 단축 가능.
--   스펙: _workspace/tmdb-mirror-spec.md
--
-- 사용법:
--   Supabase Dashboard → SQL Editor에 paste → Run

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. tmdb_catalog: 존재하는 TMDB ID 목록 (Daily ID Export로 채움)
CREATE TABLE IF NOT EXISTS tmdb_catalog (
  tmdb_id      BIGINT NOT NULL,
  media_type   TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  popularity   NUMERIC,
  adult        BOOLEAN NOT NULL DEFAULT FALSE,
  first_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_export  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (tmdb_id, media_type)
);

CREATE INDEX IF NOT EXISTS idx_catalog_popularity
  ON tmdb_catalog (media_type, popularity DESC)
  WHERE NOT deleted AND NOT adult;

COMMENT ON TABLE tmdb_catalog IS
  'TMDB Daily ID Export 미러. /api/cron/tmdb-catalog-sync이 매일 08:00 UTC에 채움.';

-- 2. tmdb_metadata: 각 작품의 풀 detail (detail + credits + providers 병합)
CREATE TABLE IF NOT EXISTS tmdb_metadata (
  tmdb_id        BIGINT NOT NULL,
  media_type     TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title          TEXT,
  title_en       TEXT,
  overview       TEXT,
  rating         NUMERIC,
  release_date   TEXT,
  poster_url     TEXT,
  backdrop_url   TEXT,
  director       TEXT,
  cast_names     TEXT[],
  runtime        INTEGER,
  seasons        INTEGER,
  country        TEXT[],
  origin_country TEXT[],
  genre_ids      INTEGER[],
  providers             JSONB,
  providers_fetched_at  TIMESTAMPTZ,
  watch_link     TEXT,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tmdb_id, media_type)
);

-- providers_fetched_at은 Q5 결정으로 추가: providers만 30일 TTL 분리 (전체 metadata 180일 유지)
-- 기존 실행본 호환을 위한 멱등 ALTER
ALTER TABLE tmdb_metadata
  ADD COLUMN IF NOT EXISTS providers_fetched_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_metadata_fetched ON tmdb_metadata (fetched_at);
CREATE INDEX IF NOT EXISTS idx_metadata_genres ON tmdb_metadata USING GIN (genre_ids);
CREATE INDEX IF NOT EXISTS idx_metadata_title_trgm
  ON tmdb_metadata USING GIN (title gin_trgm_ops);

COMMENT ON TABLE tmdb_metadata IS
  'TMDB 작품 메타데이터 미러. TMDB 약관상 레코드당 180일 이내 refresh 필요.';

-- 3. tmdb_crawl_queue: Phase 2에서 bulk-crawl cron이 사용
CREATE TABLE IF NOT EXISTS tmdb_crawl_queue (
  tmdb_id       BIGINT NOT NULL,
  media_type    TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  priority      INTEGER NOT NULL DEFAULT 0,
  attempted_at  TIMESTAMPTZ,
  failed_count  INTEGER NOT NULL DEFAULT 0,
  error_last    TEXT,
  PRIMARY KEY (tmdb_id, media_type)
);

CREATE INDEX IF NOT EXISTS idx_queue_priority
  ON tmdb_crawl_queue (priority DESC, failed_count ASC, attempted_at ASC NULLS FIRST);

COMMENT ON TABLE tmdb_crawl_queue IS
  'TMDB detail 크롤 대기열. Phase 2 /api/cron/tmdb-bulk-crawl이 pull.';

-- 4. RLS — service_role만 허용, anon/authenticated 차단
--    (Supabase에서 service_role은 기본적으로 RLS bypass이므로 정책 없이 ENABLE만 걸면
--     service_role 전용 테이블이 됨)
ALTER TABLE tmdb_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE tmdb_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE tmdb_crawl_queue ENABLE ROW LEVEL SECURITY;
