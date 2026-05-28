import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Persona, FavoriteMeta } from '../lib/types';
import {
  getPersonas,
  getActivePersonaId,
  getActivePersona,
  createPersona as storeCreatePersona,
  switchPersona as storeSwitchPersona,
  deletePersona as storeDeletePersona,
} from '../lib/store';

/**
 * PersonaContext — web `apps/web/src/contexts/PersonaContext.tsx` 의 native 포팅.
 *
 * 차이점:
 *   - web 은 localStorage 동기, native 는 AsyncStorage 비동기 → 모든 setter 가 async.
 *   - web 은 `migrateToPersonaV2()` 호출 (v1 flat key → v2 personas 마이그레이션).
 *     native 는 v1 단일 모델로 시작했고 페르소나 v2 마이그레이션 없음.
 *
 * 데이터 모델 결정 (W5 Task G):
 *   native 의 페르소나는 **metadata-only** — id/name/favorites/favoritesMeta 만 관리.
 *   watchReports / seenTitles / saved_items 는 single bucket 유지 (web 의 v1 sync
 *   limitation 과 정합 — 비-default persona 일 때 push 의 watch_reports skip 동일).
 *
 * 2026-05-28 — "1 생성 = 1 페르소나" 모델: 시드 페르소나('default'/'기본') 자동
 *   생성 제거. 페르소나 미생성 상태에서는 `personas=[]`, `activePersonaId=''`,
 *   `activePersona=null`. consumer 는 null 케이스 safe 처리 필요
 *   (DiscoverHeader chip 은 `personas.length > 1` 조건으로 이미 가드).
 *
 * 컴포넌트 마운트 시 비동기 refresh — 첫 paint 는 빈 상태, useEffect 완료 후 채워짐.
 * Provider 는 root layout 에 마운트, `usePersona()` 로 어디서나 접근.
 */

interface PersonaContextValue {
  personas: Persona[];
  activePersonaId: string;
  activePersona: Persona | null;
  switchPersona: (id: string) => Promise<void>;
  createPersona: (
    name: string,
    favorites: string[],
    favoritesMeta: FavoriteMeta[],
  ) => Promise<string | null>;
  deletePersona: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const PersonaContext = createContext<PersonaContextValue | null>(null);

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  // 시드 페르소나 제거(2026-05-28) — 'default' 폴백 대신 '' (페르소나 없음 의미).
  const [activePersonaId, setActivePersonaId] = useState('');
  const [activePersona, setActivePersona] = useState<Persona | null>(null);

  const refresh = useCallback(async () => {
    const [ps, id, active] = await Promise.all([
      getPersonas(),
      getActivePersonaId(),
      getActivePersona(),
    ]);
    setPersonas(ps);
    setActivePersonaId(id);
    setActivePersona(active);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSwitch = useCallback(
    async (id: string) => {
      await storeSwitchPersona(id);
      await refresh();
    },
    [refresh],
  );

  const handleCreate = useCallback(
    async (
      name: string,
      favorites: string[],
      favoritesMeta: FavoriteMeta[],
    ) => {
      const id = await storeCreatePersona(name, favorites, favoritesMeta);
      if (id) await refresh();
      return id;
    },
    [refresh],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await storeDeletePersona(id);
      await refresh();
    },
    [refresh],
  );

  return (
    <PersonaContext.Provider
      value={{
        personas,
        activePersonaId,
        activePersona,
        switchPersona: handleSwitch,
        createPersona: handleCreate,
        deletePersona: handleDelete,
        refresh,
      }}
    >
      {children}
    </PersonaContext.Provider>
  );
}

export function usePersona(): PersonaContextValue {
  const ctx = useContext(PersonaContext);
  if (!ctx) throw new Error('usePersona must be used within PersonaProvider');
  return ctx;
}
