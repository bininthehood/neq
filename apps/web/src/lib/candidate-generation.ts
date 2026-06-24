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
import type { SupabaseClient } from "@supabase/supabase-js";
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
  // weight = sqrt(totalScore) — linear (totalScore) 는 강한 작품 편향이 커서
  // tail variance 가 작음. sqrt 로 spread 증가 → batch 간 풀 변동 ↑.
  // totalScore 음수/0 방어 — 최소 1e-6 부여 (균등 fallback)
  const pool = rest.slice();
  const weights = pool.map((c) => Math.sqrt(Math.max(c.totalScore, 1e-6)));
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

// ---------- P2 (2026-06-24): pgvector ANN retrieval ----------
//
// 설계 정본: _workspace/11_p2-retrieval-plan-2026-06-24.md §작업2.
// candidate retrieval 을 mirror SQL(rating DESC) → 취향벡터 cosine NN 으로 교체.
// 순수 additive — feature flag(REC_EMBED_RETRIEVAL_ENABLED) off 시 미진입.
// 임베딩 신규 호출 없음 — favorites 의 *기존* DB embedding 만 사용.

/**
 * ANN top-K 상한 (RPC match_count).
 *
 * IVFFlat 는 대형 K 에서 planner 가 인덱스를 버리고 seq-scan + exact sort 로 전환 →
 * 수초~수십초(8s statement_timeout 초과 → silent SQL fallback). 2026-06-24 실측 cliff:
 *   K=150 media_type 필터 130ms / K=300 필터 7.5s (필터 결합 시 더 빨리 무너짐).
 * 아키텍처 정본도 "pgvector ANN top~100". poolSize×3(=1500) 는 ANN 부적합 → 150 으로 캡.
 * OTT/origin client 후처리 손실은 150 헤드룸으로 흡수(최종 picks ~10-30). 좁은 OTT
 * 구독(1개)에서 후보 부족 시 → probes↑+K↑ 동반 튜닝 또는 OTT 를 SQL 로 이관(P3 follow-up).
 */
const ANN_MATCH_COUNT = 150;
/** popularity 블렌딩 가중 — finalScore = similarity + POP_WEIGHT*(rating/10). */
const POP_WEIGHT = 0.15;

/**
 * Supabase 가 vector(1536) 컬럼을 JSON 문자열("[...]")로 돌려줄 수 있어 정규화.
 * scripts/tmdb-embed-sanity.ts 의 parseEmbedding 패턴 재사용.
 */
