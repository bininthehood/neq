import type {
  Recommendation,
  SavedItem,
  WatchReport,
  WatchReaction,
  UserDataExport,
  Persona,
  FavoriteMeta,
} from "./types";
import {
  createPersona as createPersonaCore,
  deletePersona as deletePersonaCore,
  getActivePersona as getActivePersonaCore,
  MAX_PERSONAS as MAX_PERSONAS_CORE,
  type PersonaContext,
  type TasteSurveyAnswer,
} from "@neq/core";
import { USER_DATA_SCHEMA_VERSION } from "./types";

export type { FavoriteMeta } from "./types";
import { getDeviceId } from "./device-id";

function safeParse<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

// === Subscribe pattern (R19 useSyncExternalStore 통합) ===
//
// store mutation 시 notify() 호출 → 등록된 listener 전체 실행.
// hooks/use-store-value.ts 의 useSaved/useWatchReports/... 가 구독.
// 같은 탭 안 reactive update 가 자동으로 컴포넌트에 반영됨.
//
// cross-tab sync 는 추후 storage event 통합 시 (Phase 3) 추가.

const listeners = new Set<() => void>();

export function subscribeStore(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function notifyStore(): void {
  listeners.forEach((cb) => cb());
}

// === localStorage keys ===

const PERSONAS_KEY = "neq_personas";
const ACTIVE_PERSONA_KEY = "neq_active_persona_id";
const MIGRATION_VERSION_KEY = "neq_migration_version";

// Global keys (not per-persona)
const SAVED_KEY = "neq_saved";
const ARCHIVE_KEY = "neq_archived";
const HISTORY_KEY = "neq_rec_history";

// Legacy flat keys (v1 — read during migration, then removed)
const FAVORITES_KEY = "neq_favorites";
const FAVORITES_META_KEY = "neq_favorites_meta";
const RECS_KEY = "neq_recommendations";
const RECS_FILTERED_PREFIX = "neq_recs_";
const REPORTS_KEY = "neq_watch_reports";
const SEEN_KEY = "neq_seen_titles";

const MAX_SEEN = 200;

// === Migration ===

let _migrated = false;

// id 8자 short id 정책 유지 (web v2 마이그레이션 기존 호환). packages/core 의
// createPersona 는 풀 UUID 를 생성하므로 결과를 받은 뒤 id 만 web 측에서 덮어쓴다.
// native store.ts 와 동일 wrapper 패턴 (PR 3 정합).
function createEmptyPersona(id: string, name: string): Persona {
  return { ...createPersonaCore(name), id };
}

export function migrateToPersonaV2() {
  if (typeof window === "undefined") return;
  if (_migrated) return;
  _migrated = true;

  const ver = safeParse<number>(MIGRATION_VERSION_KEY, 0);
  if (ver >= 2) return;

  const favorites = safeParse<string[]>(FAVORITES_KEY, []);
  const favoritesMeta = safeParse<FavoriteMeta[]>(FAVORITES_META_KEY, []);
  const watchReports = safeParse<WatchReport[]>(REPORTS_KEY, []);
  const seenTitles = safeParse<string[]>(SEEN_KEY, []);
  const recCache = safeParse<Recommendation[]>(RECS_KEY, []);

  const recFilteredCache: Record<string, Recommendation[]> = {};
  const filteredKeys = Object.keys(localStorage).filter((k) =>
    k.startsWith(RECS_FILTERED_PREFIX),
  );
  for (const k of filteredKeys) {
    recFilteredCache[k] = safeParse<Recommendation[]>(k, []);
  }

  const defaultPersona: Persona = {
    id: "default",
    name: "기본",
    favorites,
    favoritesMeta,
    watchReports,
    seenTitles,
    recCache,
    recFilteredCache,
  };

  localStorage.setItem(PERSONAS_KEY, JSON.stringify([defaultPersona]));
  localStorage.setItem(ACTIVE_PERSONA_KEY, JSON.stringify("default"));
  localStorage.setItem(MIGRATION_VERSION_KEY, JSON.stringify(2));

  // Remove legacy flat keys
  localStorage.removeItem(FAVORITES_KEY);
  localStorage.removeItem(FAVORITES_META_KEY);
  localStorage.removeItem(REPORTS_KEY);
  localStorage.removeItem(SEEN_KEY);
  localStorage.removeItem(RECS_KEY);
  for (const k of filteredKeys) {
    localStorage.removeItem(k);
  }
}

function ensureMigrated() {
  if (!_migrated) migrateToPersonaV2();
}

// === Persona CRUD ===

export function getPersonas(): Persona[] {
  if (typeof window === "undefined") return [];
  ensureMigrated();
  return safeParse<Persona[]>(PERSONAS_KEY, []);
}

export function setPersonas(personas: Persona[]) {
  localStorage.setItem(PERSONAS_KEY, JSON.stringify(personas));
  notifyStore();
}

export function getActivePersonaId(): string {
  if (typeof window === "undefined") return "default";
  ensureMigrated();
  return safeParse<string>(ACTIVE_PERSONA_KEY, "default");
}

export function setActivePersonaId(id: string) {
  localStorage.setItem(ACTIVE_PERSONA_KEY, JSON.stringify(id));
  notifyStore();
}

export function getActivePersona(): Persona {
  ensureMigrated();
  const personas = getPersonas();
  const activeId = getActivePersonaId();
  return (
    getActivePersonaCore(personas, activeId) ??
    createEmptyPersona("default", "기본")
  );
}

function updateActivePersona(updater: (p: Persona) => Persona) {
  const personas = getPersonas();
  const activeId = getActivePersonaId();
  const idx = personas.findIndex((p) => p.id === activeId);
  if (idx === -1) return;
  personas[idx] = {
    ...updater(personas[idx]),
    // v2: 모든 mutation 시 updatedAt 자동 갱신 (Last-write-wins 정책)
    updatedAt: new Date().toISOString(),
  };
  setPersonas(personas);
}

/**
 * 페르소나 v2 — 기존 페르소나의 tasteSummary 갱신 ("취향 설문 다시 받기" 시).
 * 호출자가 personaId 명시. id 미존재 시 no-op.
 */
export function updatePersonaTasteSummary(
  personaId: string,
  tasteSummary: string,
  tasteSurveyAnswers?: TasteSurveyAnswer[],
) {
  const personas = getPersonas();
  const idx = personas.findIndex((p) => p.id === personaId);
  if (idx === -1) return;
  personas[idx] = {
    ...personas[idx],
    tasteSummary,
    ...(tasteSurveyAnswers ? { tasteSurveyAnswers } : {}),
    updatedAt: new Date().toISOString(),
  };
  setPersonas(personas);
}

/**
 * 페르소나 신규 생성. v2 (2026-05-24 design doc) — extras 인자로 LLM 동적
 * 설문 결과 (tasteSummary / tasteSurveyAnswers / context) 전달 가능. 기존
 * 호출자 (favorites + favoritesMeta 만) 영향 0 (extras 는 optional).
 * packages/core wrapper 패턴 (native store.ts 정합).
 */
export function createPersona(
  name: string,
  favorites: string[],
  favoritesMeta: FavoriteMeta[],
  extras?: {
    tasteSummary?: string;
    tasteSurveyAnswers?: TasteSurveyAnswer[];
    context?: PersonaContext;
  },
): string | null {
  const personas = getPersonas();
  if (personas.length >= MAX_PERSONAS_CORE) return null;
  const id = crypto.randomUUID().slice(0, 8);
  const persona: Persona = {
    ...createPersonaCore(name),
    id,
    favorites,
    favoritesMeta,
    ...(extras?.tasteSummary ? { tasteSummary: extras.tasteSummary } : {}),
    ...(extras?.tasteSurveyAnswers
      ? { tasteSurveyAnswers: extras.tasteSurveyAnswers }
      : {}),
    ...(extras?.context ? { context: extras.context } : {}),
  };
  personas.push(persona);
  setPersonas(personas);
  return id;
}

export function switchPersona(id: string) {
  const personas = getPersonas();
  if (!personas.some((p) => p.id === id)) return;
  setActivePersonaId(id);
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem("neq_top_idx");
    const sessionKeys = Object.keys(sessionStorage).filter(
      (k) => k.startsWith("neq_filter_") || k.startsWith("neq_ott_"),
    );
    for (const k of sessionKeys) {
      sessionStorage.removeItem(k);
    }
  }
}

