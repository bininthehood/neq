/**
 * 입고 알림 프로브 — 로컬 dedup 저장 (web / localStorage).
 *
 * "알려드릴게요" 탭 시 작품 키를 저장해 (a) 재탭 이벤트 중복 방지, (b) 재진입 시
 * "알림 신청됨" 비활성 상태 유지. 서버 워치리스트 이관(B 단계)의 씨앗.
 *
 * 키: `${type}:${tmdbId}` — PK=(tmdb_id, media_type) 정합 (movie/tv id 공간 독립).
 *
 * ponytail: 단일 localStorage 키에 배열 JSON. 규모(수십~수백)에서 충분. 서버 이관 시
 * 이 배열을 그대로 씨앗으로 넘긴다.
 */

const STORAGE_KEY = "neq_arrival_notify";

export function arrivalKey(tmdbId: number, type: string): string {
  return `${type === "movie" ? "movie" : "series"}:${tmdbId}`;
}

function readSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((v) => typeof v === "string")) : new Set();
  } catch {
    return new Set();
  }
}

export function hasNotified(tmdbId: number, type: string): boolean {
  return readSet().has(arrivalKey(tmdbId, type));
}

export function markNotified(tmdbId: number, type: string): void {
  if (typeof window === "undefined") return;
  try {
    const set = readSet();
    set.add(arrivalKey(tmdbId, type));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // 저장 실패해도 앱 동작 무관 — 최악의 경우 재탭 시 이벤트 1회 중복
  }
}