function parseEmbedding(e: number[] | string | null | undefined): number[] | null {
  if (e == null) return null;
  if (Array.isArray(e)) return e;
  try {
    const parsed = JSON.parse(e);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 취향벡터 빌드 — favorites 작품의 기존 embedding 을 평균 + L2 정규화.
 *
 * @param admin            service_role Supabase client
 * @param favoriteTmdbIds  페르소나 favorites 의 TMDB id
 * @returns 1536-d L2-normalized vector. 유효 embedding 0건 → null (cold-start fallback).
 *
 * 동작:
 *   1. tmdb_metadata 에서 tmdb_id IN (favoriteTmdbIds) 의 embedding 일괄 select.
 *      providers/embedding NULL 무관 — favorites 는 KR 가용 모집단 밖일 수 있음.
 *   2. parseEmbedding 으로 number[] 정규화 (string 컬럼 방어).
 *   3. 성분별 평균 → L2 정규화 (cosine 정합).
 *
 * 임베딩 신규 호출 절대 없음 — DB 의 기존 embedding 만 read.
 */
export async function buildTasteVector(
  admin: SupabaseClient,
  favoriteTmdbIds: number[],
): Promise<number[] | null> {
  if (!favoriteTmdbIds || favoriteTmdbIds.length === 0) return null;

  const { data, error } = await admin
    .from("tmdb_metadata")
    .select("embedding")
    .in("tmdb_id", favoriteTmdbIds)
    .not("embedding", "is", null);
  if (error) throw error;

  const rows = (data ?? []) as Array<{ embedding: number[] | string | null }>;
  const vecs: number[][] = [];
  let dim = 0;
  for (const r of rows) {
    const v = parseEmbedding(r.embedding);
    if (v && v.length > 0) {
      if (dim === 0) dim = v.length;
      // 차원 불일치 row 는 skip (방어 — 정상적으로는 전부 1536-d)
      if (v.length === dim) vecs.push(v);
    }
  }
  if (vecs.length === 0 || dim === 0) return null;

  // 성분별 평균
  const mean = new Array<number>(dim).fill(0);
  for (const v of vecs) {
    for (let i = 0; i < dim; i++) mean[i] += v[i];
  }
  for (let i = 0; i < dim; i++) mean[i] /= vecs.length;

  // L2 정규화 (cosine 정합 — 정규화된 벡터끼리 dot = cosine)
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += mean[i] * mean[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return null; // 영벡터 방어
  for (let i = 0; i < dim; i++) mean[i] /= norm;

  return mean;
}

/**
 * match_tmdb_by_embedding RPC 반환 row (스네이크케이스 — 계약은 정본 §작업1).
 * tmdb_metadata 미러 컬럼 + similarity.
 */
interface MatchEmbeddingRpcRow {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string | null;
  title_en: string | null;
  overview: string | null;
  // PostgREST 가 numeric/float 을 string 으로 직렬화할 수 있음 → Number() 후처리.
  rating: number | string | null;
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
  similarity: number | string;
}

/**
 * 취향벡터 cosine NN retrieval — RPC match_tmdb_by_embedding 호출 + client 후처리.
 *
 * 필터 매핑은 generateCandidates 의 SQL 빌드 로직과 동일 의미 (type/genre/year/origin/ott).
 * popularity 블렌딩: finalScore = similarity + POP_WEIGHT*(rating/10) → totalScore 자리.
 * personaMatch 는 similarity 기반 보존 (downstream 은 totalScore 만 봄).
 * stratifiedSample 로 다양성 tail (P3 DPP 전까지 현 거동 유지).
 */
export async function embeddingRetrieval(
  admin: SupabaseClient,
  taste: number[],
  profile: PersonaProfile,
  filter: RecommendFilter,
  excludeIds: number[],
  poolSize: number,
  topK: number,
): Promise<TmdbCandidate[]> {
  // ── 필터 매핑 ──
  // ⚠️ 장르 하드필터 미적용 (2026-06-24 실측 결정): broad genre `&&` 필터는 IVFFlat planner 가
  //   인덱스를 버리고 exact-sort 로 전환(~12K 행 cold 6~10s → statement_timeout → silent SQL
  //   fallback). 임베딩 경로는 **취향벡터가 장르/주제를 이미 내포**하므로 프로필 장르 하드필터는
  //   중복이자 유해. 단 variety(예능)는 format 정의 장르(reality/talk)가 좁아(=적은 행, cold도 빠름)
  //   유지 — 이게 없으면 "tv 전체"가 되어 예능 정체성이 사라짐.
  //   (media_type/연도/origin/providers/excludeIds 하드필터는 인덱스와 양립 → 유지.)
  let pMediaType: "movie" | "tv" | null = null;
  let pGenreIds: number[] | null = null;
  if (filter.type === "movie") pMediaType = "movie";
  else if (filter.type === "series") pMediaType = "tv";
  else if (filter.type === "variety") {
    pMediaType = "tv";
    pGenreIds = [10764, 10767]; // reality/talk — 좁은 필터, 인덱스 영향 미미
  }

  const dateRange = yearFilterToRange(filter.year);

  // origin: 'kr' | 'foreign' | null (RPC 가 country 기반 하드필터)
  const pOrigin =
    filter.origin === "kr" ? "kr" : filter.origin === "foreign" ? "foreign" : null;

  // exclude: excludeIds + favoriteTmdbIds 안전망
  const excludeSet = new Set<number>([
    ...excludeIds,
    ...(profile.favoriteTmdbIds ?? []),
  ]);
  const pExcludeIds = excludeSet.size > 0 ? Array.from(excludeSet) : null;

  const { data, error } = await admin.rpc("match_tmdb_by_embedding", {
    query_embedding: taste,
    match_count: ANN_MATCH_COUNT,
    p_media_type: pMediaType,
    p_genre_ids: pGenreIds,
    p_date_gte: dateRange?.gte ?? null,
    p_date_lte: dateRange?.lte ?? null,
    p_origin: pOrigin,
    p_exclude_ids: pExcludeIds,
  });
  if (error) throw error;

  const rows = (data ?? []) as MatchEmbeddingRpcRow[];

  // ── OTT/origin client 후처리 (generateCandidates 와 동일) ──
  const ottNames =
    filter.ott && filter.ott.length > 0
      ? filter.ott
      : profile.subscribedOtt ?? [];
  const ottSet = new Set(ottNames);
  const wantForeign = filter.origin === "foreign";

  const candidates: TmdbCandidate[] = [];
  for (const row of rows) {
    if (excludeSet.has(row.tmdb_id)) continue; // RPC hard filter 안전망
    if (ottSet.size > 0) {
      const matched = (row.providers ?? []).some((p) => ottSet.has(p.name));
      if (!matched) continue;
    }
    if (wantForeign) {
      const isKR = (row.country ?? row.origin_country ?? []).includes("KR");
      if (isKR) continue;
    }

    // PostgREST 가 numeric/float 을 string 으로 직렬화할 수 있어 Number() 방어.
    const rating = Number(row.rating ?? 0) || 0;
    const similarity = Number(row.similarity ?? 0) || 0;
    // popularity 블렌딩 — finalScore 를 totalScore 자리에 매핑.
    const finalScore = similarity + POP_WEIGHT * (rating / 10);

    candidates.push({
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
      popularity: rating,
      // personaMatch 는 similarity 기반 보존 (downstream 진단·향후 ranking 신호).
      personaMatch: similarity,
      totalScore: finalScore,
    });
  }

  candidates.sort((a, b) => b.totalScore - a.totalScore);
  // P3 DPP 전까지 stratifiedSample 다양성 tail 유지 (SQL 경로와 동일).
  return stratifiedSample(candidates, poolSize, topK);
}

// ---------- P3 (2026-06-24): DPP 다양성 (greedy MAP) ----------
//
// 설계 정본: _workspace/08·09 + project_rec_refactor P3.
// LLM rerank 입력 풀 선별을 stratifiedSample(셔플성) → DPP greedy MAP 로 교체.
// 커널 L = diag(q)·CosSim·diag(q) (quality-diversity 분해, PSD 보장):
//   - q_i = relevance(totalScore) — 대각 L_ii = q_i²
//   - S_ij = cos(e_i, e_j) (정규화 임베딩 dot) — 유사 작품일수록 ↑ → DPP 가 동시선택 회피
//   라이브 A/B 에서 MMR·휴리스틱 상회(YouTube Wilhelm CIKM2018 / Hulu Chen NeurIPS2018).
//   greedy Cholesky O(K·n·dim), 60→35 sub-10ms. **셔플로 다양성 흉내 금지** — DPP 가 정공법.

/** DPP 후보 상한 — embedding fetch + 거리계산 비용 bound (관련성 top N 만). */
const DPP_POOL = 90;

/**
 * DPP quality↔diversity knob — q_i = (relevance/max)^γ.
 *   γ=1: 관련성 그대로. γ↓: q 평탄화 → 다양성 비중↑(γ=0 = 순수 다양성).
 *
 * **실측 결론(2026-06-24 스윕, γ=1.0/0.5/0.25):** 다양성은 거의 불변(+5.7~6.3%, 노이즈
 *   수준)인데 평탄화할수록 후미 평균평점만 하락(7.07→6.78). 다양성은 q 가중이 아니라
 *   임베딩 cosine 커널+풀 구성이 지배 → **γ=1.0 이 다양성·품질 모두 최적, 기본 채택.**
 *   knob 은 향후(interaction 데이터 후) 재튜닝용으로 보존. 환경변수 DPP_GAMMA 로 스윕.
 */
const DPP_GAMMA = Number(process.env.DPP_GAMMA ?? "1");

/** tmdb_metadata 에서 embedding 일괄 read → L2 정규화 Map. (parseEmbedding 재사용) */
async function fetchNormalizedEmbeddings(
  admin: SupabaseClient,
  ids: number[],
): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (ids.length === 0) return map;
  const { data, error } = await admin
    .from("tmdb_metadata")
    .select("tmdb_id, embedding")
    .in("tmdb_id", ids)
    .not("embedding", "is", null);
  if (error) throw error;
  for (const r of (data ?? []) as Array<{
    tmdb_id: number;
    embedding: number[] | string | null;
  }>) {
    if (map.has(r.tmdb_id)) continue; // (tmdb_id, media_type) 복합 PK — 첫 행만
    const v = parseEmbedding(r.embedding);
    if (!v || v.length === 0) continue;
    let norm = 0;
    for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm);
    if (norm === 0) continue;
    map.set(
      r.tmdb_id,
      v.map((x) => x / norm),
    );
  }
  return map;
}

/**
 * DPP greedy MAP (Chen et al. NeurIPS2018 fast greedy).
 * @param q   relevance (양수). 대각 커널 L_ii = q_i².
 * @param emb L2 정규화 임베딩 (cos = dot).
 * @param k   선택 개수.
 * @returns 선택된 인덱스 배열 (선택 순서 = 관련성·다양성 균형 순).
 *
 * 매 step: 잔여 i 의 잔차분산 d_i² 갱신 → 최대 d_i² 선택. d_i² 는 "이미 선택된 것과
 * 겹치지 않는 quality" → 관련성 높고 기존 선택과 다른 작품이 뽑힘.
 */
export function dppGreedyMAP(
  q: number[],
  emb: number[][],
  k: number,
): number[] {
  const n = q.length;
  const K = Math.min(k, n);
  if (n === 0 || K === 0) return [];

  const cis: number[][] = Array.from({ length: n }, () => []);
  const d2 = q.map((qi) => qi * qi); // d_i² = L_ii
  const sel = new Set<number>();
  const order: number[] = [];

  // 첫 선택 = 최대 quality
  let j = 0;
  for (let i = 1; i < n; i++) if (d2[i] > d2[j]) j = i;
  sel.add(j);
  order.push(j);

  while (order.length < K) {
    const cj = cis[j];
    const dj = Math.sqrt(d2[j]);
    if (!(dj > 1e-9)) break;
    for (let i = 0; i < n; i++) {
      if (sel.has(i) || d2[i] <= 1e-12) continue;
      // L_ji = q_j q_i cos(e_j, e_i)
      let cos = 0;
      const ej = emb[j];
      const ei = emb[i];
      for (let t = 0; t < ej.length; t++) cos += ej[t] * ei[t];
      const Lji = q[j] * q[i] * cos;
      // <c_j, c_i>
      const ciI = cis[i];
      let cc = 0;
      for (let t = 0; t < cj.length; t++) cc += cj[t] * ciI[t];
      const e = (Lji - cc) / dj;
      ciI.push(e);
      d2[i] -= e * e;
    }
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (sel.has(i) || d2[i] <= 1e-12) continue;
      if (best < 0 || d2[i] > d2[best]) best = i;
    }
    if (best < 0) break;
    j = best;
    sel.add(j);
    order.push(j);
  }
  return order;
}

