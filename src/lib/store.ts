import type {
  Recommendation,
  SavedItem,
  WatchReport,
  WatchReaction,
  UserDataExport,
} from "./types";
import { USER_DATA_SCHEMA_VERSION } from "./types";
import { getDeviceId } from "./device-id";

function safeParse<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

const FAVORITES_KEY = "neq_favorites";
const FAVORITES_META_KEY = "neq_favorites_meta";
const SAVED_KEY = "neq_saved";
const RECS_KEY = "neq_recommendations";
const RECS_FILTERED_PREFIX = "neq_recs_";

export interface FavoriteMeta {
  id: number;
  title: string;
  posterUrl: string | null;
}

// 온보딩에서 선택한 좋아하는 작품
export function getFavorites(): string[] {
  if (typeof window === "undefined") return [];
  return safeParse<string[]>(FAVORITES_KEY, []);
}

export function setFavorites(titles: string[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(titles));
}

export function getFavoritesMeta(): FavoriteMeta[] {
  if (typeof window === "undefined") return [];
  return safeParse<FavoriteMeta[]>(FAVORITES_META_KEY, []);
}

export function setFavoritesMeta(items: FavoriteMeta[]) {
  localStorage.setItem(FAVORITES_META_KEY, JSON.stringify(items));
}

// 추천 목록 — 필터별 캐시
function filterKey(filterType: string, filterOrigin: string): string {
  return `${RECS_FILTERED_PREFIX}${filterType}_${filterOrigin}`;
}

export function getRecommendations(ft = "all", fo = "all"): Recommendation[] {
  if (typeof window === "undefined") return [];
  const key = ft === "all" && fo === "all" ? RECS_KEY : filterKey(ft, fo);
  return safeParse<Recommendation[]>(key, []);
}

export function setRecommendations(recs: Recommendation[], ft = "all", fo = "all") {
  const key = ft === "all" && fo === "all" ? RECS_KEY : filterKey(ft, fo);
  localStorage.setItem(key, JSON.stringify(recs));
}

export function clearAllRecommendations() {
  if (typeof window === "undefined") return;
  const keys = Object.keys(localStorage).filter(
    (k) => k === RECS_KEY || k.startsWith(RECS_FILTERED_PREFIX)
  );
  keys.forEach((k) => localStorage.removeItem(k));
}

// 저장한 작품
export function getSaved(): SavedItem[] {
  if (typeof window === "undefined") return [];
  return safeParse<SavedItem[]>(SAVED_KEY, []);
}

export function addSaved(rec: Recommendation) {
  const saved = getSaved();
  if (saved.some((s) => s.recommendation.tmdbId === rec.tmdbId)) return;
  saved.push({ recommendation: rec, savedAt: Date.now() });
  localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
}

export function removeSaved(tmdbId: number) {
  const saved = getSaved().filter((s) => s.recommendation.tmdbId !== tmdbId);
  localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
}

export function hasOnboarded(): boolean {
  if (typeof window === "undefined") return false;
  return getFavorites().length >= 3;
}

// 시청 리포트
const REPORTS_KEY = "neq_watch_reports";

export function getWatchReports(): WatchReport[] {
  if (typeof window === "undefined") return [];
  return safeParse<WatchReport[]>(REPORTS_KEY, []);
}

export function getWatchReport(tmdbId: number): WatchReport | undefined {
  return getWatchReports().find((r) => r.tmdbId === tmdbId);
}

export function addWatchReport(tmdbId: number, reaction: WatchReaction) {
  const reports = getWatchReports().filter((r) => r.tmdbId !== tmdbId);
  reports.push({ tmdbId, reaction, reportedAt: Date.now() });
  localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
}

export function removeWatchReport(tmdbId: number) {
  const reports = getWatchReports().filter((r) => r.tmdbId !== tmdbId);
  localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
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

// 아카이브 (시청 완료 후 숨긴 작품)
const ARCHIVE_KEY = "neq_archived";

export function getArchivedIds(): number[] {
  if (typeof window === "undefined") return [];
  return safeParse<number[]>(ARCHIVE_KEY, []);
}

export function archiveItem(tmdbId: number) {
  const ids = getArchivedIds();
  if (!ids.includes(tmdbId)) {
    ids.push(tmdbId);
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(ids));
  }
}

