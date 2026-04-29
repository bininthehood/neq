/**
 * api 의 prefetch 캐시 키 생성 함수만 분리.
 * - 외부 의존성(react-native, posthog-react-native, expo-constants) 없음
 * - vitest 등 web 테스트 러너에서 직접 import 가능
 *
 * `api.ts` 는 이 모듈을 re-export 해서 사용. 단일 진입점 유지.
 *
 * 위임 D6 §2.2 — module-level prefetch 캐시는 filter+favorites+savedCount 조합으로
 * 같은 요청을 1회만 보낸다.
 */

import type { RecommendFilter } from '@neq/core';

/**
 * prefetch 캐시 키 — filter + favorites + savedCount 조합.
 *
 * web stack 누적 패턴과 일치: 같은 조건일 때 prefetch 결과 1회 재사용.
 * favorites 순서는 중요하지 않으므로 정렬 후 join. exclude 는 키에서 제외 (호출 시점에 따라 변동).
 */
export function buildPrefetchKey(
  filter: RecommendFilter | undefined,
  favorites: string[] | undefined,
  savedCount: number | undefined,
): string {
  const f = filter ?? {};
  const filterPart = JSON.stringify({
    type: f.type ?? 'all',
    origin: f.origin ?? 'all',
    year: f.year ?? 'all',
    ott: [...(f.ott ?? [])].sort(),
  });
  const favPart = [...(favorites ?? [])].sort().join('|');
  const savedPart = String(savedCount ?? 0);
  return `${filterPart}::${favPart}::${savedPart}`;
}
