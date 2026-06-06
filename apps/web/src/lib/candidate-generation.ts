/**
 * Phase B-1 (2026-06-06) — Candidate Pool Retrieval.
 *
 * Tier 3 리팩토링 §1 Phase B 의 첫 단계. 기존 one-shot LLM generation 패턴
 * (favorites → TMDB /recommendations → LLM 이 직접 10건 반환) 을
 * **candidate generation + ranking** 2-stage 로 분리하기 위한 candidate pool 모듈.
 *
 * 본 모듈은 *retrieval* 만 담당:
 *   1. TMDB mirror (`tmdb_metadata`) SQL query — KR providers / 장르 / 연도 / OTT 필터
 *   2. popularity × persona_match score 정렬, 상위 poolSize 반환
 *   3. excludeIds 차단
 *
 * Ranking (LLM 또는 score-based) 은 B-2 (`ranking.ts`) 에서 본 모듈 출력을 받음.
 * 메인 흐름 통합은 B-3 에서 `recommend.ts` 갱신.
 *
 * **변경 금지 (B-1 영역 외):**
 *   - `recommend.ts` / `prompt.ts` / `match.ts` (B-2/B-3 영역)
 *   - 기존 `enrichFromMirror` (단일 작품 hydrate, 본 모듈은 *pool* retrieval)
 *
 * **메모리 참조:**
 *   - `project_tmdb_mirror_status` — 17K KR universe, providers 30일 TTL
 *   - `project_recommendation_engine_baseline` — 다양성 튜닝 baseline
 *
 * 산출 spec: `_workspace/08_refactor-handoff-2026-06-06.md` §2 Phase B.
 */
import { supabaseAdmin } from "./supabase-admin";
import type { RecommendFilter } from "./types";

// ---------- 타입 ----------

/**
 * 페르소나 추천 컨텍스트 — 본 모듈의 후보 retrieval 입력.
 *
 * NOTE: `packages/core/types.ts` 의 `PersonaContext` (contentType + companion) 와
 *       이름 충돌 방지를 위해 별도 정의. core 타입은 *페르소나 생성* 컨텍스트
 *       (영화·시리즈·예능 × 혼자·같이) 이고, 본 타입은 *추천 retrieval* 입력.
 *
 * 모든 필드 optional — 이른 단계 사용자 (페르소나 미완성, axes 없음) 도 호환.
 */
export interface PersonaProfile {
  /** 페르소나 favorites 의 TMDB 장르 id 빈도 분포. 상위 5개를 가중 매칭에 사용. */
  favoriteGenreIds?: number[];
  /** 페르소나 favorites 의 TMDB id (자기 자신 차단용). */
  favoriteTmdbIds?: number[];
  /** AccountPrefs.tasteGenres — 한글 라벨 ("액션", "코미디" 등). */
  tasteGenres?: string[];
  /** AccountPrefs.subscribedOtt — OTT name ("Netflix", "wavve" 등, OTT_OPTIONS 기준). */
  subscribedOtt?: string[];
  /** 페르소나 favorites 의 출시 연도 분포 (10년 단위 cluster 검출용). */
  favoriteDecades?: number[];
}

/**
 * Candidate pool 의 단일 row. `tmdb_metadata` 미러 row 의 핵심 필드 +
 * persona_match 점수. B-2 ranking 단계 입력으로 사용.
 *
 * `EnrichedCandidate` (recommend/types.ts) 와 호환 가능하지만 본 모듈은
 * pool retrieval 만 담당 — credits 등 ranking 단계에서 추가 hydrate.
 */
export interface TmdbCandidate {
  tmdbId: number;
  type: "movie" | "series";
  title: string;
  titleEn: string | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  rating: number | null;
  releaseDate: string | null;
  genreIds: number[];
  country: string[];
  originCountry: string[];
  runtime: number | null;
  seasons: number | null;
  director: string | null;
  castNames: string[];
  providers: Array<{
    name: string;
    logoUrl: string | null;
    category?: "subscription" | "rent" | "buy";
  }>;
  watchLink: string | null;
  /** TMDB popularity (별점 우선 — popularity 컬럼은 catalog 만 보유, metadata 는 rating). */
  popularity: number;
  /** 본 모듈의 persona_match score (장르 매칭 + 연도 매칭 + tasteGenres 매칭). */
  personaMatch: number;
  /** popularity × (1 + personaMatch) — 정렬 키. */
  totalScore: number;
}

