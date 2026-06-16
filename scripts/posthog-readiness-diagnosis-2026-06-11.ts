/**
 * PostHog readiness 잔여 P0 진단 (2026-06-11).
 *
 * 목적: release-readiness-result.md 의 2건 ❌ 원인 분리
 *  1) recommendation_failed 6.76% (25/345) — reason 분포
 *     사용자 측 (네트워크/취소) vs 코드 측 (LLM null / TMDB miss)
 *  2) 온보딩 completion 1.1% (32/2966) — 측정 정의 검증
 *     2966 started 비현실. autocapture noise / 봇 / event 정의 mismatch 의심
 *
 * 호출:
 *   POSTHOG_PROJECT_ID=... POSTHOG_PERSONAL_API_KEY=... \
 *     npx tsx scripts/posthog-readiness-diagnosis-2026-06-11.ts
 *
 * 산출물: `posthog-readiness-diagnosis-result.md`
 */
import { writeFileSync } from "node:fs";

const PH_HOST = (process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
const PH_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const PH_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;

if (!PH_PROJECT_ID || !PH_API_KEY) {
  console.error("[diagnosis] missing POSTHOG_PROJECT_ID or POSTHOG_PERSONAL_API_KEY");
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

// ── A) recommendation_failed reason 분포 (7일)
const Q_FAIL_REASON = `
SELECT
  coalesce(properties.reason, '(none)') AS reason,
  coalesce(properties.\$lib, 'unknown') AS lib,
  count(*) AS n
FROM events
WHERE event = 'recommendation_failed'
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY reason, lib
ORDER BY n DESC
`;

// ── B) recommendation_failed property 키 분포 (실제 어떤 키들이 붙는지)
const Q_FAIL_KEYS = `
SELECT
  arrayJoin(JSONExtractKeys(toJSONString(properties))) AS key,
  count(*) AS n
FROM events
WHERE event = 'recommendation_failed'
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY key
ORDER BY n DESC
LIMIT 50
`;

// ── C) onboarding_started — distinct_id uniq vs event count + $lib 분포 (14일)
const Q_ONB_STARTED_PROFILE = `
SELECT
  coalesce(properties.\$lib, 'unknown') AS lib,
  count(*) AS events_n,
  uniq(distinct_id) AS distinct_ids,
  uniq(properties.\$session_id) AS sessions,
  round(count(*) * 1.0 / nullif(uniq(distinct_id), 0), 2) AS events_per_id
FROM events
WHERE event = 'onboarding_started'
  AND timestamp >= now() - INTERVAL 14 DAY
GROUP BY lib
ORDER BY events_n DESC
`;

// ── D) onboarding_completed — 동일 프로파일
const Q_ONB_COMPLETED_PROFILE = `
SELECT
  coalesce(properties.\$lib, 'unknown') AS lib,
  count(*) AS events_n,
  uniq(distinct_id) AS distinct_ids,
  uniq(properties.\$session_id) AS sessions
FROM events
WHERE event = 'onboarding_completed'
  AND timestamp >= now() - INTERVAL 14 DAY
GROUP BY lib
ORDER BY events_n DESC
`;

// ── E) onboarding_started 일별 추이 (14일) — 특정 일 spike 여부
const Q_ONB_STARTED_DAILY = `
SELECT
  toDate(timestamp) AS day,
  count(*) AS started_n,
  uniq(distinct_id) AS unique_users,
  uniq(properties.\$session_id) AS sessions
FROM events
WHERE event = 'onboarding_started'
  AND timestamp >= now() - INTERVAL 14 DAY
GROUP BY day
ORDER BY day
`;

// ── F) onboarding_started — distinct_id 별 event count distribution (봇/재시도 탐지)
const Q_ONB_TOP_DISTINCT = `
SELECT
  distinct_id,
  coalesce(properties.\$lib, 'unknown') AS lib,
  count(*) AS started_n
FROM events
WHERE event = 'onboarding_started'
  AND timestamp >= now() - INTERVAL 14 DAY
GROUP BY distinct_id, lib
ORDER BY started_n DESC
LIMIT 20
`;

// ── G) onboarding_completed 일별 추이 (14일) — completion 추세
const Q_ONB_COMPLETED_DAILY = `
SELECT
  toDate(timestamp) AS day,
  count(*) AS completed_n,
  uniq(distinct_id) AS unique_users
FROM events
WHERE event = 'onboarding_completed'
  AND timestamp >= now() - INTERVAL 14 DAY
GROUP BY day
ORDER BY day
`;

// ── H) 진짜 funnel — 같은 distinct_id 의 started → completed 비율 (14일)
const Q_ONB_UNIQUE_FUNNEL = `
SELECT
  uniqIf(distinct_id, event = 'onboarding_started') AS unique_started,
  uniqIf(distinct_id, event = 'onboarding_completed') AS unique_completed,
  round(
    uniqIf(distinct_id, event = 'onboarding_completed') * 100.0
    / nullif(uniqIf(distinct_id, event = 'onboarding_started'), 0),
    1
  ) AS unique_completion_pct
FROM events
WHERE event IN ('onboarding_started', 'onboarding_completed')
  AND timestamp >= now() - INTERVAL 14 DAY
`;

function fmt(v: unknown, suffix = ""): string {
  if (v === null || v === undefined) return "—";
  return `${v}${suffix}`;
}

async function main() {
  const [rFail, rFailKeys, rStarted, rCompleted, rStartedDaily, rTopDistinct, rCompletedDaily, rUniqFunnel] =
    await Promise.all([
      hogQL("reason", Q_FAIL_REASON),
      hogQL("fail_keys", Q_FAIL_KEYS),
      hogQL("onb_started", Q_ONB_STARTED_PROFILE),
      hogQL("onb_completed", Q_ONB_COMPLETED_PROFILE),
      hogQL("onb_started_daily", Q_ONB_STARTED_DAILY),
      hogQL("onb_top_distinct", Q_ONB_TOP_DISTINCT),
      hogQL("onb_completed_daily", Q_ONB_COMPLETED_DAILY),
      hogQL("onb_unique_funnel", Q_ONB_UNIQUE_FUNNEL),
    ]);

  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];

  lines.push(`# PostHog readiness 잔여 P0 진단 — ${today}`);
  lines.push("");
  lines.push("> 대상: release-readiness 2건 ❌");
  lines.push("> 1) recommendation_failed 6.76% (25/345)");
  lines.push("> 2) 온보딩 completion 1.1% (32/2966)");
  lines.push("");

  // A. reason 분포
  lines.push("## A) recommendation_failed reason × lib (7일)");
  lines.push("");
  if (rFail.results.length === 0) {
    lines.push("_no recommendation_failed events in last 7d_");
  } else {
    lines.push("| reason | lib | n |");
    lines.push("|---|---|---|");
    for (const row of rFail.results) {
      const [reason, lib, n] = row;
      lines.push(`| \`${fmt(reason)}\` | \`${fmt(lib)}\` | ${fmt(n)} |`);
    }
  }
  lines.push("");
  lines.push("**판정 가이드:**");
  lines.push("- `(none)` 대부분 → reason property 누락 (코드 수정 필요)");
  lines.push("- `network` / `timeout` / `aborted` 다수 → 사용자 측 (false alarm 비중 큼)");
  lines.push("- `llm_null` / `no_recommendations` / `tmdb_miss` 다수 → 코드 측 (fix wave 필요)");
  lines.push("");

  // B. fail event 의 property 키 분포
  lines.push("## B) recommendation_failed property 키 분포 (7일)");
  lines.push("");
  if (rFailKeys.results.length === 0) {
    lines.push("_no keys_");
  } else {
    lines.push("| key | n |");
    lines.push("|---|---|");
    for (const row of rFailKeys.results) {
      const [key, n] = row;
      lines.push(`| \`${fmt(key)}\` | ${fmt(n)} |`);
    }
  }
  lines.push("");
  lines.push("**판정 가이드:** `reason` 키가 모든 row 에 있는지 확인. 없으면 instrumentation gap.");
  lines.push("");

  // C. onboarding_started profile by lib
  lines.push("## C) onboarding_started 프로파일 (lib 별, 14일)");
  lines.push("");
  lines.push("| lib | events | distinct_ids | sessions | events/id |");
  lines.push("|---|---|---|---|---|");
  for (const row of rStarted.results) {
    const [lib, events, dids, sessions, perId] = row;
    lines.push(`| \`${fmt(lib)}\` | ${fmt(events)} | ${fmt(dids)} | ${fmt(sessions)} | ${fmt(perId)} |`);
  }
  lines.push("");
  lines.push("**판정 가이드:**");
  lines.push("- `events/id` ≫ 1 → 동일 사용자가 반복 emit (재시도/리렌더). 측정 정의 noise");
  lines.push("- `lib` 가 `web` 인데 native 출시 전이라면 PWA 트래픽 (정상)");
  lines.push("- `unknown` / `posthog-node` 가 많으면 server-side emit 누수");
  lines.push("");

  // D. onboarding_completed
  lines.push("## D) onboarding_completed 프로파일 (lib 별, 14일)");
  lines.push("");
  lines.push("| lib | events | distinct_ids | sessions |");
  lines.push("|---|---|---|---|");
  for (const row of rCompleted.results) {
    const [lib, events, dids, sessions] = row;
    lines.push(`| \`${fmt(lib)}\` | ${fmt(events)} | ${fmt(dids)} | ${fmt(sessions)} |`);
  }
  lines.push("");

  // E. started 일별 — spike 탐지
  lines.push("## E) onboarding_started 일별 (14일) — spike 탐지");
  lines.push("");
  lines.push("| day | events | unique_users | sessions |");
  lines.push("|---|---|---|---|");
  for (const row of rStartedDaily.results) {
    const [day, n, uu, sessions] = row;
    lines.push(`| ${fmt(day)} | ${fmt(n)} | ${fmt(uu)} | ${fmt(sessions)} |`);
  }
  lines.push("");
  lines.push("**판정 가이드:** 특정 일에 spike → 봇/크롤러/스모크테스트 추적. 균등 분포면 진짜 traffic.");
  lines.push("");

  // F. top distinct_ids
  lines.push("## F) onboarding_started top 20 distinct_id (재시도/봇 의심)");
  lines.push("");
  lines.push("| distinct_id | lib | started_n |");
  lines.push("|---|---|---|");
  for (const row of rTopDistinct.results) {
    const [did, lib, n] = row;
    const didShort = String(did).slice(0, 40);
    lines.push(`| \`${didShort}\` | \`${fmt(lib)}\` | ${fmt(n)} |`);
  }
  lines.push("");
  lines.push("**판정 가이드:** 상위 distinct_id 가 100+ 회 emit → 동일 세션 재시도/리렌더 또는 봇. 코드 dedupe 필요.");
  lines.push("");

  // G. completed daily
  lines.push("## G) onboarding_completed 일별 (14일)");
  lines.push("");
  lines.push("| day | events | unique_users |");
  lines.push("|---|---|---|");
  for (const row of rCompletedDaily.results) {
    const [day, n, uu] = row;
    lines.push(`| ${fmt(day)} | ${fmt(n)} | ${fmt(uu)} |`);
  }
  lines.push("");

  // H. 진짜 unique funnel
  lines.push("## H) onboarding 진짜 unique funnel (14일)");
  lines.push("");
  const [uniqStarted, uniqCompleted, uniqPct] = rUniqFunnel.results[0] ?? [0, 0, null];
  lines.push("| unique_started | unique_completed | unique_completion_pct |");
  lines.push("|---|---|---|");
  lines.push(`| ${fmt(uniqStarted)} | ${fmt(uniqCompleted)} | ${fmt(uniqPct, "%")} |`);
  lines.push("");
  lines.push("**판정 가이드:** event count 기반 1.1% 대신 **unique distinct_id** 기반 funnel 이 진짜 신호.");
  lines.push("- ≥ 60% → release-readiness ❌ 는 측정 정의 noise (false alarm). funnel 정의를 unique 로 교체");
  lines.push("- < 60% → 진짜 drop-off. UX wave 필요");
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("_생성: `scripts/posthog-readiness-diagnosis-2026-06-11.ts`._");

  const md = lines.join("\n");
  console.log(md);
  writeFileSync("posthog-readiness-diagnosis-result.md", md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
