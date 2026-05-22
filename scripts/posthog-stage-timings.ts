/**
 * 추천 파이프라인 단계별 timing 회귀 분석.
 *
 * enrich 단계만 회귀인지 (mirror/TMDB hydrate) vs 모든 단계 회귀인지
 * (Vercel function cold start) 판별용.
 *
 * 호출:
 *   POSTHOG_PROJECT_ID=... POSTHOG_PERSONAL_API_KEY=... \
 *     npx tsx scripts/posthog-stage-timings.ts
 */
import { writeFileSync } from "node:fs";

const PH_HOST = (process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
const PH_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const PH_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;

if (!PH_PROJECT_ID || !PH_API_KEY) {
  console.error("[stage-timings] missing POSTHOG_PROJECT_ID or POSTHOG_PERSONAL_API_KEY");
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

// 단계별 p50 일별 추이 (14일) — match / gather / enrich / filter / llm
// (recommend.ts mark() 키 = cold/match/gather/enrich/filter/llm)
const Q_STAGES_DAILY = `
SELECT
  toDate(timestamp) AS day,
  count(*) AS n,
  round(quantile(0.5)(toFloat(properties.srv_match_ms)), 0) AS match_p50,
  round(quantile(0.5)(toFloat(properties.srv_gather_ms)), 0) AS gather_p50,
  round(quantile(0.5)(toFloat(properties.srv_enrich_ms)), 0) AS enrich_p50,
  round(quantile(0.5)(toFloat(properties.srv_filter_ms)), 0) AS filter_p50,
  round(quantile(0.5)(toFloat(properties.srv_llm_ms)), 0) AS llm_p50
FROM events
WHERE event = 'recommendation_loaded'
  AND properties.streamed = true
  AND properties.srv_enrich_ms IS NOT NULL
  AND timestamp >= now() - INTERVAL 14 DAY
GROUP BY day
ORDER BY day
`;

// cold start 의심도 — duration_ms 도 같이 보기 (전체 wall time)
const Q_DURATION_DAILY = `
SELECT
  toDate(timestamp) AS day,
  count(*) AS n,
  round(quantile(0.5)(toFloat(properties.duration_ms)), 0) AS dur_p50,
  round(quantile(0.95)(toFloat(properties.duration_ms)), 0) AS dur_p95
FROM events
WHERE event = 'recommendation_loaded'
  AND properties.duration_ms IS NOT NULL
  AND timestamp >= now() - INTERVAL 14 DAY
GROUP BY day
ORDER BY day
`;

// favorites 분포 — cold_start_version 추세 (v1 vs v2 비율 변화 → candidate gather 다양화 추론)
const Q_COLD_START_VERSION_DAILY = `
SELECT
  toDate(timestamp) AS day,
  count(*) AS total,
  countIf(properties.cold_start_version = 'v2') AS v2_count,
  round(countIf(properties.cold_start_version = 'v2') * 100.0 / count(*), 1) AS v2_pct,
  round(avg(toFloat(properties.favorites_count)), 1) AS avg_favorites,
  round(avg(toFloat(properties.taste_genres_count)), 1) AS avg_taste_genres
FROM events
WHERE event = 'recommendation_loaded'
  AND timestamp >= now() - INTERVAL 14 DAY
GROUP BY day
ORDER BY day
`;

// cold_start (favorites=[]) vs 정상 사용자 분리 — 메트릭 오염 여부 진단
const Q_BY_COLD_START = `
SELECT
  toDate(timestamp) AS day,
  countIf(properties.cold_start = true) AS cold_n,
  countIf(properties.cold_start = false) AS warm_n,
  round(quantile(0.5)(if(properties.cold_start = true, toFloat(properties.srv_enrich_ms), NULL)), 0) AS cold_enrich_p50,
  round(quantile(0.5)(if(properties.cold_start = false, toFloat(properties.srv_enrich_ms), NULL)), 0) AS warm_enrich_p50,
  round(quantile(0.5)(if(properties.cold_start = true, toFloat(properties.srv_llm_ms), NULL)), 0) AS cold_llm_p50,
  round(quantile(0.5)(if(properties.cold_start = false, toFloat(properties.srv_llm_ms), NULL)), 0) AS warm_llm_p50
FROM events
WHERE event = 'recommendation_loaded'
  AND properties.streamed = true
  AND properties.srv_enrich_ms IS NOT NULL
  AND timestamp >= now() - INTERVAL 14 DAY
GROUP BY day
ORDER BY day
`;

function fmt(v: unknown, suffix = ""): string {
  if (v === null || v === undefined) return "—";
  return `${v}${suffix}`;
}

async function main() {
  const [rStages, rDur, rV2, rCS] = await Promise.all([
    hogQL("stages", Q_STAGES_DAILY),
    hogQL("duration", Q_DURATION_DAILY),
    hogQL("v2_split", Q_COLD_START_VERSION_DAILY),
    hogQL("cold_start_split", Q_BY_COLD_START),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  const lines: string[] = [];
  lines.push(`# 추천 파이프라인 단계별 timing 회귀 분석 — ${today}`);
  lines.push("");
  lines.push("> enrich 단독 회귀 vs 전체 stage 회귀 vs duration 회귀 구분");
  lines.push("");

  lines.push("## 1) 단계별 p50 일별 (14일, streamed=true)");
  lines.push("");
  lines.push("| day | n | match | gather | enrich | filter | llm |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const row of rStages.results) {
    const [day, n, m, g, e, f, l] = row;
    lines.push(
      `| ${fmt(day)} | ${fmt(n)} | ${fmt(m, "ms")} | ${fmt(g, "ms")} | ${fmt(e, "ms")} | ${fmt(f, "ms")} | ${fmt(l, "ms")} |`,
    );
  }
  lines.push("");
  lines.push("**해석:**");
  lines.push("- enrich 단독 회귀 시: mirror lookup 또는 Supabase admin connection 문제");
  lines.push("- match/gather/filter 동시 회귀 시: Vercel function cold start");
  lines.push("- llm 단독 회귀 시: OpenAI API latency 또는 prompt cache evict");
  lines.push("");

  lines.push("## 2) duration_ms (전체 wall time) 일별");
  lines.push("");
  lines.push("| day | n | p50 | p95 |");
  lines.push("|---|---|---|---|");
  for (const row of rDur.results) {
    const [day, n, p50, p95] = row;
    lines.push(`| ${fmt(day)} | ${fmt(n)} | ${fmt(p50, "ms")} | ${fmt(p95, "ms")} |`);
  }
  lines.push("");

  lines.push("## 3) Cold start version + favorites 분포");
  lines.push("");
  lines.push("| day | total | v2_count | v2_pct | avg_favorites | avg_taste_genres |");
  lines.push("|---|---|---|---|---|---|");
  for (const row of rV2.results) {
    const [day, total, v2c, v2p, avgF, avgT] = row;
    lines.push(
      `| ${fmt(day)} | ${fmt(total)} | ${fmt(v2c)} | ${fmt(v2p, "%")} | ${fmt(avgF)} | ${fmt(avgT)} |`,
    );
  }
  lines.push("");
  lines.push("**해석:** v2 비율 또는 avg_favorites 가 5/13 점프 시 candidate gather 다양화 → mirror miss 증가 가설 지지");
  lines.push("");

  lines.push("## 4) cold_start (favorites=[]) 분리 — 메트릭 오염 진단");
  lines.push("");
  lines.push("| day | cold_n | warm_n | cold enrich p50 | warm enrich p50 | cold llm p50 | warm llm p50 |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const row of rCS.results) {
    const [day, coldN, warmN, ce, we, cl, wl] = row;
    lines.push(
      `| ${fmt(day)} | ${fmt(coldN)} | ${fmt(warmN)} | ${fmt(ce, "ms")} | ${fmt(we, "ms")} | ${fmt(cl, "ms")} | ${fmt(wl, "ms")} |`,
    );
  }
  lines.push("");
  lines.push("**해석:** warm 사용자 (favorites 보유) p50 이 안정적이라면 회귀는 cold_start 호출 (시뮬레이터 fresh state) 오염. cold/warm 둘 다 회귀라면 인프라 회귀.");
  lines.push("");

  const md = lines.join("\n");
  console.log(md);
  writeFileSync("posthog-stage-timings-result.md", md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