export function deletePersona(id: string) {
  const current = getPersonas();
  const personas = deletePersonaCore(current, id);
  // packages/core 의 deletePersona 가 빈 결과 시 default persona 1개 시드.
  setPersonas(personas);
  if (getActivePersonaId() === id) {
    setActivePersonaId(personas[0].id);
  }
}

// === Favorites (per-persona) ===

export function getFavorites(): string[] {
  if (typeof window === "undefined") return [];
  return getActivePersona().favorites;
}

export function setFavorites(titles: string[]) {
  updateActivePersona((p) => ({ ...p, favorites: titles }));
}

export function getFavoritesMeta(): FavoriteMeta[] {
  if (typeof window === "undefined") return [];
  return getActivePersona().favoritesMeta;
}

export function setFavoritesMeta(items: FavoriteMeta[]) {
  updateActivePersona((p) => ({ ...p, favoritesMeta: items }));
}

export function hasOnboarded(): boolean {
  if (typeof window === "undefined") return false;
  ensureMigrated();
  // 명시 완료 플래그 우선 (cold_start_v1 호환 — favorites 빈 케이스도 인정)
  if (localStorage.getItem("neq_onboarded") === "true") return true;
  // backward compat: favorites >= 3 (기존 사용자 데이터)
  const personas = getPersonas();
  return personas.some((p) => p.favorites.length >= 3);
}

