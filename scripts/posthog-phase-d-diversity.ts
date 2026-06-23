/**
 * Phase D-1 (2026-06-07) — Tier 3 Phase A+B+C+B-3.2 효과 PostHog 실측.
 *
 * 측정 대상 PR (2026-06-06 main land):
 *   #24 Phase A   — LLM diversity (temperature / seed / axis)
 *   #25 Phase B   — 2-stage (candidate gen + ranking + fallback ladder)
 *   #26 Phase C   — diversity reorder (배치 내 순서)
 *   #27 B-3.2     — candidate pool stochasticity (top-K + sqrt weighted)
 *
 * **한계:** `recommendation_loaded` event 가 `tmdb_ids` 목록을 송출하지 않음 →
 * 같은 사용자 5회 호출 overlap (Jaccard) 직접 측정 불가. 본 script 는
 * **송출되는 props 분포** 로 indirect 검증:
 *   1. 2-stage 정상 진입 vs fallback 비율 (Phase B 동작 확인)
 *   2. timings p50/p95 (Phase B 인덱스 정착 + B-3.2 영향)
 *   3. diversity_axis 분포 (Phase A-3 균등 random pick)
 *   4. temperature 분포 (Phase A-1 cutoff)
 *   5. seed uniqueness — distinct seed / 호출 (Phase A-2 randomization)
 *   6. cold start 비율 (CLAUDE.md srv_enrich_ms > 1000 정의 + srv_cold_ms 키)
 *
 * 호출:
 *   POSTHOG_PROJECT_ID=... POSTHOG_PAT=... \
 *     npx tsx scripts/posthog-phase-d-diversity.ts
 *
 * 출력: `_workspace/phase-d-baseline-YYYY-MM-DD.md` + stdout.
 */
import { writeFileSync } from "node:fs";

