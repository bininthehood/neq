# TMDB 미러 프로젝트 분리 런북 (2026-08-18)

## 배경

2026-08-17 밤 Supabase Free 500MB 한도 초과로 프로젝트 전체가 `exceed_db_size_quota`
제한을 받아 데이터 API 가 HTTP 402 로 차단됨. 원인은 성격이 다른 두 덩어리가 한
프로젝트에 있었던 것.

| 덩어리 | 크기 | 인증/RLS | 접근 주체 | 죽었을 때 |
|---|---|---|---|---|
| 유저 데이터 | 약 3MB | 필요 | 앱이 직접 | **앱 정지** |
| TMDB 미러 | 약 400MB | 불필요 | 서버만 | 추천 느려짐 (라이브 fallback) |

미러는 인증·RLS가 필요 없고 서버에서만 읽으므로 별도 프로젝트로 분리한다.
Supabase Free 는 **프로젝트당** 500MB 라 총 1GB 를 무료로 쓰게 된다.

## 이동 대상

**테이블** — `tmdb_metadata` / `tmdb_catalog` / `tmdb_crawl_queue` / `tmdb_provider_snapshots`
**RPC** — `match_tmdb_by_embedding` (pgvector retrieval), `db_size_bytes` (크기 가드)
**확장** — `vector` (pgvector), `pg_trgm`

유저 테이블(`saved_items` / `watch_reports` / `personas` / `profiles` / auth 일체)은
기존 프로젝트에 그대로 둔다. **두 덩어리 사이에 FK 도 조인도 없다** — 분리 가능성은
코드 확인으로 검증됨 (미러 접근은 전부 서버 사이드, PostgREST 관계 구문 미사용).

## 1. 새 프로젝트 생성

Supabase 대시보드에서 새 프로젝트를 만든다. 이름은 `neq-tmdb-mirror` 권장.
**리전은 기존 프로젝트와 동일하게** — Vercel 함수에서 두 프로젝트를 모두 호출하므로
왕복 지연을 맞춘다.

생성 후 Settings → API 에서 아래 둘을 확보한다.

- Project URL → `MIRROR_SUPABASE_URL`
- `service_role` key → `MIRROR_SUPABASE_SERVICE_ROLE_KEY`

## 2. 스키마 적용

새 프로젝트의 SQL Editor 에서 **아래 순서대로** 기존 마이그레이션 파일 내용을 실행한다.
(DDL 을 여기 복사하지 않는 이유: 원본과 갈라지면 추적이 불가능해진다.)

| 순서 | 파일 | 비고 |
|---|---|---|
| 1 | `20260424_tmdb_mirror.sql` | 미러 3테이블 본체 |
| 2 | `20260428_onboarding_v2.sql` | **`tmdb_provider_snapshots` 부분만** — 나머지는 유저 스키마 |
| 3 | `20260606_tmdb_metadata_phase_b_indexes.sql` | |
| 4 | `20260624_tmdb_embedding_column.sql` | `vector` 확장 필요 |
| 5 | `20260624_tmdb_embed_backfill_index.sql` | |
| 6 | `20260624_tmdb_match_embedding.sql` | retrieval RPC |
| 7 | `20260629_tmdb_metadata_title_en_index.sql` | |
| 8 | `20260715_tmdb_related_seeds.sql` | |
| 9 | `20260715_tmdb_related_seeds_idx.sql` | |
| 10 | `20260721_tmdb_director_id_idx.sql` | |
| 11 | `20260818_db_size_guard.sql` | 크기 가드 RPC |

**벡터 인덱스(`20260624_tmdb_embedding_hnsw.sql`)는 데이터 이전 후에** 만든다.
빈 테이블에 만들면 IVFFlat 의 `lists` 가 무의미하고, 적재 중에는 인덱스 갱신 비용만 든다.

## 3. 데이터 이전

기존 프로젝트의 제한이 풀린 뒤에 진행한다 (읽기가 되어야 함).

행 수가 많아 대시보드 export 는 실패하기 쉽다. `tmdb_metadata` 는 임베딩 때문에
행이 크므로 **작은 배치로 나눠** 옮긴다. 순서는 `tmdb_catalog` → `tmdb_metadata` →
나머지. `tmdb_crawl_queue` 는 재생성 가능하므로 옮기지 않아도 된다.

이전이 끝나면 검증한다.

```sql
-- 새 프로젝트에서
SELECT count(*) FROM tmdb_metadata;   -- 기존과 일치해야 함
SELECT count(embedding) FROM tmdb_metadata;
SELECT count(*) FROM tmdb_catalog;
```

그다음 벡터 인덱스를 만든다 (`20260624_tmdb_embedding_hnsw.sql`).

## 4. 환경변수 설정

**Vercel** (Project Settings → Environment Variables, Production + Preview)

```
MIRROR_SUPABASE_URL=https://<new-ref>.supabase.co
MIRROR_SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

**GitHub Actions** (repo Secrets) — 크롤 워크플로 6종이 사용

```
MIRROR_SUPABASE_URL
MIRROR_SUPABASE_SERVICE_ROLE_KEY
```

워크플로 yml 의 `env:` 블록에도 두 변수를 넘겨야 한다.

## 5. 코드 동작

`supabaseMirror()` (`apps/web/src/lib/supabase-admin.ts`) 와 크롤 스크립트 모두
**env 미설정 시 기존 프로젝트로 fallback** 한다. 따라서

- env 를 넣기 전: 지금과 100% 동일하게 동작
- env 를 넣은 순간: 미러 읽기가 새 프로젝트로 전환
- env 를 지우면: 즉시 롤백

배포와 전환이 분리되어 있어 안전하다.

## 6. 전환 후 정리

새 프로젝트가 정상 동작하는 걸 확인한 뒤, **기존 프로젝트에서 미러 테이블을 삭제**한다.
이때 비로소 원래 프로젝트가 3MB 수준으로 내려가 한도 걱정이 사라진다.

```sql
-- 기존 프로젝트에서 (전환 검증 완료 후에만!)
DROP TABLE tmdb_provider_snapshots;
DROP TABLE tmdb_crawl_queue;
DROP TABLE tmdb_catalog;
DROP TABLE tmdb_metadata;
```

## 주의

**분리해도 무한 증가 문제는 그대로다.** 미러가 500MB 를 다시 채우면 같은 일이
새 프로젝트에서 반복된다. `scripts/lib/db-guard.ts` 의 크기 가드와 유입/방출 정책이
반드시 함께 있어야 한다.

**`TMDB Catalog Sync` 는 고치기 전까지 재개 금지.** 현재 코드는 TMDB 전체
(약 140만 행, 270MB)를 카탈로그에 적재한다. 2026-08-18 에 슬림 테이블로 교체해
9.7MB 로 줄인 상태이므로, 그대로 켜면 원상복구된다.
