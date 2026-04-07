import type { Recommendation, SavedItem } from "./types";

const FAVORITES_KEY = "neko_favorites";
const SAVED_KEY = "neko_saved";
const RECS_KEY = "neko_recommendations";
const RECS_FILTERED_PREFIX = "neko_recs_";

// 온보딩에서 선택한 좋아하는 작품
export function getFavorites(): string[] {
  if (typeof window === "undefined") return [];
  return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]");
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
  return JSON.parse(localStorage.getItem(key) ?? "[]");
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
  return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]");
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
