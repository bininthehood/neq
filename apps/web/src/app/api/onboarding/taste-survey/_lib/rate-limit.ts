/**
 * IP-level rate limit — persona-creation-session token 발급 가드.
 *
 * outside voice HIGH #1 의 secondary 가드: device_id × time 차원 폐기 후,
 * persona-creation-session token (1 페르소나당 N=8 호출) 으로 대체. 단 token
 * 자체의 무한 발급 차단을 위해 IP 당 1시간 5 token 발급으로 secondary 가드.
 *
 * Upstash Redis atomic INCR + EXPIRE. Redis 미응답 시 fail-open (요청 허용)
 * 결정 — abuse 방어보다 사용자 경험 우선 (서비스 안정성). 비정상 부하는 메트릭
 * 으로 감지.
 *
 * Dev 환경 (REDIS env 없음): in-memory Map fallback. test 도 동일 path.
 */
import { Redis } from '@upstash/redis';

const IP_TOKEN_LIMIT = 5;
const IP_WINDOW_SEC = 60 * 60; // 1시간

let redisClient: Redis | null = null;
let redisInitialized = false;

/**
 * Test 인젝션을 위한 export.
 */
export interface RateLimitStore {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

const memoryStore = new Map<
  string,
  { count: number; expiresAt: number }
>();

const memoryFallback: RateLimitStore = {
  async incr(key: string) {
    const now = Date.now();
    const entry = memoryStore.get(key);
    if (entry && entry.expiresAt > now) {
      entry.count += 1;
      return entry.count;
    }
    memoryStore.set(key, {
      count: 1,
      expiresAt: now + IP_WINDOW_SEC * 1000,
    });
    return 1;
  },
  async expire(key: string, seconds: number) {
    const entry = memoryStore.get(key);
    if (entry) entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  },
};

function getStore(): RateLimitStore {
  if (!redisInitialized) {
    redisInitialized = true;
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      try {
        redisClient = new Redis({ url, token });
      } catch {
        redisClient = null;
      }
    }
  }
  if (redisClient) {
    return {
      incr: (key) => redisClient!.incr(key),
      expire: (key, seconds) => redisClient!.expire(key, seconds),
    };
  }
  return memoryFallback;
}

/**
 * Test 용 — 강제로 store override.
 */
export function _setStoreForTest(store: RateLimitStore | null) {
  if (store) {
    redisInitialized = true;
    redisClient = null;
    // monkey-patch getStore 결과
    (getStore as unknown as { __override?: RateLimitStore }).__override =
      store;
  } else {
    redisInitialized = false;
    redisClient = null;
    delete (getStore as unknown as { __override?: RateLimitStore }).__override;
  }
}

function getStoreWithOverride(): RateLimitStore {
  const ovr = (getStore as unknown as { __override?: RateLimitStore })
    .__override;
  return ovr ?? getStore();
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSec?: number;
}

/**
 * IP 당 1시간 N token 발급 체크. INCR + 신규 키면 EXPIRE.
 * Redis 장애 시 fail-open (allowed=true) — 사용자 경험 우선.
 */
export async function checkIpTokenLimit(ip: string): Promise<RateLimitResult> {
  if (!ip || ip === 'unknown') {
    // IP 식별 불가 — fail-open
    return { allowed: true, count: 0, limit: IP_TOKEN_LIMIT };
  }
  const key = `taste-survey:token-issue:${ip}`;
  try {
    const store = getStoreWithOverride();
    const count = await store.incr(key);
    if (count === 1) {
      await store.expire(key, IP_WINDOW_SEC);
    }
    if (count > IP_TOKEN_LIMIT) {
      return {
        allowed: false,
        count,
        limit: IP_TOKEN_LIMIT,
        retryAfterSec: IP_WINDOW_SEC,
      };
    }
    return { allowed: true, count, limit: IP_TOKEN_LIMIT };
  } catch {
    // Redis 장애 — fail-open
    return { allowed: true, count: 0, limit: IP_TOKEN_LIMIT };
  }
}

/**
 * Memory store 초기화 (test 격리용).
 */
export function _clearMemoryStoreForTest() {
  memoryStore.clear();
}

export const IP_TOKEN_LIMIT_FOR_TEST = IP_TOKEN_LIMIT;
