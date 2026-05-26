/**
 * Persona pure helpers (storage 의존 X).
 *
 * 2026-05-24 design doc (LLM 동적 취향 설문 v2) plan-eng-review #2 결정:
 * web/native store.ts 의 중복 헬퍼를 packages/core 로 끌어올림. 3 단계 PR
 * (outside voice MED #3) 의 PR 1 산출물.
 *
 * 모든 mutation 함수는 새 Persona 배열을 반환 (불변). updatedAt 은 클라
 * timestamp 로 stamp 하되, Supabase push 시 서버 now() 가 권위 (outside voice
 * HIGH #2 — clock skew 차단). 따라서 클라 updatedAt 은 hint, sync 후 서버
 * 값으로 덮어쓴다.
 */
import type { Persona, PersonaContext } from './types';

export const MAX_PERSONAS = 3;
export const DEFAULT_PERSONA_ID = 'default';
export const DEFAULT_PERSONA_NAME = '기본';

/**
 * personas 배열에서 activeId 와 일치하는 페르소나 반환.
 * 없으면 첫 번째 페르소나, 그것도 없으면 undefined.
 */
export function getActivePersona(
  personas: Persona[],
  activeId: string | null | undefined,
): Persona | undefined {
  if (personas.length === 0) return undefined;
  if (activeId) {
    const found = personas.find((p) => p.id === activeId);
    if (found) return found;
  }
  return personas[0];
}

/**
 * 신규 Persona 객체 생성 (id = crypto.randomUUID, 빈 배열로 초기화).
 * storage 와 무관 — 호출자가 setPersonas / push 로 저장.
 */
export function createPersona(
  name: string,
  context?: PersonaContext,
): Persona {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    favorites: [],
    favoritesMeta: [],
    watchReports: [],
    seenTitles: [],
    recCache: [],
    recFilteredCache: {},
    ...(context ? { context } : {}),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * personas 배열에서 id 매칭 페르소나에 updater 적용 후 새 배열 반환.
 * id 미존재 시 원본 배열 그대로 반환 (no-op). updatedAt 자동 갱신.
 */
export function updatePersona(
  personas: Persona[],
  id: string,
  updater: (p: Persona) => Persona,
): Persona[] {
  const idx = personas.findIndex((p) => p.id === id);
  if (idx === -1) return personas;
  const updated = updater(personas[idx]);
  const next = [...personas];
  next[idx] = { ...updated, updatedAt: new Date().toISOString() };
  return next;
}

/**
 * personas 배열에서 id 매칭 페르소나 제거 후 새 배열 반환.
 * 결과가 빈 배열이면 default persona 1개를 자동 생성 (앱이 항상 1개 이상 보유).
 */
export function deletePersona(personas: Persona[], id: string): Persona[] {
  const next = personas.filter((p) => p.id !== id);
  if (next.length === 0) {
    return [
      {
        id: DEFAULT_PERSONA_ID,
        name: DEFAULT_PERSONA_NAME,
        favorites: [],
        favoritesMeta: [],
        watchReports: [],
        seenTitles: [],
        recCache: [],
        recFilteredCache: {},
        updatedAt: new Date().toISOString(),
      },
    ];
  }
  return next;
}

/**
 * MAX_PERSONAS 도달 여부 체크 (UI 비활성화 / 차단 결정용).
 */
export function canCreatePersona(personas: Persona[]): boolean {
  return personas.length < MAX_PERSONAS;
}
