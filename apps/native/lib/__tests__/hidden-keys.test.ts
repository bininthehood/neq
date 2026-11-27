import { describe, it, expect, beforeEach } from 'vitest';
import {
  addHiddenKey,
  clearAllUserData,
  getHiddenEntries,
  getHiddenKeys,
  removeHiddenKey,
} from '../store';
import { HIDDEN_KEYS_MAX, addHiddenEntry, hiddenKeyOf } from '../hidden-keys';
import { __resetStorage } from './_mocks/async-storage';

beforeEach(() => __resetStorage());

describe('hiddenKeys 저장소', () => {
  it('키 형식: 영화는 movie, 시리즈·예능은 tv (서버 PR #55 계약)', () => {
    expect(hiddenKeyOf({ type: 'movie', tmdbId: 1396 })).toBe('movie:1396');
    expect(hiddenKeyOf({ type: 'series', tmdbId: 1396 })).toBe('tv:1396');
    expect(hiddenKeyOf({ type: 'variety', tmdbId: 7 })).toBe('tv:7');
  });

  it('추가 → 최근 순, 추가 시각 저장, 영구 저장(다시 읽어도 유지)', async () => {
    await addHiddenKey('movie:1');
    await addHiddenKey('tv:2');
    expect(await getHiddenKeys()).toEqual(['tv:2', 'movie:1']);
    const entries = await getHiddenEntries();
    expect(entries[0].hiddenAt).toBeGreaterThan(0);
  });

  it('중복 추가는 한 번만, 맨 앞으로', async () => {
    await addHiddenKey('movie:1');
    await addHiddenKey('tv:2');
    await addHiddenKey('movie:1');
    expect(await getHiddenKeys()).toEqual(['movie:1', 'tv:2']);
  });

  it('되돌리기 = 그 키만 제거, 같은 id 의 다른 종류는 남음', async () => {
    await addHiddenKey('movie:5');
    await addHiddenKey('tv:5');
    await removeHiddenKey('movie:5');
    expect(await getHiddenKeys()).toEqual(['tv:5']);
  });

  it(`상한 ${HIDDEN_KEYS_MAX} 초과 시 오래된 숨김부터 탈락`, () => {
    let list = [] as ReturnType<typeof addHiddenEntry>;
    for (let i = 0; i < HIDDEN_KEYS_MAX + 3; i++) list = addHiddenEntry(list, `movie:${i}`, i);
    expect(list).toHaveLength(HIDDEN_KEYS_MAX);
    expect(list[0].key).toBe(`movie:${HIDDEN_KEYS_MAX + 2}`);
    expect(list.some((e) => e.key === 'movie:0' || e.key === 'movie:2')).toBe(false);
    expect(list.some((e) => e.key === 'movie:3')).toBe(true);
  });

  it("'모든 데이터 초기화' 후 비어 있음", async () => {
    await addHiddenKey('movie:1');
    await clearAllUserData();
    expect(await getHiddenKeys()).toEqual([]);
  });
});
