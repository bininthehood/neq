/**
 * match-divergence-check — 미러-우선 매칭 vs 외부 TMDB 검색 적중 divergence 게이트.
 *
 * 배경: `matchFavoritesToTMDB` 를 미러-우선(REC_MIRROR_MATCH_ENABLED)으로 바꾸면
 *   favorite 제목별 외부 TMDB `searchTMDB`(태평양 횡단, match_ms ~755ms floor)를
 *   `tmdb_metadata`(서울 co-located) 배치 쿼리 1회로 흡수한다. 미스만 기존 searchTMDB
 *   fallback 이라 적중 *수* 는 불변이나, **동명이작**(같은 제목 다른 작품)에서는 미러가
 *   고른 row 와 searchTMDB 가 고른 popularity-top 결과가 갈릴 수 있다 — 적중 *id* 가
 *   달라지는 유일 지점. 본 스크립트는 그 divergence 를 flag-on **전에** 정량 측정한다.
 *   (정신: memory feedback_pgvector_ivfflat_filtered_ann "silent divergence 경계")
 *
 * 동작:
 *   동일 favorites 셋을 ① flag off(searchTMDB-only) ② flag on(미러-우선) 두 번 매칭 →
 *   제목별 적중 id/type/genreIds 비교. 미러 히트 여부도 직접 probe 해서
 *   "divergence 는 오직 미러 히트 지점에서만 발생" 불변을 확인.
 *
 * 출력:
 *   - 제목별: off(id,type) | on(id,type) | mirror_hit | verdict
 *   - 요약: 양쪽 적중 / id divergence / type divergence / genre divergence /
 *           only_off / only_on / 미러 커버리지(latency 이득 비율)
 *   - 게이트 권고: id_divergence_pct (양쪽 적중 기준)
 *       < ~5%  → flag-on 안전
 *       ≥ ~5% → 미러 tie-break 보강(예: popularity/rating 정렬) 후 재측정
 *
 * 환경 변수: NEXT_PUBLIC_SUPABASE_URL(or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
 *   TMDB_API_KEY (searchTMDB 용 — app env.ts getTmdbApiKey 가 읽음).
 *   FAVORITES (선택, 콤마구분 제목으로 기본 샘플 override).
 *
 * 실행 (repo 루트):
 *   set -a; source apps/web/.env.local; set +a
 *   npx tsx scripts/match-divergence-check.ts
 *
 * 주의: off 경로가 제목당 최대 2회 TMDB 호출 → 기본 샘플(~24건)은 ~48 동시호출.
 *   TMDB rate limit 여유 안에서 동작하나, 대량 샘플 시 FAVORITES 를 나눠 실행.
 */
import { createClient } from "@supabase/supabase-js";
import { matchFavoritesToTMDB } from "../apps/web/src/lib/recommend/match";
import type { MatchedFavorite } from "../apps/web/src/lib/recommend/types";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "[divergence] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락",
  );
  process.exit(1);
}
if (!process.env.TMDB_API_KEY) {
  console.error("[divergence] TMDB_API_KEY 누락 (searchTMDB 경로 필요)");
  process.exit(1);
}

// 기본 샘플 — 영화/시리즈/예능 혼합 + 동명이작·리메이크 prone 제목 포함(divergence 스트레스).
const DEFAULT_FAVORITES = [
  // KR 영화
  "기생충", "올드보이", "부산행", "택시운전사", "범죄도시", "베테랑", "곡성", "아저씨",
  // 동명이작/리메이크 prone (여러 작품이 같은 제목)
  "마더", "리틀 포레스트", "1987", "살인의 추억",
  // 해외 영화
  "인터스텔라", "어벤져스", "라라랜드", "조커", "기생수",
  // 시리즈
  "오징어 게임", "더 글로리", "킹덤", "사랑의 불시착", "스위트홈",
  // 예능/기타
  "흑백요리사", "피지컬: 100",
];

// match.ts 의 normalizeTitle 와 동일 — 미러 커버리지 probe 용 (drift 방지 복제).
function normalizeTitle(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

function toInList(values: string[]): string {
  return values
    .map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",");
}

/** 미러에 해당 제목이 존재하는지(=on 경로가 mirror-hit 할지) 직접 probe. */
async function mirrorPresentKeys(favorites: string[]): Promise<Set<string>> {
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const wanted = new Set(favorites.map(normalizeTitle));
  const raw = Array.from(new Set(favorites.map((t) => t.trim()))).filter(
    (t) => t.length > 0,
  );
  const present = new Set<string>();
  if (raw.length === 0) return present;
  const { data, error } = await admin
    .from("tmdb_metadata")
    .select("title, title_en")
    .or(`title.in.(${toInList(raw)}),title_en.in.(${toInList(raw)})`);
  if (error) throw error;
  for (const row of (data ?? []) as Array<{
    title: string | null;
    title_en: string | null;
  }>) {
    for (const col of [row.title, row.title_en]) {
      if (!col) continue;
      const key = normalizeTitle(col);
      if (wanted.has(key)) present.add(key);
    }
  }
  return present;
}

