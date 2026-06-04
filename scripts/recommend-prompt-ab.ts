/**
 * recommend-prompt-ab — 옛 vs 새 CURATION_SYSTEM_PROMPT A/B 비교.
 *
 * 변경 commit (7c013c9) 의 system prompt 확장 (380→1040 토큰) 이 추천 결과에
 * 어떤 영향을 주는지 측정. 같은 후보 + favorites 시드를 양쪽 prompt 에 전달하고
 * picks 일치율 / reason 길이 분포 / 톤 위반율 비교.
 *
 * 실행:
 *   # 1) 옛 (baseline) prompt 추출 — 비교 대상 git ref 의 prompt.ts 에서 발췌
 *   #    아래 line range 는 commit 마다 달라질 수 있음. CURATION_SYSTEM_PROMPT 정의 위치.
 *   git show HEAD~3:apps/web/src/lib/recommend/prompt.ts | sed -n '17,90p' > /tmp/old-prompt.txt
 *
 *   # 2) 환경변수 + 실행
 *   cd /Users/james/Projects/neko/apps/web
 *   set -a; source .env.local; source .env; set +a
 *   npx tsx ../../scripts/recommend-prompt-ab.ts
 *
 *   # OLD_PROMPT_PATH 로 baseline 위치 override 가능 (기본 /tmp/old-prompt.txt)
 *
 * 환경:
 *   - OPENAI_API_KEY: gpt-4o-mini 호출
 *   - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: tmdb_metadata 후보 fetch
 *
 * 비용: 시드 3 × prompt 2 = 6 호출 ≈ $0.01~0.03 (gpt-4o-mini, 1.5k input + 1k output)
 */

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_KEY) {
  console.error(
    "[prompt-ab] OPENAI_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락",
  );
  process.exit(1);
}

const SAMPLE_SEEDS: Array<{ label: string; favorites: string[] }> = [
  {
    label: "K-드라마 + 한국 영화",
    favorites: ["기생충", "오징어 게임", "더 글로리", "헤어질 결심"],
  },
  {
    label: "해외 명작 + SF",
    favorites: ["인터스텔라", "대부", "라라랜드", "퍼니셔"],
  },
  {
    label: "애니 + 잔잔한 결",
    favorites: ["너의 이름은.", "센과 치히로의 행방불명", "어바웃 타임"],
  },
];

interface CandidateRow {
  tmdb_id: number;
  title: string;
  media_type: "movie" | "tv";
  release_date: string | null;
  rating: number | null;
  overview: string | null;
  genre_ids: number[] | null;
}

interface Pick {
  id: number;
  reason: string;
}

// ─── prompt 로드 ──────────────────────────────────────────────────────
const OLD_PROMPT_PATH = process.env.OLD_PROMPT_PATH ?? "/tmp/old-prompt.txt";
const oldPromptText = readFileSync(resolve(OLD_PROMPT_PATH), "utf8")
  .replace(/^export const CURATION_SYSTEM_PROMPT = `/, "")
  .replace(/`;?\s*$/, "");

const newPromptText = (() => {
  const file = readFileSync(
    resolve(
      "/Users/james/Projects/neko/apps/web/src/lib/recommend/prompt.ts",
    ),
    "utf8",
  );
  const start = file.indexOf("export const CURATION_SYSTEM_PROMPT = `");
  if (start < 0) throw new Error("새 prompt 시작 마커 못 찾음");
  const bodyStart = start + "export const CURATION_SYSTEM_PROMPT = `".length;
  const end = file.indexOf("`;", bodyStart);
  if (end < 0) throw new Error("새 prompt 종료 마커 못 찾음");
  return file.slice(bodyStart, end);
})();

console.log(
  `[prompt-ab] old prompt ${oldPromptText.length} chars, new prompt ${newPromptText.length} chars (delta +${newPromptText.length - oldPromptText.length})`,
);

// ─── 후보 fetch ──────────────────────────────────────────────────────
async function fetchCandidates(): Promise<CandidateRow[]> {
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // KR 가용 + 인기작 75개. providers != null 필터.
  const { data, error } = await admin
    .from("tmdb_metadata")
    .select(
      "tmdb_id, title, media_type, release_date, rating, overview, genre_ids",
    )
    .not("providers", "is", null)
    .gte("rating", 6.5)
    .order("rating", { ascending: false, nullsFirst: false })
    .limit(75);
  if (error) {
    console.error("[prompt-ab] 후보 fetch 실패:", error);
    process.exit(1);
  }
  return (data ?? []) as CandidateRow[];
}

