/**
 * "관심 없음" 숨김 키 — 순수 함수 (Night Pool 5단계, 서버 PR #55 계약과 같은 형식).
 *
 * 키 = `movie:1396` / `tv:1396`. 영화·TV id 공간이 독립이라 숫자만으로는 충돌한다.
 * series·variety 는 모두 TV (서버 `isHiddenRec` 와 같은 규칙).
 * 서버는 최근 숨김부터 500개만 본다 → 저장도 최근 우선 500개.
 */
import type { Recommendation } from './types';

export const HIDDEN_KEYS_MAX = 500;

export interface HiddenEntry {
  key: string;
  hiddenAt: number;
}

export function hiddenKeyOf(rec: Pick<Recommendation, 'type' | 'tmdbId'>): string {
  return `${rec.type === 'movie' ? 'movie' : 'tv'}:${rec.tmdbId}`;
}

/** 맨 앞에 추가(중복이면 앞으로 이동), 상한 넘으면 오래된 것부터 탈락. */
export function addHiddenEntry(list: HiddenEntry[], key: string, now: number): HiddenEntry[] {
  return [{ key, hiddenAt: now }, ...list.filter((e) => e.key !== key)].slice(0, HIDDEN_KEYS_MAX);
}

/**
 * 화면에 카드를 올리는 공통 지점(발견 덱·큐 덱)의 마지막 거름망 (계획 X2).
 * 서버를 거치지 않는 길 — 인기작 대체(/api/trending), 관련작·장르 큐, 이미 받아 둔 카드 —
 * 이 모두 여기를 지난다. 숨김이 없으면 같은 배열을 돌려줘 렌더 비용 0.
 */
export function filterHidden<T extends Pick<Recommendation, 'type' | 'tmdbId'>>(
  recs: T[],
  hidden: ReadonlySet<string>,
): T[] {
  if (hidden.size === 0) return recs;
  return recs.filter((r) => !hidden.has(hiddenKeyOf(r)));
}