// === Recommendations (per-persona) ===

function filterCacheKey(ft: string, fo: string): string {
  return `${RECS_FILTERED_PREFIX}${ft}_${fo}`;
}

export function getRecommendations(ft = "all", fo = "all"): Recommendation[] {
  if (typeof window === "undefined") return [];
  const persona = getActivePersona();
  if (ft === "all" && fo === "all") return persona.recCache;
  return persona.recFilteredCache[filterCacheKey(ft, fo)] ?? [];
}

export function setRecommendations(recs: Recommendation[], ft = "all", fo = "all") {
  if (ft === "all" && fo === "all") {
    updateActivePersona((p) => ({ ...p, recCache: recs }));
  } else {
    updateActivePersona((p) => ({
      ...p,
      recFilteredCache: {
        ...p.recFilteredCache,
        [filterCacheKey(ft, fo)]: recs,
      },
    }));
  }
}

export function clearAllRecommendations() {
  if (typeof window === "undefined") return;
  updateActivePersona((p) => ({
    ...p,
    recCache: [],
    recFilteredCache: {},
  }));
}

// === Saved (global) ===

export function getSaved(): SavedItem[] {
  if (typeof window === "undefined") return [];
  return safeParse<SavedItem[]>(SAVED_KEY, []);
}

export function addSaved(rec: Recommendation) {
  const saved = getSaved();
  if (saved.some((s) => s.recommendation.tmdbId === rec.tmdbId)) return;
  saved.push({ recommendation: rec, savedAt: Date.now() });
  localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  notifyStore();
}

export function removeSaved(tmdbId: number) {
  const saved = getSaved().filter((s) => s.recommendation.tmdbId !== tmdbId);
  localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  notifyStore();
}

// === Watch Reports (per-persona) ===

export function getWatchReports(): WatchReport[] {
  if (typeof window === "undefined") return [];
  return getActivePersona().watchReports;
}

export function getWatchReport(tmdbId: number): WatchReport | undefined {
  return getWatchReports().find((r) => r.tmdbId === tmdbId);
}

export function addWatchReport(tmdbId: number, reaction: WatchReaction) {
  const activeId = getActivePersonaId();
  updateActivePersona((p) => ({
    ...p,
    watchReports: [
      ...p.watchReports.filter((r) => r.tmdbId !== tmdbId),
      { tmdbId, reaction, reportedAt: Date.now(), contextId: activeId },
    ],
  }));
}

export function removeWatchReport(tmdbId: number) {
  updateActivePersona((p) => ({
    ...p,
    watchReports: p.watchReports.filter((r) => r.tmdbId !== tmdbId),
  }));
}

export function getWatchStats() {
  const reports = getWatchReports();
  return {
    total: reports.length,
    loved: reports.filter((r) => r.reaction === "loved").length,
    good: reports.filter((r) => r.reaction === "good").length,
    meh: reports.filter((r) => r.reaction === "meh").length,
    dropped: reports.filter((r) => r.reaction === "dropped").length,
  };
}

// === Archive (global) ===

export function getArchivedIds(): number[] {
  if (typeof window === "undefined") return [];
  return safeParse<number[]>(ARCHIVE_KEY, []);
}

export function archiveItem(tmdbId: number) {
  const ids = getArchivedIds();
  if (!ids.includes(tmdbId)) {
    ids.push(tmdbId);
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(ids));
    notifyStore();
  }
}

export function unarchiveItem(tmdbId: number) {
  const ids = getArchivedIds().filter((id) => id !== tmdbId);
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(ids));
  notifyStore();
}

// === Rec History (global) ===

const MAX_HISTORY = 100;

export interface RecHistoryEntry {
  title: string;
  tmdbId: number;
  posterUrl: string | null;
  date: string;
  type?: "movie" | "series" | "variety";
}

export function getRecHistory(): RecHistoryEntry[] {
  if (typeof window === "undefined") return [];
  return safeParse<RecHistoryEntry[]>(HISTORY_KEY, []);
}

export function addRecHistory(
  recs: { title: string; tmdbId: number; posterUrl: string | null; type?: "movie" | "series" | "variety" }[],
) {
  const existing = getRecHistory();
  const existingIds = new Set(existing.map((e) => e.tmdbId));
  const date = new Date().toISOString().slice(0, 10);
  const newEntries = recs
    .filter((r) => !existingIds.has(r.tmdbId))
    .map((r) => ({ ...r, date }));
  const updated = [...newEntries, ...existing].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  notifyStore();
}

