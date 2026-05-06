import { supabaseAdmin } from "../supabase-admin";
import { getKoreanProviders, getCredits, getDetails } from "../tmdb";
import type { Candidate, EnrichedCandidate, TmdbMetadataRow } from "./types";

// ---------- Step 4: 메타데이터 풍부화 ----------

export async function enrichCandidates(candidates: Candidate[]): Promise<EnrichedCandidate[]> {
  const results: EnrichedCandidate[] = [];
  const BATCH = 10;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const enriched = await Promise.all(
      batch.map(async (c) => {
        const [{ providers, watchLink }, credits, details] = await Promise.all([
          getKoreanProviders(c.id, c.type),
          getCredits(c.id, c.type),
          getDetails(c.id, c.type),
        ]);
        return { ...c, providers, watchLink, credits, details };
      })
    );
    results.push(...enriched);
    // 충분한 OTT 가용 결과가 모이면 조기 종료 (필터 후 60개 목표)
    const withOTT = results.filter((r) => r.providers.length > 0);
    if (withOTT.length >= 60) break;
  }
  return results;
}

// ---------- Phase 3: TMDB 미러 (tmdb_metadata) 기반 enrich ----------
//
// `phase3-design.md` 4.1~4.2 참조. Day 18~19 변경 반영:
// - poster_path/backdrop_path 원본 path 저장 → 읽기 시 prefix 생성
// - providers는 Array<{name, logoUrl, category}> 평탄 dedup 구조로 적재됨 (Phase 2)
// - 1차 PoC: stale 처리 단순화 (180일/30일 TTL은 다음 단계). 모두 hit 취급
// - missing은 기존 enrichCandidates(TMDB API)로 fallback

export function rowToEnrichedFields(row: TmdbMetadataRow): {
  providers: EnrichedCandidate["providers"];
  watchLink: EnrichedCandidate["watchLink"];
  credits: EnrichedCandidate["credits"];
  details: EnrichedCandidate["details"];
} {
  return {
    providers: row.providers ?? [],
    watchLink: row.watch_link,
    credits: {
      director: row.director,
      cast: (row.cast_names ?? []).slice(0, 4),
      // 위임 J #4 — mirror cache (tmdb_metadata) 는 person id/profile_path 미보유.
      // hydrate 경로(/api/tmdb/hydrate) 또는 enrichCandidates(TMDB credits API) 경로에서만
      // directorMember/castMembers 가 채워진다. mirror 경로는 null/빈 배열 → DetailSheet 기존 fallback.
      directorMember: null,
      castMembers: [],
    },
    details: {
      runtime: row.runtime,
      seasons: row.seasons,
      country: (row.country ?? row.origin_country ?? []) as string[],
      backdrop: row.backdrop_path
        ? `https://image.tmdb.org/t/p/w780${row.backdrop_path}`
        : null,
    },
  };
}

export async function enrichFromMirror(
  candidates: Candidate[],
): Promise<EnrichedCandidate[]> {
  if (candidates.length === 0) return [];

  const movieIds = candidates
    .filter((c) => c.type === "movie")
    .map((c) => c.id);
  const tvIds = candidates.filter((c) => c.type === "series").map((c) => c.id);

  let admin;
  try {
    admin = supabaseAdmin();
  } catch {
    // SUPABASE 환경변수 누락 등 → 기존 TMDB 경로 fallback
    return enrichCandidates(candidates);
  }

  const SELECT_COLS =
    "tmdb_id, media_type, poster_path, backdrop_path, director, cast_names, runtime, seasons, country, origin_country, providers, watch_link";
  const rows = new Map<string, TmdbMetadataRow>();

  try {
    const fetched: TmdbMetadataRow[] = [];
    const tasks: Array<Promise<void>> = [];
    if (movieIds.length > 0) {
      tasks.push(
        (async () => {
          const { data, error } = await admin
            .from("tmdb_metadata")
            .select(SELECT_COLS)
            .eq("media_type", "movie")
            .in("tmdb_id", movieIds);
          if (error) throw error;
          if (data) fetched.push(...(data as unknown as TmdbMetadataRow[]));
        })(),
      );
    }
    if (tvIds.length > 0) {
      tasks.push(
        (async () => {
          const { data, error } = await admin
            .from("tmdb_metadata")
            .select(SELECT_COLS)
            .eq("media_type", "tv")
            .in("tmdb_id", tvIds);
          if (error) throw error;
          if (data) fetched.push(...(data as unknown as TmdbMetadataRow[]));
        })(),
      );
    }
    await Promise.all(tasks);

    for (const row of fetched) {
      rows.set(`${row.media_type}:${row.tmdb_id}`, row);
    }
  } catch (err) {
    console.error("[mirror] DB 조회 실패, TMDB API fallback:", err);
    return enrichCandidates(candidates);
  }

  const hits: EnrichedCandidate[] = [];
  const missing: Candidate[] = [];
  for (const c of candidates) {
    const mediaType = c.type === "series" ? "tv" : "movie";
    const row = rows.get(`${mediaType}:${c.id}`);
    if (row) {
      hits.push({ ...c, ...rowToEnrichedFields(row) });
    } else {
      missing.push(c);
    }
  }

  // missing은 TMDB API로 fallback (Phase 2 적재가 catalog 100% 커버라 거의 0건 예상)
  const fallback = missing.length > 0 ? await enrichCandidates(missing) : [];
  return [...hits, ...fallback];
}

/** useMirror 분기 helper. true면 DB 경로, false면 기존 TMDB API 경로. */
export async function enrichWithMode(
  candidates: Candidate[],
  useMirror: boolean,
): Promise<EnrichedCandidate[]> {
  return useMirror ? enrichFromMirror(candidates) : enrichCandidates(candidates);
}
