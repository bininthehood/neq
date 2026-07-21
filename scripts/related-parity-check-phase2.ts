/**
 * /api/tmdb/related Phase 2 미러 보강 — parity 검증 (트랙2 recommendations 중심).
 *
 * 목적: recommendations 를 TMDB /recommendations → pgvector NN(match_tmdb_by_embedding)
 *   으로 치환했을 때의 **빈 결과율 + 질적 타당성** 을 대표 샘플로 확인.
 *   (유사작은 TMDB 와 exact-match 일 필요 없음 — 판정 = 빈응답/무관 비율이 낮은가.)
 *
 * TMDB /recommendations 직접 비교는 이 환경에 TMDB_API_KEY 가 없어 생략.
 *   대신 pgvector 경로 자체의 (a) 임베딩 보유율 (b) 빈 결과율 (c) top-8 이웃 제목을
 *   출력해 육안 타당성 게이트 + 트랙1 감독작 미러 매칭 sanity 도 병행.
 *
 * 읽기 전용 — RPC 호출 + select 만. 어떤 write 도 없음.
 *
 * 실행:
 *   node_modules/.bin/tsx scripts/related-parity-check-phase2.ts [envfile]
 *   기본 envfile = /Volumes/Workspace/Projects/neko/apps/web/.env.local
 *   (SUPABASE_SERVICE_ROLE_KEY + SUPABASE_DB_URL(ref 추출용) 를 파일에서 직접 파싱 —
 *    비밀번호 특수문자로 인한 셸 인용 문제 회피)
 */
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---- env 로드 (파일 직접 파싱) ----
const ENV_FILE =
  process.argv[2] ?? "/Volumes/Workspace/Projects/neko/apps/web/.env.local";

function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let raw = "";
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnv(ENV_FILE);
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL ?? env.SUPABASE_DB_URL ?? "";

// REST URL 유도: pooler username `postgres.<ref>` 또는 `db.<ref>.supabase.co` 에서 ref 추출
function deriveRestUrl(dbUrl: string): string | null {
  const explicit = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (explicit) return explicit;
  const poolerRef = dbUrl.match(/postgres\.([a-z0-9]{20})/);
  if (poolerRef) return `https://${poolerRef[1]}.supabase.co`;
  const directRef = dbUrl.match(/db\.([a-z0-9]{20})\.supabase\.co/);
  if (directRef) return `https://${directRef[1]}.supabase.co`;
  return null;
}

const REST_URL = deriveRestUrl(DB_URL);
if (!SERVICE_KEY || !REST_URL) {
  console.error(
    `[parity] 접속 정보 부족 — SERVICE_KEY=${!!SERVICE_KEY} REST_URL=${REST_URL}`,
  );
  process.exit(1);
}

