/**
 * 2026-06-22 게이트 0 — Discover 로딩 13초 검증 (작업 1 scope 확정용).
 *
 * 목적: 13초가 p50(상시) vs p95(꼬리)인지, 병목 단계(llm/rank/fallback)가 무엇인지,
 *       streaming first-card 가 체감 단축에 기여하는지 측정으로 확정.
 *       측정 없이 LLM/fallback 코드를 손대는 헛수고 방지.
 *
 * 키 검증 완료 (코드 emit 대조):
 *   - duration_ms (client round-trip, prefix 無)
 *   - srv_{match,candidates,gather,fallback,enrich,filter,llm,rank}_ms (recommend.ts mark() 키)
 *   - srv_first_card_ms (streaming 첫 카드 도착)
 *   - streamed / cold_start / $lib
 *
 * 호출:
 *   POSTHOG_PROJECT_ID=... POSTHOG_PERSONAL_API_KEY=... \
 *     npx tsx scripts/posthog-gate0-loading-2026-06-22.ts
 * 출력: posthog-gate0-loading-result.md
 */
import { writeFileSync } from "node:fs";

const PH_HOST = (process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
const PH_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const PH_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;

if (!PH_PROJECT_ID || !PH_API_KEY) {
  console.error("[gate0] missing POSTHOG_PROJECT_ID or POSTHOG_PERSONAL_API_KEY");
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

function table(r: HogQLResult): string {
  if (!r.results.length) return "_(데이터 없음)_\n";
  const head = `| ${r.columns.join(" | ")} |`;
  const sep = `| ${r.columns.map(() => "---").join(" | ")} |`;
  const rows = r.results.map((row) => `| ${row.map((c) => (c === null ? "·" : String(c))).join(" | ")} |`);
  return [head, sep, ...rows].join("\n") + "\n";
}

// ── 1) 전체 분포 + over_13s 비율 (7일, $lib 분리)
const Q_OVERALL = `
SELECT
  coalesce(properties.$lib, '?') AS lib,
  count() AS total,
  countIf(toFloat(properties.duration_ms) > 13000) AS over_13s,
  round(countIf(toFloat(properties.duration_ms) > 13000) * 100.0 / count(), 1) AS over_13s_pct,
  round(quantile(0.5)(toFloat(properties.duration_ms)), 0) AS dur_p50,
  round(quantile(0.95)(toFloat(properties.duration_ms)), 0) AS dur_p95,
  round(quantile(0.5)(toFloat(properties.srv_first_card_ms)), 0) AS first_card_p50,
  countIf(properties.streamed = true) AS streamed_n,
  countIf(toFloat(properties.srv_fallback_ms) > 0) AS fallback_n
FROM events
WHERE event = 'recommendation_loaded'
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY lib ORDER BY total DESC
`;

// ── 2) 단계별 p50/p95 (7일) — 병목 단계 식별
const Q_STAGES = `
SELECT
  round(quantile(0.5)(toFloat(properties.srv_match_ms)), 0) AS match_p50,
  round(quantile(0.5)(toFloat(properties.srv_candidates_ms)), 0) AS cand_p50,
  round(quantile(0.5)(toFloat(properties.srv_gather_ms)), 0) AS gather_p50,
  round(quantile(0.5)(toFloat(properties.srv_llm_ms)), 0) AS llm_p50,
  round(quantile(0.95)(toFloat(properties.srv_llm_ms)), 0) AS llm_p95,
  round(quantile(0.5)(toFloat(properties.srv_rank_ms)), 0) AS rank_p50,
  round(quantile(0.95)(toFloat(properties.srv_rank_ms)), 0) AS rank_p95,
  round(quantile(0.5)(toFloat(properties.srv_enrich_ms)), 0) AS enrich_p50,
  round(quantile(0.5)(toFloat(properties.srv_filter_ms)), 0) AS filter_p50,
  round(quantile(0.5)(toFloat(properties.srv_fallback_ms)), 0) AS fallback_p50,
  round(quantile(0.95)(toFloat(properties.srv_fallback_ms)), 0) AS fallback_p95
FROM events
WHERE event = 'recommendation_loaded'
  AND timestamp >= now() - INTERVAL 7 DAY
  AND properties.srv_llm_ms IS NOT NULL
`;

// ── 3) 일별 추이 (7일) — 13초가 특정일/조건 집중인지
const Q_DAILY = `
SELECT
  toDate(timestamp) AS day,
  count() AS total,
  countIf(toFloat(properties.duration_ms) > 13000) AS over_13s,
  round(quantile(0.5)(toFloat(properties.duration_ms)), 0) AS dur_p50,
  round(quantile(0.95)(toFloat(properties.duration_ms)), 0) AS dur_p95,
  round(quantile(0.5)(toFloat(properties.srv_llm_ms)), 0) AS llm_p50,
  round(quantile(0.5)(toFloat(properties.srv_first_card_ms)), 0) AS first_card_p50,
  countIf(properties.streamed = true) AS streamed_n
FROM events
WHERE event = 'recommendation_loaded'
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY day ORDER BY day DESC
`;

// ── 4) 체감 격차 — first_card vs duration (streaming 효과)
const Q_PERCEIVED = `
SELECT
  coalesce(properties.$lib, '?') AS lib,
  countIf(properties.streamed = true) AS streamed_n,
  round(quantile(0.5)(toFloat(properties.srv_first_card_ms)), 0) AS first_card_p50,
  round(quantile(0.95)(toFloat(properties.srv_first_card_ms)), 0) AS first_card_p95,
  round(quantile(0.5)(toFloat(properties.duration_ms)), 0) AS dur_p50,
  countIf(toFloat(properties.srv_first_card_ms) < 3000) AS first_card_under_3s
FROM events
WHERE event = 'recommendation_loaded'
  AND properties.srv_first_card_ms IS NOT NULL
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY lib ORDER BY streamed_n DESC
`;

// ── 5) cold vs warm (병목 origin)
const Q_COLD = `
SELECT
  countIf(properties.cold_start = true) AS cold_n,
  countIf(properties.cold_start = false OR properties.cold_start IS NULL) AS warm_n,
  round(quantile(0.5)(if(properties.cold_start = true, toFloat(properties.duration_ms), NULL)), 0) AS cold_dur_p50,
  round(quantile(0.5)(if(properties.cold_start != true, toFloat(properties.duration_ms), NULL)), 0) AS warm_dur_p50,
  round(quantile(0.5)(if(properties.cold_start = true, toFloat(properties.srv_llm_ms), NULL)), 0) AS cold_llm_p50,
  round(quantile(0.5)(if(properties.cold_start != true, toFloat(properties.srv_llm_ms), NULL)), 0) AS warm_llm_p50
FROM events
WHERE event = 'recommendation_loaded'
  AND timestamp >= now() - INTERVAL 7 DAY
`;

async function main() {
  const out: string[] = [];
  out.push("# 게이트 0 — Discover 로딩 13초 검증 (2026-06-22)\n");
  out.push("> 목적: 13초가 p50(상시) vs p95(꼬리)인지, 병목 단계, streaming 체감 기여 확정.\n");

  const overall = await hogQL("overall", Q_OVERALL);
  out.push("## 1) 전체 분포 + over_13s 비율 (7일, lib 분리)\n");
  out.push(table(overall));
  out.push("**해석:** over_13s_pct ≥ 50% = 13초 상시 / < 10% = p95 꼬리. dur_p50 vs first_card_p50 격차 = streaming 체감 단축 폭.\n");

  const stages = await hogQL("stages", Q_STAGES);
  out.push("## 2) 단계별 p50/p95 (7일) — 병목 식별\n");
  out.push(table(stages));
  out.push("**해석:** llm_p50 / rank_p50 가 dur_p50 의 70%+ = LLM 병목 확정. fallback_p95 큰값 = 보충 경로 활성.\n");

  const daily = await hogQL("daily", Q_DAILY);
  out.push("## 3) 일별 추이 (7일)\n");
  out.push(table(daily));
  out.push("**해석:** over_13s 가 특정일 집중이면 엣지(persona 변경/cold), 매일 분산이면 상시.\n");

  const perceived = await hogQL("perceived", Q_PERCEIVED);
  out.push("## 4) 체감 격차 — first_card vs duration (streaming 효과)\n");
  out.push(table(perceived));
  out.push("**해석:** first_card_under_3s / streamed_n 비율 높음 = streaming 이 이미 체감 3초 달성 중 → 절대값보다 스켈레톤 결합이 우선.\n");

  const cold = await hogQL("cold", Q_COLD);
  out.push("## 5) cold vs warm\n");
  out.push(table(cold));
  out.push("**해석:** cold_n 비율 낮고 cold_dur_p50 ≫ warm = cold 는 rare 엣지. warm 에서도 13초면 LLM 상시 병목.\n");

  const md = out.join("\n");
  writeFileSync("posthog-gate0-loading-result.md", md);
  console.log(md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
