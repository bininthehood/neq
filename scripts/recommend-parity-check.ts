/**
 * recommend-parity-check — Mirror snapshot vs Live TMDB 데이터 레이어 parity 검증.
 *
 * /api/recommend 의 enrich 단계에서 mirror 경로 (`enrichFromMirror`) 와
 * LLM-direct 경로 (`enrichCandidates` → 라이브 TMDB) 가 동일 candidate 에 대해
 * 동일 enriched 결과를 산출하는지 데이터 레이어에서 직접 비교.
 *
 * OpenAI/Filter 단계는 양 경로 동일이므로 우회. 차이는 오직 enrichment data source.
 *
 * 실행:
 *   cd /Users/james/Projects/neko/apps/web
 *   SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
 *   SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY \
 *   TMDB_API_KEY=$TMDB_API_KEY \
 *     npx tsx ../../scripts/recommend-parity-check.ts
 *
 * 출력: 표준출력에 parity 리포트.
 *   - 샘플 N건 (default 100, env SAMPLE_SIZE 로 조정)
 *   - providers exact match / superset / subset / disjoint / etc 분포
 *   - watch_link / runtime / seasons / country 일치율
 *   - 발견된 divergence 예시 5건 (디버깅용)
 *
 * 권장 해석:
 *   exact_match ≥ 90% → mirror 활성화 안전 (주: 30일 TTL 미구현 상태 가정)
 *   exact_match < 70% → providers TTL 트리거 필수, 활성화 보류
 */

import { createClient } from "@supabase/supabase-js";
import {
  RateLimiter,
  fetchMetadata,
  type MetadataRow,
} from "./lib/tmdb-fetch";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const SAMPLE_SIZE = Number(process.env.SAMPLE_SIZE ?? "100");
const RATE_LIMIT_RPS = Number(process.env.TMDB_RATE_LIMIT_RPS ?? "20");

if (!SUPABASE_URL || !SERVICE_KEY || !TMDB_API_KEY) {
  console.error(
    "[parity-check] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / TMDB_API_KEY 누락",
  );
  process.exit(1);
}

type SampleRow = {
  tmdb_id: number;
  media_type: "movie" | "tv";
  providers: Array<{ name: string; logoUrl: string | null; category?: string }> | null;
  watch_link: string | null;
  runtime: number | null;
  seasons: number | null;
  country: string[] | null;
  providers_fetched_at: string | null;
};

type ParityResult = {
  tmdb_id: number;
  media_type: "movie" | "tv";
  fetched_at: string | null;
  providers_status: "exact" | "mirror_superset" | "live_superset" | "disjoint" | "both_empty" | "mirror_only_empty" | "live_only_empty";
  mirror_providers: string[];
  live_providers: string[];
  watch_link_match: boolean;
  runtime_match: boolean;
  seasons_match: boolean;
  country_match: boolean;
};

function setEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function setSuperset(superSet: Set<string>, subSet: Set<string>): boolean {
  for (const x of subSet) if (!superSet.has(x)) return false;
  return true;
}

function diffProviders(
  mirror: SampleRow["providers"],
  live: MetadataRow["providers"],
): {
  status: ParityResult["providers_status"];
  mirrorNames: string[];
  liveNames: string[];
} {
  const mirrorNames = (mirror ?? []).map((p) => p.name).sort();
  const liveNames = (live ?? []).map((p) => p.name).sort();
  const mSet = new Set(mirrorNames);
  const lSet = new Set(liveNames);

  if (mSet.size === 0 && lSet.size === 0) {
    return { status: "both_empty", mirrorNames, liveNames };
  }
  if (mSet.size === 0) {
    return { status: "mirror_only_empty", mirrorNames, liveNames };
  }
  if (lSet.size === 0) {
    return { status: "live_only_empty", mirrorNames, liveNames };
  }
  if (setEqual(mSet, lSet)) {
    return { status: "exact", mirrorNames, liveNames };
  }
  if (setSuperset(mSet, lSet)) {
    return { status: "mirror_superset", mirrorNames, liveNames };
  }
  if (setSuperset(lSet, mSet)) {
    return { status: "live_superset", mirrorNames, liveNames };
  }
  return { status: "disjoint", mirrorNames, liveNames };
}

