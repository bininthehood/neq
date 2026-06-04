import { Redis } from "@upstash/redis";

/**
 * /api/recommend rate limit (분당 60회/IP).
 *
 * **Upstash Redis 우선, in-memory fallback.**
 *
 * 배경: 기존 in-memory `Map` 은 Vercel 멀티 인스턴스에서 각 인스턴스가 독립 Map
 * 을 가져 실효 limit 이 N배로 증가 (취약점 분석 D7 보고). Upstash REST 클라이언트
 * 로 동기화 — 모든 인스턴스가 동일 카운터 사용.
 *
 * 동작:
 *   - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` 설정 시 Redis 사용
 *   - 미설정 또는 Redis 일시 오류 시 in-memory fallback (가용성 우선)
 *   - 카운터: `INCR rl:<ip>` + 첫 호출 시 `EXPIRE 60` — fixed window
 *
 * 환경변수 누락 시: 기존 동작 (single-instance 에서만 유효한 제한). 안전한 dev 경험.
 */

const WINDOW_MS = 60_000;
const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 60;

const redis: Redis | null = (() => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
})();

const memoryRequests = new Map<string, { count: number; resetAt: number }>();

function checkInMemory(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = memoryRequests.get(ip);

  if (memoryRequests.size > 1_000) {
    for (const [key, val] of memoryRequests) {
      if (val.resetAt < now) memoryRequests.delete(key);
    }
  }

  if (!entry || entry.resetAt < now) {
    memoryRequests.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }

  if (entry.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: MAX_REQUESTS - entry.count };
}

export async function checkRateLimit(
  ip: string,
): Promise<{ allowed: boolean; remaining: number }> {
  if (!redis) return checkInMemory(ip);

  const key = `rl:${ip}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      // 첫 호출에서만 TTL 설정 — 이후 같은 키는 만료 후 자동 리셋.
      await redis.expire(key, WINDOW_SECONDS);
    }
    if (count > MAX_REQUESTS) {
      return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: MAX_REQUESTS - count };
  } catch {
    return checkInMemory(ip);
  }
}