const admin: SupabaseClient = createClient(REST_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---- parseEmbedding (candidate-generation 패턴 재사용) ----
function parseEmbedding(e: number[] | string | null | undefined): number[] | null {
  if (e == null) return null;
  if (Array.isArray(e)) return e;
  try {
    const p = JSON.parse(e);
    return Array.isArray(p) ? p : null;
  } catch {
    return null;
  }
}

// ---- 대표 샘플 (movie/tv 혼합, 한/외 혼합) ----
interface Seed {
  label: string;
  mediaType: "movie" | "tv";
  patterns: string[];
}
const SEEDS: Seed[] = [
  { label: "기생충", mediaType: "movie", patterns: ["기생충", "Parasite"] },
  { label: "오징어 게임", mediaType: "tv", patterns: ["오징어 게임", "오징어게임", "Squid Game"] },
  { label: "반지의 제왕: 반지원정대", mediaType: "movie", patterns: ["반지 원정대", "반지원정대", "Fellowship of the Ring"] },
  { label: "인터스텔라", mediaType: "movie", patterns: ["인터스텔라", "Interstellar"] },
  { label: "어벤져스: 엔드게임", mediaType: "movie", patterns: ["엔드게임", "Endgame"] },
  { label: "라라랜드", mediaType: "movie", patterns: ["라라랜드", "La La Land"] },
  { label: "기묘한 이야기", mediaType: "tv", patterns: ["기묘한 이야기", "Stranger Things"] },
  { label: "브레이킹 배드", mediaType: "tv", patterns: ["브레이킹 배드", "Breaking Bad"] },
  { label: "인셉션", mediaType: "movie", patterns: ["인셉션", "Inception"] },
  { label: "타이타닉", mediaType: "movie", patterns: ["타이타닉", "Titanic"] },
  { label: "부산행", mediaType: "movie", patterns: ["부산행", "Train to Busan"] },
  { label: "극한직업", mediaType: "movie", patterns: ["극한직업", "Extreme Job"] },
  { label: "미나리", mediaType: "movie", patterns: ["미나리", "Minari"] },
  { label: "사랑의 불시착", mediaType: "tv", patterns: ["사랑의 불시착", "Crash Landing"] },
  { label: "나의 아저씨", mediaType: "tv", patterns: ["나의 아저씨", "My Mister"] },
  { label: "킹덤", mediaType: "tv", patterns: ["킹덤", "Kingdom"] },
  { label: "살인의 추억", mediaType: "movie", patterns: ["살인의 추억", "Memories of Murder"] },
  { label: "위플래시", mediaType: "movie", patterns: ["위플래시", "Whiplash"] },
  { label: "어바웃 타임", mediaType: "movie", patterns: ["어바웃 타임", "About Time"] },
  { label: "더 글로리", mediaType: "tv", patterns: ["더 글로리", "The Glory"] },
];

interface SeedRow {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string | null;
  title_en: string | null;
  rating: number | null;
  embedding: number[] | string | null;
}

async function findSeed(seed: Seed): Promise<SeedRow | null> {
  // 패턴별 ilike — embedding 보유 우선, rating desc 로 정본 행 선택
  for (const p of seed.patterns) {
    const like = `%${p}%`;
    const { data, error } = await admin
      .from("tmdb_metadata")
      .select("tmdb_id, media_type, title, title_en, rating, embedding")
      .eq("media_type", seed.mediaType)
      .or(`title.ilike.${like},title_en.ilike.${like}`)
      .order("rating", { ascending: false, nullsFirst: false })
      .limit(5);
    if (error) {
      console.error(`[parity] findSeed(${seed.label}) 오류:`, error.message);
      continue;
    }
    const rows = (data ?? []) as SeedRow[];
    if (rows.length === 0) continue;
    // embedding 보유 행 우선
    const withEmb = rows.find((r) => parseEmbedding(r.embedding) !== null);
    return withEmb ?? rows[0];
  }
  return null;
}

interface RpcRow {
  tmdb_id: number;
  title: string | null;
  title_en: string | null;
  rating: number | string | null;
  similarity: number | string;
}

async function nnRecommendations(
  emb: number[],
  mediaType: "movie" | "tv",
  selfId: number,
): Promise<{ rows: RpcRow[]; ms: number; error?: string }> {
  const t0 = Date.now();
  const { data, error } = await admin.rpc("match_tmdb_by_embedding", {
    query_embedding: emb,
    match_count: 30,
    p_media_type: mediaType,
    p_genre_ids: null,
    p_date_gte: null,
    p_date_lte: null,
    p_origin: null,
    p_exclude_ids: [selfId],
  });
  const ms = Date.now() - t0;
  if (error) return { rows: [], ms, error: error.message };
  return { rows: (data ?? []) as RpcRow[], ms };
}

// 트랙1 sanity — 감독 필모 미러 매칭 개수 (seeds.director_tmdb_id 필요 → 여기선 director_tmdb_id 직접 조회)
async function directorWorksCount(
  tmdbId: number,
  mediaType: "movie" | "tv",
): Promise<number | null> {
  const { data: seedRow } = await admin
    .from("tmdb_metadata")
    .select("director_tmdb_id, related_seeds_fetched_at")
    .eq("media_type", mediaType)
    .eq("tmdb_id", tmdbId)
    .maybeSingle();
  const dirId = (seedRow as { director_tmdb_id?: number | null } | null)?.director_tmdb_id;
  if (!dirId) return null;
  const { data } = await admin
    .from("tmdb_metadata")
    .select("tmdb_id")
    .eq("media_type", mediaType)
    .eq("director_tmdb_id", dirId)
    .limit(60);
  return (data ?? []).length;
}

async function main() {
  console.log(`[parity] REST_URL=${REST_URL}`);
  console.log(`[parity] 대표 샘플 ${SEEDS.length}건 검증 시작\n`);

  let found = 0;
  let hasEmbedding = 0;
  let rpcNonEmpty = 0;
  let rpcError = 0;
  const latencies: number[] = [];
  const rows: string[] = [];

  for (const seed of SEEDS) {
    const s = await findSeed(seed);
    if (!s) {
      rows.push(`❌ ${seed.label.padEnd(18)} | 미러에서 미발견`);
      continue;
    }
    found++;
    const emb = parseEmbedding(s.embedding);
    const dirCount = await directorWorksCount(s.tmdb_id, s.media_type);
    const dirStr = dirCount == null ? "감독미상" : `감독작 ${dirCount}`;

    if (!emb) {
      rows.push(
        `⚠️  ${seed.label.padEnd(18)} | id=${s.tmdb_id} 임베딩 없음 → TMDB fallback | ${dirStr}`,
      );
      continue;
    }
    hasEmbedding++;

    const { rows: nn, ms, error } = await nnRecommendations(emb, s.media_type, s.tmdb_id);
    latencies.push(ms);
    if (error) {
      rpcError++;
      rows.push(`🔴 ${seed.label.padEnd(18)} | RPC 오류: ${error} (${ms}ms)`);
      continue;
    }
    if (nn.length === 0) {
      rows.push(`⬜ ${seed.label.padEnd(18)} | 빈 결과 (${ms}ms) | ${dirStr}`);
      continue;
    }
    rpcNonEmpty++;
    const top = nn
      .slice(0, 8)
      .map((r) => `${r.title ?? r.title_en}(${Number(r.similarity).toFixed(3)})`)
      .join(", ");
    rows.push(
      `✅ ${seed.label.padEnd(18)} | ${nn.length}건 ${ms}ms | ${dirStr}\n      top8: ${top}`,
    );
  }

  console.log(rows.join("\n"));

  const avg = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : 0;
  const p95 = latencies.length
    ? [...latencies].sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)]
    : 0;

  console.log(`\n──── 요약 ────`);
  console.log(`대표 샘플: ${SEEDS.length}`);
  console.log(`미러 발견: ${found}/${SEEDS.length}`);
  console.log(`임베딩 보유: ${hasEmbedding}/${found} (없으면 TMDB fallback 정상)`);
  console.log(`RPC 비어있지 않음: ${rpcNonEmpty}/${hasEmbedding}`);
  console.log(`RPC 오류: ${rpcError}`);
  console.log(`RPC latency avg=${avg}ms p95=${p95}ms`);
}

main().catch((e) => {
  console.error("[parity] fatal:", e);
  process.exit(1);
});