// ─── candidate listing 직렬화 (prompt.ts:278 동일 구조) ────────────────
function buildCandidateList(candidates: CandidateRow[]): string {
  return candidates
    .map((c) => {
      const year = (c.release_date ?? "").slice(0, 4);
      const kind = c.media_type === "tv" ? "시리즈" : "영화";
      const rating = (c.rating ?? 0).toFixed(1);
      const overview = (c.overview ?? "").replace(/\s+/g, " ").slice(0, 80);
      return `[ID:${c.tmdb_id}] ${c.title} (${kind}, ${year}, 평점 ${rating}) — ${overview}`;
    })
    .join("\n");
}

function buildUserPrompt(candidates: CandidateRow[], favorites: string[]): string {
  return `[큐레이션 모드: 혼합]
사용자가 좋아하는 작품을 어느 정도 알고 있습니다. 취향 50%, 새 발견 50%.

[이 사용자가 좋아한 작품]
${favorites.join(", ")}

[후보 작품 (이 안에서 20개 선택)]
${buildCandidateList(candidates)}`;
}

// ─── LLM 호출 ────────────────────────────────────────────────────────
const openai = new OpenAI({ apiKey: OPENAI_KEY });

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ picks: Pick[]; usage: { prompt: number; completion: number; cached: number } }> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.8,
  });
  const usage = {
    prompt: response.usage?.prompt_tokens ?? 0,
    completion: response.usage?.completion_tokens ?? 0,
    cached: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
  };
  const content = response.choices[0].message.content;
  if (!content) return { picks: [], usage };
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const arr = (parsed.selected ?? parsed.recommendations ?? []) as unknown[];
    const picks: Pick[] = [];
    for (const item of arr) {
      if (
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).id === "number" &&
        typeof (item as Record<string, unknown>).reason === "string"
      ) {
        const x = item as { id: number; reason: string };
        picks.push({ id: x.id, reason: x.reason });
      }
    }
    return { picks, usage };
  } catch {
    return { picks: [], usage };
  }
}

// ─── 메트릭 ──────────────────────────────────────────────────────────
function reasonLengthStats(picks: Pick[]) {
  const lens = picks.map((p) => p.reason.trim().length);
  if (lens.length === 0) return { count: 0, avg: 0, min: 0, max: 0, under20: 0, over30: 0 };
  const sum = lens.reduce((a, b) => a + b, 0);
  return {
    count: lens.length,
    avg: +(sum / lens.length).toFixed(1),
    min: Math.min(...lens),
    max: Math.max(...lens),
    under20: lens.filter((l) => l < 20).length,
    over30: lens.filter((l) => l > 30).length,
  };
}

const FORMAL_TONE = /합니다|입니다|드립니다|됩니다|시오\b/;
const ADJ_LIST = /(이고|이며|하고)\s*\S+(이고|이며|하고)/;

function toneViolations(picks: Pick[]) {
  let formal = 0;
  let adjList = 0;
  for (const p of picks) {
    if (FORMAL_TONE.test(p.reason)) formal += 1;
    if (ADJ_LIST.test(p.reason)) adjList += 1;
  }
  return { formal, adjList };
}

function overlap(a: Pick[], b: Pick[]) {
  const aIds = new Set(a.map((p) => p.id));
  const bIds = new Set(b.map((p) => p.id));
  const inter = [...aIds].filter((id) => bIds.has(id));
  const union = new Set([...aIds, ...bIds]);
  return {
    intersect: inter.length,
    union: union.size,
    jaccard: union.size === 0 ? 0 : +((inter.length / union.size) * 100).toFixed(1),
  };
}

