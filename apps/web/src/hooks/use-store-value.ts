"use client";

/**
 * use-store-value — lib/store 의 useSyncExternalStore 통합.
 *
 * R19 strict 의 set-state-in-effect / SSR-safe 패턴 해결:
 *   기존: useState(default) + useEffect(getSaved → setState) → set-state-in-effect 경고
 *   변경: useSaved() — 한 줄. mount-only effect 불필요. lib/store mutation 시 자동 reactive.
 *
 * cache pattern:
 *   - 글로벌 invalidate (store mutation 시 모든 cache reset).
 *   - 영향 안 받는 key 도 invalidate 되지만 React batching + memo 로 실제 cost 작음.
 *   - Phase 3 에서 key 별 selective invalidate 도입 검토.
 *
 * SSR:
 *   - getServerSnapshot 이 defaultValue 반환 → hydration mismatch 회피.
 *   - 첫 CSR 렌더에서 client 값으로 자동 전환.
 */

import { useSyncExternalStore } from "react";
import {
  subscribeStore,
  getSaved,
  getArchivedIds,
  getWatchReports,
  getRecHistory,
  getFavoritesMeta,
  getFavorites,
  getPersonas,
  getActivePersonaId,
  getActivePersona,
  getSeenTitles,
} from "@/lib/store";

/**
 * lib/store getter 를 useSyncExternalStore hook 으로 변환.
 *
 * cache 는 module-level slot.
 * subscribeStore 통한 글로벌 invalidate.
 * getSnapshot 호출 시 cache miss 면 fresh fetch + 저장.
 */
function createStoreHook<T>(
  getter: () => T,
  defaultValue: T,
): () => T {
  let cache: { value: T } | undefined;
  let subscribed = false;

  const ensureSubscribed = (): void => {
    if (subscribed) return;
    subscribed = true;
    subscribeStore(() => {
      cache = undefined;
    });
  };

  const getSnapshot = (): T => {
    ensureSubscribed();
    if (cache === undefined) cache = { value: getter() };
    return cache.value;
  };

  const getServerSnapshot = (): T => defaultValue;

  return function useStoreValue(): T {
    return useSyncExternalStore(subscribeStore, getSnapshot, getServerSnapshot);
  };
}

// === Public hooks ===

export const useSaved = createStoreHook(getSaved, []);
export const useArchivedIds = createStoreHook(getArchivedIds, [] as number[]);
export const useWatchReports = createStoreHook(getWatchReports, []);
export const useRecHistory = createStoreHook(getRecHistory, []);
export const useFavoritesMeta = createStoreHook(getFavoritesMeta, []);
export const useFavorites = createStoreHook(getFavorites, [] as string[]);
export const usePersonas = createStoreHook(getPersonas, []);
export const useActivePersonaId = createStoreHook(
  getActivePersonaId,
  "default",
);
export const useSeenTitles = createStoreHook(getSeenTitles, [] as string[]);
// useActivePersona: SSR null fallback (전체 persona 객체).
// 실제 server snapshot 은 사용 안 됨 — CSR 에서 적시 hydration.
export const useActivePersona = createStoreHook(getActivePersona, null as ReturnType<typeof getActivePersona> | null);
