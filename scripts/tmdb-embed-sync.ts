/**
 * TMDB Embed Sync — tmdb_metadata content 임베딩 백필/갱신 (P1, additive).
 *
 * 배경: 추천 retrieval 을 mirror SQL(rating DESC) → pgvector ANN(취향벡터 cosine) 으로
 *   전환하기 위한 1단계. 작품 메타데이터를 이중언어(KO+EN) 문서로 임베딩해 저장.
 *   서빙 경로 무영향 — 컬럼만 채운다. P2 에서 vector 검색이 사용.
 *   설계: _workspace/09_p1-embedding-infra-plan-2026-06-23.md §2~3
 *
 * 적용 순서(인프라/사용자 영역):
 *   (1) supabase/migrations/20260624_tmdb_embedding_column.sql  ← 컬럼 추가
 *   (2) 이 스크립트 백필 (GH dispatch 또는 로컬)
 *   (3) supabase/migrations/20260624_tmdb_embedding_hnsw.sql    ← 백필 후 인덱스
 *
 * 대상: providers IS NOT NULL (KR 스트리밍 모집단 ~17K) AND
 *   (embedding IS NULL OR embedding_text_hash != 현재 문서 해시).
 *   → 멱등·재개가능. 중단 후 재실행해도 이미 처리된 행은 hash 일치로 skip.
 *
 * 임베딩: OpenAI text-embedding-3-small (1536d). 한국어 적합성은 백필 후
 *   scripts/tmdb-embed-sanity.ts 의 최근접 sanity 로 실증 검증.
 *
 * 처리 흐름:
 *   1. 후보 행 페이징 pull (providers IS NOT NULL, embedding 미설정/stale)
 *   2. buildEmbedDocument 로 문서 생성 + sha256 hash 계산
 *   3. hash 가 기존과 동일하면 skip (재임베딩 불필요)
 *   4. 신규/변경 문서를 OpenAI embeddings 에 배치(최대 EMBED_BATCH input/req) 호출 (429 backoff)
 *   5. embedding + embedding_text_hash + embedding_fetched_at=now upsert
 *
 * 환경 변수:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY (필수)
 *   EMBED_MODEL    (기본 text-embedding-3-small)
 *   EMBED_BATCH    (1 OpenAI 요청당 input 개수, 기본 200; 100~500 권장)
 *   PULL_PAGE      (DB pull 페이지 크기, 기본 1000)
 *   EMBED_LIMIT    (처리 상한 — dry-run 검증용. CLI --limit N 와 동일)
 *   DRY_RUN        (true 시 OpenAI 호출/upsert 없이 후보 수 + 문서 미리보기만)
 *
 * CLI 플래그:
 *   --limit N      소량 검증용 처리 상한 (EMBED_LIMIT 와 동일, CLI 우선)
 *   --dry-run      DRY_RUN=true 와 동일
 *
 * 운영: GitHub Actions `.github/workflows/tmdb-embed-sync.yml` (매일, bulk-crawl 이후).
 *
 * 실행(로컬):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OPENAI_API_KEY=... \
 *     npx tsx scripts/tmdb-embed-sync.ts --limit 20 --dry-run
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import OpenAI from "openai";
import {
  buildEmbedDocument,
  sleep,
  type EmbedSourceRow,
} from "./lib/tmdb-fetch";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBED_MODEL = process.env.EMBED_MODEL ?? "text-embedding-3-small";
const EMBED_DIM = 1536; // text-embedding-3-small. 모델 교체 시 migration 차원과 동기화.
const EMBED_BATCH = Number(process.env.EMBED_BATCH ?? "200");
const PULL_PAGE = Number(process.env.PULL_PAGE ?? "1000");

// CLI 플래그 파싱 (--limit N, --dry-run)
const argv = process.argv.slice(2);
function flagValue(name: string): string | undefined {
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.split("=")[1];
  const idx = argv.indexOf(name);
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  return undefined;
}
const CLI_LIMIT = flagValue("--limit");
const LIMIT = CLI_LIMIT
  ? Number(CLI_LIMIT)
  : process.env.EMBED_LIMIT
    ? Number(process.env.EMBED_LIMIT)
    : Infinity;
const DRY_RUN = argv.includes("--dry-run") || process.env.DRY_RUN === "true";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "[tmdb-embed-sync] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락",
  );
  process.exit(1);
}
if (!OPENAI_API_KEY && !DRY_RUN) {
  console.error("[tmdb-embed-sync] OPENAI_API_KEY 누락 (--dry-run 은 예외)");
  process.exit(1);
}

type MetaRow = EmbedSourceRow & {
  embedding_text_hash: string | null;
  embedding: unknown | null;
};

function docHash(doc: string): string {
  return createHash("sha256").update(doc, "utf8").digest("hex");
}

/** GPT-style 토큰 근사치 (영문 ~4char/token, 한글 가중) — 로깅/비용 추정용. 정밀 토크나이저 아님. */
function approxTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const openai = DRY_RUN ? null : new OpenAI({ apiKey: OPENAI_API_KEY });

  console.log(
    `[tmdb-embed-sync] 시작 model=${EMBED_MODEL} dim=${EMBED_DIM} batch=${EMBED_BATCH} ` +
      `limit=${LIMIT === Infinity ? "∞" : LIMIT} dry_run=${DRY_RUN}`,
  );

  let processed = 0; // 임베딩 발급된 행
  let skipped = 0; // hash 동일로 skip
  let scanned = 0; // pull 후 검사한 행
  let approxTokenSum = 0;

  // 임베딩 대상 누적 버퍼 (OpenAI 배치 단위로 flush)
  type Pending = {
    tmdb_id: number;
    media_type: "movie" | "tv";
    doc: string;
    hash: string;
  };
  let pending: Pending[] = [];

  async function flush(): Promise<void> {
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];

    if (DRY_RUN || !openai) {
      // dry-run: 첫 배치 일부 문서 미리보기
      for (const p of batch.slice(0, 3)) {
        console.log(
          `[tmdb-embed-sync][dry] ${p.media_type}/${p.tmdb_id}\n--- 문서 ---\n${p.doc}\n--- hash=${p.hash.slice(0, 12)} (~${approxTokens(p.doc)} tok) ---`,
        );
      }
      processed += batch.length;
      return;
    }

    const inputs = batch.map((p) => p.doc);
    const embeddings = await embedWithBackoff(openai, inputs);
    if (embeddings.length !== batch.length) {
      throw new Error(
        `[tmdb-embed-sync] embedding 개수 불일치 (req ${batch.length}, res ${embeddings.length})`,
      );
    }

    const now = new Date().toISOString();
    const rows = batch.map((p, i) => ({
      tmdb_id: p.tmdb_id,
      media_type: p.media_type,
      embedding: embeddings[i],
      embedding_text_hash: p.hash,
      embedding_fetched_at: now,
    }));
    const { error } = await admin.from("tmdb_metadata").upsert(rows, {
      onConflict: "tmdb_id,media_type",
    });
    if (error) {
      throw new Error(`[tmdb-embed-sync] upsert 실패: ${error.message}`);
    }
    processed += batch.length;
  }

  // 후보 페이징: providers IS NOT NULL AND (embedding IS NULL OR hash stale)
  // embedding IS NULL 은 DB 측에서 필터(미처리 우선). hash mismatch 는 pull 후 판정
  // (현재 문서 hash 는 클라이언트에서 계산해야 알 수 있으므로).
  // → 안정적 페이징을 위해 (tmdb_id, media_type) 키 순 정렬 + range 페이징.
  // keyset 페이지네이션: deep OFFSET(.range) 은 offset 이 커질수록 statement timeout
  // 유발 → tmdb_id 커서(.gt)로 교체. offset 깊이와 무관하게 페이지당 O(page) 유지.
  // 경계에서 같은 tmdb_id 의 다른 media_type 행이 드물게 누락될 수 있으나 멱등 재실행으로 회수.
  let cursorId = -1;
  while (processed + skipped < LIMIT || LIMIT === Infinity) {
    const pageSize =
      LIMIT === Infinity
        ? PULL_PAGE
        : Math.min(PULL_PAGE, Math.max(1, LIMIT * 3));

    const { data, error } = await admin
      .from("tmdb_metadata")
      .select(
        // embedding 벡터(1536 floats)는 select 안 함 — hash 만으로 null+stale 판정(전송 경량).
        "tmdb_id, media_type, title, title_en, overview, release_date, director, cast_names, genre_ids, embedding_text_hash",
      )
      .not("providers", "is", null)
      .gt("tmdb_id", cursorId)
      .order("tmdb_id", { ascending: true })
      .order("media_type", { ascending: true })
      .limit(pageSize);

    if (error) throw new Error(`[tmdb-embed-sync] pull 실패: ${error.message}`);
    const page = (data ?? []) as MetaRow[];
    if (page.length === 0) break;
    cursorId = page[page.length - 1].tmdb_id;

    for (const r of page) {
      if (processed + pending.length >= LIMIT) break;
      scanned += 1;
      const doc = buildEmbedDocument(r);
      if (!doc.trim()) {
        // 임베딩할 내용 없음(제목/줄거리 모두 비어있음) → skip
        skipped += 1;
        continue;
      }
      const hash = docHash(doc);
      // 멱등: hash 동일 → 이미 같은 문서로 임베딩됨(embedding 과 hash 는 함께 기록) → skip.
      // hash null(미임베딩) 또는 불일치(문서 변경) → 재임베딩. 벡터 select 불필요.
      if (r.embedding_text_hash === hash) {
        skipped += 1;
        continue;
      }
      approxTokenSum += approxTokens(doc);
      pending.push({
        tmdb_id: r.tmdb_id,
        media_type: r.media_type,
        doc,
        hash,
      });
      if (pending.length >= EMBED_BATCH) {
        await flush();
        logProgress(processed, skipped, scanned, approxTokenSum, startedAt);
      }
      if (processed + pending.length >= LIMIT) break;
    }

    if (processed + pending.length >= LIMIT) break;
    if (page.length < pageSize) break; // 마지막 페이지
  }

  await flush();

  const durationMs = Date.now() - startedAt;
  console.log(
    `[tmdb-embed-sync] 완료 duration=${(durationMs / 1000).toFixed(1)}s ` +
      `처리=${processed} 스킵=${skipped} 스캔=${scanned} ~토큰=${approxTokenSum} ` +
      `${DRY_RUN ? "(DRY_RUN — upsert 없음)" : ""}`,
  );
}

