/**
 * 2026-06-18 deepdive — failure_pct 43% + duration p50 30s 회귀 원인 조사.
 *
 * 호출:
 *   POSTHOG_PROJECT_ID=... POSTHOG_PERSONAL_API_KEY=... \
 *     npx tsx scripts/posthog-regression-deepdive-2026-06-18.ts
 *
 * 출력: stdout + posthog-regression-deepdive-result.md
 */
import { writeFileSync } from "node:fs";

const PH_HOST = (process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
const PH_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const PH_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;

if (!PH_PROJECT_ID || !PH_API_KEY) {
  console.error("[deepdive] missing POSTHOG_PROJECT_ID or POSTHOG_PERSONAL_API_KEY");
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

// ── 1) recommendation_failed 분포: reason × lib × version (7일)
const Q_FAILED_BY_REASON = `
SELECT
  coalesce(properties.reason, '(null)') AS reason,
  coalesce(properties.\$lib, 'unknown') AS lib,
  coalesce(properties.\$app_version, '(null)') AS app_version,
  coalesce(toString(properties.status), '(none)') AS status,
  count(*) AS n
FROM events
WHERE event = 'recommendation_failed'
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY reason, lib, app_version, status
ORDER BY n DESC
LIMIT 30
`;

// ── 2) recommendation_failed 일별 (7일) — 회귀 시점 식별
const Q_FAILED_DAILY = `
SELECT
  toDate(timestamp) AS day,
  count(*) AS failed,
  coalesce(properties.\$lib, 'unknown') AS lib
FROM events
WHERE event = 'recommendation_failed'
  AND timestamp >= now() - INTERVAL 14 DAY
GROUP BY day, lib
ORDER BY day DESC, failed DESC
`;

// ── 3) duration_ms outlier top 20 (14일)
const Q_DURATION_OUTLIERS = `
SELECT
  toDateTime(timestamp) AS ts,
  distinct_id,
  coalesce(properties.\$lib, '?') AS lib,
  coalesce(properties.\$app_version, '?') AS app_version,
  coalesce(toBool(properties.cold_start), false) AS cold,
  coalesce(toBool(properties.streamed), false) AS streamed,
  coalesce(toInt(properties.count), 0) AS rec_count,
  coalesce(toInt(properties.duration_ms), 0) AS dur,
  coalesce(toInt(properties.srv_enrich_ms), -1) AS enrich,
  coalesce(toInt(properties.srv_llm_ms), -1) AS llm
FROM events
WHERE event = 'recommendation_loaded'
  AND timestamp >= now() - INTERVAL 14 DAY
  AND toInt(properties.duration_ms) > 10000
ORDER BY dur DESC
LIMIT 20
`;

// ── 4) duration p50/p95 분리 — cold_start × streamed × lib (14일)
const Q_DURATION_BY_DIM = `
SELECT
  coalesce(properties.\$lib, '?') AS lib,
  coalesce(toBool(properties.cold_start), false) AS cold,
  coalesce(toBool(properties.streamed), false) AS streamed,
  count(*) AS n,
  round(quantile(0.5)(toFloat(properties.duration_ms)), 0) AS dur_p50,
  round(quantile(0.95)(toFloat(properties.duration_ms)), 0) AS dur_p95,
  round(quantile(0.5)(toFloat(properties.srv_enrich_ms)), 0) AS enrich_p50,
  round(quantile(0.5)(toFloat(properties.srv_llm_ms)), 0) AS llm_p50
FROM events
WHERE event = 'recommendation_loaded'
  AND timestamp >= now() - INTERVAL 14 DAY
  AND properties.duration_ms IS NOT NULL
GROUP BY lib, cold, streamed
ORDER BY n DESC
`;

// ── 5) distinct_id concentration — outlier 가 특정 device 인지
const Q_DURATION_BY_USER = `
SELECT
  distinct_id,
  count(*) AS n,
  round(quantile(0.5)(toFloat(properties.duration_ms)), 0) AS dur_p50,
  round(quantile(0.95)(toFloat(properties.duration_ms)), 0) AS dur_p95,
  countIf(toInt(properties.duration_ms) > 10000) AS high_count
FROM events
WHERE event = 'recommendation_loaded'
  AND timestamp >= now() - INTERVAL 7 DAY
  AND properties.duration_ms IS NOT NULL
GROUP BY distinct_id
HAVING n >= 3
ORDER BY high_count DESC, n DESC
LIMIT 15
`;

// ── 6) recommendation_failed 시간대 (4h bucket) — 인프라 회귀 시간 패턴
const Q_FAILED_HOURLY = `
SELECT
  toStartOfHour(timestamp) AS hour,
  count(*) AS failed,
  groupArray(coalesce(properties.reason, '(null)')) AS reasons
FROM events
WHERE event = 'recommendation_failed'
  AND timestamp >= now() - INTERVAL 3 DAY
GROUP BY hour
ORDER BY hour DESC
LIMIT 24
`;

function renderTable(label: string, q: HogQLResult): string {
  const cols = q.columns;
  const lines = [`### ${label}`, "", `| ${cols.join(" | ")} |`, `| ${cols.map(() => "---").join(" | ")} |`];
  for (const row of q.results.slice(0, 30)) {
    lines.push(`| ${row.map((v) => (v === null ? "(null)" : String(v))).join(" | ")} |`);
  }
  return lines.join("\n");
}

(async () => {
  const [failedByReason, failedDaily, durOutliers, durByDim, durByUser, failedHourly] = await Promise.all([
    hogQL("failed_by_reason", Q_FAILED_BY_REASON),
    hogQL("failed_daily", Q_FAILED_DAILY),
    hogQL("dur_outliers", Q_DURATION_OUTLIERS),
    hogQL("dur_by_dim", Q_DURATION_BY_DIM),
    hogQL("dur_by_user", Q_DURATION_BY_USER),
    hogQL("failed_hourly", Q_FAILED_HOURLY),
  ]);

  const md = [
    "# Regression deepdive — 2026-06-18",
    "",
    "> failure_pct 43% + duration p50 30s 회귀 원인 분리 조사",
    "",
    "## 1) recommendation_failed 분포 (7일)",
    "",
    renderTable("reason × lib × version × status", failedByReason),
    "",
    "## 2) recommendation_failed 일별 추이 (14일)",
    "",
    renderTable("daily × lib", failedDaily),
    "",
    "## 3) duration_ms > 10s outlier top 20 (14일)",
    "",
    renderTable("outliers", durOutliers),
    "",
    "## 4) duration p50/p95 by lib × cold × streamed",
    "",
    renderTable("dim breakdown", durByDim),
    "",
    "## 5) duration concentration by distinct_id (7일)",
    "",
    renderTable("per-user", durByUser),
    "",
    "## 6) recommendation_failed 시간대 (3일, 1h bucket)",
    "",
    renderTable("hourly", failedHourly),
    "",
    "---",
    `_생성: scripts/posthog-regression-deepdive-2026-06-18.ts_`,
  ].join("\n");

  writeFileSync("posthog-regression-deepdive-result.md", md);
  console.log(md);
})();
