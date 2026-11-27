import type { Recommendation } from "@/lib/types";

/**
 * "관심 없음" 숨김 목록 (2026-11-26, Night Pool PR-S).
 *
 * 앱이 영구 숨김 작품을 `hiddenKeys: ["movie:1396", "tv:1396", ...]` 로 보낸다.
 * excludeIds(숫자, 7일 기록)와 분리한 이유: 영화·TV id 공간이 독립이라 숫자만으로는
 * 영화 1396 을 숨기면 드라마 1396 까지 사라진다. 그래서 (종류, id) 쌍으로 비교한다.
 * 예전 앱은 필드를 안 보낸다 → 빈 Set → 기존 동작 그대로.
 */
const HIDDEN_KEY_RE = /^(movie|tv):[0-9]{1,9}$/;
export const HIDDEN_KEYS_MAX = 500;

/** 형식이 틀린 항목은 조용히 버리고 중복 제거, 앞에서부터 500개 (클라가 최근 숨김부터 보냄). */
export function parseHiddenKeys(raw: unknown): Set<string> {
  const keys = new Set<string>();
  if (!Array.isArray(raw)) return keys;
  for (const x of raw) {
    if (keys.size >= HIDDEN_KEYS_MAX) break;
    if (typeof x === "string" && HIDDEN_KEY_RE.test(x)) keys.add(x);
  }
  return keys;
}

/** rec.type → TMDB media type. series/variety 는 모두 TV (ArrivalProbe 와 동일 규칙). */
export function isHiddenRec(rec: Recommendation, hidden: Set<string>): boolean {
  if (hidden.size === 0) return false;
  return hidden.has(`${rec.type === "movie" ? "movie" : "tv"}:${rec.tmdbId}`);
}
