/**
 * Tier 3 P0-A (2026-06-10) — broader query.
 *
 * phase-d-baseline 의 표본 절벽 (06-08~09 합쳐 4건, 06-06 104건 대비 96% 감소) +
 * srv_diversity_axis / srv_temperature / srv_seed 100% null 진단용.
 *
 * 가설:
 *   (a) prod 트래픽 자체 감소 — TestFlight 미배포 + 출시 전 자연 감소
 *   (b) PostHog event 송출 회귀 — recommendation_loaded 자체가 안 들어옴
 *   (c) streaming meta chunk 누락 — server→client onMeta forward 실패
 *
 * 검증:
 *   1. recommendation_loaded total + distinct_id + streamed 분포 (06-04 ~ 06-09)
 *   2. has_srv_candidates / has_srv_diversity_axis / has_srv_temperature / has_srv_seed bool 분포
 *   3. cold_start_v1 vs v2 + favorites_count 분포 (cold-start 비중 확인 — onMeta 미호출 path)
 *   4. excludeIds 누적 의심 — srv_rank_ms p50 일별 (excludeCount cutoff 발현 확인)
 *   5. native vs web distinct_id 비교 (native 측 회귀 격리)
 */
import { writeFileSync } from "node:fs";

const PH_HOST = (process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
const PH_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const PH_API_KEY = process.env.POSTHOG_PAT || process.env.POSTHOG_PERSONAL_API_KEY;

if (!PH_PROJECT_ID || !PH_API_KEY) {
  console.error("[broader] missing POSTHOG_PROJECT_ID or POSTHOG_PAT");
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

// 1) 일별 total + distinct_id + streamed pct (트래픽 절벽 직접 확인)
const Q1 = `
SELECT
  toDate(timestamp) AS day,
  count(*) AS total,
  uniq(distinct_id) AS distinct_users,
  countIf(properties.streamed = true) AS streamed_n,
  round(countIf(properties.streamed = true) * 100.0 / nullif(count(*), 0), 1) AS streamed_pct
FROM events
WHERE event = 'recommendation_loaded'
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY day
ORDER BY day
`;

// 2) srv_* props 송출 분포 — 어떤 prop 이 송출됐고 어떤 게 누락됐는지
const Q2 = `
SELECT
  toDate(timestamp) AS day,
  count(*) AS total,
  countIf(properties.srv_candidates_ms IS NOT NULL) AS has_candidates_ms,
  countIf(properties.srv_rank_ms IS NOT NULL) AS has_rank_ms,
  countIf(properties.srv_diversity_axis IS NOT NULL) AS has_axis,
  countIf(properties.srv_temperature IS NOT NULL) AS has_temperature,
  countIf(properties.srv_seed IS NOT NULL) AS has_seed,
  countIf(properties.srv_enrich_ms IS NOT NULL) AS has_enrich_ms,
  countIf(properties.srv_cold_ms IS NOT NULL) AS has_cold_ms
FROM events
WHERE event = 'recommendation_loaded'
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY day
ORDER BY day
`;

// 3) cold_start vs warm — favorites_count 분포 (cold-start 는 onMeta 미호출 path)
const Q3 = `
SELECT
  toDate(timestamp) AS day,
  count(*) AS total,
  countIf(toFloat(properties.favorites_count) = 0) AS cold_warm_split_cold,
  countIf(toFloat(properties.favorites_count) > 0) AS cold_warm_split_warm,
  countIf(properties.cold_start_version = 'v1') AS v1,
  countIf(properties.cold_start_version = 'v2') AS v2
FROM events
WHERE event = 'recommendation_loaded'
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY day
ORDER BY day
`;

// 4) timings p50 일별 추세 (06-06 vs 06-08~09 회귀 추적)
const Q4 = `
SELECT
  toDate(timestamp) AS day,
  count(*) AS n,
  round(quantile(0.5)(toFloat(properties.srv_candidates_ms)), 0) AS candidates_p50,
  round(quantile(0.5)(toFloat(properties.srv_rank_ms)), 0) AS rank_p50,
  round(quantile(0.5)(toFloat(properties.srv_enrich_ms)), 0) AS enrich_p50,
  round(quantile(0.5)(toFloat(properties.duration_ms)), 0) AS duration_p50,
  round(quantile(0.5)(toFloat(properties.srv_first_card_ms)), 0) AS first_card_p50
FROM events
WHERE event = 'recommendation_loaded'
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY day
ORDER BY day
`;

// 5) distinct_id 별 호출 빈도 — 같은 사용자 반복 vs 다양한 사용자
const Q5 = `
SELECT
  toDate(timestamp) AS day,
  uniq(distinct_id) AS distinct_users,
  count(*) AS total,
  round(count(*) / nullif(uniq(distinct_id), 0), 2) AS calls_per_user
FROM events
WHERE event = 'recommendation_loaded'
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY day
ORDER BY day
`;

// 6) source 분포 — native 앱 vs web 분리
const Q6 = `
SELECT
  toDate(timestamp) AS day,
  countIf(properties.$lib = 'web') AS web,
  countIf(properties.$lib = 'posthog-react-native') AS native,
  countIf(properties.$lib NOT IN ('web', 'posthog-react-native') OR properties.$lib IS NULL) AS other,
  count(*) AS total
FROM events
WHERE event = 'recommendation_loaded'
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY day
ORDER BY day
`;

const QUERIES: Array<{ label: string; query: string }> = [
  { label: "1. 일별 total + distinct_users + streamed pct (트래픽 절벽 진단)", query: Q1 },
  { label: "2. srv_* props 송출 분포 (어떤 prop 이 누락됐는가)", query: Q2 },
  { label: "3. cold_start vs warm + v1/v2 분포", query: Q3 },
  { label: "4. timings p50 일별 추세 (회귀 추적)", query: Q4 },
  { label: "5. 호출 빈도 — 같은 사용자 반복 vs 다양한 사용자", query: Q5 },
  { label: "6. source 분포 — native vs web", query: Q6 },
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
    `# Tier 3 P0-A broader baseline ${today}`,
    "",
    "phase-d-baseline 의 표본 절벽 (06-08~09 합쳐 4건) + axis/temperature/seed 100% null 진단.",
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

  const outPath = `_workspace/tier3-broader-${today}.md`;
  writeFileSync(outPath, sections.join("\n"));
  console.log(`\n✓ saved → ${outPath}`);
})();
