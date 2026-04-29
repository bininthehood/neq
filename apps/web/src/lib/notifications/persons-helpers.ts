/**
 * notifications/refresh-persons helper.
 *
 * TMDB credits 응답 → director + cast top 3 추출 + 사용자×person 단위 dedup 변환.
 *
 * 책임 분리:
 *  - 본 모듈 = 순수 함수 (mapper / dedup). DB I/O 없음.
 *  - cron route = orchestration (Supabase 조회/저장, TMDB 호출 동시성, 응답).
 *
 * 결정 사항:
 *  - cast top 3 (spec §6 우선; notification-triggers §6.2 의 top 4 는 무시)
 *  - favorites 소스: saved_items 만 사용 (profiles.onboarding_picks 비활용)
 *
 * 스펙: _workspace/p0-5a-design.md §2.2~§2.6, §5 결정 #5
 */

import {
  RateLimiter,
  mapWithConcurrency,
  sleep,
  type MediaType,
} from "./providers-helpers";

export { RateLimiter, mapWithConcurrency };
export type { MediaType };

export type PersonRole = "director" | "actor";

export interface ExtractedPerson {
  personId: number;
  personName: string;
  role: PersonRole;
}

/**
 * TMDB credits 응답 → director 1명 + cast top 3 추출.
 *
 * 패턴은 scripts/lib/tmdb-fetch.ts mapToMetadataRow 와 동일:
 *  - director: job="Director" → department="Directing" 폴백
 *  - cast: 응답 cast 배열의 상위 3명 (TMDB 가 order 순으로 반환)
 *
 * id 가 누락된 row 는 drop (정상 TMDB 응답이라면 없음).
 */
export function extractPersonsFromCredits(
  credits: Record<string, unknown> | null | undefined,
): ExtractedPerson[] {
  if (!credits) return [];
  const out: ExtractedPerson[] = [];

  const crew = (credits.crew ?? []) as Array<{
    id?: number;
    name?: string;
    job?: string;
    department?: string;
  }>;
  const director =
    crew.find((c) => c.job === "Director") ??
    crew.find((c) => c.department === "Directing");
  if (director?.id && director.name) {
    out.push({
      personId: director.id,
      personName: director.name,
      role: "director",
    });
  }

  const cast = (credits.cast ?? []) as Array<{
    id?: number;
    name?: string;
  }>;
  // top 3 (spec §6) — false positive 최소화
  for (const c of cast.slice(0, 3)) {
    if (typeof c.id === "number" && typeof c.name === "string" && c.name.length > 0) {
      out.push({ personId: c.id, personName: c.name, role: "actor" });
    }
  }

  return out;
}

/**
 * (작품 1개에서 추출한) ExtractedPerson 배열을 사용자×person×role dedup.
 *
 * 동일 사용자가 여러 작품에서 같은 사람을 follow 하게 되면 1행 (UNIQUE 제약).
 * 다만 source_work_id 는 첫 발견 작품을 보존.
 */
export interface PersonRow {
  profileId: string;
  personId: number;
  personName: string;
  role: PersonRole;
  sourceWorkId: number;
  sourceMediaType: MediaType;
}

/**
 * 한 사용자에 대해 작품들을 순회하며 PersonRow 배열로 dedup.
 *
 * 입력:
 *  - profileId
 *  - works: Array<{ tmdbId, mediaType, persons }>
 * 출력:
 *  - PersonRow[] (UNIQUE profile_id, person_id, role)
 */
export function dedupPersonsForProfile(
  profileId: string,
  works: Array<{
    tmdbId: number;
    mediaType: MediaType;
    persons: ExtractedPerson[];
  }>,
): PersonRow[] {
  const seen = new Set<string>(); // `${person_id}|${role}`
  const rows: PersonRow[] = [];
  for (const w of works) {
    for (const p of w.persons) {
      const key = `${p.personId}|${p.role}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        profileId,
        personId: p.personId,
        personName: p.personName,
        role: p.role,
        sourceWorkId: w.tmdbId,
        sourceMediaType: w.mediaType,
      });
    }
  }
  return rows;
}

/**
 * TMDB credits 호출 + 작품 단위 캐시.
 *
 * 동일 작품이 여러 사용자 favorites/saved 에 있어도 TMDB 호출은 1회.
 * Map<`${tmdbId}|${mediaType}`, ExtractedPerson[]> 캐시 in-memory.
 */
export async function tmdbCredits(
  tmdbId: number,
  mediaType: MediaType,
  apiKey: string,
  limiter: RateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  await limiter.acquire();
  const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/credits?api_key=${apiKey}&language=ko-KR`;
  const res = await fetchImpl(url);
  if (!res.ok) {
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000);
      const retry = await fetchImpl(url);
      if (!retry.ok) {
        throw new Error(`TMDB credits ${tmdbId}/${mediaType}: ${retry.status}`);
      }
      return retry.json();
    }
    throw new Error(`TMDB credits ${tmdbId}/${mediaType}: ${res.status}`);
  }
  return res.json();
}

/**
 * 작품 키 (Map 캐시 + 호출 dedup 용도).
 */
export function workKey(tmdbId: number, mediaType: MediaType): string {
  return `${tmdbId}|${mediaType}`;
}
