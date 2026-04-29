/**
 * tmdb-providers-snapshot helper.
 *
 * KR 지역 watch/providers 추출 + 미러 join + snapshot 압축 변환 로직.
 *
 * 책임 분리:
 *  - 본 모듈 = 순수 함수 (mapper/converter/rate-limiter). DB I/O 없음.
 *  - cron route = orchestration (Supabase 조회/저장, 페이징, 응답).
 *
 * 스펙:
 *  - _workspace/p0-5a-design.md §1.4 (KR 필터), §1.5 (미러 일관성), §1.6 (배치)
 *  - notification-triggers-detail.md §3.2 (snapshot 형식)
 */

export type MediaType = "movie" | "tv";

/**
 * snapshot 테이블에 저장하는 압축 형식.
 *
 * provider id 만 저장 (이름은 ott-expiry 발송 시 PROVIDER_ID_TO_KR_NAME 매핑).
 * 비교 시 set 차분만 하면 되므로 단순하다.
 */
export interface CompactProviders {
  flatrate: number[];
  rent: number[];
  buy: number[];
}

export const EMPTY_PROVIDERS: CompactProviders = {
  flatrate: [],
  rent: [],
  buy: [],
};

/**
 * TMDB /watch/providers 응답 → 압축 형식 변환.
 *
 * 입력 예시:
 *   { results: { KR: { flatrate: [{ provider_id: 8, ... }], rent: [], buy: [] } } }
 *
 * KR 데이터가 없으면 빈 객체 반환 (NULL 회피 — 어제 vs 오늘 비교 단순화).
 */
export function extractKrProviderIds(
  raw: Record<string, unknown> | null | undefined,
): CompactProviders {
  if (!raw) return { flatrate: [], rent: [], buy: [] };
  const results = raw.results as Record<string, unknown> | undefined;
  const kr = results?.KR as Record<string, unknown> | undefined;
  if (!kr) return { flatrate: [], rent: [], buy: [] };

  return {
    flatrate: pickProviderIds(kr.flatrate),
    rent: pickProviderIds(kr.rent),
    buy: pickProviderIds(kr.buy),
  };
}

function pickProviderIds(items: unknown): number[] {
  if (!Array.isArray(items)) return [];
  const ids = items
    .map((p) => (p && typeof p === "object" ? (p as { provider_id?: number }).provider_id : undefined))
    .filter((id): id is number => typeof id === "number" && Number.isFinite(id));
  // dedup (TMDB 가 동일 provider 중복 노출 가능성 방어)
  return Array.from(new Set(ids));
}

/**
 * tmdb_metadata.providers (Array<{name, logoUrl, category}>) → snapshot 형식 변환.
 *
 * 미러는 이름 기준이라 provider_id 가 없다. 미러 hit 의 신뢰도가 낮은 이유.
 * 그래도 stale 회피를 위해 이름 → id 역매핑을 시도한다 (PROVIDER_ID_TO_KR_NAME 영문 fallback).
 *
 * NOTE: 미러 hit 시 실제 비교는 이름 set 차분으로 fallback 가능. 다만 ott-expiry 가
 *       provider_id 기준 비교를 가정 (P0-5b 구현 시 명시) → 미러 hit 가 "fresh" 라도 신규 호출이
 *       더 안전하다는 결정이 있으면 cron 측에서 fresh 만 사용하도록 분기.
 *       본 모듈은 변환만 제공, 정책은 cron route 가 책임.
 */
const PROVIDER_NAME_TO_ID: Record<string, number> = {
  Netflix: 8,
  "Disney Plus": 337,
  "Disney+": 337,
  Wavve: 356,
  TVING: 1881,
  Tving: 1881,
  Watcha: 97,
  "Apple TV": 2,
  "Apple TV Plus": 350,
  "Apple TV+": 350,
  "Amazon Prime Video": 119,
  "Coupang Play": 1796,
  "Google Play Movies": 3,
};

