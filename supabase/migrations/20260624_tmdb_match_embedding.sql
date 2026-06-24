-- P2 추천 리팩토링 — pgvector cosine NN retrieval RPC `match_tmdb_by_embedding`
--
-- 배경: candidate retrieval 을 mirror SQL(rating DESC) → 취향벡터 pgvector cosine NN 으로 교체.
--   사용자 favorites 작품의 *기존* content 임베딩을 평균(L2 정규화)한 취향벡터를 입력으로,
--   tmdb_metadata.embedding 과 cosine 유사 NN top-K 를 반환. OTT/origin 미세 매칭은 client 후처리.
--   설계 정본: _workspace/11_p2-retrieval-plan-2026-06-24.md §작업1
--             (후속: 08_rec-refactor-research-2026-06-23.md / 09_p1-embedding-infra-plan-2026-06-23.md)
--
-- ⚠️ 적용: 인프라/사용자 직접 영역. 본 파일은 작성만 — 절대 prod DB 에 적용/CLI push 하지 말 것.
--   적용 순서(선행조건 모두 충족 후):
--     (1) 20260624_tmdb_embedding_column.sql      — embedding vector(1536) 컬럼
--     (2) scripts/tmdb-embed-sync.ts 백필          — embedding 값 채움 (KR 스트리밍 모집단 ~17K)
--     (3) 20260624_tmdb_embedding_hnsw.sql         — IVFFlat(또는 HNSW) cosine 인덱스
--     (4) ← 이 파일                                 — RPC 함수 (Supabase SQL Editor 1회 paste → Run)
--     (5) Vercel env REC_EMBED_RETRIEVAL_ENABLED=true — flag on (사용자 적용). 이상 시 env 제거로 즉시 롤백.
--
-- 타입 정합 (★ 실제 스키마 20260424_tmdb_mirror.sql 기준 — 정본의 잠정 타입을 실 컬럼에 정정):
--   · tmdb_id      BIGINT       → RETURNS bigint   (정본 int  → 정정. structure mismatch 방지)
--   · rating       NUMERIC      → RETURNS numeric  (정본 real → 정정)
--   · release_date TEXT         → RETURNS text     (정본 date → 정정. ISO "YYYY-MM-DD" 문자열 저장)
--   · runtime/seasons  INTEGER  → int,  cast_names/country/origin_country TEXT[] → text[]
--   · genre_ids    INTEGER[]    → int[],  providers JSONB → jsonb,  poster/backdrop/director/watch_link TEXT → text
--   RETURNS TABLE 의 각 컬럼 타입이 실 컬럼과 1:1 일치해야 함 — 불일치 시
--   "structure of query does not match function result type" 런타임 에러.
--
-- release_date 필터 (★ TEXT 컬럼이므로 p_date_gte/lte 도 text):
--   release_date 는 ISO 8601 "YYYY-MM-DD" 문자열 → 사전식(lexicographic) 정렬 = 시간 정렬.
--   기존 SQL 경로(candidate-generation.ts: q.gte/lte("release_date", "2020-01-01")) 와 동일한
--   text 비교 → bit-identical. 정본의 `date` 파라미터 타입을 `text` 로 정정(rec-engineer 가
--   넘기는 yearFilterToRange 결과도 "YYYY-MM-DD" 문자열).
--
-- p_exclude_ids: 정본 계약 그대로 int[]. tmdb_id 가 bigint 여도 `bigint = ANY(int[])` 는
--   Postgres 가 int element 를 bigint 로 promote → 정상. 계약(int[]) 유지.
--
-- ⚠️ 구현 방식 = PL/pgSQL 동적 SQL (2026-06-24 진단 후 LANGUAGE sql 에서 전환):
--   초기 LANGUAGE sql STABLE + `(p IS NULL OR col=p)` OR 술어 버전은 **IVFFlat 인덱스를 안 탔다**.
--   EXPLAIN ANALYZE 실측: Function Scan, 412K buffers(~3.2GB seq-scan+sort), Exec 61,112ms
--   → service_role/authenticator statement_timeout 8s 초과 → 57014 취소 → 항상 SQL fallback.
--   원인: (a) `SET search_path` 가 SQL 함수 인라인을 막고, (b) PostgREST 파라미터화 + OR 술어로
--          planner 가 ANN 인덱스를 못 고름(파라미터를 plan-time 상수로 fold 못 함).
--   해결: 동적 SQL 로 *제공된 필터만* 깔끔한 술어(AND col=…)로 붙여 인덱스 사용을 보장.
--         probes 도 함수 내부에서 set_config 로 설정(LANGUAGE sql 은 불가했던 부분).
--   RPC 계약(시그니처/RETURNS/반환컬럼)은 **불변** — candidate-generation.ts 무영향.

CREATE OR REPLACE FUNCTION match_tmdb_by_embedding(
  query_embedding vector(1536),
  match_count     int,
  p_media_type    text   DEFAULT NULL,   -- 'movie' | 'tv' | NULL(both)
  p_genre_ids     int[]  DEFAULT NULL,   -- 겹치면 통과 (&&). NULL=미적용
  p_date_gte      text   DEFAULT NULL,   -- ISO "YYYY-MM-DD" (release_date TEXT 와 사전식 비교)
  p_date_lte      text   DEFAULT NULL,
  p_origin        text   DEFAULT NULL,   -- 'kr' | 'foreign' | NULL
  p_exclude_ids   int[]  DEFAULT NULL
)
RETURNS TABLE (
  tmdb_id bigint, media_type text, title text, title_en text, overview text,
  rating numeric, release_date text, poster_path text, backdrop_path text,
  director text, cast_names text[], runtime int, seasons int,
  country text[], origin_country text[], genre_ids int[],
  providers jsonb, watch_link text,
  similarity float
)
-- statement_timeout 헤드룸: 정상 경로는 cold 578ms / warm ~200ms 이나, 인스턴스 cold spike
--   (index 페이지 대량 evict 후) 대비 15s 부여 → 8s(authenticator) 에서 silent SQL fallback 차단.
LANGUAGE plpgsql STABLE SECURITY INVOKER SET statement_timeout = '15000' AS $$
DECLARE
  q    text;
  vlit text := quote_literal(query_embedding::text);  -- 벡터를 리터럴로 인라인
