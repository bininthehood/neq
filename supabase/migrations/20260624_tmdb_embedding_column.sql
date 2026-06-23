-- P1 추천 리팩토링 — tmdb_metadata content 임베딩 컬럼 (additive, 서빙 무영향)
--
-- 배경: 추천 retrieval 을 mirror SQL(rating DESC) → pgvector ANN(취향벡터 cosine) 로
--   전환하기 위한 1단계. 작품 메타데이터를 임베딩으로 표현해 P2 에서 vector 검색.
--   설계: _workspace/08_rec-refactor-research-2026-06-23.md / 09_p1-embedding-infra-plan-2026-06-23.md
--
-- 모델: OpenAI text-embedding-3-small (1536 dim). 한국어 적합성은 백필 후 최근접 sanity 로
--   실증 검증 — 실패 시 -3-large/다국어로 교체(차원만 조정).
--
-- ⚠️ 적용: 인프라/사용자 영역. 본 파일은 작성만. 적용 순서:
--   (1) 이 파일 → (2) scripts/tmdb-embed-sync.ts 백필 → (3) 20260624_tmdb_embedding_hnsw.sql
--   적용 명령(Supabase SQL Editor):
--     아래 전체 paste → Run

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE tmdb_metadata
  ADD COLUMN IF NOT EXISTS embedding vector(1536),       -- text-embedding-3-small
  ADD COLUMN IF NOT EXISTS embedding_text_hash TEXT,     -- 입력 문서 sha256 — 메타 변경 감지/재임베딩
  ADD COLUMN IF NOT EXISTS embedding_fetched_at TIMESTAMPTZ;

COMMENT ON COLUMN tmdb_metadata.embedding IS
  'content 임베딩 (text-embedding-3-small 1536d). 이중언어 문서(KO+EN) 기반. scripts/tmdb-embed-sync.ts 가 채움.';
COMMENT ON COLUMN tmdb_metadata.embedding_text_hash IS
  '임베딩 입력 문서 sha256. 문서 불변이면 재임베딩 skip, 변경 시 재생성 트리거.';