export function unarchiveItem(tmdbId: number) {
  const ids = getArchivedIds().filter((id) => id !== tmdbId);
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(ids));
}

// 추천 히스토리 — 과거 추천 기록
const HISTORY_KEY = "neq_rec_history";
const MAX_HISTORY = 100;

export interface RecHistoryEntry {
  title: string;
  tmdbId: number;
  posterUrl: string | null;
  date: string; // ISO date
}

export function getRecHistory(): RecHistoryEntry[] {
  if (typeof window === "undefined") return [];
  return safeParse<RecHistoryEntry[]>(HISTORY_KEY, []);
}

export function addRecHistory(recs: { title: string; tmdbId: number; posterUrl: string | null }[]) {
  const existing = getRecHistory();
  const existingIds = new Set(existing.map((e) => e.tmdbId));
  const date = new Date().toISOString().slice(0, 10);
  const newEntries = recs
    .filter((r) => !existingIds.has(r.tmdbId))
    .map((r) => ({ ...r, date }));
  const updated = [...newEntries, ...existing].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}

// 지나간 작품 (스와이프로 넘긴 제목들) — 재추천 방지
const SEEN_KEY = "neq_seen_titles";
const MAX_SEEN = 200; // 최대 저장 수

export function getSeenTitles(): string[] {
  if (typeof window === "undefined") return [];
  return safeParse<string[]>(SEEN_KEY, []);
}

export function addSeenTitles(titles: string[]) {
  const seen = getSeenTitles();
  const updated = [...new Set([...seen, ...titles])].slice(-MAX_SEEN);
  localStorage.setItem(SEEN_KEY, JSON.stringify(updated));
}

export function clearSeenTitles() {
  localStorage.removeItem(SEEN_KEY);
}

// ============================================================
// 데이터 내보내기/가져오기 — 백엔드 sync API와 동일한 스키마
// ============================================================

export function exportUserData(): UserDataExport {
  return {
    version: USER_DATA_SCHEMA_VERSION,
    deviceId: getDeviceId(),
    exportedAt: Date.now(),
    data: {
      favorites: getFavorites(),
      saved: getSaved(),
      watchReports: getWatchReports(),
      seenTitles: getSeenTitles(),
      archived: getArchivedIds(),
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

/**
 * JSON을 읽어 localStorage에 복원한다.
 * - 버전 체크
 * - 필수 필드 검증
 * - 실패 시 현재 데이터 유지 (원자적 동작)
 */
export function importUserData(raw: unknown): ImportResult {
  if (typeof window === "undefined") return { ok: false, error: "window unavailable" };

  // 기본 구조 검증
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

  // 배열 검증 (없는 필드는 빈 배열로 처리)
  const favorites = Array.isArray(data.favorites) ? (data.favorites as string[]) : [];
  const saved = Array.isArray(data.saved) ? (data.saved as SavedItem[]) : [];
  const watchReports = Array.isArray(data.watchReports) ? (data.watchReports as WatchReport[]) : [];
  const seenTitles = Array.isArray(data.seenTitles) ? (data.seenTitles as string[]) : [];
  const archived = Array.isArray(data.archived) ? (data.archived as number[]) : [];

  // localStorage에 덮어쓰기
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  localStorage.setItem(REPORTS_KEY, JSON.stringify(watchReports));
  localStorage.setItem(SEEN_KEY, JSON.stringify(seenTitles));
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archived));

  return {
    ok: true,
    counts: {
      favorites: favorites.length,
      saved: saved.length,
      watchReports: watchReports.length,
      seenTitles: seenTitles.length,
      archived: archived.length,
    },
  };
}

/** 모든 사용자 데이터 초기화 (디바이스 ID는 유지) */
export function clearAllUserData() {
  if (typeof window === "undefined") return;
  const keysToRemove = [
    FAVORITES_KEY,
    SAVED_KEY,
    REPORTS_KEY,
    SEEN_KEY,
    ARCHIVE_KEY,
    HISTORY_KEY,
    RECS_KEY,
  ];
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  // 필터별 캐시도 제거
  Object.keys(localStorage)
    .filter((k) => k.startsWith(RECS_FILTERED_PREFIX))
    .forEach((k) => localStorage.removeItem(k));
}