export function mirrorProvidersToCompact(
  providers:
    | Array<{ name?: string; category?: "subscription" | "rent" | "buy" }>
    | null
    | undefined,
): CompactProviders {
  if (!providers || !Array.isArray(providers)) {
    return { flatrate: [], rent: [], buy: [] };
  }
  const out: CompactProviders = { flatrate: [], rent: [], buy: [] };
  const seen: Record<keyof CompactProviders, Set<number>> = {
    flatrate: new Set(),
    rent: new Set(),
    buy: new Set(),
  };
  for (const p of providers) {
    if (!p?.name) continue;
    const id = PROVIDER_NAME_TO_ID[p.name];
    if (typeof id !== "number") continue;
    const bucket: keyof CompactProviders =
      p.category === "subscription" ? "flatrate" : p.category === "rent" ? "rent" : p.category === "buy" ? "buy" : "flatrate";
    if (seen[bucket].has(id)) continue;
    seen[bucket].add(id);
    out[bucket].push(id);
  }
  return out;
}

/**
 * 미러 cache 상태 분류.
 *
 * fresh : providers_fetched_at > NOW() - 24h  → 미러 그대로 사용 (TMDB 호출 0)
 * stale : 그 외                              → TMDB 호출 후 미러 갱신
 * miss  : providers_fetched_at IS NULL       → TMDB 호출 후 미러 채움
 */
export type CacheStatus = "fresh" | "stale" | "miss";

export function classifyCache(
  fetchedAtIso: string | null | undefined,
  now: Date,
): CacheStatus {
  if (!fetchedAtIso) return "miss";
  const fetched = new Date(fetchedAtIso).getTime();
  if (Number.isNaN(fetched)) return "miss";
  const ageMs = now.getTime() - fetched;
  return ageMs < 24 * 3600 * 1000 ? "fresh" : "stale";
}

/**
 * 30 req/s 페이스 제한기. tmdb-fetch.ts 의 RateLimiter 와 동일 구조.
 *
 * Vercel Function cold start 마다 인스턴스 새로 생성 → 단일 호출 내에서만 유효.
 * 일별 cron 1 회 호출이라 충분.
 */
export class RateLimiter {
  private queue: Array<() => void> = [];
  private running = 0;
  private readonly intervalMs: number;
  constructor(rps: number) {
    this.intervalMs = 1000 / rps;
  }
  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      const task = () => {
        this.running += 1;
        resolve();
        setTimeout(() => {
          this.running -= 1;
          const next = this.queue.shift();
          if (next) next();
        }, this.intervalMs);
      };
      if (this.running < 1) task();
      else this.queue.push(task);
    });
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * TMDB GET — 429/5xx 1회 재시도. 실패 시 throw.
 */
export async function tmdbWatchProviders(
  tmdbId: number,
  mediaType: MediaType,
  apiKey: string,
  limiter: RateLimiter,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  await limiter.acquire();
  const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/watch/providers?api_key=${apiKey}`;
  const res = await fetchImpl(url);
  if (!res.ok) {
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000);
      const retry = await fetchImpl(url);
      if (!retry.ok) {
        throw new Error(`TMDB watch/providers ${tmdbId}/${mediaType}: ${retry.status}`);
      }
      return retry.json();
    }
    throw new Error(`TMDB watch/providers ${tmdbId}/${mediaType}: ${res.status}`);
  }
  return res.json();
}

/**
 * 동시성 제한 worker pool — items 를 concurrency 개씩 동시 처리.
 *
 * Promise.all 은 N 개 동시에 모두 시작해서 rate limiter 큐에 쌓이는데,
 * worker pool 은 active task 가 끝나야 다음 task 가 시작 → 메모리/스택 안전.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function runOne() {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }

  const lanes = Math.max(1, Math.min(concurrency, items.length));
  const promises: Promise<void>[] = [];
  for (let k = 0; k < lanes; k += 1) promises.push(runOne());
  await Promise.all(promises);
  return results;
}
