/**
 * 2026-06-18 deepdive — Discover swipe 간헐 loading 버그 진단.
 *
 * 의심 사이트:
 *  - app/index.tsx:609 — auto_hard_refresh=true (모든 cooldown tier 0 → clearRecHistory + load())
 *  - app/index.tsx:477 — exhausted=true (진짜 풀 고갈, EmptyState 트리거)
 *  - app/index.tsx:1433 — cardsToShow=0 + state=ready → ApertureBreathLoader (b231c4a fallback)
 *
 * 가설:
 *  H1 — auto_hard_refresh 가 빈번하게 트리거되면서 load() → setState('loading') 노출
 *  H2 — exhausted lock false-positive (한 배치 소진 ≠ 풀 고갈)
 *  H3 — prefetch race: progressive fallback 시 unique=0 반복 → fallback loader 노출
 *
 * 호출:
 *   POSTHOG_PROJECT_ID=... POSTHOG_PERSONAL_API_KEY=... \
 *     npx tsx scripts/posthog-swipe-loading-deepdive-2026-06-18.ts
 *
 * 출력: posthog-swipe-loading-deepdive-result.md
 */
import { writeFileSync } from "node:fs";

const PH_HOST = (process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
const PH_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const PH_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;

if (!PH_PROJECT_ID || !PH_API_KEY) {
  console.error("[swipe-loading-deepdive] missing POSTHOG_PROJECT_ID or POSTHOG_PERSONAL_API_KEY");
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

// ── 1) load_more 종류별 분포 (14일)
//    prefetch 성공 (count>0) vs auto_hard_refresh vs exhausted vs unique_count=0
const Q_LOAD_MORE_KIND = `
SELECT
  coalesce(properties.\$lib, '?') AS lib,
  CASE
    WHEN toBool(properties.auto_hard_refresh) THEN 'auto_hard_refresh'
    WHEN toBool(properties.exhausted) THEN 'exhausted'
    WHEN toInt(properties.cooldown_used) = 7 THEN 'cooldown_7'
    WHEN toInt(properties.cooldown_used) = 3 THEN 'cooldown_3'
    WHEN toInt(properties.cooldown_used) = 1 THEN 'cooldown_1'
    WHEN toInt(properties.cooldown_used) = 0 THEN 'cooldown_0'
    WHEN toInt(properties.count) > 0 THEN 'prefetch_success'
    ELSE 'other'
  END AS kind,
  count(*) AS n
FROM events
WHERE event = 'recommendation_load_more'
  AND timestamp >= now() - INTERVAL 14 DAY
GROUP BY lib, kind
ORDER BY n DESC
`;

// ── 2) auto_hard_refresh 일별 추이 (14일) — H1 검증
const Q_AUTO_REFRESH_DAILY = `
SELECT
  toDate(timestamp) AS day,
  countIf(toBool(properties.auto_hard_refresh)) AS auto_refresh_n,
  countIf(toBool(properties.exhausted)) AS exhausted_n,
  countIf(toInt(properties.cooldown_used) >= 0 AND toInt(properties.unique_count) > 0) AS cooldown_success_n,
  count(*) AS total_load_more
FROM events
WHERE event = 'recommendation_load_more'
  AND timestamp >= now() - INTERVAL 14 DAY
GROUP BY day
ORDER BY day DESC
`;

// ── 3) cooldown_used 분포 — progressive fallback 어느 tier 에서 가장 자주 성공/실패하는가
const Q_COOLDOWN_DIST = `
SELECT
  coalesce(toInt(properties.cooldown_used), -999) AS cooldown_used,
  count(*) AS n,
  round(avg(toFloat(properties.unique_count)), 1) AS avg_unique,
  countIf(toInt(properties.unique_count) = 0) AS zero_unique_n
FROM events
WHERE event = 'recommendation_load_more'
  AND properties.cooldown_used IS NOT NULL
  AND timestamp >= now() - INTERVAL 14 DAY
GROUP BY cooldown_used
ORDER BY cooldown_used
`;

// ── 4) auto_hard_refresh 발생한 distinct_id 의 행동 패턴 (7일)
//    swipe 빈도 (card_swiped) + load() 호출 (recommendation_loaded) + load_more 비율
const Q_AUTO_REFRESH_USERS = `
WITH affected AS (
  SELECT DISTINCT distinct_id
  FROM events
  WHERE event = 'recommendation_load_more'
    AND toBool(properties.auto_hard_refresh)
    AND timestamp >= now() - INTERVAL 7 DAY
)
SELECT
  a.distinct_id AS distinct_id,
  countIf(e.event = 'card_swiped') AS swipes,
  countIf(e.event = 'recommendation_loaded') AS loads,
  countIf(e.event = 'recommendation_load_more') AS load_mores,
  countIf(e.event = 'recommendation_load_more' AND toBool(e.properties.auto_hard_refresh)) AS auto_refreshes,
  countIf(e.event = 'recommendation_load_more' AND toBool(e.properties.exhausted)) AS exhausted_hits
FROM events e
JOIN affected a ON e.distinct_id = a.distinct_id
WHERE e.timestamp >= now() - INTERVAL 7 DAY
GROUP BY a.distinct_id
ORDER BY auto_refreshes DESC
LIMIT 15
`;

// ── 5) auto_hard_refresh 직전 N초 동안 swipe 빈도 (race 패턴 식별)
//    user 가 무액션 (swipe=0) 상태에서 auto_hard_refresh 발생했는지 확인
const Q_REFRESH_PRE_SWIPE = `
SELECT
  toDate(timestamp) AS day,
  count(*) AS auto_refresh_events,
  -- 동일 user 의 직전 60s 내 swipe 횟수
  groupArray(distinct_id) AS distinct_ids
FROM events
WHERE event = 'recommendation_load_more'
  AND toBool(properties.auto_hard_refresh)
  AND timestamp >= now() - INTERVAL 14 DAY
GROUP BY day
ORDER BY day DESC
`;

// ── 6) load_more 사이 간격 패턴 (race 의심)
//    같은 user 의 연속 load_more events 시간 간격
const Q_LOAD_MORE_INTERVALS = `
WITH ranked AS (
  SELECT
    distinct_id,
    timestamp,
    toBool(properties.auto_hard_refresh) AS is_auto,
    toBool(properties.exhausted) AS is_exhausted,
    toInt(properties.cooldown_used) AS cooldown_used,
    lag(timestamp, 1) OVER (PARTITION BY distinct_id ORDER BY timestamp) AS prev_ts
  FROM events
  WHERE event = 'recommendation_load_more'
    AND timestamp >= now() - INTERVAL 7 DAY
)
SELECT
  CASE
    WHEN is_auto THEN 'auto_hard_refresh'
    WHEN is_exhausted THEN 'exhausted'
    ELSE 'cooldown_' || coalesce(toString(cooldown_used), 'other')
  END AS kind,
  count(*) AS n,
  round(quantile(0.5)(dateDiff('second', prev_ts, timestamp)), 0) AS gap_p50_s,
  round(quantile(0.95)(dateDiff('second', prev_ts, timestamp)), 0) AS gap_p95_s
FROM ranked
WHERE prev_ts IS NOT NULL
GROUP BY kind
ORDER BY n DESC
LIMIT 10
`;

function renderTable(label: string, q: HogQLResult): string {
  const cols = q.columns;
  const lines = [`### ${label}`, "", `| ${cols.join(" | ")} |`, `| ${cols.map(() => "---").join(" | ")} |`];
  for (const row of q.results.slice(0, 30)) {
    lines.push(`| ${row.map((v) => (v === null ? "(null)" : Array.isArray(v) ? `[${v.length} ids]` : String(v))).join(" | ")} |`);
  }
  return lines.join("\n");
}

(async () => {
  const [kind, daily, cooldown, users, preSwipe, intervals] = await Promise.all([
    hogQL("load_more_kind", Q_LOAD_MORE_KIND),
    hogQL("auto_refresh_daily", Q_AUTO_REFRESH_DAILY),
    hogQL("cooldown_dist", Q_COOLDOWN_DIST),
    hogQL("auto_refresh_users", Q_AUTO_REFRESH_USERS),
    hogQL("refresh_pre_swipe", Q_REFRESH_PRE_SWIPE),
    hogQL("load_more_intervals", Q_LOAD_MORE_INTERVALS),
  ]);

  const md = [
    "# Discover swipe 간헐 loading 버그 deepdive — 2026-06-18",
    "",
    "> 6/16 build 34 testflight-qa 발견. \"작품 잘 보이는 상태에서 무액션 + 수 초 후 loading 노출, 간헐적\".",
    "> 의심: auto_hard_refresh 빈도 / progressive fallback unique=0 / cardsToShow=0 fallback loader (`b231c4a`).",
    "",
    "## 1) load_more 종류별 분포 (14일) — H1 검증",
    "",
    renderTable("kind × lib", kind),
    "",
    "**해석:**",
    "- `auto_hard_refresh` 가 상위에 있으면 H1 확정 (clearRecHistory + load() → loading 화면 빈번 노출)",
    "- `exhausted` 빈도 ≥ prefetch_success 면 H2 확정 (한 배치 소진 false-positive)",
    "- cooldown_3/1/0 가 cooldown_7 보다 많으면 progressive fallback 이 7일 tier 에서 자주 실패",
    "",
    "## 2) auto_hard_refresh 일별 추이 (14일) — H1 추가 검증",
    "",
    renderTable("daily", daily),
    "",
    "**해석:**",
    "- `auto_refresh_n / total_load_more` ≥ 30% = H1 즉시 확정",
    "- 6/10 이후 자연 증가 패턴이면 prod traffic 누적 (build 21~ 잠재 동작)",
    "",
    "## 3) cooldown 분포 — progressive fallback 효과 측정",
    "",
    renderTable("cooldown_used", cooldown),
    "",
    "**해석:**",
    "- cooldown_used=-1 = auto_hard_refresh (모든 tier 0)",
    "- 각 tier 의 `zero_unique_n` 비율 높음 = progressive fallback 실패 빈번",
    "- `avg_unique` 가 1~5 사이면 다양성 좁음",
    "",
    "## 4) auto_hard_refresh 발생 user 의 행동 패턴 (7일)",
    "",
    renderTable("affected users", users),
    "",
    "**해석:**",
    "- `swipes / auto_refreshes` 비율 < 10 = 무액션 / 적은 swipe 후 trigger (사용자 보고와 정합)",
    "- `auto_refreshes / load_mores` ≥ 0.3 = 빈번한 hard refresh",
    "- `exhausted_hits > 0` = EmptyState 도달도 같이 발생",
    "",
    "## 5) auto_hard_refresh 일별 (14일) — outbreak 시점",
    "",
    renderTable("daily", preSwipe),
    "",
    "## 6) load_more 사이 간격 분포 (7일) — race 패턴",
    "",
    renderTable("gap by kind", intervals),
    "",
    "**해석:**",
    "- `auto_hard_refresh` gap_p50 < 30s = 빠른 연쇄 (사용자 swipe race)",
    "- `cooldown_*` gap_p50 < 5s = prefetch trigger 가 swipe 마다 호출되어 자원 낭비",
    "",
    "---",
    `_생성: scripts/posthog-swipe-loading-deepdive-2026-06-18.ts_`,
  ].join("\n");

  writeFileSync("posthog-swipe-loading-deepdive-result.md", md);
  console.log(md);
})();