BEGIN
  -- IVFFlat recall — 트랜잭션 로컬(PostgREST 가 호출을 트랜잭션으로 감쌈).
  PERFORM set_config('ivfflat.probes', '10', true);
  -- iterative_scan(pgvector 0.8) — media_type 등 post-filter 로 LIMIT 미충족 시 인덱스 추가 스캔.
  PERFORM set_config('ivfflat.iterative_scan', 'relaxed_order', true);

  -- ⚠️ 모든 값을 bind 파라미터가 아니라 quote_literal 리터럴로 인라인한다.
  --   이유(2026-06-24 실측): bind 파라미터($1 벡터)로는 PostgREST/PG 가 실행 수 회 후
  --   generic plan 으로 전환하며 IVFFlat 인덱스를 버려 seq-scan(8s+ → statement_timeout).
  --   ORDER BY 대상(벡터)이 *상수 리터럴*이면 planner 가 매번 custom plan 으로 인덱스를 탐 →
  --   호출 간 latency 안정(인덱스 130ms vs seq-scan 8s+). 모든 입력은 quote_literal 로 주입 안전.
  q := '
    SELECT tmdb_id, media_type, title, title_en, overview, rating, release_date,
           poster_path, backdrop_path, director, cast_names, runtime, seasons,
           country, origin_country, genre_ids, providers, watch_link,
           1 - (embedding <=> ' || vlit || '::vector) AS similarity
    FROM tmdb_metadata
    WHERE providers IS NOT NULL AND embedding IS NOT NULL';

  IF p_media_type IS NOT NULL THEN
    q := q || ' AND media_type = ' || quote_literal(p_media_type);
  END IF;
  IF p_genre_ids IS NOT NULL THEN
    q := q || ' AND genre_ids && ' || quote_literal(p_genre_ids::text) || '::int[]';
  END IF;
  IF p_date_gte IS NOT NULL THEN
    q := q || ' AND release_date >= ' || quote_literal(p_date_gte);
  END IF;
  IF p_date_lte IS NOT NULL THEN
    q := q || ' AND release_date <= ' || quote_literal(p_date_lte);
  END IF;
  IF p_origin = 'kr' THEN
    q := q || ' AND country @> ARRAY[''KR'']';
  ELSIF p_origin = 'foreign' THEN
    q := q || ' AND NOT (country @> ARRAY[''KR''])';
  END IF;
  IF p_exclude_ids IS NOT NULL THEN
    q := q || ' AND NOT (tmdb_id = ANY(' || quote_literal(p_exclude_ids::text) || '::int[]))';
  END IF;

  q := q || ' ORDER BY embedding <=> ' || vlit || '::vector LIMIT ' || match_count::text;

  RETURN QUERY EXECUTE q;
END;
$$;

GRANT EXECUTE ON FUNCTION match_tmdb_by_embedding(
  vector, int, text, int[], text, text, text, int[]) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 검증 (적용 후 Supabase SQL Editor — 인덱스 사용 + 정상 NN 확인)
--
-- [1] 인덱스 사용 확인: 임의 seed 작품의 embedding 으로 NN 100건 — IVFFlat/HNSW Index Scan 이 떠야 함.
--   EXPLAIN ANALYZE
--   SELECT * FROM match_tmdb_by_embedding(
--     (SELECT embedding FROM tmdb_metadata WHERE embedding IS NOT NULL LIMIT 1),
--     100               -- match_count = poolSize × OVERFETCH(3)
--   );
--   → plan 에 "Index Scan using idx_metadata_embedding_ivf" (또는 _hnsw) 가 나타나면 성공.
--     "Seq Scan ... ORDER BY ... Sort" 면 인덱스 미적용 → (2) 백필/(3) 인덱스 선행조건 점검.
--   ※ probes 가 낮으면(기본 1) recall 이 낮을 수 있음 — 정확성 평가 전 set_config 로 10 설정:
--       SELECT set_config('ivfflat.probes', '10', false);
--
-- [2] 하드필터 동작 확인: 장르/기간/origin 결합 필터.
--   EXPLAIN ANALYZE
--   SELECT tmdb_id, title, rating, release_date, similarity
--   FROM match_tmdb_by_embedding(
--     (SELECT embedding FROM tmdb_metadata WHERE embedding IS NOT NULL LIMIT 1),
--     100,
--     'movie',                    -- p_media_type
--     ARRAY[27, 53]::int[],       -- p_genre_ids (호러 27 / 스릴러 53 겹치면 통과)
--     '2020-01-01',               -- p_date_gte (text, 사전식)
--     NULL,                       -- p_date_lte
--     'foreign',                  -- p_origin (비-KR)
--     NULL                        -- p_exclude_ids
--   );
--   → 반환 row 의 media_type='movie', release_date >= '2020-01-01', country 에 'KR' 미포함,
--     genre_ids 가 {27,53} 중 하나 이상 포함, similarity DESC(= embedding <=> ASC) 정렬 확인.
--
-- [3] retrieval latency 게이트(P2): < 100ms (probes/lists 튜닝은 사용자 실측).
