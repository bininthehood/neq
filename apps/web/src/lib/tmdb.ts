import { getTmdbApiKey } from "./env";

// 모듈 평가 시 1회만 평가. tmdb.ts 사용처는 모두 server-side
// (API routes / Server Components) 라 안전.
const API_KEY = getTmdbApiKey();
import type { TMDBResult } from "./types";

const BASE = "https://api.themoviedb.org/3";

export async function searchTMDB(
  title: string,
  type: "movie" | "series"
): Promise<TMDBResult | null> {
  const mediaType = type === "series" ? "tv" : "movie";

  // 한글 검색
  let res = await fetch(
    `${BASE}/search/${mediaType}?api_key=${API_KEY}&query=${encodeURIComponent(title)}&language=ko-KR`
  );
  let data = await res.json();
  if (data.results?.length > 0) return data.results[0];

  // 영문 폴백
  res = await fetch(
    `${BASE}/search/${mediaType}?api_key=${API_KEY}&query=${encodeURIComponent(title)}&language=en-US`
  );
  data = await res.json();
  if (data.results?.length > 0) {
    const enResult = data.results[0];
    // 영문으로 찾은 경우 한글 제목을 다시 가져옴
    const krRes = await fetch(
      `${BASE}/${mediaType}/${enResult.id}?api_key=${API_KEY}&language=ko-KR`
    );
    const krData = await krRes.json();
    return {
      ...enResult,
      title: krData.title ?? krData.name ?? enResult.title ?? enResult.name,
      name: krData.name ?? krData.title ?? enResult.name ?? enResult.title,
      overview: krData.overview || enResult.overview,
    };
  }
  return null;
}

/**
 * search/multi 응답의 작품 1건 raw shape (popularity 정렬용).
 * TMDB 가 movie/tv 를 한 응답에 섞어 반환하며 각 row 에 popularity 를 포함한다.
 */
interface MultiWorkRaw {
  id: number;
  media_type: "movie" | "tv";
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  popularity?: number;
  vote_average?: number;
  genre_ids?: number[];
}

/** favorites 매칭 fallback 의 단건 결과 — id/type/장르 (popularity-best). */
export interface BestMatch {
  id: number;
  type: "movie" | "series";
  genreIds: number[];
}

/**
 * 제목 → "가장 대표적인 작품" 단건 매칭 (movie+tv 통합, popularity desc).
 *
 * 동기 (2026-06-29 매칭 원칙화):
 *   기존 searchTMDB 는 movie 를 *먼저* 검색해 결과가 하나라도 있으면 series 를 안 봤다 →
 *   `오징어 게임`(인기 시리즈)을 동명의 무명 영화로 오매칭하는 latent 버그. 본 함수는
 *   search/multi 1회로 movie+tv 를 함께 받아 **popularity desc(동률 시 vote_average)**
 *   로 best 1건을 고른다 — movie-first 폐기, type 도 이 정렬이 결정.
 *
 *   popularity 는 미러 경로(tmdb_catalog.popularity)와 동일 신호 → 동명이작에서 두
 *   경로가 갈리지 않는다 (rating 은 vote 정규화가 없어 무명 高평점에 오염 — `리틀 포레스트`
 *   tv rating=10/vote=1 vs movie pop=2.06 정답에서 popularity 가 우월함을 실측).
 *
 * 폴백: ko-KR 결과 0 → en-US 재검색 (영문 전용 제목 대비).
 *
 * ⚠️ search/multi 는 부분 문자열 매칭(`킹덤`→`애니멀 킹덤`, `리틀 포레스트`→`리틀 포레스트:
 *   여름과 가을`)도 반환한다. 미러 경로(정확 title 일치)와 정합시키기 위해 **정확 제목
 *   일치 후보로 먼저 좁힌 뒤** popularity-best 를 고른다. 정확 일치가 하나도 없으면
 *   부분매칭 전체로 폴백 (그래도 popularity 로 best — 표기 변동 흡수).
 * @returns 후보 없으면 null (호출측에서 해당 favorite 스킵).
 */
