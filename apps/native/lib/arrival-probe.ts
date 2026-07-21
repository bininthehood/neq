/**
 * 입고 알림 프로브 — 로컬 dedup 저장 (native / AsyncStorage).
 *
 * web `apps/web/src/lib/arrival-probe.ts` 의 native 대응. AsyncStorage 라 모든 API async.
 * 키: `${type}:${tmdbId}` — PK=(tmdb_id, media_type) 정합.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'neq_arrival_notify';

export function arrivalKey(tmdbId: number, type: string): string {
  return `${type === 'movie' ? 'movie' : 'series'}:${tmdbId}`;
}

async function readSet(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((v) => typeof v === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export async function hasNotified(tmdbId: number, type: string): Promise<boolean> {
  return (await readSet()).has(arrivalKey(tmdbId, type));
}

export async function markNotified(tmdbId: number, type: string): Promise<void> {
  try {
    const set = await readSet();
    set.add(arrivalKey(tmdbId, type));
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // 저장 실패해도 앱 동작 무관
  }
}
