import { searchTMDB, getTMDBRecommendations } from "../tmdb";
import { supabaseAdmin } from "../supabase-admin";
import type { Candidate, MatchedFavorite } from "./types";

// ---------- Step 1: favorites → TMDB 매칭 ----------

/**
 * 외부 searchTMDB 기반 단건 매칭 (변경 전 로직과 100% 동일).
 *
 * movie 먼저 검색 → 실패 시 series. 둘 다 실패면 null.
 * 미러-우선 경로의 fallback 으로 재사용 — 미스 favorite 만 이 함수로 resolve 하면
 * 적중 id/type/genreIds 가 변경 전과 동일하게 유지된다.
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
 * 정합성 (memory project_rec_refactor):
 *   - 미러 title/title_en 와 searchTMDB 는 동일 TMDB 원천 (ko-KR 우선 + en 폴백).
 *   - genre_ids 도 동일 원천 → 적중 작품 동일하면 장르신호·자기차단 영향 0.
 *   - type: movie row 우선 (변경 전 "movie 먼저" 우선순위 보존).
 *
 * flag off (기본) | 미러 throw / 환경변수 누락 → 전량 searchTMDB fallback
 *   (= 변경 전 거동과 bit-identical).
 */
export async function matchFavoritesToTMDB(favorites: string[]): Promise<MatchedFavorite[]> {
  if (favorites.length === 0) return [];

  // flag off → 변경 전 경로 그대로 (전량 searchTMDB).
  if (process.env.REC_MIRROR_MATCH_ENABLED !== "true") {
    const results = await Promise.all(favorites.map((t) => matchOneViaSearch(t)));
    return results.filter((r): r is MatchedFavorite => r !== null);
  }

  // ── 미러-우선 ──
  // 1) 모든 favorite 제목을 미러 title/title_en 에 배치 조회 (1 쿼리, 서울 DB).
  let mirrorByKey = new Map<string, { id: number; type: "movie" | "series"; genreIds: number[] }>();
  try {
    mirrorByKey = await resolveFavoritesFromMirror(favorites);
  } catch (err) {
    // 미러 unavailable / 쿼리 실패 → 전량 searchTMDB fallback (정확성 보존).
    console.warn("[match mirror] resolve failed, full searchTMDB fallback:", err);
    const results = await Promise.all(favorites.map((t) => matchOneViaSearch(t)));
    return results.filter((r): r is MatchedFavorite => r !== null);
  }

  // 2) favorite 별로 미러 히트면 즉시 채택, 미스만 searchTMDB fallback.
  const results = await Promise.all(
    favorites.map(async (title): Promise<MatchedFavorite | null> => {
      const hit = mirrorByKey.get(normalizeTitle(title));
      if (hit) {
        return { id: hit.id, type: hit.type, title, genreIds: hit.genreIds };
      }
      return matchOneViaSearch(title);
    }),
  );
  return results.filter((r): r is MatchedFavorite => r !== null);
}

interface MirrorTitleRow {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string | null;
  title_en: string | null;
  genre_ids: number[] | null;
}

/**
 * favorites 제목 배열 → 미러(`tmdb_metadata`)에서 정규화 title/title_en 매칭.
 *
 * @returns 정규화 제목 키 → {id,type,genreIds}. movie row 우선 (변경 전 우선순위).
 *
 * 동작:
 *   - title / title_en 모두에 대해 `.in()` 배치 조회 (1 라운드트립).
 *   - providers 가용성 무관 (favorites 는 KR 모집단 밖일 수 있음 — 자기차단·장르신호엔
 *     가용성 무관). embedding 무관.
 *   - 같은 정규화 제목에 movie/tv 양쪽 row 존재 시 movie 우선. movie 끼리 충돌 시
 *     먼저 들어온 row 유지 (보수적 — 동명이작은 flag off 기본 + 검증 후 on).
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

  // title 또는 title_en 이 favorite 원본과 일치하는 row 일괄 조회.
  // .or() 로 두 컬럼 .in() 결합. PostgREST .in() 은 콤마구분 + 따옴표 이스케이프 필요 —
  // 제목에 콤마/따옴표가 있을 수 있어 supabase-js 의 .in() helper 사용 (자동 quoting).
  const { data, error } = await admin
    .from("tmdb_metadata")
    .select("tmdb_id, media_type, title, title_en, genre_ids")
    .or(
      `title.in.(${toInList(rawTitles)}),title_en.in.(${toInList(rawTitles)})`,
    );
  if (error) throw error;

  const rows = (data ?? []) as MirrorTitleRow[];
  for (const row of rows) {
    const candidateType: "movie" | "series" =
      row.media_type === "tv" ? "series" : "movie";
    const genreIds = row.genre_ids ?? [];
    for (const col of [row.title, row.title_en]) {
      if (!col) continue;
      const key = normalizeTitle(col);
      if (!wantedKeys.has(key)) continue;
      const existing = out.get(key);
      // movie 우선: 기존이 series 인데 movie 가 오면 교체. movie 끼리는 첫 row 유지.
      if (!existing || (existing.type === "series" && candidateType === "movie")) {
        out.set(key, { id: row.tmdb_id, type: candidateType, genreIds });
      }
    }
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
