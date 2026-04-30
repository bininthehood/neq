/**
 * Recent Searches store — D10b.
 *
 * SearchSheet idle 상태에서 노출되는 "최근 검색어" 목록을
 * LocalStorage 단일 JSON 키로 저장한다.
 *
 * 정책:
 *   - FIFO 큐, 최대 10개
 *   - 동일 query 재입력 시 기존 항목 제거 후 최신 ts 로 재삽입 (dedupe)
 *   - 정규화: trim + 소문자 비교 (표시는 원본 case 보존)
 *   - SSR 안전: typeof window 가드
 *
 * 참조: apps/web/src/lib/store.ts (LocalStorage 패턴)
 */

const RECENT_SEARCHES_KEY = "neq_recent_searches";
const MAX_RECENT_SEARCHES = 10;

export interface RecentSearch {
  /** 표시용 원본 query (case 보존) */
  query: string;
  /** Unix epoch ms */
  ts: number;
}

// ─── parse / serialize ───

function parseRecentSearches(raw: string | null): RecentSearch[] {
  if (!raw) return [];
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(obj)) return [];
  const items = obj
    .map((it): RecentSearch | null => {
      if (!it || typeof it !== "object") return null;
      const o = it as Record<string, unknown>;
      const query = typeof o.query === "string" ? o.query : null;
      const ts = typeof o.ts === "number" ? o.ts : null;
      if (!query || ts == null) return null;
      const trimmed = query.trim();
      if (trimmed.length === 0) return null;
      return { query: trimmed, ts };
    })
    .filter((x): x is RecentSearch => x !== null);
  return items;
}

function normalizeKey(query: string): string {
  return query.trim().toLowerCase();
}

// ─── core API ───

/**
 * 최근 검색어 목록을 ts 내림차순 (최신 우선) 으로 반환한다.
 * 최대 10개. 빈 / SSR 환경 → [].
 */
export function getRecentSearches(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  const items = parseRecentSearches(localStorage.getItem(RECENT_SEARCHES_KEY));
  // 최신 우선 정렬 (저장 시 prepend 하지만 외부 파괴 대비)
  const sorted = [...items].sort((a, b) => b.ts - a.ts);
  return sorted.slice(0, MAX_RECENT_SEARCHES);
}

/**
 * 검색어를 추가한다. 동일 query (정규화 비교) 가 이미 있으면 제거 후 새 ts 로 재삽입.
 * 빈 문자열 / 공백만 → no-op.
 */
export function addRecentSearch(query: string): void {
  if (typeof window === "undefined") return;
  const trimmed = query.trim();
  if (trimmed.length === 0) return;

  const key = normalizeKey(trimmed);
  const items = parseRecentSearches(localStorage.getItem(RECENT_SEARCHES_KEY));
  const dedup = items.filter((it) => normalizeKey(it.query) !== key);
  const next: RecentSearch = { query: trimmed, ts: Date.now() };
  // 최신을 앞에 두고, 최대 10개로 자른다.
  const updated = [next, ...dedup].slice(0, MAX_RECENT_SEARCHES);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
}

/**
 * 특정 검색어를 제거한다. 정규화 비교 (대소문자 무시).
 * 일치 항목이 없으면 no-op.
 */
export function removeRecentSearch(query: string): void {
  if (typeof window === "undefined") return;
  const key = normalizeKey(query);
  if (key.length === 0) return;
  const items = parseRecentSearches(localStorage.getItem(RECENT_SEARCHES_KEY));
  const filtered = items.filter((it) => normalizeKey(it.query) !== key);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(filtered));
}

/**
 * 전체 초기화.
 */
export function clearRecentSearches(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(RECENT_SEARCHES_KEY);
}