// ---------- 한글 → TMDB 장르 id 매핑 ----------
//
// `prompt.ts` 의 `TMDB_GENRE_KR` 와 reverse — tasteGenres (한글 라벨) 를
// 미러 SQL 의 `genre_ids @>` 매칭에 쓸 id 로 변환. 모듈 간 의존성 추가
// (prompt.ts import) 안 하고 같은 매핑을 재구성 — prompt.ts 는 LLM 인풋 전용
// (변경 빈도 ↑) 이므로 분리.
const TASTE_GENRE_LABEL_TO_IDS: Record<string, number[]> = {
  // movie + tv id 둘 다 매핑 — 한 라벨이 양쪽 type 후보 retrieve 가능하게
  액션: [28, 10759],
  모험: [12, 10759],
  애니메이션: [16],
  코미디: [35],
  범죄: [80],
  다큐: [99],
  드라마: [18],
  가족: [10751],
  판타지: [14, 10765],
  역사: [36],
  공포: [27],
  음악: [10402],
  미스터리: [9648],
  로맨스: [10749],
  SF: [878, 10765],
  스릴러: [53],
  전쟁: [10752, 10768],
  서부: [37],
  키즈: [10762],
  뉴스: [10763],
  리얼리티: [10764],
  연속극: [10766],
  토크: [10767],
  // 합성 라벨 (Movie / TV cross)
  "액션·모험": [28, 12, 10759],
  "SF·판타지": [878, 14, 10765],
  "전쟁·정치": [10752, 10768],
};

/**
 * tasteGenres (한글 라벨 배열) → TMDB 장르 id 합집합.
 * 알 수 없는 라벨은 silent skip.
 */
export function tasteGenresToIds(labels: string[] | undefined): number[] {
  if (!labels || labels.length === 0) return [];
  const ids = new Set<number>();
  for (const label of labels) {
    const mapped = TASTE_GENRE_LABEL_TO_IDS[label];
    if (mapped) {
      for (const id of mapped) ids.add(id);
    }
  }
  return Array.from(ids);
}

// ---------- 연도 필터 변환 ----------

function yearFilterToRange(
  year: RecommendFilter["year"],
): { gte?: string; lte?: string } | null {
  if (year === "recent") return { gte: "2020-01-01" };
  if (year === "2010s") return { gte: "2010-01-01", lte: "2019-12-31" };
  if (year === "classic") return { lte: "2009-12-31" };
  return null;
}

// ---------- TmdbMetadata row → TmdbCandidate ----------

interface TmdbMetadataPoolRow {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string | null;
  title_en: string | null;
  overview: string | null;
  rating: number | null;
  release_date: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  director: string | null;
  cast_names: string[] | null;
  runtime: number | null;
  seasons: number | null;
  country: string[] | null;
  origin_country: string[] | null;
  genre_ids: number[] | null;
  providers: Array<{
    name: string;
    logoUrl: string | null;
    category?: "subscription" | "rent" | "buy";
  }> | null;
  watch_link: string | null;
}

const SELECT_COLS = [
  "tmdb_id",
  "media_type",
  "title",
  "title_en",
  "overview",
  "rating",
  "release_date",
  "poster_path",
  "backdrop_path",
  "director",
  "cast_names",
  "runtime",
  "seasons",
  "country",
  "origin_country",
  "genre_ids",
  "providers",
  "watch_link",
].join(", ");

// ---------- Persona match score ----------
//
// 단순 가중 합산 — Phase B-2 가 학습된 ranker 로 대체 가능하게 분리.
//
// 가중치 근거:
//   - 장르 매칭이 가장 강한 신호 (favorites 의 장르 cluster) — +1.0 per overlap
//   - tasteGenres (계정 prefs) 는 보조 — +0.5 per overlap
//   - 연도 cluster 매칭 — +0.3 per overlap (favorites decade 와 같으면)
//   - rating 7+ 보너스 — +0.2 (모집단 자체가 KR 가용 17K 이므로 가벼운 양념)
//
// 정규화: rating 은 0~10 scale, personaMatch 는 0~몇 정도. totalScore =
// rating * (1 + personaMatch) → rating 만 있는 popular 작품과 persona fit 작품을
// 동등하게 끌어올리되, persona fit 이 있으면 우선.
function computePersonaMatch(
  row: TmdbMetadataPoolRow,
  favoriteGenreIds: Set<number>,
  tasteGenreIds: Set<number>,
  favoriteDecades: Set<number>,
): number {
  let score = 0;

  const genres = row.genre_ids ?? [];
  for (const gid of genres) {
    if (favoriteGenreIds.has(gid)) score += 1.0;
    if (tasteGenreIds.has(gid)) score += 0.5;
  }

  if (favoriteDecades.size > 0 && row.release_date) {
    const year = parseInt(row.release_date.slice(0, 4), 10);
    if (!Number.isNaN(year)) {
      const decade = Math.floor(year / 10) * 10;
      if (favoriteDecades.has(decade)) score += 0.3;
    }
  }

  if ((row.rating ?? 0) >= 7) score += 0.2;

  return score;
}

