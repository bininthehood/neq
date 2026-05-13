/**
 * W5 게이트 4지표 daily 체크 (HogQL API).
 *
 * 출력: `posthog-gate-result.md` (workflow 의 다음 step 이 gh issue comment 로 발송).
 * 호출처: `.github/workflows/posthog-gate-check.yml` (매일 09:00 UTC).
 *
 * 환경 변수:
 *  - POSTHOG_PERSONAL_API_KEY (필수, read 권한)
 *  - POSTHOG_PROJECT_ID (필수)
 *  - POSTHOG_HOST (선택, 기본 https://us.i.posthog.com)
 */
import { writeFileSync } from "node:fs";

// GH Actions 에서 secret 미등록 시 환경변수가 빈 문자열로 set 됨. `??` 는 undefined 만
// 대체하므로 빈 문자열을 보존 → URL 조립 실패. `||` 로 falsy 모두 default 적용.
const PH_HOST = (process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
const PH_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const PH_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;

if (!PH_PROJECT_ID || !PH_API_KEY) {
  console.error("[gate-check] missing POSTHOG_PROJECT_ID or POSTHOG_PERSONAL_API_KEY");
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

// Q1b: Bridge→Discover 전환율 (14일 합산)
const Q_BRIDGE = `
SELECT
  countIf(event = 'bridge_shown') AS shown,
  countIf(event = 'bridge_completed') AS completed,
  round(
    countIf(event = 'bridge_completed') * 100.0
    / nullif(countIf(event = 'bridge_shown'), 0),
    1
  ) AS conversion_pct
FROM events
WHERE event IN ('bridge_shown', 'bridge_completed')
  AND timestamp >= now() - INTERVAL 14 DAY
`;

// Q2a: /saved 재방문율 14일 — saved_viewed 이벤트 기반
const Q_SAVED_VIEWED = `
WITH user_visits AS (
  SELECT distinct_id, count(*) AS visit_count
  FROM events
  WHERE event = 'saved_viewed'
    AND timestamp >= now() - INTERVAL 14 DAY
  GROUP BY distinct_id
)
SELECT
  count(*) AS users_with_visit,
  countIf(visit_count >= 2) AS users_with_revisit,
  round(countIf(visit_count >= 2) * 100.0 / nullif(count(*), 0), 1) AS revisit_rate_pct
FROM user_visits
`;

// Q2b: /saved 재방문율 14일 — $pageview 폴백 (saved_viewed 배포 전 데이터)
const Q_SAVED_PAGEVIEW = `
WITH user_visits AS (
  SELECT distinct_id, count(*) AS visit_count
  FROM events
  WHERE event = '$pageview'
    AND properties.$pathname = '/saved'
    AND timestamp >= now() - INTERVAL 14 DAY
  GROUP BY distinct_id
)
SELECT
  count(*) AS users_with_visit,
  countIf(visit_count >= 2) AS users_with_revisit,
  round(countIf(visit_count >= 2) * 100.0 / nullif(count(*), 0), 1) AS revisit_rate_pct
FROM user_visits
`;

// DAU 7일 평균
const Q_DAU = `
SELECT round(avg(daily_users), 1) AS dau_7d_avg
FROM (
  SELECT toDate(timestamp) AS day, uniq(distinct_id) AS daily_users
  FROM events
  WHERE timestamp >= now() - INTERVAL 7 DAY
  GROUP BY day
)
`;

// srv_enrich_ms p50/p95 — recommendation_loaded streamed=true 한정 (mirror enrich 측정)
const Q_ENRICH = `
SELECT
  round(quantile(0.5)(toFloat64(properties.srv_enrich_ms)), 0) AS p50_ms,
  round(quantile(0.95)(toFloat64(properties.srv_enrich_ms)), 0) AS p95_ms,
  count(*) AS sample_n
FROM events
WHERE event = 'recommendation_loaded'
  AND properties.srv_enrich_ms IS NOT NULL
  AND properties.streamed = true
  AND timestamp >= now() - INTERVAL 7 DAY
`;

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function pass(actual: number | null, op: "gte" | "lte", target: number): string {
  if (actual === null) return "—";
  if (op === "gte") return actual >= target ? "✅" : "❌";
  return actual <= target ? "✅" : "❌";
}

function fmt(v: unknown, suffix = ""): string {
  if (v === null || v === undefined) return "—";
  return `${v}${suffix}`;
}

async function main() {
  const [rBridge, rSavedView, rSavedPV, rDau, rEnrich] = await Promise.all([
    hogQL("bridge", Q_BRIDGE),
    hogQL("saved_viewed", Q_SAVED_VIEWED),
    hogQL("saved_pageview", Q_SAVED_PAGEVIEW),
    hogQL("dau", Q_DAU),
    hogQL("enrich", Q_ENRICH),
  ]);

  const [shown, completed, convPct] = rBridge.results[0] ?? [0, 0, null];
  const [u1a, urev1a, rev1aPct] = rSavedView.results[0] ?? [0, 0, null];
  const [u1b, urev1b, rev1bPct] = rSavedPV.results[0] ?? [0, 0, null];
  const [dau7] = rDau.results[0] ?? [null];
  const [p50, p95, sampleN] = rEnrich.results[0] ?? [null, null, 0];

  const today = new Date().toISOString().slice(0, 10);

  const dauN = num(dau7);
  const p50N = num(p50);
  const rev1aN = num(rev1aPct);
  const convN = num(convPct);

  const md = [
    `## W5 게이트 측정 — ${today}`,
    "",
    "| 지표 | 목표 | 실측 | 통과 |",
    "|------|------|------|------|",
    `| DAU 7일 평균 | ≥ 10 | ${fmt(dau7)} | ${pass(dauN, "gte", 10)} |`,
    `| \`srv_enrich_ms\` p50 (streamed) | ≤ 5000ms | ${fmt(p50, "ms")} (p95 ${fmt(p95, "ms")}, n=${fmt(sampleN)}) | ${pass(p50N, "lte", 5000)} |`,
    `| /saved 재방문율 14일 (saved_viewed) | ≥ 25% | ${fmt(rev1aPct, "%")} (${urev1a}/${u1a}) | ${pass(rev1aN, "gte", 25)} |`,
    `| /saved 재방문율 14일 (\$pageview 폴백) | 참고 | ${fmt(rev1bPct, "%")} (${urev1b}/${u1b}) | — |`,
    `| Bridge → Discover 전환율 14일 | ≥ 80% | ${fmt(convPct, "%")} (${completed}/${shown}) | ${pass(convN, "gte", 80)} |`,
    "",
    "_자동 생성 — `.github/workflows/posthog-gate-check.yml`. 산출물: `_workspace/posthog-w5-gate-queries-2026-05-13.md`_",
  ].join("\n");

  console.log(md);
  writeFileSync("posthog-gate-result.md", md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
