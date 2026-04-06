import type { Recommendation, SavedItem } from "./types";

const FAVORITES_KEY = "neko_favorites";
const SAVED_KEY = "neko_saved";
const RECS_KEY = "neko_recommendations";

// 온보딩에서 선택한 좋아하는 작품
export function getFavorites(): string[] {
  if (typeof window === "undefined") return [];
  return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]");
}

export function setFavorites(titles: string[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(titles));
}

// 추천 목록 (배치로 받아온 것)
export function getRecommendations(): Recommendation[] {
  if (typeof window === "undefined") return [];
  return JSON.parse(localStorage.getItem(RECS_KEY) ?? "[]");
}

export function setRecommendations(recs: Recommendation[]) {
  localStorage.setItem(RECS_KEY, JSON.stringify(recs));
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
