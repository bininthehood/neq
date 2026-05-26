/**
 * REGRESSION (CRITICAL — IRON RULE) — Persona v2 신규 필드 추가가
 * 기존 sync / store 동작에 영향 없는지 확인.
 *
 * 배경 (design doc 2026-05-24 v2 + plan-eng-review §484-485):
 * - Persona interface 에 tasteSummary / tasteSurveyAnswers / context / updatedAt
 *   네 필드 추가. 기존 페르소나는 이 필드가 undefined.
 * - PR 2-b 에선 persona 자체의 Supabase sync 는 별도 column/table 미구축으로
 *   defer (PR 3+ 또는 후속 migration). 대신 sync 파이프라인이 v2 필드 보유
 *   persona 와 공존해도 회귀 없는지 본 spec 으로 확정.
 *
 * 검증:
 *  - legacy persona (v1 fields only) + v2 persona 가 같은 personas 배열에 공존
 *  - createPersona(extras) 가 v2 필드 채움 + 기존 호출 (extras 없음) 영향 0
 *  - updatePersonaTasteSummary 가 target persona 만 갱신
 *  - localStorage round-trip 시 v2 필드 보존
 *  - getActivePersonaId / setPersonas 등 sync.ts 가 의존하는 헬퍼는 v2 필드 무관 동작
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

async function loadStore() {
  return await import('../store');
}

let uuidCounter = 0;
vi.stubGlobal('crypto', {
  ...globalThis.crypto,
  randomUUID: () => {
    uuidCounter++;
    // createPersona 가 slice(0, 8) 로 id 를 만들므로 앞 8자리를 고유하게.
    const hex = String(uuidCounter).padStart(8, 'a');
    return `${hex}-0000-0000-0000-000000000000`;
  },
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  uuidCounter = 0;
  vi.resetModules();
});

describe('Persona v2 신규 필드 — legacy 호환 (IRON RULE)', () => {
  it('legacy persona (v1 fields only) 가 그대로 로드된다', async () => {
    // v2 migration 진행한 default persona (v1 필드만)
    localStorage.setItem('neq_migration_version', JSON.stringify(2));
    const legacyPersona = {
      id: 'default',
      name: '기본',
      favorites: ['기생충'],
      favoritesMeta: [],
      watchReports: [],
      seenTitles: [],
      recCache: [],
      recFilteredCache: {},
      // tasteSummary / tasteSurveyAnswers / context / updatedAt 의도적 omit
    };
    localStorage.setItem('neq_personas', JSON.stringify([legacyPersona]));
    localStorage.setItem('neq_active_persona_id', JSON.stringify('default'));

    const store = await loadStore();
    const personas = store.getPersonas();
    expect(personas).toHaveLength(1);
    const p = personas[0];
    expect(p.id).toBe('default');
    expect(p.tasteSummary).toBeUndefined();
    expect(p.tasteSurveyAnswers).toBeUndefined();
    expect(p.context).toBeUndefined();
    expect(p.updatedAt).toBeUndefined();
    // 기존 동작 보존
    expect(store.getActivePersonaId()).toBe('default');
    expect(store.getActivePersona().favorites).toEqual(['기생충']);
  });

  it('createPersona(extras) 가 v2 필드를 채우고 기존 호출 시 누락 안 함', async () => {
    localStorage.setItem('neq_migration_version', JSON.stringify(2));
    localStorage.setItem('neq_personas', JSON.stringify([
      {
        id: 'default',
        name: '기본',
        favorites: [],
        favoritesMeta: [],
        watchReports: [],
        seenTitles: [],
        recCache: [],
        recFilteredCache: {},
      },
    ]));
    localStorage.setItem('neq_active_persona_id', JSON.stringify('default'));

    const store = await loadStore();

    // 신규 호출 — extras 동봉
    const newId = store.createPersona('영화 · 혼자', [], [], {
      tasteSummary: '천천히 깊게 보는 한국 영화 팬',
      tasteSurveyAnswers: [{ question: '페이스?', selectedOption: '천천히 깊게' }],
      context: { contentType: 'movie', companion: 'alone' },
    });
    expect(newId).toBeTruthy();

    // 기존 호출 — extras 없음 (회귀: 신규 필드 없이도 호출 성공)
    const legacyId = store.createPersona('레거시', ['타이타닉'], []);
    expect(legacyId).toBeTruthy();

    const personas = store.getPersonas();
    expect(personas).toHaveLength(3); // default + 신규 2

    const newP = personas.find((p) => p.id === newId);
    expect(newP?.tasteSummary).toBe('천천히 깊게 보는 한국 영화 팬');
    expect(newP?.context).toEqual({ contentType: 'movie', companion: 'alone' });
    expect(newP?.updatedAt).toBeTruthy();
    expect(newP?.tasteSurveyAnswers?.length).toBe(1);

    const legacyP = personas.find((p) => p.id === legacyId);
    expect(legacyP?.tasteSummary).toBeUndefined();
    expect(legacyP?.tasteSurveyAnswers).toBeUndefined();
    expect(legacyP?.context).toBeUndefined();
    // updatedAt 은 모든 신규 페르소나에 stamp (sync 정책)
    expect(legacyP?.updatedAt).toBeTruthy();
  });

  it('updatePersonaTasteSummary 가 target persona 만 갱신, 다른 페르소나 영향 0', async () => {
    localStorage.setItem('neq_migration_version', JSON.stringify(2));
    localStorage.setItem('neq_personas', JSON.stringify([
      {
        id: 'default',
        name: '기본',
        favorites: [],
        favoritesMeta: [],
        watchReports: [],
        seenTitles: [],
        recCache: [],
        recFilteredCache: {},
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'p2',
        name: '영화',
        favorites: [],
        favoritesMeta: [],
        watchReports: [],
        seenTitles: [],
        recCache: [],
        recFilteredCache: {},
        tasteSummary: '기존 요약',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]));

    const store = await loadStore();
    store.updatePersonaTasteSummary('p2', '갱신된 요약', [
      { question: 'Q?', selectedOption: 'A' },
    ]);

    const personas = store.getPersonas();
    const p2 = personas.find((p) => p.id === 'p2')!;
    expect(p2.tasteSummary).toBe('갱신된 요약');
    expect(p2.tasteSurveyAnswers?.length).toBe(1);
    expect(p2.updatedAt).not.toBe('2026-01-01T00:00:00Z');

    // default 영향 0
    const defaultP = personas.find((p) => p.id === 'default')!;
    expect(defaultP.tasteSummary).toBeUndefined();
    expect(defaultP.updatedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('updatePersonaTasteSummary 가 존재하지 않는 personaId 에 no-op', async () => {
    localStorage.setItem('neq_migration_version', JSON.stringify(2));
    localStorage.setItem('neq_personas', JSON.stringify([
      {
        id: 'default',
        name: '기본',
        favorites: [],
        favoritesMeta: [],
        watchReports: [],
        seenTitles: [],
        recCache: [],
        recFilteredCache: {},
      },
    ]));

    const store = await loadStore();
    // 미존재 id — throw 없이 no-op
    expect(() =>
      store.updatePersonaTasteSummary('nonexistent', 'x'),
    ).not.toThrow();
    expect(store.getPersonas()[0].tasteSummary).toBeUndefined();
  });

  it('localStorage round-trip 시 v2 필드 보존 (JSON 직렬화/역직렬화)', async () => {
    localStorage.setItem('neq_migration_version', JSON.stringify(2));
    const personaWithV2 = {
      id: 'p1',
      name: '영화 · 혼자',
      favorites: [],
      favoritesMeta: [],
      watchReports: [],
      seenTitles: [],
      recCache: [],
      recFilteredCache: {},
      tasteSummary: '한국어 자모 ㄱㄴㄷ 보존 테스트 — 따뜻한 영화',
      tasteSurveyAnswers: [
        { question: '페이스?', selectedOption: '천천히' },
        { question: '결말?', selectedOption: '여운' },
      ],
      context: { contentType: 'movie', companion: 'alone' },
      updatedAt: '2026-05-24T12:00:00.000Z',
    };
    localStorage.setItem('neq_personas', JSON.stringify([personaWithV2]));

    const store = await loadStore();
    const loaded = store.getPersonas()[0];
    expect(loaded.tasteSummary).toBe(personaWithV2.tasteSummary);
    expect(loaded.tasteSurveyAnswers).toEqual(personaWithV2.tasteSurveyAnswers);
    expect(loaded.context).toEqual(personaWithV2.context);
    expect(loaded.updatedAt).toBe(personaWithV2.updatedAt);
  });

  it('legacy + v2 페르소나 공존 — 활성/삭제 동작 정상', async () => {
    localStorage.setItem('neq_migration_version', JSON.stringify(2));
    localStorage.setItem('neq_personas', JSON.stringify([
      {
        id: 'default',
        name: '기본',
        favorites: ['legacy'],
        favoritesMeta: [],
        watchReports: [],
        seenTitles: [],
        recCache: [],
        recFilteredCache: {},
      },
      {
        id: 'p2',
        name: '영화',
        favorites: ['v2'],
        favoritesMeta: [],
        watchReports: [],
        seenTitles: [],
        recCache: [],
        recFilteredCache: {},
        tasteSummary: '요약',
        context: { contentType: 'movie', companion: 'alone' },
        updatedAt: '2026-05-24T00:00:00Z',
      },
    ]));
    localStorage.setItem('neq_active_persona_id', JSON.stringify('default'));

    const store = await loadStore();
    expect(store.getActivePersona().favorites).toEqual(['legacy']);

    store.switchPersona('p2');
    expect(store.getActivePersonaId()).toBe('p2');
    expect(store.getActivePersona().tasteSummary).toBe('요약');

    // legacy 삭제 후에도 v2 페르소나 정상
    store.deletePersona('default');
    const personas = store.getPersonas();
    expect(personas).toHaveLength(1);
    expect(personas[0].id).toBe('p2');
    expect(personas[0].tasteSummary).toBe('요약');
  });

  it('sync.ts 가 의존하는 getActivePersonaId 는 v2 필드와 무관하게 동작', async () => {
    localStorage.setItem('neq_migration_version', JSON.stringify(2));
    localStorage.setItem('neq_personas', JSON.stringify([
      {
        id: 'default',
        name: '기본',
        favorites: [],
        favoritesMeta: [],
        watchReports: [],
        seenTitles: [],
        recCache: [],
        recFilteredCache: {},
        tasteSummary: '있어도',
        updatedAt: '2026-05-24T00:00:00Z',
      },
    ]));
    localStorage.setItem('neq_active_persona_id', JSON.stringify('default'));

    const store = await loadStore();
    // sync.ts pushToServer / pullFromServer 의 default-only 분기 조건이 그대로 동작.
    expect(store.getActivePersonaId()).toBe('default');
  });
});
