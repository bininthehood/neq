export type BudgetStore = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
};

/** Reserve one recommendation request in a shared UTC-day counter. */
export async function reserveDailyBudget(
  store: BudgetStore,
  maxRequests: number,
  now = new Date(),
): Promise<boolean> {
  if (!Number.isInteger(maxRequests) || maxRequests < 1) {
    throw new Error("Daily recommendation budget must be a positive integer");
  }
  const day = now.toISOString().slice(0, 10);
  const key = `recommend:daily:${day}`;
  const nextDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const seconds = Math.max(1, Math.ceil((nextDay - now.getTime()) / 1000));
  const count = await store.incr(key);
  await store.expire(key, seconds);
  return count <= maxRequests;
}
