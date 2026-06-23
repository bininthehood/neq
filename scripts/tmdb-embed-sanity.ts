/**
 * TMDB Embed Sanity — 최근접 sanity (한국어 적합성 육안 게이트).
 *
 * 배경: text-embedding-3-small 의 한국어 줄거리 적합성은 리서치 미검증 항목.
 *   대표작 5종의 cosine 최근접 10 을 출력해 의미상 유사한 이웃이 나오는지 육안 확인.
 *   통과 → -3-small 채택. 실패(한국어 이웃이 의미상 엉킴) → -3-large/다국어 모델로 교체.
 *   설계: _workspace/09_p1-embedding-infra-plan-2026-06-23.md §검증 (한국어 적합성 게이트)
 *
 * 선행: scripts/tmdb-embed-sync.ts 백필 완료 (embedding 채워진 상태).
 *   HNSW 인덱스는 불필요 — 본 스크립트는 클라이언트 측 cosine 계산(검증용, latency 무관).
 *   (서빙 latency 검증은 별도 EXPLAIN ANALYZE, hnsw migration 참조.)
 *
 * 처리 흐름:
 *   1. 대표작 5종을 제목 ilike 매칭으로 seed 행 탐색 (embedding 포함)
 *   2. providers IS NOT NULL + embedding NOT NULL 모집단을 페이징 pull (id/제목/embedding)
 *   3. 각 seed 에 대해 전 모집단과 cosine similarity 계산 → 상위 10 출력
 *
 * 환경 변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (필수)
 *
 * 실행: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/tmdb-embed-sanity.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PULL_PAGE = Number(process.env.PULL_PAGE ?? "1000");
const TOP_K = Number(process.env.TOP_K ?? "10");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("[tmdb-embed-sanity] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락");
  process.exit(1);
}

// 대표작 5종 — 제목 ilike 매칭 (한글 우선, 영문 폴백 후보 포함)
const SEEDS: Array<{ label: string; patterns: string[] }> = [
  { label: "어벤져스", patterns: ["어벤져스", "Avengers"] },
  { label: "기생충", patterns: ["기생충", "Parasite"] },
  { label: "라라랜드", patterns: ["라라랜드", "La La Land"] },
  { label: "오징어 게임", patterns: ["오징어 게임", "오징어게임", "Squid Game"] },
  { label: "인터스텔라", patterns: ["인터스텔라", "Interstellar"] },
];

type Row = {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string | null;
  title_en: string | null;
  release_date: string | null;
  embedding: number[] | string | null;
};

/** Supabase 가 vector 컬럼을 JSON 문자열("[...]")로 돌려줄 수 있어 정규화. */
function parseEmbedding(e: number[] | string | null): number[] | null {
  if (e == null) return null;
  if (Array.isArray(e)) return e;
  try {
    const parsed = JSON.parse(e);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function displayTitle(r: { title: string | null; title_en: string | null }): string {
  return r.title ?? r.title_en ?? "(제목없음)";
}

async function findSeed(
  admin: SupabaseClient,
  patterns: string[],
): Promise<Row | null> {
  for (const pat of patterns) {
    for (const col of ["title", "title_en"] as const) {
      const { data, error } = await admin
        .from("tmdb_metadata")
        .select("tmdb_id, media_type, title, title_en, release_date, embedding")
        .not("embedding", "is", null)
        .ilike(col, `%${pat}%`)
        .order("rating", { ascending: false })
        .limit(1);
      if (error) {
        console.warn(`[tmdb-embed-sanity] seed 검색 오류(${pat}): ${error.message}`);
        continue;
      }
      const row = (data ?? [])[0] as Row | undefined;
      if (row && parseEmbedding(row.embedding)) return row;
    }
  }
  return null;
}

async function loadPopulation(admin: SupabaseClient): Promise<Row[]> {
  const rows: Row[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin
      .from("tmdb_metadata")
      .select("tmdb_id, media_type, title, title_en, release_date, embedding")
      .not("providers", "is", null)
      .not("embedding", "is", null)
      .order("tmdb_id", { ascending: true })
      .order("media_type", { ascending: true })
      .range(offset, offset + PULL_PAGE - 1);
    if (error) throw new Error(`[tmdb-embed-sanity] 모집단 pull 실패: ${error.message}`);
    const page = (data ?? []) as Row[];
    if (page.length === 0) break;
    rows.push(...page);
    offset += page.length;
    if (page.length < PULL_PAGE) break;
  }
  return rows;
}

async function main(): Promise<void> {
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("[tmdb-embed-sanity] 모집단 로딩 중...");
  const population = await loadPopulation(admin);
  console.log(
    `[tmdb-embed-sanity] 모집단 ${population.length}건 (providers≠null, embedding≠null)`,
  );
  if (population.length === 0) {
    console.error(
      "[tmdb-embed-sanity] embedding 채워진 행 없음 — 먼저 tmdb-embed-sync 백필 실행",
    );
    process.exit(1);
  }

  // 모집단 embedding 사전 파싱 (한 번만)
  const popVecs = population.map((r) => ({
    row: r,
    vec: parseEmbedding(r.embedding),
  }));

  for (const seed of SEEDS) {
    const seedRow = await findSeed(admin, seed.patterns);
    if (!seedRow) {
      console.log(`\n### ${seed.label} — seed 미발견 (모집단에 임베딩 없음)`);
      continue;
    }
    const seedVec = parseEmbedding(seedRow.embedding);
    if (!seedVec) {
      console.log(`\n### ${seed.label} — seed embedding 파싱 실패`);
      continue;
    }

    const scored = popVecs
      .filter(
        (p) =>
          p.vec != null &&
          !(
            p.row.tmdb_id === seedRow.tmdb_id &&
            p.row.media_type === seedRow.media_type
          ),
      )
      .map((p) => ({ row: p.row, sim: cosine(seedVec, p.vec!) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, TOP_K);

    const year = seedRow.release_date ? seedRow.release_date.slice(0, 4) : "?";
    console.log(
      `\n### ${seed.label} → seed: ${displayTitle(seedRow)} (${year}, ${seedRow.media_type}, id=${seedRow.tmdb_id})`,
    );
    scored.forEach((s, i) => {
      const y = s.row.release_date ? s.row.release_date.slice(0, 4) : "?";
      console.log(
        `  ${String(i + 1).padStart(2)}. ${s.sim.toFixed(4)}  ${displayTitle(s.row)} (${y}, ${s.row.media_type})`,
      );
    });
  }

  console.log(
    "\n[tmdb-embed-sanity] 완료 — 이웃이 의미상 유사하면 -3-small 채택, 엉키면 -3-large/다국어 교체.",
  );
}

main().catch((err) => {
  console.error("[tmdb-embed-sanity] 치명적 오류:", err);
  process.exit(1);
});
