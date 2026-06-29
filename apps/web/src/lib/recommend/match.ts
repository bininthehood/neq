import { searchTMDB, searchBestByPopularity, getTMDBRecommendations } from "../tmdb";
import { supabaseAdmin } from "../supabase-admin";
import type { Candidate, MatchedFavorite } from "./types";

// ---------- Step 1: favorites → TMDB 매칭 ----------

/**
 * 외부 searchTMDB 기반 단건 매칭 (변경 전 prod 거동과 100% 동일).
 *
 * movie 먼저 검색 → 실패 시 series. 둘 다 실패면 null.
 * ⚠️ movie-first 라 동명의 무명 영화가 인기 시리즈를 가로채는 latent 버그 보유
 * (`오징어 게임`→무명 movie 등). 이 거동은 **flag off 경로 전용**으로만 유지 —
 * 안전한 bit-identical 롤백 경로라 의도적으로 손대지 않는다. 개선판은 flag on 의
 * matchOneViaPopularity 가 담당.
 */
async function matchOneViaSearch(title: string): Promise<MatchedFavorite | null> {
  let result = await searchTMDB(title, "movie");
  let type: "movie" | "series" = "movie";
  if (!result) {
    result = await searchTMDB(title, "series");
    type = "series";
  }
  if (!result) return null;
  return { id: result.id, type, title, genreIds: result.genre_ids ?? [] };
}

/**
 * 원칙화된 단건 매칭 (flag on 의 미러 미스 fallback).
 *
 * search/multi 1회로 movie+tv 통합 → popularity desc best (movie-first 폐기).
 * 미러 경로(tmdb_catalog.popularity)와 동일 신호로 정렬 → 동명이작에서 미러/fallback
 * 이 갈리지 않는다. 결과 없으면 null (해당 favorite 스킵).
 */
async function matchOneViaPopularity(title: string): Promise<MatchedFavorite | null> {
  const best = await searchBestByPopularity(title);
  if (!best) return null;
  return { id: best.id, type: best.type, title, genreIds: best.genreIds };
}

/**
 * 제목 정규화 키 — 미러 title/title_en 와 favorite 제목을 동일 기준으로 비교.
 * 소문자 + 양끝 trim + 내부 공백 1칸 압축. (현지화/표기 변동 흡수는 최소화 —
 * 과도한 정규화는 오매칭 위험. 정확성 우선이라 보수적으로.)
 */
