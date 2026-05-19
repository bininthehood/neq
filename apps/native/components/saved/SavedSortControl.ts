/**
 * Saved 정렬 helper + persist util — RN 포팅.
 *
 * web 정본: `apps/web/src/components/saved/SavedSortControl.tsx`.
 *  - sort 옵션 / load / persist / 정렬 함수.
 *  - SavedFilterSheet 의 정렬 섹션과 saved.tsx 의 sortBy state 가 공유.
 *
 * "saved":  저장순 (savedAt desc) — 디폴트
 * "title":  가나다 (한글 locale)
 * "rating": 평점 (rating desc)
 *
 * AsyncStorage 키: 'neq_saved_sort' — web localStorage 키와 동일 (향후 호환).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SavedItem } from '../../lib/types';

export type SavedSort = 'saved' | 'title' | 'rating';

const SAVED_SORT_KEY = 'neq_saved_sort';

/** web SORT_OPTIONS 정합 — 라벨/설명. SavedFilterSheet 정렬 섹션에서 사용. */
export const SORT_OPTIONS: { key: SavedSort; label: string; desc: string }[] = [
  { key: 'saved', label: '저장순', desc: '최근 저장한 작품 먼저' },
  { key: 'title', label: '가나다순', desc: '제목 오름차순' },
  { key: 'rating', label: '평점순', desc: '평점 높은 작품 먼저' },
];

export async function loadSavedSort(): Promise<SavedSort> {
  try {
    const v = await AsyncStorage.getItem(SAVED_SORT_KEY);
    if (v === 'saved' || v === 'title' || v === 'rating') return v;
  } catch {
    /* ignore */
  }
  return 'saved';
}

export async function persistSavedSort(sort: SavedSort): Promise<void> {
  try {
    await AsyncStorage.setItem(SAVED_SORT_KEY, sort);
  } catch {
    /* ignore */
  }
}

/** web `sortSavedItems` 와 1:1 동일 — 비파괴 정렬 (복사본 반환). */
export function sortSavedItems(items: SavedItem[], sort: SavedSort): SavedItem[] {
  if (sort === 'title') {
    return [...items].sort((a, b) =>
      a.recommendation.title.localeCompare(b.recommendation.title, 'ko'),
    );
  }
  if (sort === 'rating') {
    return [...items].sort(
      (a, b) => (b.recommendation.rating ?? 0) - (a.recommendation.rating ?? 0),
    );
  }
  // "saved" — savedAt desc (최근 저장 우선)
  return [...items].sort((a, b) => b.savedAt - a.savedAt);
}