function byTitle(rows: MatchedFavorite[]): Map<string, MatchedFavorite> {
  const m = new Map<string, MatchedFavorite>();
  for (const r of rows) m.set(r.title, r);
  return m;
}

function sameGenres(a: number[], b: number[]): boolean {
  const sa = [...a].sort((x, y) => x - y).join(",");
  const sb = [...b].sort((x, y) => x - y).join(",");
  return sa === sb;
}

async function main() {
  const favorites = (process.env.FAVORITES
    ? process.env.FAVORITES.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_FAVORITES);

  console.log(`[divergence] 샘플 ${favorites.length}건 — off(searchTMDB) vs on(미러-우선)\n`);

  // off 경로
  process.env.REC_MIRROR_MATCH_ENABLED = "false";
  const off = byTitle(await matchFavoritesToTMDB(favorites));

  // on 경로
  process.env.REC_MIRROR_MATCH_ENABLED = "true";
  const on = byTitle(await matchFavoritesToTMDB(favorites));

  // 미러 커버리지 probe
  const mirrorKeys = await mirrorPresentKeys(favorites);

  let bothMatched = 0;
  let idDiverge = 0;
  let typeDiverge = 0;
  let genreDiverge = 0;
  let onlyOff = 0;
  let onlyOn = 0;
  let mirrorHits = 0;
  const diverged: string[] = [];
  const invariantBreaches: string[] = [];

  const rows: string[] = [];
  for (const title of favorites) {
    const o = off.get(title);
    const n = on.get(title);
    const hit = mirrorKeys.has(normalizeTitle(title));
    if (hit) mirrorHits++;

    let verdict: string;
    if (o && n) {
      bothMatched++;
      const idSame = o.id === n.id;
      const typeSame = o.type === n.type;
      const genreSame = sameGenres(o.genreIds, n.genreIds);
      if (!idSame) idDiverge++;
      if (!typeSame) typeDiverge++;
      if (!genreSame) genreDiverge++;
      if (idSame && typeSame && genreSame) {
        verdict = "MATCH";
      } else {
        verdict = `DIVERGE${!idSame ? " id" : ""}${!typeSame ? " type" : ""}${!genreSame ? " genre" : ""}`;
        diverged.push(title);
      }
      // 불변: divergence 는 오직 mirror-hit 지점에서만 (미스는 둘 다 searchTMDB).
      if (!idSame && !hit) {
        invariantBreaches.push(title);
      }
    } else if (o && !n) {
      onlyOff++;
      verdict = "ONLY_OFF";
    } else if (!o && n) {
      onlyOn++;
      verdict = "ONLY_ON";
    } else {
      verdict = "BOTH_MISS";
    }

    const offStr = o ? `${o.id}/${o.type}` : "-";
    const onStr = n ? `${n.id}/${n.type}` : "-";
    rows.push(
      `${title.padEnd(16)} off=${offStr.padEnd(14)} on=${onStr.padEnd(14)} ` +
        `mirror=${hit ? "hit" : "miss"}  ${verdict}`,
    );
  }

  console.log(rows.join("\n"));
  console.log("\n──────── 요약 ────────");
  console.log(`샘플:              ${favorites.length}`);
  console.log(`양쪽 적중:         ${bothMatched}`);
  console.log(`only_off:          ${onlyOff}  (미러-우선이 놓친 건 — fallback 으로도 못 잡으면 회귀)`);
  console.log(`only_on:           ${onlyOn}`);
  console.log(
    `미러 커버리지:     ${mirrorHits}/${favorites.length} (${((mirrorHits / favorites.length) * 100).toFixed(0)}%) — latency 이득 비율`,
  );
  console.log(`id divergence:     ${idDiverge}${bothMatched ? ` (${((idDiverge / bothMatched) * 100).toFixed(1)}% of 양쪽적중)` : ""}`);
  console.log(`type divergence:   ${typeDiverge}`);
  console.log(`genre divergence:  ${genreDiverge}`);
  if (diverged.length > 0) {
    console.log(`\n갈린 제목: ${diverged.join(", ")}`);
  }
  if (invariantBreaches.length > 0) {
    console.log(
      `\n⚠️ 불변 위반(미러 miss 인데 id 갈림 — 구현 점검 필요): ${invariantBreaches.join(", ")}`,
    );
  }

  const divPct = bothMatched ? (idDiverge / bothMatched) * 100 : 0;
  console.log("\n──────── 게이트 권고 ────────");
  if (onlyOff > 0) {
    console.log(`❌ only_off ${onlyOff}건 — 미러-우선이 적중을 놓침(fallback 실패). flag-on 보류, 원인 점검.`);
  } else if (divPct < 5) {
    console.log(`✅ id divergence ${divPct.toFixed(1)}% (<5%) — flag-on 안전. 갈린 건은 동명이작 정상 범위.`);
  } else {
    console.log(`⚠️ id divergence ${divPct.toFixed(1)}% (≥5%) — 미러 tie-break 보강(rating/popularity 정렬 등) 후 재측정 권고.`);
  }
}

main().catch((err) => {
  console.error("[divergence] 실패:", err);
  process.exit(1);
});
