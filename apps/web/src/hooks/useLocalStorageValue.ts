"use client";

/**
 * useLocalStorageValue — useSyncExternalStore 기반 localStorage reactive read.
 *
 * R19 strict 의 set-state-in-effect / SSR-safe 패턴 해결:
 *   기존: useState(default) + useEffect(read on mount) → set-state-in-effect 경고
 *   변경: useSyncExternalStore + subscribe(storage event + custom event)
 *
 * 같은 탭 안 update 도 reactive 하게 잡으려면 write 시 `setLocalStorageItem`
 * 또는 `removeLocalStorageItem` 사용 필수 (custom event dispatch). 직접
 * localStorage.setItem 호출은 같은 탭의 다른 구독자 알림 X (cross-tab 만 동작).
 *
 * SSR 시 getServerSnapshot 이 항상 defaultValue 반환 → hydration mismatch 회피.
 */

import { useSyncExternalStore } from "react";

const STORAGE_EVENT = "neq:local-storage-update";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  // cross-tab: 브라우저 기본 storage event
  window.addEventListener("storage", callback);
  // same-tab: setLocalStorageItem 이 dispatch 하는 custom event
  window.addEventListener(STORAGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(STORAGE_EVENT, callback);
  };
}

/**
 * key 별 hook 생성 factory.
 *
 * snapshot 함수가 module-level 에서 한 번만 만들어져 useSyncExternalStore 의
 * re-subscribe / 재호출 최소화.
 *
 * @example
 *   const useTutorialV3Shown = createLocalStorageHook(
 *     "tutorialV3Shown",
 *     (raw) => raw === "1",
 *     false,
 *   );
 *   // 컴포넌트 안: const shown = useTutorialV3Shown();
 */
export function createLocalStorageHook<T>(
  key: string,
  parse: (raw: string | null) => T,
  defaultValue: T,
): () => T {
  const getSnapshot = (): T => {
    if (typeof window === "undefined") return defaultValue;
    return parse(localStorage.getItem(key));
  };
  const getServerSnapshot = (): T => defaultValue;
  return function useValue(): T {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  };
}

/**
 * localStorage write + 같은 탭 reactive update 알림.
 *
 * value=null 이면 removeItem.
 */
export function setLocalStorageItem(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  if (value === null) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, value);
  }
  window.dispatchEvent(new Event(STORAGE_EVENT));
}
