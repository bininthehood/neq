import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getActivePersona,
  createPersona,
  updatePersona,
  deletePersona,
  canCreatePersona,
  MAX_PERSONAS,
  DEFAULT_PERSONA_ID,
} from '../persona';
import type { Persona } from '../types';

let uuidCounter = 0;
vi.stubGlobal('crypto', {
  ...globalThis.crypto,
  randomUUID: () => {
    uuidCounter++;
    return `00000000-0000-0000-0000-${String(uuidCounter).padStart(12, '0')}`;
  },
});

beforeEach(() => {
  uuidCounter = 0;
});

function fixturePersona(id: string, name: string): Persona {
  return {
    id,
    name,
    favorites: [],
    favoritesMeta: [],
    watchReports: [],
    seenTitles: [],
    recCache: [],
    recFilteredCache: {},
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('getActivePersona', () => {
  it('activeId 가 매칭되면 해당 페르소나 반환', () => {
    const personas = [fixturePersona('a', 'A'), fixturePersona('b', 'B')];
    expect(getActivePersona(personas, 'b')?.id).toBe('b');
  });

  it('activeId 가 없으면 첫 번째 페르소나 반환', () => {
    const personas = [fixturePersona('a', 'A'), fixturePersona('b', 'B')];
    expect(getActivePersona(personas, null)?.id).toBe('a');
    expect(getActivePersona(personas, undefined)?.id).toBe('a');
    expect(getActivePersona(personas, '')?.id).toBe('a');
  });

  it('activeId 가 매칭 안 되면 첫 번째 페르소나 반환 (fallback)', () => {
    const personas = [fixturePersona('a', 'A')];
    expect(getActivePersona(personas, 'nonexistent')?.id).toBe('a');
  });

  it('빈 배열이면 undefined 반환', () => {
    expect(getActivePersona([], 'a')).toBeUndefined();
    expect(getActivePersona([], null)).toBeUndefined();
  });
});

describe('createPersona', () => {
  it('id, name, 빈 배열 필드, updatedAt 으로 생성', () => {
    const p = createPersona('영화·혼자');
    expect(p.id).toBe('00000000-0000-0000-0000-000000000001');
    expect(p.name).toBe('영화·혼자');
    expect(p.favorites).toEqual([]);
    expect(p.favoritesMeta).toEqual([]);
    expect(p.watchReports).toEqual([]);
    expect(p.seenTitles).toEqual([]);
    expect(p.recCache).toEqual([]);
    expect(p.recFilteredCache).toEqual({});
    expect(p.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(p.context).toBeUndefined();
  });

  it('context 인자가 있으면 객체에 포함', () => {
    const p = createPersona('영화·혼자', {
      contentType: 'movie',
      companion: 'alone',
    });
    expect(p.context).toEqual({
      contentType: 'movie',
      companion: 'alone',
    });
  });

  it('tasteSummary 는 undefined (생성 시 미설정)', () => {
    const p = createPersona('default');
    expect(p.tasteSummary).toBeUndefined();
    expect(p.tasteSurveyAnswers).toBeUndefined();
  });
});

describe('updatePersona', () => {
  it('id 매칭 페르소나에 updater 적용 + updatedAt 갱신', () => {
    const before = [fixturePersona('a', 'A'), fixturePersona('b', 'B')];
    const after = updatePersona(before, 'a', (p) => ({
      ...p,
      favorites: ['기생충'],
    }));
    expect(after[0].favorites).toEqual(['기생충']);
    expect(after[0].updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
    expect(after[1]).toBe(before[1]); // 다른 페르소나는 동일 참조
  });

  it('id 미매칭 시 원본 배열 반환 (no-op)', () => {
    const before = [fixturePersona('a', 'A')];
    const after = updatePersona(before, 'nonexistent', (p) => p);
    expect(after).toBe(before);
  });

  it('tasteSummary 신규 필드 추가 가능', () => {
    const before = [fixturePersona('a', 'A')];
    const after = updatePersona(before, 'a', (p) => ({
      ...p,
      tasteSummary: '여운이 긴 작품을 좋아하는 사람입니다.',
    }));
    expect(after[0].tasteSummary).toBe(
      '여운이 긴 작품을 좋아하는 사람입니다.',
    );
  });
});

describe('deletePersona', () => {
  it('id 매칭 페르소나 제거', () => {
    const before = [
      fixturePersona('a', 'A'),
      fixturePersona('b', 'B'),
      fixturePersona('c', 'C'),
    ];
    const after = deletePersona(before, 'b');
    expect(after.map((p) => p.id)).toEqual(['a', 'c']);
  });

  it('id 미매칭 시 원본 배열 반환', () => {
    const before = [fixturePersona('a', 'A')];
    const after = deletePersona(before, 'nonexistent');
    expect(after).toEqual(before);
  });

  it('마지막 페르소나 삭제 시 default persona 자동 생성', () => {
    const before = [fixturePersona('a', 'A')];
    const after = deletePersona(before, 'a');
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(DEFAULT_PERSONA_ID);
    expect(after[0].name).toBe('기본');
    expect(after[0].favorites).toEqual([]);
  });
});

describe('canCreatePersona', () => {
  it(`personas.length < ${MAX_PERSONAS} 이면 true`, () => {
    expect(canCreatePersona([])).toBe(true);
    expect(canCreatePersona([fixturePersona('a', 'A')])).toBe(true);
    expect(
      canCreatePersona([fixturePersona('a', 'A'), fixturePersona('b', 'B')]),
    ).toBe(true);
  });

  it(`personas.length >= ${MAX_PERSONAS} 이면 false`, () => {
    const personas = Array.from({ length: MAX_PERSONAS }, (_, i) =>
      fixturePersona(`p${i}`, `P${i}`),
    );
    expect(canCreatePersona(personas)).toBe(false);
  });
});
