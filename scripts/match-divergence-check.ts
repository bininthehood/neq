/**
 * match-divergence-check — 매칭 원칙화(2026-06-29) 전후 적중 divergence + 정확도 판정.
 *
 * 배경: `matchFavoritesToTMDB` 의 flag off/on 이 이제 "구버그(movie-first) vs 원칙화
 *   (popularity-best)" 를 가른다.
 *   - off (현재 prod): searchTMDB movie-first → 인기 시리즈를 동명 무명 영화로 오매칭
 *     하는 latent 버그 보유 (`오징어 게임`→무명 movie 등).
 *   - on (원칙화): 미러(tmdb_catalog.popularity) + fallback(search/multi popularity)
 *     으로 movie/tv 통합 popularity-best 선택. movie-first 폐기.
 *   따라서 divergence 는 *의도적으로* 높게 나온다 (시리즈 매칭 교정 + 동명이작 재선택).
 *   퍼센트가 아니라 **갈린 각 제목에서 on 이 진짜 더 대표적(=popularity 최상위)인가**
 *   를 제목별로 판정하는 게 본 스크립트의 목적.
 *   (정신: memory feedback_pgvector_ivfflat_filtered_ann "silent divergence 경계")
 *
 * 동작:
 *   동일 favorites 셋을 ① flag off ② flag on 두 번 매칭 → 제목별 id/type/genreIds 비교.
 *   갈린 제목마다 TMDB search/multi 로 movie+tv popularity-top(= "가장 대표적 작품")을
 *   ground-truth 참조로 뽑아 off/on 중 어느 쪽이 그것과 일치하는지 자동 판정.
 *   추가로 알려진 정답 스팟체크(오징어게임→tv 93405, 올드보이→movie 670, 더글로리→tv
 *   136283)를 on 경로에 대해 검증.
 *
 * 출력:
 *   - 제목별: off(id,type) | on(id,type) | gt(popularity-top) | verdict
 *   - 갈린 제목 판정: ON_CORRECT(on=gt) / OFF_CORRECT(off=gt, on 틀림=회귀) /
 *                     BOTH_WRONG / AMBIGUOUS
 *   - 스팟체크 PASS/FAIL
 *   - 게이트: off 가 맞고 on 이 틀린 회귀(OFF_CORRECT) 0 + 스팟체크 전부 PASS → flag-on 권고
 *
 * 환경 변수: NEXT_PUBLIC_SUPABASE_URL(or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
 *   TMDB_API_KEY. FAVORITES (선택, 콤마구분으로 기본 샘플 override).
 *
 * 실행 (repo 루트):
 *   set -a; source apps/web/.env; source apps/web/.env.local; set +a
 *   npx tsx scripts/match-divergence-check.ts
 */
import { matchFavoritesToTMDB } from "../apps/web/src/lib/recommend/match";
import type { MatchedFavorite } from "../apps/web/src/lib/recommend/types";

// match.ts 미러 경로(supabaseAdmin) 가 읽는 자격증명 + ground-truth/fallback 용 TMDB 키.
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
  console.error("[divergence] TMDB_API_KEY 누락 (search/multi popularity 경로 필요)");
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

// 알려진 정답 스팟체크 — on 경로가 반드시 맞춰야 하는 그라운드 트루스.
const SPOTCHECK: Record<string, { id: number; type: "movie" | "series" }> = {
  "오징어 게임": { id: 93405, type: "series" },
  "올드보이": { id: 670, type: "movie" },
  "더 글로리": { id: 136283, type: "series" },
};

function byTitle(rows: MatchedFavorite[]): Map<string, MatchedFavorite> {
  const m = new Map<string, MatchedFavorite>();
  for (const r of rows) m.set(r.title, r);
  return m;
}

interface GroundTruth {
  id: number;
  type: "movie" | "series";
  popularity: number;
}

