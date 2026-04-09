import type { Recommendation, SavedItem, WatchReport, WatchReaction } from "./types";

function safeParse<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

const FAVORITES_KEY = "neko_favorites";
const SAVED_KEY = "neko_saved";
const RECS_KEY = "neko_recommendations";
const RECS_FILTERED_PREFIX = "neko_recs_";

// 온보딩에서 선택한 좋아하는 작품
export function getFavorites(): string[] {
  if (typeof window === "undefined") return [];
  return safeParse<string[]>(FAVORITES_KEY, []);
}

export function setFavorites(titles: string[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(titles));
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
const REPORTS_KEY = "neko_watch_reports";

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
const ARCHIVE_KEY = "neko_archived";

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
const HISTORY_KEY = "neko_rec_history";
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
const SEEN_KEY = "neko_seen_titles";
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
