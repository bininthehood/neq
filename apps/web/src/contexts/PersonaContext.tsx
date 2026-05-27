"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Persona, FavoriteMeta } from "../lib/types";
import {
  migrateToPersonaV2,
  getPersonas,
  getActivePersonaId,
  getActivePersona,
  createPersona as storeCreatePersona,
  switchPersona as storeSwitchPersona,
  deletePersona as storeDeletePersona,
} from "../lib/store";

interface PersonaContextValue {
  personas: Persona[];
  activePersonaId: string;
  activePersona: Persona | null;
  switchPersona: (id: string) => void;
  createPersona: (name: string, favorites: string[], favoritesMeta: FavoriteMeta[]) => string | null;
  deletePersona: (id: string) => void;
  refresh: () => void;
}

const PersonaContext = createContext<PersonaContextValue | null>(null);

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [activePersonaId, setActivePersonaId] = useState("default");
  const [activePersona, setActivePersona] = useState<Persona | null>(null);

  const refresh = useCallback(() => {
    setPersonas(getPersonas());
    setActivePersonaId(getActivePersonaId());
    setActivePersona(getActivePersona());
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect --
       mount-only persona V2 마이그레이션 + 초기 refresh (localStorage 읽기).
       SSR 에선 personas 접근 불가 → 정통 mount-effect 패턴.
       useSyncExternalStore 마이그레이션은 R19 sprint 후속에서 처리. */
    migrateToPersonaV2();
    refresh();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [refresh]);

  const handleSwitch = useCallback(
    (id: string) => {
      storeSwitchPersona(id);
      refresh();
    },
    [refresh],
  );

  const handleCreate = useCallback(
    (name: string, favorites: string[], favoritesMeta: FavoriteMeta[]) => {
      const id = storeCreatePersona(name, favorites, favoritesMeta);
      if (id) refresh();
      return id;
    },
    [refresh],
  );

  const handleDelete = useCallback(
    (id: string) => {
      storeDeletePersona(id);
      refresh();
    },
    [refresh],
  );

  return (
    <PersonaContext value={{
      personas,
      activePersonaId,
      activePersona,
      switchPersona: handleSwitch,
      createPersona: handleCreate,
      deletePersona: handleDelete,
      refresh,
    }}>
      {children}
    </PersonaContext>
  );
}

export function usePersona(): PersonaContextValue {
  const ctx = useContext(PersonaContext);
  if (!ctx) throw new Error("usePersona must be used within PersonaProvider");
  return ctx;
}
