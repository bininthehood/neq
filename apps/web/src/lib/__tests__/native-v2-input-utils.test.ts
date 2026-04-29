/**
 * 네이티브 v2-input-utils 단위 테스트.
 *
 * 위치: apps/web/src/lib/__tests__/  (기존 vitest 인프라 재사용)
 * 대상: apps/native/lib/v2-input-utils.ts
 *
 * 위임 D4b §2.2 — Cold Start V2 LLM 입력 분기. flag 평가/AsyncStorage 조회는
 * 호출자(useRecommendations 또는 화면) 가 담당하고, 본 모듈은 입력값만 받아
 * fetch body / PostHog 속성 분기를 결정한다 (외부 의존 0).
 *
 * jest-expo 미도입 사유: SDK 호환 리스크 (D7 시점과 동일).
 * 외부 의존성 없는 함수만 별도 모듈로 분리해 web vitest 에서 직접 import.
 *
 * 검증 대상:
 *   - 두 flag OFF → V1 (body 빈, count 0)
 *   - flag ON + 값 없음 → V1 (count 0)
 *   - flag ON + 값 있음 → V2 (body 에 키 포함, count 양수)
 *   - 한쪽 flag 만 ON → 해당 쪽만 body 에 포함
 *   - flag OFF 인데 prefs 가 채워져 있어도 무시 (회귀 0 보장)
 */
import { describe, it, expect } from 'vitest';
import { computeV2Inputs } from '../../../../../apps/native/lib/v2-input-utils';

describe('computeV2Inputs — flag OFF (회귀 0)', () => {
  it('두 flag 모두 OFF 면 prefs 무관하게 V1 반환', () => {
    const out = computeV2Inputs({
      tasteGenresEnabled: false,
      ottWeakSignalEnabled: false,
      tasteGenres: ['thriller', 'drama'],
      subscribedOtt: [8, 337],
    });
    expect(out.body).toEqual({});
    expect(out.tasteGenresCount).toBe(0);
    expect(out.subscribedOttCount).toBe(0);
    expect(out.coldStartVersion).toBe('v1');
  });

  it('flag OFF + 빈 prefs → V1', () => {
    const out = computeV2Inputs({
      tasteGenresEnabled: false,
      ottWeakSignalEnabled: false,
      tasteGenres: [],
      subscribedOtt: [],
    });
    expect(out.body).toEqual({});
    expect(out.coldStartVersion).toBe('v1');
  });
});

describe('computeV2Inputs — flag ON + 값 없음', () => {
  it('두 flag ON + prefs 비어있음 → body 비어있고 V1', () => {
    const out = computeV2Inputs({
      tasteGenresEnabled: true,
      ottWeakSignalEnabled: true,
      tasteGenres: [],
      subscribedOtt: [],
    });
    expect(out.body).toEqual({});
    expect(out.tasteGenresCount).toBe(0);
    expect(out.subscribedOttCount).toBe(0);
    expect(out.coldStartVersion).toBe('v1');
  });
});

describe('computeV2Inputs — flag ON + 값 있음 (V2 분기)', () => {
  it('두 flag ON + 양쪽 값 있음 → V2', () => {
    const out = computeV2Inputs({
      tasteGenresEnabled: true,
      ottWeakSignalEnabled: true,
      tasteGenres: ['thriller', 'drama'],
      subscribedOtt: [8, 337],
    });
    expect(out.body.tasteGenres).toEqual(['thriller', 'drama']);
    expect(out.body.subscribedOtt).toEqual([8, 337]);
    expect(out.tasteGenresCount).toBe(2);
    expect(out.subscribedOttCount).toBe(2);
    expect(out.coldStartVersion).toBe('v2');
  });

  it('tasteGenres 만 있음 → tasteGenres 만 body 포함', () => {
    const out = computeV2Inputs({
      tasteGenresEnabled: true,
      ottWeakSignalEnabled: true,
      tasteGenres: ['thriller'],
      subscribedOtt: [],
    });
    expect(out.body.tasteGenres).toEqual(['thriller']);
    expect(out.body.subscribedOtt).toBeUndefined();
    expect(out.tasteGenresCount).toBe(1);
    expect(out.subscribedOttCount).toBe(0);
    expect(out.coldStartVersion).toBe('v2');
  });

  it('subscribedOtt 만 있음 → subscribedOtt 만 body 포함', () => {
    const out = computeV2Inputs({
      tasteGenresEnabled: true,
      ottWeakSignalEnabled: true,
      tasteGenres: [],
      subscribedOtt: [8],
    });
    expect(out.body.tasteGenres).toBeUndefined();
    expect(out.body.subscribedOtt).toEqual([8]);
    expect(out.tasteGenresCount).toBe(0);
    expect(out.subscribedOttCount).toBe(1);
    expect(out.coldStartVersion).toBe('v2');
  });
});

describe('computeV2Inputs — 한쪽 flag 만 ON', () => {
  it('tasteGenres flag 만 ON — subscribedOtt 값이 있어도 무시', () => {
    const out = computeV2Inputs({
      tasteGenresEnabled: true,
      ottWeakSignalEnabled: false,
      tasteGenres: ['thriller'],
      subscribedOtt: [8, 337],
    });
    expect(out.body.tasteGenres).toEqual(['thriller']);
    expect(out.body.subscribedOtt).toBeUndefined();
    expect(out.tasteGenresCount).toBe(1);
    expect(out.subscribedOttCount).toBe(0);
    expect(out.coldStartVersion).toBe('v2');
  });

  it('ottWeakSignal flag 만 ON — tasteGenres 값이 있어도 무시', () => {
    const out = computeV2Inputs({
      tasteGenresEnabled: false,
      ottWeakSignalEnabled: true,
      tasteGenres: ['thriller', 'drama'],
      subscribedOtt: [8],
    });
    expect(out.body.tasteGenres).toBeUndefined();
    expect(out.body.subscribedOtt).toEqual([8]);
    expect(out.tasteGenresCount).toBe(0);
    expect(out.subscribedOttCount).toBe(1);
    expect(out.coldStartVersion).toBe('v2');
  });

  it('한쪽 flag 만 ON + 그 쪽 값 비어있음 → V1', () => {
    const out = computeV2Inputs({
      tasteGenresEnabled: true,
      ottWeakSignalEnabled: false,
      tasteGenres: [],
      subscribedOtt: [8, 337], // 무시됨
    });
    expect(out.body).toEqual({});
    expect(out.coldStartVersion).toBe('v1');
  });
});

describe('computeV2Inputs — 결정성/순수성', () => {
  it('동일 입력 → 동일 출력 (순수 함수)', () => {
    const args = {
      tasteGenresEnabled: true,
      ottWeakSignalEnabled: true,
      tasteGenres: ['thriller'],
      subscribedOtt: [8],
    };
    const a = computeV2Inputs(args);
    const b = computeV2Inputs(args);
    expect(a).toEqual(b);
  });

  it('입력 배열을 mutate 하지 않는다', () => {
    const tasteGenres = ['thriller'];
    const subscribedOtt = [8];
    computeV2Inputs({
      tasteGenresEnabled: true,
      ottWeakSignalEnabled: true,
      tasteGenres,
      subscribedOtt,
    });
    expect(tasteGenres).toEqual(['thriller']);
    expect(subscribedOtt).toEqual([8]);
  });
});