function normalizeTitle(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * 제목의 "가장 대표적인 작품" = TMDB search/multi 의 movie+tv popularity-top.
 * off/on 매칭이 이것과 일치하는지 판정하는 ground-truth 참조.
 *
 * ⚠️ search/multi 는 부분 문자열 매칭(`킹덤`→`애니멀 킹덤`, `1987`→`대운하 1987`)도
 *   반환하므로, **정확 제목 일치(title/name == 쿼리)** 후보로 먼저 좁힌다. 정확 일치가
 *   하나도 없으면(=KR 미공급 등) 부분매칭 전체로 폴백하되 exact=false 로 표시 —
 *   미러(정확 title 매칭)와 공정하게 비교하기 위함.
 */
async function popularityTop(title: string): Promise<(GroundTruth & { exact: boolean }) | null> {
  const key = process.env.TMDB_API_KEY!;
  const want = normalizeTitle(title);
  const fetchWorks = async (lang: string) => {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/multi?api_key=${key}&query=${encodeURIComponent(title)}&language=${lang}`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.results ?? []) as Array<{
      id: number;
      media_type?: string;
      popularity?: number;
      title?: string;
      name?: string;
      original_title?: string;
      original_name?: string;
    }>).filter((r) => r.media_type === "movie" || r.media_type === "tv");
  };
  let works = await fetchWorks("ko-KR");
  if (works.length === 0) works = await fetchWorks("en-US");
  if (works.length === 0) return null;

  const isExact = (r: { title?: string; name?: string; original_title?: string; original_name?: string }) =>
    [r.title, r.name, r.original_title, r.original_name]
      .filter(Boolean)
      .some((t) => normalizeTitle(t as string) === want);

  const exactWorks = works.filter(isExact);
  const pool = exactWorks.length > 0 ? exactWorks : works;
  const best = pool.reduce((a, b) =>
    (b.popularity ?? -1) > (a.popularity ?? -1) ? b : a,
  );
  return {
    id: best.id,
    type: best.media_type === "tv" ? "series" : "movie",
    popularity: best.popularity ?? -1,
    exact: exactWorks.length > 0,
  };
}

async function main() {
  const favorites = process.env.FAVORITES
    ? process.env.FAVORITES.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_FAVORITES;

  console.log(
    `[divergence] 샘플 ${favorites.length}건 — off(movie-first 구버그) vs on(popularity 원칙화)\n`,
  );

  process.env.REC_MIRROR_MATCH_ENABLED = "false";
  const off = byTitle(await matchFavoritesToTMDB(favorites));

  process.env.REC_MIRROR_MATCH_ENABLED = "true";
  const on = byTitle(await matchFavoritesToTMDB(favorites));

  let bothMatched = 0;
  let idDiverge = 0;
  let onlyOff = 0;
  let onlyOn = 0;
  const diverged: string[] = [];

  const rows: string[] = [];
  for (const title of favorites) {
    const o = off.get(title);
    const n = on.get(title);
    let verdict: string;
    if (o && n) {
      bothMatched++;
      if (o.id === n.id && o.type === n.type) {
        verdict = "MATCH";
      } else {
        idDiverge++;
        verdict = "DIVERGE";
        diverged.push(title);
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
      `${title.padEnd(16)} off=${offStr.padEnd(14)} on=${onStr.padEnd(14)} ${verdict}`,
    );
  }
  console.log(rows.join("\n"));

  // ── 갈린 제목 정확도 판정 (ground-truth = popularity-top) ──
  console.log("\n──────── 갈린 제목 정확도 판정 (gt = TMDB popularity-top) ────────");
  let onCorrect = 0;
  let offCorrectRegression = 0;
  let bothWrong = 0;
  const regressionTitles: string[] = [];
  for (const title of diverged) {
    const o = off.get(title)!;
    const n = on.get(title)!;
    const gt = await popularityTop(title);
    const gtStr = gt
      ? `${gt.id}/${gt.type}(pop=${gt.popularity.toFixed(1)}${gt.exact ? "" : ",부분"})`
      : "?";
    const onIsGt = gt ? n.id === gt.id : false;
    const offIsGt = gt ? o.id === gt.id : false;
    let v: string;
    if (onIsGt && !offIsGt) {
      v = "ON_CORRECT (on=gt, off 틀림 → 교정)";
      onCorrect++;
    } else if (offIsGt && !onIsGt) {
      v = "⚠️ OFF_CORRECT (off=gt, on 틀림 → 회귀!)";
      offCorrectRegression++;
      regressionTitles.push(title);
    } else if (onIsGt && offIsGt) {
      v = "BOTH=gt (정렬 무관)";
    } else {
      v = "BOTH_WRONG/AMBIGUOUS (gt 와 둘 다 불일치)";
      bothWrong++;
    }
    console.log(
      `${title.padEnd(16)} off=${(o.id + "/" + o.type).padEnd(14)} on=${(n.id + "/" + n.type).padEnd(14)} gt=${gtStr.padEnd(22)} ${v}`,
    );
  }

  // ── 알려진 정답 스팟체크 (on 경로) ──
  console.log("\n──────── 스팟체크 (on 경로 = 알려진 정답) ────────");
  let spotPass = 0;
  let spotFail = 0;
  for (const [title, want] of Object.entries(SPOTCHECK)) {
    const n = on.get(title);
    const ok = n && n.id === want.id && n.type === want.type;
    if (ok) spotPass++;
    else spotFail++;
    console.log(
      `${title.padEnd(16)} want=${want.id}/${want.type} got=${n ? `${n.id}/${n.type}` : "-"}  ${ok ? "PASS" : "FAIL"}`,
    );
  }

  console.log("\n──────── 요약 ────────");
  console.log(`샘플:            ${favorites.length}`);
  console.log(`양쪽 적중:       ${bothMatched}`);
  console.log(`only_off:        ${onlyOff} (on 이 적중 놓침 — fallback 실패 시 회귀)`);
  console.log(`only_on:         ${onlyOn} (off 가 놓친 걸 on 이 잡음)`);
  console.log(
    `id divergence:   ${idDiverge}${bothMatched ? ` (${((idDiverge / bothMatched) * 100).toFixed(1)}% — 원칙화로 의도적 변경)` : ""}`,
  );
  console.log(`  └ ON_CORRECT (off 버그 교정):    ${onCorrect}`);
  console.log(`  └ OFF_CORRECT (on 회귀):          ${offCorrectRegression}`);
  console.log(`  └ BOTH_WRONG/AMBIGUOUS:          ${bothWrong}`);
  console.log(`스팟체크:        ${spotPass} PASS / ${spotFail} FAIL`);

  console.log("\n──────── 게이트 권고 ────────");
  if (onlyOff > 0) {
    console.log(`❌ only_off ${onlyOff}건 — on 이 적중을 놓침(fallback 실패). flag-on 보류, 원인 점검.`);
  } else if (offCorrectRegression > 0) {
    console.log(
      `❌ OFF_CORRECT 회귀 ${offCorrectRegression}건 (${regressionTitles.join(", ")}) — off 가 맞고 on 이 틀림. tie-break 보강 후 재측정.`,
    );
  } else if (spotFail > 0) {
    console.log(`❌ 스팟체크 ${spotFail}건 FAIL — 알려진 정답 불일치. flag-on 보류.`);
  } else {
    console.log(
      `✅ off→on 회귀 0 + 스팟체크 전부 PASS. 모든 divergence 가 (a) 시리즈 오매칭 교정 또는 (b) 동명이작 popularity-best 재선택으로 설명됨 → flag-on 권고.`,
    );
  }
}

main().catch((err) => {
  console.error("[divergence] 실패:", err);
  process.exit(1);
});
