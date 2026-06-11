/**
 * W7 출시 직전 점검 — W5 게이트 4지표 외 보강 메트릭.
 *
 * 호출:
 *   POSTHOG_PROJECT_ID=... POSTHOG_PERSONAL_API_KEY=... \
 *     npx tsx scripts/posthog-release-readiness.ts
 *
 * 환경 변수:
 *  - POSTHOG_PERSONAL_API_KEY (필수, read 권한)
 *  - POSTHOG_PROJECT_ID (필수)
 *  - POSTHOG_HOST (선택, 기본 https://us.i.posthog.com)
 *
 * 출력: `posthog-release-readiness-result.md` + stdout.
 *
 * 보강 영역:
 *  - latency 회귀: srv_enrich_ms / srv_llm_ms / srv_first_card_ms 일별 + p50/p95
 *  - cold start pct (CLAUDE.md 정의: srv_enrich_ms > 1000)
 *  - 신뢰성: recommendation_failed / recommendation_loaded
 *  - 온보딩 깔때기: onboarding_started → onboarding_completed
 *  - native vs web 분리 ($lib property)
 */
import { writeFileSync } from "node:fs";

const PH_HOST = (process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
const PH_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const PH_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;

if (!PH_PROJECT_ID || !PH_API_KEY) {
  console.error("[release-readiness] missing POSTHOG_PROJECT_ID or POSTHOG_PERSONAL_API_KEY");
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

// ── 1) latency 단계별 p50/p95 (7일) — streamed=true 한정, lib 분리
const Q_LATENCY_BY_LIB = `
SELECT
  coalesce(properties.\$lib, 'unknown') AS lib,
  count(*) AS n,
  round(quantile(0.5)(toFloat(properties.srv_enrich_ms)), 0) AS enrich_p50,
  round(quantile(0.95)(toFloat(properties.srv_enrich_ms)), 0) AS enrich_p95,
  round(quantile(0.5)(toFloat(properties.srv_llm_ms)), 0) AS llm_p50,
  round(quantile(0.95)(toFloat(properties.srv_llm_ms)), 0) AS llm_p95,
  round(quantile(0.5)(toFloat(properties.srv_first_card_ms)), 0) AS fc_p50,
  round(quantile(0.95)(toFloat(properties.srv_first_card_ms)), 0) AS fc_p95
FROM events
WHERE event = 'recommendation_loaded'
  AND properties.streamed = true
  AND properties.srv_enrich_ms IS NOT NULL
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY lib
ORDER BY n DESC
`;

// ── 2) cold start pct 일별 — CLAUDE.md 정의 (srv_enrich_ms > 1000)
const Q_COLD_START_DAILY = `
SELECT
  toDate(timestamp) AS day,
  count(*) AS total,
  countIf(toFloat(properties.srv_enrich_ms) > 1000) AS cold_likely,
  round(countIf(toFloat(properties.srv_enrich_ms) > 1000) * 100.0 / count(*), 1) AS cold_pct
FROM events
WHERE event = 'recommendation_loaded'
  AND properties.streamed = true
  AND properties.srv_enrich_ms IS NOT NULL
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY day
ORDER BY day
`;

// ── 3) DAU 일별 추이 (7일)
const Q_DAU_DAILY = `
SELECT
  toDate(timestamp) AS day,
  uniq(distinct_id) AS dau
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY
GROUP BY day
ORDER BY day
`;

// ── 4) 신뢰성 — recommendation_failed / loaded 비율 (7일)
const Q_ERROR_RATE = `
SELECT
  countIf(event = 'recommendation_loaded') AS loaded,
  countIf(event = 'recommendation_failed') AS failed,
  round(
    countIf(event = 'recommendation_failed') * 100.0
    / nullif(countIf(event = 'recommendation_loaded') + countIf(event = 'recommendation_failed'), 0),
    2
  ) AS failure_pct
FROM events
WHERE event IN ('recommendation_loaded', 'recommendation_failed')
  AND timestamp >= now() - INTERVAL 7 DAY
`;

// ── 5) 온보딩 깔때기 — unique distinct_id 기반 (14일)
// 2026-06-11: 단일 outlier (5/28 build, 단일 device 2828번 emit) 이 1.1% false alarm 유발 → unique 기반으로 교체.
// 진단: _workspace/posthog-diagnosis-2026-06-11.md
// events 기반 (legacy) 도 비교용 병행 출력.
const Q_ONBOARDING_FUNNEL = `
SELECT
  uniqIf(distinct_id, event = 'onboarding_started') AS unique_started,
  uniqIf(distinct_id, event = 'onboarding_completed') AS unique_completed,
  round(
    uniqIf(distinct_id, event = 'onboarding_completed') * 100.0
    / nullif(uniqIf(distinct_id, event = 'onboarding_started'), 0),
    1
  ) AS unique_completion_pct,
  countIf(event = 'onboarding_started') AS events_started,
  countIf(event = 'onboarding_completed') AS events_completed,
  round(
    countIf(event = 'onboarding_completed') * 100.0
    / nullif(countIf(event = 'onboarding_started'), 0),
    2
  ) AS events_completion_pct
FROM events
WHERE event IN ('onboarding_started', 'onboarding_completed')
  AND timestamp >= now() - INTERVAL 14 DAY
`;

// ── 6) enrich 일별 추이 — 5/13 mirror 활성화 직후 ~400ms vs 현재 비교
const Q_ENRICH_DAILY = `
SELECT
  toDate(timestamp) AS day,
  count(*) AS n,
  round(quantile(0.5)(toFloat(properties.srv_enrich_ms)), 0) AS p50,
  round(quantile(0.95)(toFloat(properties.srv_enrich_ms)), 0) AS p95
FROM events
WHERE event = 'recommendation_loaded'
  AND properties.streamed = true
  AND properties.srv_enrich_ms IS NOT NULL
  AND timestamp >= now() - INTERVAL 14 DAY
GROUP BY day
ORDER BY day
`;

// ── 7) warmup ping 실측 — /api/warmup 의 cron 실행 빈도 + db ping 성공률
// 2026-05-22 추가. db_ms 500ms+ = cold instance 새 connection.
const Q_WARMUP_DAILY = `
SELECT
  toDate(timestamp) AS day,
  count(*) AS pings,
  countIf(properties.ok = true) AS ok_count,
  round(countIf(properties.ok = true) * 100.0 / count(*), 1) AS ok_pct,
  round(quantile(0.5)(toFloat(properties.db_ms)), 0) AS db_p50,
  round(quantile(0.95)(toFloat(properties.db_ms)), 0) AS db_p95,
  countIf(toFloat(properties.db_ms) > 500) AS cold_likely
FROM events
WHERE event = 'warmup_ping'
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY day
ORDER BY day
`;

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(v: unknown, suffix = ""): string {
  if (v === null || v === undefined) return "—";
  return `${v}${suffix}`;
}

function pass(actual: number | null, op: "gte" | "lte", target: number): string {
  if (actual === null) return "—";
  if (op === "gte") return actual >= target ? "✅" : "❌";
  return actual <= target ? "✅" : "❌";
}

async function main() {
  const [rLib, rCold, rDau, rErr, rOnb, rEnrich, rWarmup] = await Promise.all([
    hogQL("latency_by_lib", Q_LATENCY_BY_LIB),
    hogQL("cold_daily", Q_COLD_START_DAILY),
    hogQL("dau_daily", Q_DAU_DAILY),
    hogQL("error_rate", Q_ERROR_RATE),
    hogQL("onboarding", Q_ONBOARDING_FUNNEL),
    hogQL("enrich_daily", Q_ENRICH_DAILY),
    hogQL("warmup_daily", Q_WARMUP_DAILY),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  const lines: string[] = [];
  lines.push(`# W7 출시 게이트 보강 — ${today}`);
  lines.push("");
  lines.push("> W5 게이트 4지표는 `scripts/posthog-gate-check.ts` (매일 자동) 참조.");
  lines.push("> 본 리포트는 출시 직전(W7) 회귀/품질/사용 추세 보강.");
  lines.push("");

  // 1. Latency by lib
  lines.push("## 1) Latency 단계별 (7일, streamed=true)");
  lines.push("");
  lines.push("| lib | n | enrich p50/p95 | llm p50/p95 | first_card p50/p95 |");
  lines.push("|---|---|---|---|---|");
  for (const row of rLib.results) {
    const [lib, n, ep50, ep95, lp50, lp95, fp50, fp95] = row;
    lines.push(
      `| \`${fmt(lib)}\` | ${fmt(n)} | ${fmt(ep50, "ms")} / ${fmt(ep95, "ms")} | ${fmt(lp50, "ms")} / ${fmt(lp95, "ms")} | ${fmt(fp50, "ms")} / ${fmt(fp95, "ms")} |`,
    );
  }
  lines.push("");
  lines.push("**해석:**");
  lines.push("- `enrich p50` 목표 ≤ 500ms (CLAUDE.md mirror 활성화 직후 ~400ms 기준)");
  lines.push("- `llm p50` 4~6s = LLM API 자체 베이스라인 (audit `_workspace/llm-step-audit-2026-05-18.md`)");
  lines.push("- `first_card p50` 목표 ≤ 3000ms (web), native 는 5/18 streaming 활성화 후 메트릭 미보강");
  lines.push("");

  // 2. Cold start pct
  lines.push("## 2) Cold start pct 일별 (CLAUDE.md 정의: srv_enrich_ms > 1000ms)");
  lines.push("");
  lines.push("| day | total | cold_likely | cold_pct |");
  lines.push("|---|---|---|---|");
  for (const row of rCold.results) {
    const [day, total, cold, pct] = row;
    lines.push(`| ${fmt(day)} | ${fmt(total)} | ${fmt(cold)} | ${fmt(pct, "%")} |`);
  }
  lines.push("");
  lines.push("**해석:** mirror 활성화(5/8) 직후 cold_pct 가 0~10% 수준이어야 정상. 50%+ 지속 시 warmup ping 실패 또는 warm pool eviction 의심.");
  lines.push("");

  // 3. enrich daily (5/13 회귀 분석용)
  lines.push("## 3) srv_enrich_ms 일별 추이 (14일) — 5/13 ~400ms 회귀 분석");
  lines.push("");
  lines.push("| day | n | p50 | p95 |");
  lines.push("|---|---|---|---|");
  for (const row of rEnrich.results) {
    const [day, n, p50, p95] = row;
    lines.push(`| ${fmt(day)} | ${fmt(n)} | ${fmt(p50, "ms")} | ${fmt(p95, "ms")} |`);
  }
  lines.push("");

  // 4. DAU daily
  lines.push("## 4) DAU 일별 추이 (7일)");
  lines.push("");
  lines.push("| day | dau |");
  lines.push("|---|---|");
  for (const row of rDau.results) {
    const [day, dau] = row;
    lines.push(`| ${fmt(day)} | ${fmt(dau)} |`);
  }
  lines.push("");

  // 5. Error rate
  lines.push("## 5) 신뢰성 — recommendation_failed (7일)");
  lines.push("");
  const [loaded, failed, failPct] = rErr.results[0] ?? [0, 0, null];
  const failN = num(failPct);
  lines.push(
    `| loaded | failed | failure_pct | 통과 (≤ 2%) |`,
  );
  lines.push(`|---|---|---|---|`);
  lines.push(`| ${fmt(loaded)} | ${fmt(failed)} | ${fmt(failPct, "%")} | ${pass(failN, "lte", 2)} |`);
  lines.push("");

  // 6. Onboarding funnel — unique distinct_id 기반 (2026-06-11 진단 후 교체)
  lines.push("## 6) 온보딩 깔때기 (14일, unique distinct_id 기반)");
  lines.push("");
  const [uniqStarted, uniqCompleted, uniqPct, evStarted, evCompleted, evPct] =
    rOnb.results[0] ?? [0, 0, null, 0, 0, null];
  const uniqN = num(uniqPct);
  lines.push("| metric | started | completed | completion_pct | 통과 (≥ 30%) |");
  lines.push("|---|---|---|---|---|");
  lines.push(
    `| **unique distinct_id** | ${fmt(uniqStarted)} | ${fmt(uniqCompleted)} | ${fmt(uniqPct, "%")} | ${pass(uniqN, "gte", 30)} |`,
  );
  lines.push(
    `| events (legacy) | ${fmt(evStarted)} | ${fmt(evCompleted)} | ${fmt(evPct, "%")} | — |`,
  );
  lines.push("");
  lines.push(
    "**해석:** unique = 게이트 판정 기준 (≥ 30%). events 기반은 단일 device 의 무한 emit 으로 noise 큼 (5/28 outlier 사례). 진단: `_workspace/posthog-diagnosis-2026-06-11.md`.",
  );
  lines.push("");

  // 7. warmup ping
  lines.push("## 7) warmup ping 실측 (7일) — /api/warmup cron 실행 + db ping");
  lines.push("");
  lines.push("| day | pings | ok_pct | db p50 | db p95 | cold_likely (db>500ms) |");
  lines.push("|---|---|---|---|---|---|");
  for (const row of rWarmup.results) {
    const [day, pings, _ok, okPct, p50, p95, cold] = row;
    lines.push(`| ${fmt(day)} | ${fmt(pings)} | ${fmt(okPct, "%")} | ${fmt(p50, "ms")} | ${fmt(p95, "ms")} | ${fmt(cold)} |`);
  }
  lines.push("");
  lines.push("**해석:**");
  lines.push("- `pings` < 288 (24h × 12 = 5분 cron) 시 cron-job.org 누락. ping 빈도 자체 부족");
  lines.push("- `ok_pct` < 100% 시 Supabase db ping 실패 — connection/RLS 이슈");
  lines.push("- `db_p50` 500ms+ 또는 `cold_likely` 비율 큼 → cold instance 다수, warmup 효과 부족");
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("_생성: `scripts/posthog-release-readiness.ts`. W5 일상 점검은 `posthog-gate-check.yml` 참조._");

  const md = lines.join("\n");
  console.log(md);
  writeFileSync("posthog-release-readiness-result.md", md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