/**
 * DPP 다양성 선별 — 후보 k 개를 관련성+다양성 균형으로 고르고 **DPP greedy 순서 유지**.
 *
 * 배치(2026-06-24 실측 결정): LLM rerank *앞*이 아니라 **Phase 2 채움**(나머지 30장)에 적용.
 *   rerank 앞 DPP 는 LLM 이 관련성으로 재클러스터 + 35풀→20픽 비율(1.75×)이 좁아 효과 ~0.
 *   Phase 2 는 ~130풀→30 (여유 큼) + Math.random() 셔플(안티패턴) 대체 → 실질 다양화.
 *   DPP 순서 = 각 픽이 이전 선택과 최대 상이 → 연속 유사작 회피(스와이프 UX).
 *
 * 관련성 top DPP_POOL 의 임베딩 fetch → DPP greedy.
 * **best-effort**: 후보 부족/임베딩 부족/에러 → null (caller 가 기존 셔플 fallback).
 */
export async function dppDiversify(
  candidates: TmdbCandidate[],
  k: number,
): Promise<TmdbCandidate[] | null> {
  if (candidates.length === 0) return [];
  if (candidates.length <= k) return candidates.slice();
  try {
    const admin = supabaseAdmin();
    const pool = candidates.slice(0, Math.min(DPP_POOL, candidates.length));
    const embMap = await fetchNormalizedEmbeddings(
      admin,
      pool.map((c) => c.tmdbId),
    );
    const items = pool.filter((c) => embMap.has(c.tmdbId));
    if (items.length <= k) return null; // 부족 → caller fallback
    // q_i = (relevance/max)^γ — γ<1 평탄화로 다양성 비중↑ (DPP_GAMMA 참조).
    const maxScore = Math.max(...items.map((c) => c.totalScore), 1e-6);
    const q = items.map((c) =>
      Math.pow(Math.max(c.totalScore, 1e-6) / maxScore, DPP_GAMMA),
    );
    const emb = items.map((c) => embMap.get(c.tmdbId)!);
    const pickedIdx = dppGreedyMAP(q, emb, k);
    const picked = pickedIdx.map((i) => items[i]);
    // DPP 가 완전중복 등으로 k 미만 반환 시 → relevance 상위 미선택분으로 top-up.
    if (picked.length < k) {
      const pickedSet = new Set(pickedIdx);
      for (let i = 0; i < items.length && picked.length < k; i++) {
        if (!pickedSet.has(i)) picked.push(items[i]);
      }
    }
    return picked; // DPP 순서 유지 (relevance 재정렬 안 함 — 다양성 순서가 핵심)
  } catch (err) {
    console.error("[P3] DPP failed:", err);
    return null;
  }
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
  topK: number = 30,
): Promise<TmdbCandidate[]> {
  const admin = supabaseAdmin(); // env 누락 시 throw → caller 가 fallback

  // ── P2 (2026-06-24): pgvector ANN retrieval 분기 (순수 additive + flag gating) ──
  // flag off | 취향벡터 null | RPC throw → 아래 기존 SQL rating-DESC 경로 그대로 (fallback).
  // 기존 경로 거동은 한 줄도 바뀌지 않음 (flag off = bit-identical).
  if (
    process.env.REC_EMBED_RETRIEVAL_ENABLED === "true" &&
    profile.favoriteTmdbIds &&
    profile.favoriteTmdbIds.length > 0
  ) {
    try {
      const taste = await buildTasteVector(admin, profile.favoriteTmdbIds);
      if (taste) {
        return await embeddingRetrieval(
          admin,
          taste,
          profile,
          filter,
          excludeIds,
          poolSize,
          topK,
        );
      }
    } catch (err) {
      // RPC 실패 / 빌드 실패 → SQL fallback (정확성 보존). 진단 로그만 남김.
      console.error("[P2] embedding retrieval failed, SQL fallback:", err);
    }
  }

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