function rowToCandidate(
  row: TmdbMetadataPoolRow,
  personaMatch: number,
): TmdbCandidate {
  const rating = row.rating ?? 0;
  return {
    tmdbId: row.tmdb_id,
    type: row.media_type === "tv" ? "series" : "movie",
    title: row.title ?? row.title_en ?? "",
    titleEn: row.title_en,
    overview: row.overview,
    posterPath: row.poster_path,
    backdropPath: row.backdrop_path,
    rating,
    releaseDate: row.release_date,
    genreIds: row.genre_ids ?? [],
    country: row.country ?? [],
    originCountry: row.origin_country ?? [],
    runtime: row.runtime,
    seasons: row.seasons,
    director: row.director,
    castNames: row.cast_names ?? [],
    providers: row.providers ?? [],
    watchLink: row.watch_link,
    popularity: rating, // mirror metadata 는 popularity 컬럼 X — rating 으로 proxy
    personaMatch,
    totalScore: rating * (1 + personaMatch),
  };
}

// ---------- Phase B-3.2: stratifiedSample ----------
//
// 동기: B-3.1 측정에서 같은 페르소나 5 batch Jaccard 0.401 floor.
// 원인: generateCandidates 가 항상 totalScore desc 상위 N → LLM phase1 도 같은 풀
// 에서 같은 picks → 셋 자체가 결정적. Phase 2 셔플은 잔여 30 슬롯만 영향.
//
// 본 함수는 풀 자체를 stochastic 화 — 상위 topK 는 deterministic 유지 (persona
// 강한 신호 보존), 나머지는 totalScore 가중 random sample. TikTok/IG L3 표준 패턴.
//
// 결과: 같은 페르소나 호출 시 풀이 매번 다른 tail 을 가짐 → LLM picks 도 자연스럽게
// 분산 → Jaccard 가 풀 변동률만큼 추가로 감소.

/**
 * Phase B-3.2 (2026-06-06) — top-K deterministic + 가중 random tail.
 *
 * @param candidates totalScore desc 정렬된 입력 (호출자 책임)
 * @param poolSize   반환 크기 상한 (candidates.length 보다 작으면 sampling 발생)
 * @param topK       deterministic 보존 개수 (상위). default 100.
 *
 * @returns 길이 = min(poolSize, candidates.length). totalScore desc 정렬.
 *
 * 알고리즘:
 *   1. 상위 topK 는 항상 포함
 *   2. 나머지에서 (poolSize - topK) 개를 totalScore 가중 random sample (중복 X)
 *   3. 합산 후 totalScore desc 재정렬
 *
 * Edge cases:
 *   - candidates.length <= poolSize → 전체 반환 (sampling skip)
 *   - topK >= poolSize → 상위 poolSize 그대로 반환
 *   - totalScore 0 만 있는 tail → 균등 random 으로 degrade (math safe)
 */
export function stratifiedSample<T extends { totalScore: number }>(
  candidates: T[],
  poolSize: number,
  topK: number,
): T[] {
  if (candidates.length <= poolSize) return candidates.slice();
  if (topK >= poolSize) return candidates.slice(0, poolSize);

  const top = candidates.slice(0, topK);
  const rest = candidates.slice(topK);
  const sampleSize = Math.min(poolSize - topK, rest.length);
  if (sampleSize <= 0) return top.slice(0, poolSize);

  // 가중 sample without replacement. pool 수백 단위라 O(n × sampleSize) OK.
  const pool = rest.slice();
  // totalScore 음수/0 방어 — 최소 weight 1 부여 (균등 fallback)
  const weights = pool.map((c) => Math.max(c.totalScore, 1e-6));
  let totalWeight = weights.reduce((s, w) => s + w, 0);

  const sampled: T[] = [];
  for (let i = 0; i < sampleSize; i++) {
    const r = Math.random() * totalWeight;
    let cum = 0;
    let pickIdx = pool.length - 1; // 부동소수 오차 fallback
    for (let j = 0; j < pool.length; j++) {
      cum += weights[j];
      if (r < cum) {
        pickIdx = j;
        break;
      }
    }
    sampled.push(pool[pickIdx]);
    totalWeight -= weights[pickIdx];
    pool.splice(pickIdx, 1);
    weights.splice(pickIdx, 1);
  }

  const merged = [...top, ...sampled];
  merged.sort((a, b) => b.totalScore - a.totalScore);
  return merged;
}

