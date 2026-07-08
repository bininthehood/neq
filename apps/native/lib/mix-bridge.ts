/**
 * Seeded Mix 2차 (2026-07-08) — Mix 탭 → Discover 믹스 시작 브리지.
 *
 * expo-router 탭 params 는 string 만 지원 — 풀 Recommendation seed 를 넘기기 위해
 * module-level mailbox 사용 (prefetch 캐시와 동일 패턴). Mix 탭이 set 후
 * router.push('/') → Discover 의 useFocusEffect 가 consume 해 믹스 시작.
 */
import type { Recommendation } from './types';

export type MixStartSource = 'native_card_menu' | 'native_mix_tab';

interface PendingMixSeed {
  seed: Recommendation;
  source: MixStartSource;
}

let pending: PendingMixSeed | null = null;

export function setPendingMixSeed(seed: Recommendation, source: MixStartSource): void {
  pending = { seed, source };
}

/** 1회 소비 — 재focus 시 중복 믹스 시작 방지. */
export function consumePendingMixSeed(): PendingMixSeed | null {
  const p = pending;
  pending = null;
  return p;
}
