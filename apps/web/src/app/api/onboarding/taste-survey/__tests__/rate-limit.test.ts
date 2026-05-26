import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  checkIpTokenLimit,
  _setStoreForTest,
  _clearMemoryStoreForTest,
  IP_TOKEN_LIMIT_FOR_TEST,
  type RateLimitStore,
} from '../_lib/rate-limit';

beforeEach(() => {
  _clearMemoryStoreForTest();
  _setStoreForTest(null);
});

describe('checkIpTokenLimit (memory fallback)', () => {
  it('첫 호출 시 count=1, allowed=true', async () => {
    const res = await checkIpTokenLimit('1.2.3.4');
    expect(res.allowed).toBe(true);
    expect(res.count).toBe(1);
    expect(res.limit).toBe(IP_TOKEN_LIMIT_FOR_TEST);
  });

  it(`${IP_TOKEN_LIMIT_FOR_TEST}회 까지 allowed, ${IP_TOKEN_LIMIT_FOR_TEST + 1}회 부터 차단`, async () => {
    const ip = '1.2.3.4';
    for (let i = 1; i <= IP_TOKEN_LIMIT_FOR_TEST; i++) {
      const r = await checkIpTokenLimit(ip);
      expect(r.allowed).toBe(true);
      expect(r.count).toBe(i);
    }
    const blocked = await checkIpTokenLimit(ip);
    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(IP_TOKEN_LIMIT_FOR_TEST + 1);
    expect(blocked.retryAfterSec).toBe(3600);
  });

  it('다른 IP 는 별도 카운터', async () => {
    for (let i = 0; i < IP_TOKEN_LIMIT_FOR_TEST; i++) {
      await checkIpTokenLimit('1.1.1.1');
    }
    const other = await checkIpTokenLimit('2.2.2.2');
    expect(other.allowed).toBe(true);
    expect(other.count).toBe(1);
  });

  it('IP unknown 또는 빈 문자열 → fail-open (allowed)', async () => {
    expect((await checkIpTokenLimit('')).allowed).toBe(true);
    expect((await checkIpTokenLimit('unknown')).allowed).toBe(true);
  });
});

describe('checkIpTokenLimit (injected store — Redis 시뮬레이션)', () => {
  it('정상 INCR/EXPIRE 호출 sequence', async () => {
    const store: RateLimitStore = {
      incr: vi.fn().mockResolvedValueOnce(1),
      expire: vi.fn().mockResolvedValueOnce(1),
    };
    _setStoreForTest(store);
    await checkIpTokenLimit('1.2.3.4');
    expect(store.incr).toHaveBeenCalledWith(
      'taste-survey:token-issue:1.2.3.4',
    );
    expect(store.expire).toHaveBeenCalledWith(
      'taste-survey:token-issue:1.2.3.4',
      3600,
    );
  });

  it('count=2 일 땐 EXPIRE 재호출 안 함 (신규 키만 stamp)', async () => {
    const store: RateLimitStore = {
      incr: vi.fn().mockResolvedValueOnce(2),
      expire: vi.fn().mockResolvedValueOnce(1),
    };
    _setStoreForTest(store);
    await checkIpTokenLimit('1.2.3.4');
    expect(store.expire).not.toHaveBeenCalled();
  });

  it('Redis throw → fail-open (allowed=true)', async () => {
    const store: RateLimitStore = {
      incr: vi.fn().mockRejectedValueOnce(new Error('redis down')),
      expire: vi.fn(),
    };
    _setStoreForTest(store);
    const res = await checkIpTokenLimit('1.2.3.4');
    expect(res.allowed).toBe(true);
    expect(res.count).toBe(0);
  });

  it('count > limit → 차단 응답 + retryAfterSec', async () => {
    const store: RateLimitStore = {
      incr: vi
        .fn()
        .mockResolvedValueOnce(IP_TOKEN_LIMIT_FOR_TEST + 3),
      expire: vi.fn(),
    };
    _setStoreForTest(store);
    const res = await checkIpTokenLimit('1.2.3.4');
    expect(res.allowed).toBe(false);
    expect(res.count).toBe(IP_TOKEN_LIMIT_FOR_TEST + 3);
    expect(res.retryAfterSec).toBe(3600);
  });
});
