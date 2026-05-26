/**
 * AsyncStorage in-memory mock — vitest 환경 전용.
 * RN bridge 없이 동일 API 표면을 제공. 각 test 시작 시 store 초기화는
 * `__resetStorage()` 로 호출 가능.
 */
let store = new Map<string, string>();

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    return store.has(key) ? store.get(key)! : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    store.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    store.delete(key);
  },
  async getAllKeys(): Promise<string[]> {
    return Array.from(store.keys());
  },
  async multiRemove(keys: string[]): Promise<void> {
    keys.forEach((k) => store.delete(k));
  },
  async clear(): Promise<void> {
    store.clear();
  },
};

export default AsyncStorage;

/** Test 격리용 — beforeEach 에서 호출. */
export function __resetStorage(): void {
  store = new Map<string, string>();
}

/** Test inspection — 특정 key 가 있는지 직접 확인. */
export function __peekStorage(key: string): string | undefined {
  return store.get(key);
}

/** Test inspection — 모든 keys 조회. */
export function __allKeys(): string[] {
  return Array.from(store.keys());
}