function normalizeTitle(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * 미러-우선 favorites → TMDB 매칭 (REC_MIRROR_MATCH_ENABLED).
 *
 * 동기: 변경 전 구현은 favorite 제목마다 외부 TMDB `searchTMDB` 호출 (favorite당
 *   최대 2회 + 영문 폴백 detail 1회). 외부 호출이라 Supabase(서울) 리전과 무관 →
 *   태평양 횡단 latency 가 match_ms ~755ms floor.
 *
 * 본 함수는 `tmdb_metadata` (서울 co-located) 배치 쿼리 1회로 대부분 favorite 을
 *   resolve, **미스만 기존 searchTMDB 로 fallback** → 적중 id/type/genreIds 가
 *   변경 전과 동일하게 유지된다 (품질 회귀 0 이 1순위, latency 는 그 다음).
 *
 * 매칭 원칙 (2026-06-29 원칙화 — flag on 전용):
 *   favorite 제목 = 그 제목을 가진 작품 중 **popularity 최상위** 작품 (movie/tv 통합).
 *   - 미러: tmdb_metadata title/title_en 매칭 → tmdb_catalog.popularity desc best
 *     (popularity 없으면 rating desc). type 도 이 정렬이 결정 (movie-first 폐기).
 *   - fallback (미러 미스): search/multi 1회 → popularity desc best (동일 신호로 정합).
 *   이로써 movie-first 가 인기 시리즈를 무명 영화로 가로채던 버그를 양 경로에서 제거.
 *
 * 정합성: 미러(catalog.popularity)와 fallback(search/multi popularity)이 같은 TMDB
 *   popularity 신호 → 동명이작에서 두 경로 best 가 일치. genre_ids 도 동일 원천.
 *
 * flag off (기본) | 미러 throw / 환경변수 누락 → 변경 전 searchTMDB(movie-first) 경로
 *   (= prod 거동과 bit-identical, 안전 롤백).
 */
export async function matchFavoritesToTMDB(favorites: string[]): Promise<MatchedFavorite[]> {
  if (favorites.length === 0) return [];

  // flag off → 변경 전 prod 경로 그대로 (전량 searchTMDB, movie-first).
  if (process.env.REC_MIRROR_MATCH_ENABLED !== "true") {
    const results = await Promise.all(favorites.map((t) => matchOneViaSearch(t)));
    return results.filter((r): r is MatchedFavorite => r !== null);
  }

  // ── 미러-우선 (원칙화) ──
  // 1) 모든 favorite 제목을 미러 title/title_en + catalog.popularity 배치 조회.
  let mirrorByKey = new Map<string, { id: number; type: "movie" | "series"; genreIds: number[] }>();
  try {
    mirrorByKey = await resolveFavoritesFromMirror(favorites);
  } catch (err) {
    // 미러 unavailable / 쿼리 실패 → 전량 popularity fallback (원칙 유지).
    console.warn("[match mirror] resolve failed, full popularity fallback:", err);
    const results = await Promise.all(favorites.map((t) => matchOneViaPopularity(t)));
    return results.filter((r): r is MatchedFavorite => r !== null);
  }

  // 2) favorite 별로 미러 히트면 즉시 채택, 미스만 popularity fallback (동일 원칙).
  const results = await Promise.all(
    favorites.map(async (title): Promise<MatchedFavorite | null> => {
      const hit = mirrorByKey.get(normalizeTitle(title));
      if (hit) {
        return { id: hit.id, type: hit.type, title, genreIds: hit.genreIds };
      }
      return matchOneViaPopularity(title);
    }),
  );
  return results.filter((r): r is MatchedFavorite => r !== null);
}

interface MirrorTitleRow {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string | null;
  title_en: string | null;
  rating: number | null;
  genre_ids: number[] | null;
}

interface MatchCandidate {
  id: number;
  type: "movie" | "series";
  genreIds: number[];
  rating: number;
  popularity: number; // catalog.popularity (없으면 -1 — rating·order 로만 비교)
}

/**
 * favorites 제목 배열 → 미러(`tmdb_metadata` + `tmdb_catalog`)에서 popularity-best 매칭.
 *
 * @returns 정규화 제목 키 → {id,type,genreIds}. 동명이작은 popularity desc 로 best 선택.
 *
 * 매칭 원칙 (movie-first 폐기):
 *   같은 정규화 제목에 여러 작품(movie/tv 무관)이 걸리면 **catalog.popularity 최상위**
 *   를 채택 (popularity 동률/부재 시 rating desc → 그래도 동률이면 먼저 본 row). type 도
 *   이 정렬이 결정. tmdb_metadata 는 popularity 컬럼이 없어 catalog 와 별도 조회·join.
 *   (rating 단독은 vote 정규화 부재로 무명 高평점에 오염 — `리틀 포레스트` tv rating=10/
 *   vote=1 vs movie popularity=2.06 정답. popularity 가 대표성을 직접 반영.)
 *
 * 동작:
 *   - tmdb_metadata: title/title_en `.or(.in)` 배치 조회 (rating 포함).
 *   - tmdb_catalog: 1단계에서 모은 (tmdb_id,media_type) 의 popularity 배치 조회.
 *   - providers 가용성·embedding 무관 (favorites 는 KR 모집단 밖일 수 있음).
 */
async function resolveFavoritesFromMirror(
  favorites: string[],
): Promise<Map<string, { id: number; type: "movie" | "series"; genreIds: number[] }>> {
  const out = new Map<string, { id: number; type: "movie" | "series"; genreIds: number[] }>();
  const admin = supabaseAdmin();

  // 정규화 키 ↔ 원본 제목 (dedup). 원본은 미러 컬럼이 ko-KR 우선이라 ko 매칭이 다수.
  const wantedKeys = new Set(favorites.map((t) => normalizeTitle(t)));
  const rawTitles = Array.from(new Set(favorites.map((t) => t.trim()))).filter(
    (t) => t.length > 0,
  );
  if (rawTitles.length === 0) return out;

  // 1) title 또는 title_en 이 favorite 원본과 일치하는 row 일괄 조회 (rating 포함).
  const { data, error } = await admin
    .from("tmdb_metadata")
    .select("tmdb_id, media_type, title, title_en, rating, genre_ids")
    .or(
      `title.in.(${toInList(rawTitles)}),title_en.in.(${toInList(rawTitles)})`,
    );
  if (error) throw error;
  const rows = (data ?? []) as MirrorTitleRow[];

  // 2) 후보 id 들의 catalog.popularity 배치 조회 (popularity 컬럼은 catalog 만 보유).
  const popByIdType = await fetchCatalogPopularity(
    admin,
    rows.map((r) => ({ id: r.tmdb_id, type: r.media_type })),
  );

  // 3) 정규화 키별로 동명 후보를 모아 popularity desc(→rating)로 best 선택.
  const byKey = new Map<string, MatchCandidate[]>();
  for (const row of rows) {
    const candidate: MatchCandidate = {
      id: row.tmdb_id,
      type: row.media_type === "tv" ? "series" : "movie",
      genreIds: row.genre_ids ?? [],
      rating: row.rating ?? 0,
      popularity: popByIdType.get(`${row.tmdb_id}:${row.media_type}`) ?? -1,
    };
    for (const col of [row.title, row.title_en]) {
      if (!col) continue;
      const key = normalizeTitle(col);
      if (!wantedKeys.has(key)) continue;
      const list = byKey.get(key);
      if (list) list.push(candidate);
      else byKey.set(key, [candidate]);
    }
  }

  for (const [key, candidates] of byKey) {
    const best = candidates.reduce((a, b) => {
      if (b.popularity !== a.popularity) return b.popularity > a.popularity ? b : a;
      if (b.rating !== a.rating) return b.rating > a.rating ? b : a;
      return a; // 완전 동률 → 먼저 본 row 유지 (결정적).
    });
    out.set(key, { id: best.id, type: best.type, genreIds: best.genreIds });
  }
  return out;
}

/**
 * (tmdb_id, media_type) 후보들의 catalog.popularity 배치 조회.
 * @returns `${tmdb_id}:${media_type}` → popularity. 미존재 행은 맵 부재 (-1 로 취급).
 */
async function fetchCatalogPopularity(
  admin: ReturnType<typeof supabaseAdmin>,
  refs: Array<{ id: number; type: "movie" | "tv" }>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = Array.from(new Set(refs.map((r) => r.id)));
  if (ids.length === 0) return out;
  // tmdb_id 로만 조회 후 media_type 까지 키에 포함 (movie/tv 동 id 분리).
  const { data, error } = await admin
    .from("tmdb_catalog")
    .select("tmdb_id, media_type, popularity")
    .in("tmdb_id", ids);
  if (error) throw error;
  for (const r of (data ?? []) as Array<{
    tmdb_id: number;
    media_type: "movie" | "tv";
    popularity: number | null;
  }>) {
    out.set(`${r.tmdb_id}:${r.media_type}`, r.popularity ?? -1);
  }
  return out;
}

/**
 * PostgREST `.or(... .in.(...))` 인라인용 값 리스트 생성.
 * 콤마/괄호/따옴표가 든 제목을 안전하게 큰따옴표로 감싸고 내부 " 는 이스케이프.
 * (supabase-js 의 .in() 은 .or() 안에서 직접 못 쓰므로 수동 직렬화.)
 */
function toInList(values: string[]): string {
  return values
    .map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",");
}

