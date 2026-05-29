/**
 * Recent Searches store (native) — AsyncStorage 패턴.
 *
 * web `apps/web/src/lib/recent-searches.ts` 의 RN 포팅.
 *   - LocalStorage 동기 API → AsyncStorage 비동기 API.
 *   - 키 / 정책 / 정규화 / FIFO 큐 (10개) / dedupe 정합.
 *
 * SearchSheet idle 상태에서 노출되는 "최근 검색어" 목록.
 *
 * 정책:
 *   - FIFO 큐, 최대 10개
 *   - 동일 query 재입력 시 기존 항목 제거 후 최신 ts 로 재삽입 (dedupe)
 *   - 정규화: trim + 소문자 비교 (표시는 원본 case 보존)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENT_SEARCHES_KEY = 'neq_recent_searches';
const MAX_RECENT_SEARCHES = 10;

export interface RecentSearch {
  /** 표시용 원본 query (case 보존) */
  query: string;
  /** Unix epoch ms */
  ts: number;
}

function parseRecentSearches(raw: string | null): RecentSearch[] {
  if (!raw) return [];
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(obj)) return [];
  return obj
    .map((it): RecentSearch | null => {
      if (!it || typeof it !== 'object') return null;
      const o = it as Record<string, unknown>;
      const query = typeof o.query === 'string' ? o.query : null;
      const ts = typeof o.ts === 'number' ? o.ts : null;
      if (!query || ts == null) return null;
      const trimmed = query.trim();
      if (trimmed.length === 0) return null;
      return { query: trimmed, ts };
    })
    .filter((x): x is RecentSearch => x !== null);
}

function normalizeKey(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * 최근 검색어 목록을 ts 내림차순 (최신 우선) 으로 반환. 최대 10개.
 */
export async function getRecentSearches(): Promise<RecentSearch[]> {
  const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY).catch(() => null);
  const items = parseRecentSearches(raw);
  const sorted = [...items].sort((a, b) => b.ts - a.ts);
  return sorted.slice(0, MAX_RECENT_SEARCHES);
}

/**
 * 검색어 추가. 동일 query (정규화 비교) 가 이미 있으면 제거 후 새 ts 로 재삽입.
 * 빈 문자열 / 공백만 → no-op.
 */
export async function addRecentSearch(query: string): Promise<void> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return;

  const key = normalizeKey(trimmed);
  const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY).catch(() => null);
  const items = parseRecentSearches(raw);
  const dedup = items.filter((it) => normalizeKey(it.query) !== key);
  const next: RecentSearch = { query: trimmed, ts: Date.now() };
  const updated = [next, ...dedup].slice(0, MAX_RECENT_SEARCHES);
  await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
}

/**
 * 특정 검색어 제거. 정규화 비교 (대소문자 무시). 일치 없으면 no-op.
 */
export async function removeRecentSearch(query: string): Promise<void> {
  const key = normalizeKey(query);
  if (key.length === 0) return;
  const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY).catch(() => null);
  const items = parseRecentSearches(raw);
  const filtered = items.filter((it) => normalizeKey(it.query) !== key);
  await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(filtered));
}

/**
 * 전체 초기화.
 */
export async function clearRecentSearches(): Promise<void> {
  await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
}

/**
 * `/api/trending` 응답 항목.
 * apps/web/src/app/api/trending/route.ts 와 정합.
 */
export interface TrendingItem {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
}
