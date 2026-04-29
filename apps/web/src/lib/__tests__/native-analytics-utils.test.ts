/**
 * 네이티브 analytics-utils 단위 테스트.
 *
 * 위치: apps/web/src/lib/__tests__/  (기존 vitest 인프라 재사용)
 * 대상: apps/native/lib/analytics-utils.ts
 *
 * native 디렉토리에는 jest 인프라가 없고 (e2e만 wdio 셋업)
 * jest-expo 도입은 SDK 호환 리스크가 있어 위임 D7 범위 외.
 * `analytics-utils.ts` 는 외부 의존성이 0인 순수 함수만 모아 둠 → web vitest로 직접 검증 가능.
 */
import { describe, it, expect } from 'vitest';
import {
  sanitize,
  parseServerTiming,
  timingsToProps,
  usageToProps,
} from '../../../../../apps/native/lib/analytics-utils';

describe('analytics-utils.sanitize', () => {
  it('undefined 값을 제외한다', () => {
    const out = sanitize({ a: 1, b: undefined, c: 'x' });
    expect(out).toEqual({ a: 1, c: 'x' });
  });

  it('null/false/0 은 유지한다 (의미 있는 값)', () => {
    const out = sanitize({ a: null, b: false, c: 0, d: '' });
    expect(out).toEqual({ a: null, b: false, c: 0, d: '' });
  });

  it('빈 입력은 빈 객체', () => {
    expect(sanitize()).toEqual({});
    expect(sanitize({})).toEqual({});
  });
});

describe('analytics-utils.parseServerTiming', () => {
  it('표준 형식을 파싱한다', () => {
    const out = parseServerTiming('enrich;dur=286,llm;dur=8855');
    expect(out).toEqual({ enrich: 286, llm: 8855 });
  });

  it('공백/대소문자 변형도 허용한다', () => {
    const out = parseServerTiming('enrich; Dur=100 , llm ; dur = 200.4');
    expect(out).toEqual({ enrich: 100, llm: 200 }); // 200.4 → round 200
  });

  it('null/undefined/빈 문자열은 빈 객체', () => {
    expect(parseServerTiming(null)).toEqual({});
    expect(parseServerTiming(undefined)).toEqual({});
    expect(parseServerTiming('')).toEqual({});
  });

  it('dur 없는 segment 는 스킵', () => {
    const out = parseServerTiming('miss,enrich;dur=42,desc;desc="x"');
    expect(out).toEqual({ enrich: 42 });
  });

  it('dur 가 숫자가 아니면 스킵', () => {
    const out = parseServerTiming('enrich;dur=abc,llm;dur=300');
    expect(out).toEqual({ llm: 300 });
  });
});

describe('analytics-utils.timingsToProps', () => {
  it('숫자 timings 를 srv_<key>_ms 로 변환', () => {
    const out = timingsToProps({ enrich: 100.6, llm: 200 });
    expect(out).toEqual({ srv_enrich_ms: 101, srv_llm_ms: 200 });
  });

  it('숫자 아닌 값은 스킵', () => {
    const out = timingsToProps({ enrich: 100, fail: 'x', nan: NaN });
    expect(out).toEqual({ srv_enrich_ms: 100 });
  });

  it('null/undefined/non-object 는 빈 객체', () => {
    expect(timingsToProps(null)).toEqual({});
    expect(timingsToProps(undefined)).toEqual({});
    expect(timingsToProps('not-object')).toEqual({});
  });
});

describe('analytics-utils.usageToProps', () => {
  it('알려진 토큰 필드만 srv_<field> 로 변환', () => {
    const out = usageToProps({
      prompt_tokens: 100,
      completion_tokens: 50,
      cached_tokens: 25,
      total_tokens: 175, // 알려진 키 아님 — 스킵
    });
    expect(out).toEqual({
      srv_prompt_tokens: 100,
      srv_completion_tokens: 50,
      srv_cached_tokens: 25,
    });
  });

  it('숫자 아닌 값은 스킵', () => {
    const out = usageToProps({ prompt_tokens: 'x', completion_tokens: 50 });
    expect(out).toEqual({ srv_completion_tokens: 50 });
  });

  it('null/non-object 는 빈 객체', () => {
    expect(usageToProps(null)).toEqual({});
    expect(usageToProps(42)).toEqual({});
  });
});

describe('analytics-utils 통합 시나리오', () => {
  it('Server-Timing 헤더 → recommendation_loaded props 시뮬레이션', () => {
    const headerProps = parseServerTiming('enrich;dur=286,llm;dur=8855,total;dur=9100');
    const finalProps = sanitize({
      count: 5,
      duration_ms: 9200,
      cold_start: false,
      favorites_count: 3,
      streamed: false,
      // Server-Timing 결과를 srv_* 로 펼쳐 합친다 (api.ts 와 동일 매핑)
      ...Object.fromEntries(
        Object.entries(headerProps).map(([k, v]) => [`srv_${k}_ms`, v]),
      ),
      maybe_undefined: undefined,
    });
    expect(finalProps).toEqual({
      count: 5,
      duration_ms: 9200,
      cold_start: false,
      favorites_count: 3,
      streamed: false,
      srv_enrich_ms: 286,
      srv_llm_ms: 8855,
      srv_total_ms: 9100,
    });
    expect('maybe_undefined' in finalProps).toBe(false);
  });
});