async function main(): Promise<void> {
  const startedAt = new Date();
  console.log(
    `[parity-check] 시작 ${startedAt.toISOString()} sample=${SAMPLE_SIZE} rps=${RATE_LIMIT_RPS}`,
  );

  const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // providers != null AND providers != [] (실제 KR OTT 가용 작품) 만 샘플링.
  // KR 미공급 작품은 양 경로 모두 빈 배열 반환할 거라 parity 의미 없음.
  // SAMPLE_MODE: rating (default, 인기작 위주) | stale (오래된 fetched_at 우선, ceiling 측정)
  const sampleMode = process.env.SAMPLE_MODE === "stale" ? "stale" : "rating";
  console.log(`[parity-check] 샘플 추출 중... mode=${sampleMode}`);
  const order =
    sampleMode === "stale"
      ? { col: "providers_fetched_at", asc: true } // 오래된 것부터
      : { col: "rating", asc: false }; // 인기작부터
  const { data: rows, error } = await admin
    .from("tmdb_metadata")
    .select(
      "tmdb_id, media_type, providers, watch_link, runtime, seasons, country, providers_fetched_at",
    )
    .not("providers", "is", null)
    .order(order.col, { ascending: order.asc, nullsFirst: false })
    .limit(SAMPLE_SIZE * 5);
  if (error) {
    console.error("[parity-check] 샘플 추출 실패:", error);
    process.exit(1);
  }
  if (!rows || rows.length === 0) {
    console.error("[parity-check] 샘플 0건 — providers 있는 행이 없음. mirror 미적재 의심.");
    process.exit(1);
  }
  // shuffle + take first N
  const shuffled = (rows as SampleRow[]).sort(() => Math.random() - 0.5).slice(0, SAMPLE_SIZE);
  console.log(`[parity-check] 샘플 ${shuffled.length}건 확보 (rating 상위 ${rows.length}에서 랜덤)`);

  const limiter = new RateLimiter(RATE_LIMIT_RPS);
  const now = new Date().toISOString();
  const results: ParityResult[] = [];

  let processed = 0;
  for (const sample of shuffled) {
    try {
      const live = await fetchMetadata(
        { tmdb_id: sample.tmdb_id, media_type: sample.media_type },
        limiter,
        TMDB_API_KEY!,
        now,
      );
      const { status, mirrorNames, liveNames } = diffProviders(
        sample.providers,
        live.providers,
      );
      results.push({
        tmdb_id: sample.tmdb_id,
        media_type: sample.media_type,
        fetched_at: sample.providers_fetched_at,
        providers_status: status,
        mirror_providers: mirrorNames,
        live_providers: liveNames,
        watch_link_match: (sample.watch_link ?? null) === (live.watch_link ?? null),
        runtime_match: (sample.runtime ?? null) === (live.runtime ?? null),
        seasons_match: (sample.seasons ?? null) === (live.seasons ?? null),
        country_match:
          JSON.stringify((sample.country ?? []).slice().sort()) ===
          JSON.stringify((live.country ?? []).slice().sort()),
      });
    } catch (err) {
      console.warn(
        `[parity-check] ${sample.media_type}/${sample.tmdb_id} fetch 실패:`,
        err instanceof Error ? err.message : String(err),
      );
    }
    processed += 1;
    if (processed % 25 === 0) {
      console.log(`[parity-check] ${processed}/${shuffled.length} 처리...`);
    }
  }

  // ---------- 집계 ----------
  const total = results.length;
  if (total === 0) {
    console.error("[parity-check] 집계 결과 0건 — 모든 fetch 실패");
    process.exit(1);
  }

  const byStatus: Record<ParityResult["providers_status"], number> = {
    exact: 0,
    mirror_superset: 0,
    live_superset: 0,
    disjoint: 0,
    both_empty: 0,
    mirror_only_empty: 0,
    live_only_empty: 0,
  };
  let watchLinkMatches = 0;
  let runtimeMatches = 0;
  let seasonsMatches = 0;
  let countryMatches = 0;
  for (const r of results) {
    byStatus[r.providers_status] += 1;
    if (r.watch_link_match) watchLinkMatches += 1;
    if (r.runtime_match) runtimeMatches += 1;
    if (r.seasons_match) seasonsMatches += 1;
    if (r.country_match) countryMatches += 1;
  }

  const exactPct = ((byStatus.exact + byStatus.both_empty) / total) * 100;
  const eitherEmptyPct = ((byStatus.mirror_only_empty + byStatus.live_only_empty) / total) * 100;

  // ---------- 리포트 출력 ----------
  console.log("");
  console.log("===== Parity Report =====");
  console.log(`총 비교: ${total}건`);
  console.log("");
  console.log("[providers 비교]");
  console.log(`  exact match              : ${byStatus.exact} (${pct(byStatus.exact, total)})`);
  console.log(`  both empty (KR 미공급)    : ${byStatus.both_empty} (${pct(byStatus.both_empty, total)})`);
  console.log(`  mirror superset of live  : ${byStatus.mirror_superset} (${pct(byStatus.mirror_superset, total)})`);
  console.log(`  live superset of mirror  : ${byStatus.live_superset} (${pct(byStatus.live_superset, total)})`);
  console.log(`  mirror only empty (live↑): ${byStatus.mirror_only_empty} (${pct(byStatus.mirror_only_empty, total)})`);
  console.log(`  live only empty (mirror↑): ${byStatus.live_only_empty} (${pct(byStatus.live_only_empty, total)})`);
  console.log(`  disjoint                 : ${byStatus.disjoint} (${pct(byStatus.disjoint, total)})`);
  console.log("");
  console.log(`  ★ exact + both_empty     : ${exactPct.toFixed(1)}% (활성화 판정 핵심)`);
  console.log(`  △ either empty (필터 영향): ${eitherEmptyPct.toFixed(1)}% (한 쪽만 0이면 추천 갯수 영향)`);
  console.log("");
  console.log("[기타 필드 일치율]");
  console.log(`  watch_link               : ${pct(watchLinkMatches, total)}`);
  console.log(`  runtime                  : ${pct(runtimeMatches, total)}`);
  console.log(`  seasons                  : ${pct(seasonsMatches, total)}`);
  console.log(`  country                  : ${pct(countryMatches, total)}`);
  console.log("");

  // 발견된 divergence 예시 (mirror_only_empty / live_only_empty / disjoint 우선)
  const divergent = results.filter(
    (r) =>
      r.providers_status === "mirror_only_empty" ||
      r.providers_status === "live_only_empty" ||
      r.providers_status === "disjoint" ||
      r.providers_status === "mirror_superset" ||
      r.providers_status === "live_superset",
  );
  if (divergent.length > 0) {
    console.log(`[발견 divergence 예시 (최대 5건)]`);
    for (const r of divergent.slice(0, 5)) {
      console.log(
        `  ${r.media_type}/${r.tmdb_id} (fetched ${r.fetched_at?.slice(0, 10) ?? "?"})`,
      );
      console.log(`    mirror: [${r.mirror_providers.join(", ")}]`);
      console.log(`    live:   [${r.live_providers.join(", ")}]`);
    }
  }

  // ---------- 판정 ----------
  console.log("");
  console.log("===== 판정 =====");
  if (exactPct >= 90) {
    console.log(`✅ 활성화 안전 (exact+both_empty ${exactPct.toFixed(1)}% ≥ 90%)`);
  } else if (exactPct >= 70) {
    console.log(
      `⚠️  활성화 가능, 30일 TTL 트리거 권장 (exact+both_empty ${exactPct.toFixed(1)}%)`,
    );
  } else {
    console.log(
      `❌ 활성화 보류, providers TTL 필수 (exact+both_empty ${exactPct.toFixed(1)}% < 70%)`,
    );
  }
  if (eitherEmptyPct > 5) {
    console.log(
      `⚠️  either_empty ${eitherEmptyPct.toFixed(1)}% > 5% — 필터 결과 다를 가능성. mirror/live 신선도 차이 검토 필요`,
    );
  }
  console.log(
    `\n총 소요 ${((Date.now() - startedAt.getTime()) / 1000).toFixed(1)}s`,
  );
}

function pct(n: number, total: number): string {
  return `${((n / total) * 100).toFixed(1)}%`;
}

void main();
