// expo-crypto in-memory mock — vitest 전용. randomUUID 만 사용 (store.ts createPersona).
export function randomUUID(): string {
  return 'test-uuid-' + Math.random().toString(36).slice(2);
}
export default { randomUUID };