// === Seen Titles (per-persona) ===

export function getSeenTitles(): string[] {
  if (typeof window === "undefined") return [];
  return getActivePersona().seenTitles;
}

export function addSeenTitles(titles: string[]) {
  updateActivePersona((p) => ({
    ...p,
    seenTitles: [...new Set([...p.seenTitles, ...titles])].slice(-MAX_SEEN),
  }));
}

export function clearSeenTitles() {
  updateActivePersona((p) => ({ ...p, seenTitles: [] }));
}

// === Export / Import ===

export function exportUserData(): UserDataExport {
  ensureMigrated();
  return {
    version: USER_DATA_SCHEMA_VERSION,
    deviceId: getDeviceId(),
    exportedAt: Date.now(),
    data: {
      favorites: [],
      saved: getSaved(),
      watchReports: [],
      seenTitles: [],
      archived: getArchivedIds(),
      personas: getPersonas(),
      activePersonaId: getActivePersonaId(),
    },
  };
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  counts?: {
    favorites: number;
    saved: number;
    watchReports: number;
    seenTitles: number;
    archived: number;
  };
}

export function importUserData(raw: unknown): ImportResult {
  if (typeof window === "undefined") return { ok: false, error: "window unavailable" };

  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "올바르지 않은 파일 형식이에요" };
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.version !== "number") {
    return { ok: false, error: "버전 정보가 없어요" };
  }
  if (obj.version > USER_DATA_SCHEMA_VERSION) {
    return { ok: false, error: "더 최신 버전의 데이터에요. 앱을 업데이트해주세요" };
  }
  const data = obj.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== "object") {
    return { ok: false, error: "데이터 필드가 없어요" };
  }

  const saved = Array.isArray(data.saved) ? (data.saved as SavedItem[]) : [];
  const archived = Array.isArray(data.archived) ? (data.archived as number[]) : [];

  if (obj.version >= 2 && Array.isArray(data.personas)) {
    // v2 import: restore personas directly
    const personas = data.personas as Persona[];
    const activeId = typeof data.activePersonaId === "string" ? data.activePersonaId : "default";
    setPersonas(personas);
    setActivePersonaId(activeId);
    localStorage.setItem(MIGRATION_VERSION_KEY, JSON.stringify(2));
    _migrated = true;
  } else {
    // v1 import: wrap in default persona
    const watchReports = Array.isArray(data.watchReports) ? (data.watchReports as WatchReport[]) : [];
    const seenTitles = Array.isArray(data.seenTitles) ? (data.seenTitles as string[]) : [];
    const favorites = Array.isArray(data.favorites) ? (data.favorites as string[]) : [];

    const defaultPersona = createEmptyPersona("default", "기본");
    defaultPersona.favorites = favorites;
    defaultPersona.watchReports = watchReports;
    defaultPersona.seenTitles = seenTitles;

    setPersonas([defaultPersona]);
    setActivePersonaId("default");
    localStorage.setItem(MIGRATION_VERSION_KEY, JSON.stringify(2));
    _migrated = true;
  }

  localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archived));
  notifyStore();

  const personas = getPersonas();
  const totalWatchReports = personas.reduce((n, p) => n + p.watchReports.length, 0);
  const totalSeenTitles = personas.reduce((n, p) => n + p.seenTitles.length, 0);
  const totalFavorites = personas.reduce((n, p) => n + p.favorites.length, 0);

  return {
    ok: true,
    counts: {
      favorites: totalFavorites,
      saved: saved.length,
      watchReports: totalWatchReports,
      seenTitles: totalSeenTitles,
      archived: archived.length,
    },
  };
}

export function clearAllUserData() {
  if (typeof window === "undefined") return;
  const keysToRemove = [
    PERSONAS_KEY,
    ACTIVE_PERSONA_KEY,
    MIGRATION_VERSION_KEY,
    SAVED_KEY,
    ARCHIVE_KEY,
    HISTORY_KEY,
    // Legacy keys (in case migration never ran)
    FAVORITES_KEY,
    FAVORITES_META_KEY,
    REPORTS_KEY,
    SEEN_KEY,
    RECS_KEY,
    "neq_first_discover_done",
    "neq_tutorial_seen",
  ];
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  Object.keys(localStorage)
    .filter((k) => k.startsWith(RECS_FILTERED_PREFIX))
    .forEach((k) => localStorage.removeItem(k));
  sessionStorage.removeItem("neq_top_idx");
  _migrated = false;
  notifyStore();
}
