/**
 * Saved 정렬 helper + persist util.
 * - sort 옵션 / load / persist / 정렬 함수.
 * - SavedFilterSheet 의 정렬 섹션과 page 단의 sortBy state 가 공유.
 *
 * "saved": 저장순 (savedAt desc) — 디폴트
 * "title": 가나다 (한글 locale)
 * "rating": 평점 (rating desc)
 *
 * localStorage 키: neq_saved_sort
 */
import type { SavedItem } from "@/lib/types";

export type SavedSort = "saved" | "title" | "rating";

const SAVED_SORT_KEY = "neq_saved_sort";

export function loadSavedSort(): SavedSort {
  if (typeof window === "undefined") return "saved";
  try {
    const v = localStorage.getItem(SAVED_SORT_KEY);
    if (v === "saved" || v === "title" || v === "rating") return v;
  } catch {
    /* ignore */
  }
  return "saved";
}

export function persistSavedSort(sort: SavedSort) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SAVED_SORT_KEY, sort);
  } catch {
    /* ignore */
  }
}

export function sortSavedItems(items: SavedItem[], sort: SavedSort): SavedItem[] {
  if (sort === "title") {
    return [...items].sort((a, b) =>
      a.recommendation.title.localeCompare(b.recommendation.title, "ko"),
    );
  }
  if (sort === "rating") {
    return [...items].sort(
      (a, b) => (b.recommendation.rating ?? 0) - (a.recommendation.rating ?? 0),
    );
  }
  // "saved" — savedAt desc (최근 저장 우선)
  return [...items].sort((a, b) => b.savedAt - a.savedAt);
}