export async function searchBestByPopularity(
  title: string
): Promise<BestMatch | null> {
  const want = normalizeMatchTitle(title);
  const isExact = (r: MultiWorkRaw) =>
    [r.title, r.name, r.original_title, r.original_name]
      .filter((t): t is string => Boolean(t))
      .some((t) => normalizeMatchTitle(t) === want);

  const pick = (works: MultiWorkRaw[]): BestMatch | null => {
    if (works.length === 0) return null;
    // 정확 제목 일치 후보 우선 (미러 정확매칭과 정합). 없으면 전체 부분매칭.
    const exact = works.filter(isExact);
    const pool = exact.length > 0 ? exact : works;
    const best = pool.reduce((a, b) => {
      const pa = a.popularity ?? -1;
      const pb = b.popularity ?? -1;
      if (pb !== pa) return pb > pa ? b : a;
      // popularity 동률 → vote_average tie-break (그래도 동률이면 먼저 본 row 유지).
      return (b.vote_average ?? 0) > (a.vote_average ?? 0) ? b : a;
    });
    return {
      id: best.id,
      type: best.media_type === "tv" ? "series" : "movie",
      genreIds: best.genre_ids ?? [],
    };
  };

  const fetchWorks = async (lang: string): Promise<MultiWorkRaw[]> => {
    const res = await fetch(
      `${BASE}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(title)}&language=${lang}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results ?? []).filter(
      (r: { media_type?: string }) =>
        r.media_type === "movie" || r.media_type === "tv"
    ) as MultiWorkRaw[];
  };

  let works = await fetchWorks("ko-KR");
  if (works.length === 0) works = await fetchWorks("en-US");
  return pick(works);
}

/** 매칭 비교용 제목 정규화 (match.ts normalizeTitle 와 동일 기준). */
function normalizeMatchTitle(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

export async function searchMulti(query: string): Promise<TMDBResult[]> {
  const res = await fetch(
    `${BASE}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=ko-KR`
  );
  const data = await res.json();
  return (data.results ?? [])
    .filter((r: TMDBResult & { media_type?: string }) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, 6)
    .map((r: TMDBResult) => ({
      ...r,
      title: r.title ?? r.name,
    }));
}

/**
 * search/multi 의 person 결과 raw shape. known_for 는 movie/tv 작품 배열.
 * TMDB 가 자동으로 채워주므로 추가 API 호출 불필요.
 */
export interface TMDBPersonRaw {
  id: number;
  name: string;
  media_type: "person";
  profile_path: string | null;
  known_for_department?: string;
  known_for?: Array<{
    id: number;
    media_type: "movie" | "tv";
    title?: string;
    name?: string;
    release_date?: string;
    first_air_date?: string;
    poster_path: string | null;
  }>;
}

export interface TMDBMultiGroupedRaw {
  works: TMDBResult[];                 // movie + tv (검색 순서 보존)
  persons: TMDBPersonRaw[];            // 모든 person (Directing/Acting 분리는 라우트 레이어 책임)
}

/**
 * search/multi 1회 호출로 작품 + 인물을 함께 가져온다 (grouped=1 응답용).
 *
 * - 작품(movie/tv): 기존 searchMulti 와 동일한 6개 cap 적용.
 * - 인물(person): 모든 결과 반환 (라우트에서 Directing/Acting 분류 후 cap).
 *
 * 추가 API 호출 0 — known_for / known_for_department / profile_path 모두 search/multi 응답에 포함.
 */
export async function searchMultiGrouped(query: string): Promise<TMDBMultiGroupedRaw> {
  const res = await fetch(
    `${BASE}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=ko-KR`
  );
  if (!res.ok) return { works: [], persons: [] };
  const data = await res.json();
  const all: Array<TMDBResult & { media_type?: string } | TMDBPersonRaw> = data.results ?? [];

  const works = all
    .filter((r): r is TMDBResult & { media_type?: string } =>
      (r as { media_type?: string }).media_type === "movie" ||
      (r as { media_type?: string }).media_type === "tv"
    )
    .slice(0, 6)
    .map((r) => ({ ...r, title: r.title ?? r.name }));

  const persons = all.filter((r): r is TMDBPersonRaw =>
    (r as { media_type?: string }).media_type === "person"
  );

  return { works, persons };
}

export interface ProviderInfo {
  name: string;
  type: "flatrate" | "rent" | "buy";
}

export async function getKoreanProviders(
  id: number,
  type: "movie" | "series"
): Promise<{ providers: { name: string; logoUrl: string | null; category?: 'subscription' | 'rent' | 'buy' }[]; watchLink: string | null }> {
  const mediaType = type === "series" ? "tv" : "movie";
  const res = await fetch(
    `${BASE}/${mediaType}/${id}/watch/providers?api_key=${API_KEY}`
  );
  const data = await res.json();
  const kr = data.results?.KR;
  if (!kr) return { providers: [], watchLink: null };

  // 구독(flatrate) > 대여(rent) > 구매(buy) 순서로 dedup. 같은 provider가 여러 카테고리에 있으면 가장 사용자 친화적인 것 채택
  type RawProv = { provider_name: string; logo_path: string | null };
  const buckets: Array<{ items: RawProv[]; category: 'subscription' | 'rent' | 'buy' }> = [
    { items: kr.flatrate ?? [], category: 'subscription' },
    { items: kr.rent ?? [], category: 'rent' },
    { items: kr.buy ?? [], category: 'buy' },
  ];
  const seen = new Set<string>();
  const providers: { name: string; logoUrl: string | null; category?: 'subscription' | 'rent' | 'buy' }[] = [];
  for (const { items, category } of buckets) {
    for (const p of items) {
      if (seen.has(p.provider_name)) continue;
      seen.add(p.provider_name);
      providers.push({
        name: p.provider_name,
        logoUrl: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
        category,
      });
    }
  }
  return { providers, watchLink: kr.link ?? null };
}

export async function getDetails(
  id: number,
  type: "movie" | "series"
): Promise<{ runtime: number | null; seasons: number | null; country: string[]; backdrop: string | null }> {
  const mediaType = type === "series" ? "tv" : "movie";
  const res = await fetch(
    `${BASE}/${mediaType}/${id}?api_key=${API_KEY}&language=ko-KR`
  );
  const data = await res.json();

  return {
    runtime: type === "movie" ? (data.runtime ?? null) : (data.episode_run_time?.[0] ?? null),
    seasons: type === "series" ? (data.number_of_seasons ?? null) : null,
    country: data.production_countries?.map((c: { iso_3166_1: string }) => c.iso_3166_1) ?? data.origin_country ?? [],
    backdrop: data.backdrop_path ? `https://image.tmdb.org/t/p/w780${data.backdrop_path}` : null,
  };
}

/**
 * 위임 J #4 — getCredits 가 director/cast 의 person id + profile_path 까지 함께 반환.
 *
 * 후방 호환:
 *  - 기존 호출자는 `{ director, cast }` 만 사용해도 됨 (string[]/string|null).
 *  - DetailSheet/검색 진입 등 신규 사용처는 `directorMember` / `castMembers` 사용.
 *
 * TMDB credits 응답 1회 fetch 로 두 형태 모두 동시 매핑 — 추가 API 호출 0.
 */
export async function getCredits(
  id: number,
  type: "movie" | "series"
): Promise<{
  director: string | null;
  cast: string[];
  directorMember: { name: string; tmdbId: number; profileUrl: string | null } | null;
  castMembers: { name: string; tmdbId: number; profileUrl: string | null }[];
}> {
  const mediaType = type === "series" ? "tv" : "movie";
  const res = await fetch(
    `${BASE}/${mediaType}/${id}/credits?api_key=${API_KEY}&language=ko-KR`
  );
  const data = await res.json();

  interface CrewMember {
    id: number;
    name: string;
    job?: string;
    department?: string;
    profile_path?: string | null;
  }
  interface CastMemberRaw {
    id: number;
    name: string;
    profile_path?: string | null;
  }

  const crew: CrewMember[] = data.crew ?? [];
  const directorCrew =
    crew.find((c) => c.job === "Director") ??
    crew.find((c) => c.department === "Directing") ??
    null;

  const director = directorCrew?.name ?? null;
  const directorMember = directorCrew
    ? {
        name: directorCrew.name,
        tmdbId: directorCrew.id,
        profileUrl: posterUrl(directorCrew.profile_path ?? null, "w185"),
      }
    : null;

  const castRaw: CastMemberRaw[] = (data.cast ?? []).slice(0, 4);
  const cast = castRaw.map((c) => c.name);
  const castMembers = castRaw.map((c) => ({
    name: c.name,
    tmdbId: c.id,
    profileUrl: posterUrl(c.profile_path ?? null, "w185"),
  }));

  return { director, cast, directorMember, castMembers };
}

export function posterUrl(path: string | null, size = "w500"): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

/**
 * TMDB /recommendations — 특정 작품과 관련된 추천 작품 목록.
 * TMDB 자체의 평점/키워드/장르 기반 엔진 사용 (무료, 빠름).
 *
 * Hybrid 추천 아키텍처의 핵심: 사용자 취향 작품마다 호출해서 후보 풀을 만든 뒤
 * LLM으로 큐레이션한다. 매번 LLM 호출하던 기존 방식 대비 ~30배 빠름.
 */
export interface TMDBSimilarItem {
  id: number;
  title: string;
  original_title?: string;
  original_name?: string;
  media_type: "movie" | "tv";
  poster_path: string | null;
  vote_average: number;
  overview: string;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  popularity?: number;
}

/**
 * TMDB /discover — 장르 기반 작품 검색.
 * 크로스타입 추천 보충용 (영화 취향 → 시리즈 발견, 그 반대도).
 */
export async function discoverByGenres(
  genreIds: number[],
  type: "movie" | "series",
  page = 1,
  dateRange?: { gte?: string; lte?: string },
  sortBy: "vote_average.desc" | "vote_count.desc" | "popularity.desc" = "vote_average.desc"
): Promise<TMDBSimilarItem[]> {
  if (genreIds.length === 0) return [];
  const mediaType = type === "series" ? "tv" : "movie";
  const genres = genreIds.slice(0, 5).join("|"); // OR 조건 (,는 AND → 결과 0개 됨)
  const dateField = mediaType === "tv" ? "first_air_date" : "release_date";
  let dateParams = "";
  if (dateRange?.gte) dateParams += `&${dateField}.gte=${dateRange.gte}`;
  if (dateRange?.lte) dateParams += `&${dateField}.lte=${dateRange.lte}`;
  try {
    const res = await fetch(
      `${BASE}/discover/${mediaType}?api_key=${API_KEY}&language=ko-KR&with_genres=${genres}&sort_by=${sortBy}&vote_count.gte=100&page=${page}${dateParams}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as number,
      title: (r.title ?? r.name) as string,
      original_title: r.original_title as string | undefined,
      original_name: r.original_name as string | undefined,
      media_type: mediaType as "movie" | "tv",
      poster_path: (r.poster_path as string | null) ?? null,
      vote_average: (r.vote_average as number) ?? 0,
      overview: (r.overview as string) ?? "",
      release_date: r.release_date as string | undefined,
      first_air_date: r.first_air_date as string | undefined,
      genre_ids: (r.genre_ids as number[]) ?? [],
      popularity: r.popularity as number | undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * TMDB /trending — 이번 주 인기 작품 (movie + tv 혼합).
 * Cold start (favorites 없음) 시 LLM 스킵하고 즉시 카드 반환용.
 */
export async function getTrending(
  timeWindow: "day" | "week" = "week",
  page = 1
): Promise<TMDBSimilarItem[]> {
  try {
    const res = await fetch(
      `${BASE}/trending/all/${timeWindow}?api_key=${API_KEY}&language=ko-KR&page=${page}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results ?? [])
      .filter((r: Record<string, unknown>) => r.media_type === "movie" || r.media_type === "tv")
      .map((r: Record<string, unknown>) => ({
        id: r.id as number,
        title: (r.title ?? r.name) as string,
        original_title: r.original_title as string | undefined,
        original_name: r.original_name as string | undefined,
        media_type: r.media_type as "movie" | "tv",
        poster_path: (r.poster_path as string | null) ?? null,
        vote_average: (r.vote_average as number) ?? 0,
        overview: (r.overview as string) ?? "",
        release_date: r.release_date as string | undefined,
        first_air_date: r.first_air_date as string | undefined,
        genre_ids: (r.genre_ids as number[]) ?? [],
        popularity: r.popularity as number | undefined,
      }));
  } catch {
    return [];
  }
}

/**
 * TMDB /collection/{id} — 시리즈/프랜차이즈 (반지의 제왕, 스타워즈 등) 작품 묶음.
 *
 * /movie/{id} 응답의 `belongs_to_collection.id` 가 있을 때만 의미 있음.
 * series(tv) 의 경우 TMDB 가 collection 개념을 제공하지 않으므로 호출처에서 movie 만 사용.
 *
 * 빈 결과/실패 시 null 반환 → DetailSheet 가 섹션 숨김 처리.
 */
export interface TMDBCollectionResponse {
  id: number;
  name: string;
  parts: TMDBSimilarItem[];
}

export async function getCollection(
  collectionId: number,
): Promise<TMDBCollectionResponse | null> {
  if (!collectionId || Number.isNaN(collectionId)) return null;
  try {
    const res = await fetch(
      `${BASE}/collection/${collectionId}?api_key=${API_KEY}&language=ko-KR`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.id) return null;
    const parts: TMDBSimilarItem[] = (data.parts ?? []).map(
      (r: Record<string, unknown>) => ({
        id: r.id as number,
        title: (r.title ?? r.name) as string,
        original_title: r.original_title as string | undefined,
        original_name: r.original_name as string | undefined,
        // collection.parts 는 movie 전용
        media_type: 'movie' as const,
        poster_path: (r.poster_path as string | null) ?? null,
        vote_average: (r.vote_average as number) ?? 0,
        overview: (r.overview as string) ?? '',
        release_date: r.release_date as string | undefined,
        first_air_date: r.first_air_date as string | undefined,
        genre_ids: (r.genre_ids as number[]) ?? [],
        popularity: r.popularity as number | undefined,
      }),
    );
    return {
      id: data.id as number,
      name: (data.name as string) ?? '',
      parts,
    };
  } catch {
    return null;
  }
}

/**
 * TMDB /person/{id}/movie_credits 또는 /tv_credits — 인물의 출연·연출 작품.
 *
 * 감독 다른 작품을 얻기 위해 type='movie' 시 crew 에서 job==='Director' 만 필터링한다.
 * series 도 동일 패턴 가능하지만 본 사용처(F3)는 detail 의 director 와 매칭하므로 type 일치.
 *
 * popularity desc 정렬은 호출처에서 처리.
 */
export interface TMDBPersonCreditsResponse {
  id: number;
  cast: TMDBSimilarItem[];
  crew: (TMDBSimilarItem & { job?: string; department?: string })[];
}

export async function getPersonCredits(
  personId: number,
  type: 'movie' | 'series',
): Promise<TMDBPersonCreditsResponse | null> {
  if (!personId || Number.isNaN(personId)) return null;
  const endpoint = type === 'series' ? 'tv_credits' : 'movie_credits';
  const mediaType = type === 'series' ? 'tv' : 'movie';
  try {
    const res = await fetch(
      `${BASE}/person/${personId}/${endpoint}?api_key=${API_KEY}&language=ko-KR`,
    );
    if (!res.ok) return null;
    const data = await res.json();

    const map = (r: Record<string, unknown>): TMDBSimilarItem => ({
      id: r.id as number,
      title: (r.title ?? r.name) as string,
      original_title: r.original_title as string | undefined,
      original_name: r.original_name as string | undefined,
      media_type: mediaType as 'movie' | 'tv',
      poster_path: (r.poster_path as string | null) ?? null,
      vote_average: (r.vote_average as number) ?? 0,
      overview: (r.overview as string) ?? '',
      release_date: r.release_date as string | undefined,
      first_air_date: r.first_air_date as string | undefined,
      genre_ids: (r.genre_ids as number[]) ?? [],
      popularity: r.popularity as number | undefined,
    });

    return {
      id: personId,
      cast: (data.cast ?? []).map(map),
      crew: (data.crew ?? []).map((r: Record<string, unknown>) => ({
        ...map(r),
        job: (r.job as string | undefined) ?? undefined,
        department: (r.department as string | undefined) ?? undefined,
      })),
    };
  } catch {
    return null;
  }
}

/**
 * TMDB /person/{id}/combined_credits — 인물의 movie + tv 출연/연출 통합.
 *
 * 위임 J #2 — SearchSheet 인물 카드 클릭 시 그 사람 작품 리스트 표시용.
 * single fetch 로 movie/tv 모두 받아 popularity desc 정렬·dedup 가능.
 *
 * 응답 cast/crew 의 각 item 은 media_type ('movie' | 'tv') 을 직접 들고 있어
 * 호출처가 mediaType 결정에 사용 가능 (작품 카드 → hydrate 호출 시 type 매핑).
 *
 * 실패/404 시 null 반환 → 라우트 layer 가 빈 배열 응답.
 */
export interface TMDBCombinedCreditItem {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  media_type: 'movie' | 'tv';
  poster_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
  job?: string;
  department?: string;
  character?: string;
  // 위임 P #5 (2026-05-02) — 토크쇼/리얼리티 제외 필터, 주연(order 낮음) 우선 정렬에 사용.
  genre_ids?: number[];
  vote_count?: number;
  order?: number;
}

export async function getPersonCombinedCredits(
  personId: number,
): Promise<{ cast: TMDBCombinedCreditItem[]; crew: TMDBCombinedCreditItem[] } | null> {
  if (!personId || Number.isNaN(personId)) return null;
  try {
    const res = await fetch(
      `${BASE}/person/${personId}/combined_credits?api_key=${API_KEY}&language=ko-KR`,
    );
    if (!res.ok) return null;
    const data = await res.json();

    const map = (r: Record<string, unknown>): TMDBCombinedCreditItem => ({
      id: r.id as number,
      title: r.title as string | undefined,
      name: r.name as string | undefined,
      original_title: r.original_title as string | undefined,
      original_name: r.original_name as string | undefined,
      media_type: (r.media_type as 'movie' | 'tv') ?? 'movie',
      poster_path: (r.poster_path as string | null) ?? null,
      vote_average: (r.vote_average as number) ?? 0,
      release_date: r.release_date as string | undefined,
      first_air_date: r.first_air_date as string | undefined,
      popularity: r.popularity as number | undefined,
      job: r.job as string | undefined,
      department: r.department as string | undefined,
      character: r.character as string | undefined,
      // 위임 P #5 — 토크쇼 제외 / 주연 우선 정렬용 추가 필드 (구조적 호환 유지: optional).
      genre_ids: (r.genre_ids as number[] | undefined) ?? undefined,
      vote_count: r.vote_count as number | undefined,
      order: r.order as number | undefined,
    });

    return {
      cast: (data.cast ?? []).map(map),
      crew: (data.crew ?? []).map(map),
    };
  } catch {
    return null;
  }
}

/**
 * 작품의 belongs_to_collection.id + 감독 person id 를 한 번에 가져온다.
 * /api/tmdb/related route 가 사용 — collection lookup 과 person credits 호출의 사전 단계.
 *
 * - movie 만 belongs_to_collection 지원 (TMDB 한계).
 * - 감독 식별: /credits 의 crew[job=Director] 또는 department=Directing 첫 번째.
 * - 결과 없으면 collectionId/personId 가 null 인 객체 반환.
 */
export async function getRelatedSeeds(
  tmdbId: number,
  type: 'movie' | 'series',
): Promise<{
  collectionId: number | null;
  directorId: number | null;
  directorName: string | null;
}> {
  const mediaType = type === 'series' ? 'tv' : 'movie';
  try {
    const [detailRes, creditsRes] = await Promise.all([
      fetch(`${BASE}/${mediaType}/${tmdbId}?api_key=${API_KEY}&language=ko-KR`),
      fetch(`${BASE}/${mediaType}/${tmdbId}/credits?api_key=${API_KEY}&language=ko-KR`),
    ]);
    if (!detailRes.ok && !creditsRes.ok) {
      return { collectionId: null, directorId: null, directorName: null };
    }
    const detailData = detailRes.ok ? await detailRes.json() : null;
    const creditsData = creditsRes.ok ? await creditsRes.json() : null;

    const collectionId =
      type === 'movie' ? (detailData?.belongs_to_collection?.id as number | undefined) ?? null : null;

    interface CrewMember { id: number; name: string; job?: string; department?: string }
    const crew: CrewMember[] = creditsData?.crew ?? [];
    const director =
      crew.find((c) => c.job === 'Director') ??
      crew.find((c) => c.department === 'Directing') ??
      null;

    return {
      collectionId: collectionId ?? null,
      directorId: director?.id ?? null,
      directorName: director?.name ?? null,
    };
  } catch {
    return { collectionId: null, directorId: null, directorName: null };
  }
}

export async function getTMDBRecommendations(
  tmdbId: number,
  type: "movie" | "series"
): Promise<TMDBSimilarItem[]> {
  const mediaType = type === "series" ? "tv" : "movie";
  try {
    const res = await fetch(
      `${BASE}/${mediaType}/${tmdbId}/recommendations?api_key=${API_KEY}&language=ko-KR&page=1`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const results = data.results ?? [];
    return results.map((r: Record<string, unknown>) => ({
      id: r.id as number,
      title: (r.title ?? r.name) as string,
      original_title: r.original_title as string | undefined,
      original_name: r.original_name as string | undefined,
      media_type: mediaType as "movie" | "tv",
      poster_path: (r.poster_path as string | null) ?? null,
      vote_average: (r.vote_average as number) ?? 0,
      overview: (r.overview as string) ?? "",
      release_date: r.release_date as string | undefined,
      first_air_date: r.first_air_date as string | undefined,
      genre_ids: (r.genre_ids as number[]) ?? [],
      popularity: r.popularity as number | undefined,
    }));
  } catch {
    return [];
  }
}