// ---------- 메인: generateCandidates ----------

/**
 * Phase B-1 candidate pool retrieval.
 *
 * **동작:**
 *   1. tmdb_metadata SQL — providers IS NOT NULL (KR 가용), genre/year/OTT 필터
 *      + excludeIds 차단
 *   2. 결과를 persona_match 계산 후 totalScore desc 정렬
 *   3. 상위 poolSize 반환
 *
 * **에러 정책 (B-3 의 fallback ladder 가 처리):**
 *   - Supabase 연결 실패 / 환경변수 누락 → throw (caller 가 fallback)
 *   - 결과 0건 → 빈 배열 반환 (정상 케이스 — caller 가 필터 완화 재시도)
 *
 * @param profile     페르소나 추천 컨텍스트 (favorite genres / decades / tasteGenres / OTT)
 * @param filter      사용자 UI 필터 (type / origin / year / ott)
 * @param excludeIds  차단할 TMDB id (이미 본 / saved / 누적 노출)
 * @param poolSize    반환 후보 수 (기본 1000). PoolSize 1000 → DB row ~수만 scan
 *                    + JSONB 매칭 → ~수백 ms 예상 (Supabase / pg index 의존).
 * @param topK        Phase B-3.2 stratifiedSample 의 deterministic 상위 보존 수
 *                    (default 100). 상위 topK 는 항상 totalScore desc 유지,
 *                    나머지는 가중 random sample → 같은 페르소나 호출 간 풀 변동
 *                    → batch Jaccard 추가 감소. topK >= poolSize 면 sampling 없음.
 *
 * @returns TmdbCandidate[] — totalScore desc 정렬. 0건 가능.
 */
