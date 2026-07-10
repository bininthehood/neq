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

export function monthKeyOf(item: SavedItem): number {
  const d = new Date(item.savedAt);
  return d.getFullYear() * 12 + d.getMonth();
}

export function monthLabelOf(key: number): string {
  return `${Math.floor(key / 12)}년 ${(key % 12) + 1}월`;
}

export function monthOptionsOf(items: SavedItem[]): { key: number; label: string }[] {
  const keys = new Set<number>();
  for (const item of items) keys.add(monthKeyOf(item));
  return Array.from(keys)
    .sort((a, b) => b - a)
    .map((key) => ({ key, label: monthLabelOf(key) }));
}

export type RulerSlot = {
  key: number;
  month: number;
  yearLabel: string | null;
  hasData: boolean;
  label: string;
};

export function rulerSlotsOf(items: SavedItem[], nowKey: number): RulerSlot[] {
  if (items.length === 0) return [];
  const dataKeys = new Set<number>();
  let min = Infinity;
  let max = nowKey;
  for (const item of items) {
    const key = monthKeyOf(item);
    dataKeys.add(key);
    if (key < min) min = key;
    if (key > max) max = key;
  }
  const slots: RulerSlot[] = [];
  for (let key = min; key <= max; key++) {
    const month = (key % 12) + 1;
    slots.push({
      key,
      month,
      yearLabel: month === 1 || key === min ? String(Math.floor(key / 12)) : null,
      hasData: dataKeys.has(key),
      label: monthLabelOf(key),
    });
  }
  return slots;
}

export function resolveSnapIndex(slots: RulerSlot[], rawIndex: number): number {
  const allIdx = slots.length;
  const idx = Math.max(0, Math.min(allIdx, Math.round(rawIndex)));
  if (idx === allIdx || slots[idx].hasData) return idx;
  let best = allIdx;
  let bestDist = allIdx - idx;
  for (let i = 0; i < slots.length; i++) {
    if (!slots[i].hasData) continue;
    const distance = Math.abs(i - idx);
    if (distance < bestDist || (distance === bestDist && i > best)) {
      best = i;
      bestDist = distance;
    }
  }
  return best;
}