// ---------- Step 2-3: 후보 수집 + 병합 + 랭킹 ----------

export async function gatherCandidates(
  matched: MatchedFavorite[],
  excludeIds: Set<number>,
  excludeTitles: Set<string>
): Promise<Candidate[]> {
  // 각 취향 작품마다 movie + series 양쪽 /recommendations 호출
  // (영화 ID로 tv 호출 시 빈 결과 → 안전하게 무시됨)
  const allRecs = await Promise.all(
    matched.flatMap((fav) => [
      getTMDBRecommendations(fav.id, "movie"),
      getTMDBRecommendations(fav.id, "series"),
    ])
  );

  const freqMap = new Map<number, Candidate>();
  for (const recs of allRecs) {
    for (const item of recs) {
      if (excludeIds.has(item.id)) continue;
      if (excludeTitles.has(item.title)) continue;
      const existing = freqMap.get(item.id);
      if (existing) {
        existing.frequency++;
        existing.score = existing.frequency * (existing.item.vote_average || 1);
      } else {
        freqMap.set(item.id, {
          id: item.id,
          type: item.media_type === "tv" ? "series" : "movie",
          item,
          frequency: 1,
          score: item.vote_average || 1,
        });
      }
    }
  }

  const sorted = Array.from(freqMap.values())
    .sort((a, b) => b.score - a.score);
  // 상위 20개는 유지하고, 나머지는 셔플 → 매 호출마다 다른 조합
  const top = sorted.slice(0, 20);
  const rest = sorted.slice(20).sort(() => Math.random() - 0.5);
  // 100 → 75: user prompt 토큰 ~25% 절감 + LLM 처리 시간 ~15~20% 단축 추정 [Day 19 옵션 5]
  const pool = [...top, ...rest].slice(0, 75);

  // KR HARD FILTER (2026-06-10) — fallback ladder 의 글로벌 TMDB /recommendations 결과를
  // mirror 와 inner-join 해서 KR 가용 (providers IS NOT NULL) 후보만 통과시킨다.
  // 정상 경로 (candidate-generation.ts:422) 의 `not("providers", "is", null)` 패턴 차용.
  // mirror admin client 가 unavailable / 쿼리 실패하면 안전하게 원본 pool 반환 — fallback 의 fallback.
  return await filterByMirrorKR(pool);
}

// gatherCandidates 결과를 mirror (tmdb_metadata) 와 inner-join.
// providers IS NOT NULL = KR 에서 flatrate/rent/buy 1+ provider 가용 (scripts/lib/tmdb-fetch.ts:239 정의).
async function filterByMirrorKR(pool: Candidate[]): Promise<Candidate[]> {
  if (pool.length === 0) return pool;
  try {
    const admin = supabaseAdmin();
    const ids = pool.map((c) => c.id);
    const { data, error } = await admin
      .from("tmdb_metadata")
      .select("tmdb_id")
      .in("tmdb_id", ids)
      .not("providers", "is", null);
    if (error) {
      console.warn("[fallback KR filter] mirror query error, passing through pool:", error);
      return pool;
    }
    const krAvailable = new Set<number>((data ?? []).map((r) => r.tmdb_id as number));
    return pool.filter((c) => krAvailable.has(c.id));
  } catch (err) {
    console.warn("[fallback KR filter] mirror unavailable, passing through pool:", err);
    return pool;
  }
}