function logProgress(
  processed: number,
  skipped: number,
  scanned: number,
  approxTokenSum: number,
  startedAt: number,
): void {
  const sec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[tmdb-embed-sync] 진행 처리=${processed} 스킵=${skipped} 스캔=${scanned} ~토큰=${approxTokenSum} (${sec}s)`,
  );
}

/**
 * OpenAI embeddings 호출 + 429/5xx 백오프 (지수, 최대 3회).
 * 입력 순서대로 number[][] 반환.
 */
async function embedWithBackoff(
  openai: OpenAI,
  inputs: string[],
): Promise<number[][]> {
  let attempt = 0;
  const maxAttempts = 3;
  for (;;) {
    try {
      const res = await openai.embeddings.create({
        model: EMBED_MODEL,
        input: inputs,
        dimensions: EMBED_DIM,
      });
      // index 순 보장 (OpenAI 는 data[].index 제공 — 정렬해서 안전화)
      return res.data
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding as number[]);
    } catch (err) {
      attempt += 1;
      const status =
        (err as { status?: number })?.status ??
        (err as { response?: { status?: number } })?.response?.status;
      const retriable = status === 429 || (status != null && status >= 500);
      if (!retriable || attempt >= maxAttempts) throw err;
      const backoffMs = 2000 * 2 ** (attempt - 1); // 2s, 4s
      console.warn(
        `[tmdb-embed-sync] OpenAI ${status} — ${backoffMs}ms 후 재시도 (${attempt}/${maxAttempts - 1})`,
      );
      await sleep(backoffMs);
    }
  }
}

main().catch((err) => {
  console.error("[tmdb-embed-sync] 치명적 오류:", err);
  process.exit(1);
});