export async function generateCandidates(
  profile: PersonaProfile,
  filter: RecommendFilter,
  excludeIds: number[],
  poolSize: number = 1000,
  topK: number = 100,
): Promise<TmdbCandidate[]> {
  const admin = supabaseAdmin(); // env 누락 시 throw → caller 가 fallback

  // Genre id 합산
  const favoriteGenreIds = new Set(profile.favoriteGenreIds ?? []);
  const tasteGenreIds = new Set(tasteGenresToIds(profile.tasteGenres));
  const favoriteDecades = new Set(profile.favoriteDecades ?? []);

  // SQL genre_ids @> 매칭 — favorites + tasteGenres 합집합. 비어있으면 미적용.
  const genreFilterIds = new Set<number>();
  for (const gid of favoriteGenreIds) genreFilterIds.add(gid);
  for (const gid of tasteGenreIds) genreFilterIds.add(gid);

  // Type 결정
  // - filter.type === "variety" → tv + 장르 reality/talk → 본 모듈은 type=series 로 retrieve,
  //   장르 필터에 10764/10767 강제 inject. caller (B-3) 가 추가 후처리 가능.
  let mediaType: "movie" | "tv" | "both" = "both";
  if (filter.type === "movie") mediaType = "movie";
  else if (filter.type === "series") mediaType = "tv";
  else if (filter.type === "variety") {
    mediaType = "tv";
    genreFilterIds.add(10764);
    genreFilterIds.add(10767);
  }

  // 연도 범위
  const dateRange = yearFilterToRange(filter.year);

  // -- SQL 빌더 --
  // KR 가용 = providers IS NOT NULL (mirror parity §providers TTL 30일 fresh 가정).
  // genre_ids 매칭은 PostgreSQL `&&` (overlap) 연산자 — pg_array 인덱스 활용 가능.
  // exclude 는 .not("tmdb_id", "in", `(...)`) 패턴.
  //
  // NOTE: supabase-js v2 는 raw SQL 보다 chainable query builder 권장.
  // `genre_ids && '{28,18}'` 은 `.overlaps()` 또는 `.contains()` 사용 가능.
  // 본 구현은 `.overlaps()` (= && 연산자) — 어느 한 장르라도 겹치면 매칭.
  function buildQuery(type: "movie" | "tv") {
    let q = admin
      .from("tmdb_metadata")
      .select(SELECT_COLS)
      .eq("media_type", type)
      .not("providers", "is", null);

    if (genreFilterIds.size > 0) {
      q = q.overlaps("genre_ids", Array.from(genreFilterIds));
    }
    if (dateRange?.gte) q = q.gte("release_date", dateRange.gte);
    if (dateRange?.lte) q = q.lte("release_date", dateRange.lte);
    if (filter.origin === "kr") q = q.contains("country", ["KR"]);
    if (filter.origin === "foreign") {
      // country 가 ["KR"] 단일이 아닌 모든 row — Supabase 는 NOT contains 지원 부분적.
      // 본 단계에서는 client 측 후처리 — country.includes("KR") false 만 통과.
      // SQL 단계 skip (B-3 에서 필요 시 정교화).
    }

    // OTT 필터 — filter.ott (사용자 명시) 우선, 없으면 subscribedOtt (페르소나) 사용.
    const ottNames =
      filter.ott && filter.ott.length > 0
        ? filter.ott
        : profile.subscribedOtt ?? [];
    if (ottNames.length > 0) {
      // providers JSONB = [{"name":"Netflix",...}, ...]. SQL @> 패턴:
      //   providers @> '[{"name":"Netflix"}]'  → Netflix 포함 row
      //   OR 매칭은 .or() chain 또는 client 측 후처리.
      // supabase-js 의 .or() 는 비교 연산자 표현이 제한적이라 client 후처리 채택.
    }

    // excludeIds — TMDB id NOT IN. Supabase 의 `.not("tmdb_id", "in", "(...)")` 패턴.
    // PostgreSQL IN 파라미터 한계 (~수천) → 클라이언트 측 청크 처리는 caller (B-3) 책임.
    // 본 모듈은 단순 형식만.
    if (excludeIds.length > 0) {
      // .not("tmdb_id", "in", "(...)") — Supabase 는 (...) 안에 정수 콤마구분
      const idList = excludeIds.join(",");
      q = q.not("tmdb_id", "in", `(${idList})`);
    }

    // 상위 N — rating desc + limit. persona_match 는 row 받은 후 재정렬.
    // pool 후보를 충분히 받기 위해 poolSize × 2 (overfetch) — OTT/origin 클라 후처리 손실 보정.
    return q.order("rating", { ascending: false }).limit(poolSize * 2);
  }

  async function execQuery(
    type: "movie" | "tv",
  ): Promise<TmdbMetadataPoolRow[]> {
    const { data, error } = await buildQuery(type);
    if (error) throw error;
    return (data ?? []) as unknown as TmdbMetadataPoolRow[];
  }

  const tasks: Array<Promise<TmdbMetadataPoolRow[]>> = [];
  if (mediaType === "movie" || mediaType === "both") {
    tasks.push(execQuery("movie"));
  }
  if (mediaType === "tv" || mediaType === "both") {
    tasks.push(execQuery("tv"));
  }

  const all = (await Promise.all(tasks)).flat();
  if (all.length === 0) return [];

  // OTT 후처리 — providers JSONB 안에서 name 매칭
  const ottNames =
    filter.ott && filter.ott.length > 0
      ? filter.ott
      : profile.subscribedOtt ?? [];
  const ottSet = new Set(ottNames);

  // origin=foreign 후처리
  const wantForeign = filter.origin === "foreign";

  // favoriteTmdbIds 차단 (자기 자신 추천 방지) — excludeIds 와 합산. 호출자가
  // 이미 합쳤을 가능성 큼 (recommend.ts §225) 이지만 안전망.
  const blockSet = new Set([
    ...excludeIds,
    ...(profile.favoriteTmdbIds ?? []),
  ]);

  const candidates: TmdbCandidate[] = [];
  for (const row of all) {
    if (blockSet.has(row.tmdb_id)) continue;
    if (ottSet.size > 0) {
      const matched = (row.providers ?? []).some((p) => ottSet.has(p.name));
      if (!matched) continue;
    }
    if (wantForeign) {
      const isKR = (row.country ?? row.origin_country ?? []).includes("KR");
      if (isKR) continue;
    }
    const personaMatch = computePersonaMatch(
      row,
      favoriteGenreIds,
      tasteGenreIds,
      favoriteDecades,
    );
    candidates.push(rowToCandidate(row, personaMatch));
  }

  candidates.sort((a, b) => b.totalScore - a.totalScore);
  // Phase B-3.2 — top-K deterministic + 가중 random tail (위 stratifiedSample 주석 참조).
  return stratifiedSample(candidates, poolSize, topK);
}