// ─── main ────────────────────────────────────────────────────────────
async function main() {
  const startedAt = Date.now();
  console.log("[prompt-ab] 후보 fetch 중...");
  const candidates = await fetchCandidates();
  console.log(`[prompt-ab] 후보 ${candidates.length}건 확보`);

  const seedResults: Array<{
    label: string;
    favorites: string[];
    old: { picks: Pick[]; usage: { prompt: number; completion: number; cached: number } };
    fresh: { picks: Pick[]; usage: { prompt: number; completion: number; cached: number } };
  }> = [];

  for (const seed of SAMPLE_SEEDS) {
    console.log(`\n[prompt-ab] 시드: ${seed.label}`);
    const userPrompt = buildUserPrompt(candidates, seed.favorites);

    console.log(`  ↳ OLD prompt 호출...`);
    const oldRes = await callLLM(oldPromptText, userPrompt);
    console.log(`  ↳ NEW prompt 호출...`);
    const newRes = await callLLM(newPromptText, userPrompt);

    seedResults.push({
      label: seed.label,
      favorites: seed.favorites,
      old: oldRes,
      fresh: newRes,
    });
  }

  // ─── 리포트 ─────────────────────────────────────────────────────────
  console.log("\n\n===== A/B Comparison Report =====\n");

  for (const r of seedResults) {
    console.log(`▸ ${r.label}`);
    console.log(`  favorites: ${r.favorites.join(", ")}`);
    console.log(`  picks: old=${r.old.picks.length} / new=${r.fresh.picks.length}`);

    const ov = overlap(r.old.picks, r.fresh.picks);
    console.log(`  overlap: ${ov.intersect}/${ov.union} (Jaccard ${ov.jaccard}%)`);

    const oldLen = reasonLengthStats(r.old.picks);
    const newLen = reasonLengthStats(r.fresh.picks);
    console.log(
      `  reason length — OLD: avg ${oldLen.avg} (min ${oldLen.min}, max ${oldLen.max}, <20 ${oldLen.under20}, >30 ${oldLen.over30})`,
    );
    console.log(
      `  reason length — NEW: avg ${newLen.avg} (min ${newLen.min}, max ${newLen.max}, <20 ${newLen.under20}, >30 ${newLen.over30})`,
    );

    const oldTone = toneViolations(r.old.picks);
    const newTone = toneViolations(r.fresh.picks);
    console.log(
      `  tone violations — OLD: formal ${oldTone.formal}, adj-list ${oldTone.adjList} / NEW: formal ${newTone.formal}, adj-list ${newTone.adjList}`,
    );

    console.log(
      `  tokens — OLD: ${r.old.usage.prompt}p+${r.old.usage.completion}c (cached ${r.old.usage.cached}) / NEW: ${r.fresh.usage.prompt}p+${r.fresh.usage.completion}c (cached ${r.fresh.usage.cached})`,
    );

    // 샘플 reason 3개 비교
    console.log(`  sample reasons:`);
    const sample = Math.min(3, r.old.picks.length, r.fresh.picks.length);
    for (let i = 0; i < sample; i++) {
      console.log(`    OLD#${i}: "${r.old.picks[i]?.reason}"`);
      console.log(`    NEW#${i}: "${r.fresh.picks[i]?.reason}"`);
    }
    console.log("");
  }

  // ─── 합산 ──────────────────────────────────────────────────────────
  console.log("===== 합산 =====");
  const allOld = seedResults.flatMap((r) => r.old.picks);
  const allNew = seedResults.flatMap((r) => r.fresh.picks);
  const aggOldLen = reasonLengthStats(allOld);
  const aggNewLen = reasonLengthStats(allNew);
  const aggOldTone = toneViolations(allOld);
  const aggNewTone = toneViolations(allNew);
  console.log(`총 picks: OLD ${allOld.length} / NEW ${allNew.length}`);
  console.log(`reason length avg — OLD ${aggOldLen.avg}자 / NEW ${aggNewLen.avg}자`);
  console.log(`reason <20자 위반 — OLD ${aggOldLen.under20} / NEW ${aggNewLen.under20}`);
  console.log(`reason >30자 위반 — OLD ${aggOldLen.over30} / NEW ${aggNewLen.over30}`);
  console.log(`격식체 위반 — OLD ${aggOldTone.formal} / NEW ${aggNewTone.formal}`);
  console.log(`형용사 나열 — OLD ${aggOldTone.adjList} / NEW ${aggNewTone.adjList}`);

  const totalPromptTokensOld = seedResults.reduce((s, r) => s + r.old.usage.prompt, 0);
  const totalPromptTokensNew = seedResults.reduce((s, r) => s + r.fresh.usage.prompt, 0);
  const totalCachedOld = seedResults.reduce((s, r) => s + r.old.usage.cached, 0);
  const totalCachedNew = seedResults.reduce((s, r) => s + r.fresh.usage.cached, 0);
  console.log(
    `\n토큰 — OLD prompt ${totalPromptTokensOld} (cached ${totalCachedOld}) / NEW prompt ${totalPromptTokensNew} (cached ${totalCachedNew})`,
  );
  console.log(
    `prompt 토큰 delta: +${totalPromptTokensNew - totalPromptTokensOld} (cache hit 기대치: ≥1024 토큰)`,
  );

  console.log(`\n총 소요 ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

void main().catch((err) => {
  console.error("[prompt-ab] FATAL:", err);
  process.exit(1);
});