const PH_HOST = (process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
const PH_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const PH_API_KEY = process.env.POSTHOG_PAT || process.env.POSTHOG_PERSONAL_API_KEY;

if (!PH_PROJECT_ID || !PH_API_KEY) {
  console.error("[phase-d] missing POSTHOG_PROJECT_ID or POSTHOG_PAT");
  process.exit(1);
}

type HogQLResult = { results: unknown[][]; columns: string[] };

async function hogQL(label: string, query: string): Promise<HogQLResult> {
  const res = await fetch(`${PH_HOST}/api/projects/${PH_PROJECT_ID}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PH_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[${label}] HogQL ${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as HogQLResult;
}

// ── 1) 2-stage 정상 진입 vs fallback 비율 (Phase B 핵심 검증)
const Q_PIPELINE_PATH = `
SELECT
  toDate(timestamp) AS day,
  count(*) AS total,
  countIf(properties.srv_candidates_ms IS NOT NULL AND properties.srv_fallback_ms IS NULL) AS two_stage,
  countIf(properties.srv_fallback_ms IS NOT NULL) AS fallback,
  countIf(properties.srv_cold_ms IS NOT NULL) AS cold_start,
  round(
    countIf(properties.srv_candidates_ms IS NOT NULL AND properties.srv_fallback_ms IS NULL) * 100.0
    / nullif(count(*), 0), 1
  ) AS two_stage_pct,
  round(
    countIf(properties.srv_fallback_ms IS NOT NULL) * 100.0
    / nullif(count(*), 0), 1
  ) AS fallback_pct
FROM events
WHERE event = 'recommendation_loaded'
  AND timestamp >= now() - INTERVAL 3 DAY
GROUP BY day
ORDER BY day
`;

// ── 2) Phase B timings p50/p95 (인덱스 정착 + B-3.2 영향)
const Q_TIMINGS_DISTRIB = `
SELECT
  count(*) AS n,
  round(quantile(0.5)(toFloat(properties.srv_candidates_ms)), 0) AS candidates_p50,
  round(quantile(0.95)(toFloat(properties.srv_candidates_ms)), 0) AS candidates_p95,
  round(quantile(0.5)(toFloat(properties.srv_rank_ms)), 0) AS rank_p50,
  round(quantile(0.95)(toFloat(properties.srv_rank_ms)), 0) AS rank_p95,
  round(quantile(0.5)(toFloat(properties.srv_match_ms)), 0) AS match_p50,
  round(quantile(0.95)(toFloat(properties.srv_match_ms)), 0) AS match_p95
FROM events
WHERE event = 'recommendation_loaded'
  AND properties.srv_candidates_ms IS NOT NULL
  AND properties.srv_fallback_ms IS NULL
  AND timestamp >= now() - INTERVAL 3 DAY
`;

// ── 3) Phase A-3 diversity_axis 분포 (균등 random pick 검증)
const Q_AXIS_DISTRIB = `
SELECT
  coalesce(properties.srv_diversity_axis, '(null)') AS axis,
  count(*) AS n,
  round(count(*) * 100.0 / sum(count(*)) OVER (), 1) AS pct
FROM events
WHERE event = 'recommendation_loaded'
  AND timestamp >= now() - INTERVAL 3 DAY
GROUP BY axis
ORDER BY n DESC
`;

// ── 4) Phase A-1 temperature 분포 (excludeCount cutoff 발현)
const Q_TEMPERATURE_DISTRIB = `
SELECT
  toFloat(properties.srv_temperature) AS temperature,
  count(*) AS n,
  round(count(*) * 100.0 / sum(count(*)) OVER (), 1) AS pct
FROM events
WHERE event = 'recommendation_loaded'
  AND properties.srv_temperature IS NOT NULL
  AND timestamp >= now() - INTERVAL 3 DAY
GROUP BY temperature
ORDER BY temperature
`;

// ── 5) Phase A-2 seed uniqueness — 결정성 의도적 파괴 검증
const Q_SEED_UNIQUENESS = `
SELECT
  count(*) AS calls,
  uniq(properties.srv_seed) AS unique_seeds,
  round(uniq(properties.srv_seed) * 100.0 / count(*), 2) AS unique_pct
FROM events
WHERE event = 'recommendation_loaded'
  AND properties.srv_seed IS NOT NULL
  AND timestamp >= now() - INTERVAL 3 DAY
`;

// ── 6) cold start pct 일별 — CLAUDE.md 정의 (srv_enrich_ms > 1000)
const Q_COLD_PCT = `
SELECT
  toDate(timestamp) AS day,
  count(*) AS total,
  countIf(toFloat(properties.srv_enrich_ms) > 1000) AS cold_likely,
  round(
    countIf(toFloat(properties.srv_enrich_ms) > 1000) * 100.0
    / nullif(count(*), 0), 1
  ) AS cold_pct
FROM events
WHERE event = 'recommendation_loaded'
  AND properties.srv_enrich_ms IS NOT NULL
  AND timestamp >= now() - INTERVAL 3 DAY
GROUP BY day
ORDER BY day
`;

const QUERIES: Array<{ label: string; query: string }> = [
  { label: "1. pipeline path (2-stage vs fallback)", query: Q_PIPELINE_PATH },
  { label: "2. Phase B timings p50/p95", query: Q_TIMINGS_DISTRIB },
  { label: "3. diversity_axis 분포", query: Q_AXIS_DISTRIB },
  { label: "4. temperature 분포", query: Q_TEMPERATURE_DISTRIB },
  { label: "5. seed uniqueness", query: Q_SEED_UNIQUENESS },
  { label: "6. cold start pct 일별", query: Q_COLD_PCT },
];

function fmtTable(r: HogQLResult): string {
  if (r.results.length === 0) return "  (결과 없음)\n";
  const widths = r.columns.map((c, i) =>
    Math.max(c.length, ...r.results.map((row) => String(row[i] ?? "").length)),
  );
  const header = r.columns.map((c, i) => c.padEnd(widths[i])).join(" | ");
  const sep = widths.map((w) => "-".repeat(w)).join("-+-");
  const rows = r.results
    .map((row) =>
      row.map((v, i) => String(v ?? "").padEnd(widths[i])).join(" | "),
    )
    .join("\n");
  return `${header}\n${sep}\n${rows}\n`;
}

(async () => {
  const today = new Date().toISOString().slice(0, 10);
  const sections: string[] = [
    `# Phase D-1 baseline ${today} — Tier 3 효과 PostHog 실측`,
    "",
    "Phase A+B+C+B-3.2 prod merge 2026-06-06 10:09 UTC ~ 11:30 UTC 추정.",
    "본 측정은 send-props 분포 기반 indirect 검증 (overlap 직접 측정은 tmdb_ids props 미송출로 불가).",
    "",
  ];

  for (const { label, query } of QUERIES) {
    console.log(`\n=== ${label} ===`);
    try {
      const r = await hogQL(label, query);
      const tbl = fmtTable(r);
      console.log(tbl);
      sections.push(`## ${label}\n\n\`\`\`\n${tbl}\`\`\`\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(msg);
      sections.push(`## ${label}\n\n**ERROR:** ${msg}\n`);
    }
  }

  const outPath = `_workspace/phase-d-baseline-${today}.md`;
  writeFileSync(outPath, sections.join("\n"));
  console.log(`\n✓ saved → ${outPath}`);
})();
