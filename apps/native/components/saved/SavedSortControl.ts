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

/**
 * 저장 시각(savedAt) 기준 연·월 섹션화. 누적 작품을 "2026년 6월" 단위로 묶어
 * SectionList 로 렌더하기 위한 데이터 변환.
 *
 *  - 섹션 정렬: 최신 연·월이 위 (descending).
 *  - 섹션 내부: savedAt desc (sortSavedItems 의 'saved' 와 동일 — 최근 저장 우선).
 *  - title: 한국어 라벨 `YYYY년 M월` (예: `2026년 6월`).
 *  - 같은 (year, month) 면 한 섹션.
 *
 * 로컬 타임존 기준 — 사용자가 인식하는 "저장한 달" 과 일치 (UTC 경계로 월이
 * 밀리지 않도록 getFullYear/getMonth 사용).
 */
export function groupSavedByMonth(
  items: SavedItem[],
): { title: string; data: SavedItem[] }[] {
  const buckets = new Map<number, SavedItem[]>(); // key = year*12 + month (정렬 가능한 단조 키)
  for (const it of items) {
    const d = new Date(it.savedAt);
    const key = d.getFullYear() * 12 + d.getMonth();
    const arr = buckets.get(key);
    if (arr) arr.push(it);
    else buckets.set(key, [it]);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => b[0] - a[0]) // 최신 연·월 먼저
    .map(([key, data]) => ({
      title: `${Math.floor(key / 12)}년 ${(key % 12) + 1}월`,
      data: data.sort((a, b) => b.savedAt - a.savedAt), // 섹션 내부 savedAt desc
    }));
}

/**
 * #6 인스크린 캘린더 스크러버 — 월 버킷을 SectionList 데이터가 아니라 "칩 목록 +
 * 단일 월 필터" 로 소비하기 위한 얇은 헬퍼.
 *
 *  - monthKeyOf: 한 저장 항목의 연·월 키 (year*12+month, 로컬 타임존). 필터 predicate 용.
 *  - monthLabelOf: 키 → 한국어 라벨 `YYYY년 M월`.
 *  - monthOptionsOf: 저장 목록에 실제 존재하는 월을 최신 먼저 정렬한 {key,label}[].
 *    (groupSavedByMonth 의 버킷/정렬 규칙과 동일 — 라벨 렌더는 SectionList 대신 스크러버.)
 *
 * monthKeyOf/monthLabelOf 로 필터·라벨을 분리해 groupSavedByMonth 를 재구현하지 않는다.
 */
export function monthKeyOf(item: SavedItem): number {
  const d = new Date(item.savedAt);
  return d.getFullYear() * 12 + d.getMonth();
}

export function monthLabelOf(key: number): string {
  return `${Math.floor(key / 12)}년 ${(key % 12) + 1}월`;
}

export function monthOptionsOf(
  items: SavedItem[],
): { key: number; label: string }[] {
  const keys = new Set<number>();
  for (const it of items) keys.add(monthKeyOf(it));
  return Array.from(keys)
    .sort((a, b) => b - a) // 최신 연·월 먼저
    .map((key) => ({ key, label: monthLabelOf(key) }));
}

// ponytail: 비자명 로직(월 경계/정렬/라벨) self-check. `node -r ... ` 불필요 —
// import 시 부작용 없게 require.main 게이트.
if (require.main === module) {
  const mk = (savedAt: number): SavedItem =>
    ({ savedAt, recommendation: { tmdbId: savedAt } }) as unknown as SavedItem;
  // 2026-06-15, 2026-06-01, 2026-05-31, 2025-06-30 (로컬). 월 경계/연 경계/동월 묶기 검증.
  const jun15 = new Date(2026, 5, 15, 12).getTime();
  const jun01 = new Date(2026, 5, 1, 0).getTime();
  const may31 = new Date(2026, 4, 31, 23).getTime();
  const lastYearJun = new Date(2025, 5, 30, 12).getTime();
  const g = groupSavedByMonth([mk(may31), mk(jun01), mk(lastYearJun), mk(jun15)]);
  // 섹션 3개: 2026-6 (2건), 2026-5 (1건), 2025-6 (1건). 최신 먼저.
  console.assert(g.length === 3, `섹션 수 3 기대, got ${g.length}`);
  console.assert(g[0].title === '2026년 6월' && g[0].data.length === 2, 'top=2026년 6월×2');
  console.assert(g[1].title === '2026년 5월' && g[1].data.length === 1, '2nd=2026년 5월×1');
  console.assert(g[2].title === '2025년 6월', `last=2025년 6월, got ${g[2].title}`);
  // 동월 내부 savedAt desc — jun15 가 jun01 보다 앞.
  console.assert(g[0].data[0].savedAt === jun15, '섹션 내부 savedAt desc');
  // 빈 입력 → 빈 배열.
  console.assert(groupSavedByMonth([]).length === 0, '빈 입력 → []');

  // #6 monthOptionsOf / monthKeyOf / monthLabelOf — 스크러버용 헬퍼.
  const opts = monthOptionsOf([mk(may31), mk(jun01), mk(lastYearJun), mk(jun15)]);
  console.assert(opts.length === 3, `월 옵션 3개(중복 병합), got ${opts.length}`);
  console.assert(opts[0].label === '2026년 6월', `최신 먼저=2026년 6월, got ${opts[0].label}`);
  console.assert(opts[2].label === '2025년 6월', `마지막=2025년 6월, got ${opts[2].label}`);
  // 동월 항목은 같은 key → 필터가 정확히 그 달만 통과.
  console.assert(monthKeyOf(mk(jun15)) === monthKeyOf(mk(jun01)), '동월 = 동일 key');
  console.assert(monthKeyOf(mk(jun15)) !== monthKeyOf(mk(may31)), '월 경계 = 다른 key');
  console.assert(monthLabelOf(monthKeyOf(mk(jun15))) === '2026년 6월', 'key→라벨 round-trip');
  console.assert(monthOptionsOf([]).length === 0, '빈 입력 월옵션 → []');
  console.log('groupSavedByMonth self-check OK');
}
