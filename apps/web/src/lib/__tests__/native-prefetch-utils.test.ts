/**
 * 네이티브 prefetch 캐시 키 생성 함수 단위 테스트.
 *
 * 위치: apps/web/src/lib/__tests__/  (기존 vitest 인프라 재사용)
 * 대상: apps/native/lib/prefetch-utils.ts 의 `buildPrefetchKey`
 *
 * 위임 D6 §2.2 — module-level prefetch 캐시는 filter+favorites+savedCount 조합으로
 * 같은 요청을 1회만 보낸다. 키 생성 함수는 외부 의존 0 (순수 string 직렬화) 이므로
 * native 환경 mock 없이 web vitest 로 직접 검증 가능.
 *
 * jest-expo 미도입 사유: SDK 호환 리스크 (D7 시점과 동일). analytics-utils 패턴과 동일하게
 * 외부 의존성 없는 함수만 별도 모듈로 분리해 web vitest 에서 직접 import.
 */
import { describe, it, expect } from 'vitest';
import { buildPrefetchKey } from '../../../../../apps/native/lib/prefetch-utils';

describe('buildPrefetchKey', () => {
  it('빈 입력 — 기본 key 반환', () => {
    const key = buildPrefetchKey(undefined, undefined, undefined);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('동일 입력 → 동일 key (deterministic)', () => {
    const k1 = buildPrefetchKey(
      { type: 'movie', origin: 'kr' },
      ['A', 'B', 'C'],
      5,
    );
    const k2 = buildPrefetchKey(
      { type: 'movie', origin: 'kr' },
      ['A', 'B', 'C'],
      5,
    );
    expect(k1).toBe(k2);
  });

  it('favorites 순서가 달라도 동일 key (정렬 후 비교)', () => {
    const k1 = buildPrefetchKey(undefined, ['A', 'B', 'C'], 0);
    const k2 = buildPrefetchKey(undefined, ['C', 'A', 'B'], 0);
    expect(k1).toBe(k2);
  });

  it('ott 배열 순서 무관 (정렬 후 비교)', () => {
    const k1 = buildPrefetchKey(
      { ott: ['Netflix', 'TVING'] },
      undefined,
      0,
    );
    const k2 = buildPrefetchKey(
      { ott: ['TVING', 'Netflix'] },
      undefined,
      0,
    );
    expect(k1).toBe(k2);
  });

  it('filter type 이 다르면 다른 key', () => {
    const k1 = buildPrefetchKey({ type: 'movie' }, [], 0);
    const k2 = buildPrefetchKey({ type: 'series' }, [], 0);
    expect(k1).not.toBe(k2);
  });

  it('filter origin 이 다르면 다른 key', () => {
    const k1 = buildPrefetchKey({ origin: 'kr' }, [], 0);
    const k2 = buildPrefetchKey({ origin: 'foreign' }, [], 0);
    expect(k1).not.toBe(k2);
  });

  it('filter year 가 다르면 다른 key', () => {
    const k1 = buildPrefetchKey({ year: 'recent' }, [], 0);
    const k2 = buildPrefetchKey({ year: 'classic' }, [], 0);
    expect(k1).not.toBe(k2);
  });

  it('savedCount 가 다르면 다른 key (모드 판정 signal)', () => {
    const k1 = buildPrefetchKey(undefined, ['A'], 5);
    const k2 = buildPrefetchKey(undefined, ['A'], 10);
    expect(k1).not.toBe(k2);
  });

  it('favorites 가 추가되면 다른 key', () => {
    const k1 = buildPrefetchKey(undefined, ['A'], 0);
    const k2 = buildPrefetchKey(undefined, ['A', 'B'], 0);
    expect(k1).not.toBe(k2);
  });

  it('빈 filter / 누락 filter 동일 처리 (all default)', () => {
    const k1 = buildPrefetchKey({}, [], 0);
    const k2 = buildPrefetchKey(undefined, [], 0);
    expect(k1).toBe(k2);
  });

  it('partial filter (type 만) vs full filter (type + origin all) 다르게 처리되지 않음', () => {
    // type 만 있어도 origin/year/ott 는 default 'all' 로 채워지므로
    // 명시적 type:movie 와 type:movie + origin:undefined 는 동일 key
    const k1 = buildPrefetchKey({ type: 'movie' }, [], 0);
    const k2 = buildPrefetchKey({ type: 'movie', origin: undefined }, [], 0);
    expect(k1).toBe(k2);
  });

  it('cold start 시나리오 — favorites=[] 도 안정적 key 생성', () => {
    const key = buildPrefetchKey({ type: 'movie' }, [], 0);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
    // 동일 cold start 호출은 캐시 hit 이어야 함
    const key2 = buildPrefetchKey({ type: 'movie' }, [], 0);
    expect(key).toBe(key2);
  });

  it('OTT 1개와 빈 OTT 다른 key', () => {
    const k1 = buildPrefetchKey({ ott: [] }, [], 0);
    const k2 = buildPrefetchKey({ ott: ['Netflix'] }, [], 0);
    expect(k1).not.toBe(k2);
  });
});
