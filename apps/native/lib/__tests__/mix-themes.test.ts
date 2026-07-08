import { describe, it, expect } from 'vitest';
import type { Recommendation, SavedItem } from '@neq/core';
import {
  buildRecentSavedThemes,
  buildGenreThemes,
  buildDirectorThemes,
} from '../mix-themes';

function rec(tmdbId: number, over: Partial<Recommendation> = {}): Recommendation {
  return {
    title: `t${tmdbId}`,
    titleEn: `t${tmdbId}`,
    type: 'movie',
    reason: '',
    tmdbId,
    posterUrl: null,
    rating: 0,
    date: '',
    overview: '',
    providers: [],
    watchLink: null,
    director: null,
    cast: [],
    runtime: null,
    seasons: null,
    country: [],
    backdrop: null,
    ...over,
  };
}

function item(tmdbId: number, savedAt: number, over: Partial<Recommendation> = {}): SavedItem {
  return { savedAt, recommendation: rec(tmdbId, over) };
}

describe('buildRecentSavedThemes', () => {
  it('savedAt desc 상위 N, 라벨 = "<제목> 믹스"', () => {
    const themes = buildRecentSavedThemes(
      [item(1, 100, { title: '옛날' }), item(2, 300, { title: '최신' }), item(3, 200)],
      2,
    );
    expect(themes.map((t) => t.title)).toEqual(['최신 믹스', 't3 믹스']);
    expect(themes[0].seed.tmdbId).toBe(2);
    expect(themes[0].kind).toBe('recent_saved');
  });
  it('빈 입력 → 빈 배열', () => {
    expect(buildRecentSavedThemes([])).toEqual([]);
  });
});

describe('buildGenreThemes', () => {
  it('장르 빈도 desc + seed 는 해당 장르 최신 저장작', () => {
    // 28=액션, 53=스릴러 (TMDB_GENRE_NAMES_KO)
    const themes = buildGenreThemes([
      item(1, 100, { genres: [28] }),
      item(2, 200, { genres: [28, 53] }),
      item(3, 300, { genres: [28] }),
    ]);
    expect(themes[0].title).toBe('액션 믹스'); // 3편 > 1편
    expect(themes[0].seed.tmdbId).toBe(3); // 액션 최신 = savedAt 300
    expect(themes[1].title).toBe('스릴러 믹스');
    expect(themes[1].seed.tmdbId).toBe(2);
  });
  it('미매핑 장르 id / genres 미보유 저장작 skip', () => {
    const themes = buildGenreThemes([
      item(1, 100, { genres: [999999] }),
      item(2, 200), // genres 없음
    ]);
    expect(themes).toEqual([]);
  });
  it('max 캡', () => {
    const saved = [10018, 10402, 10749, 10751, 10752, 10764, 10767].map((g, i) =>
      item(i + 1, i, { genres: [g] }),
    );
    expect(buildGenreThemes(saved, 3)).toHaveLength(3);
  });
});

describe('buildDirectorThemes', () => {
  it('감독별 그룹 작품수 desc + seed 최신작, director 없는 항목 skip', () => {
    const themes = buildDirectorThemes([
      item(1, 100, { director: '봉준호' }),
      item(2, 300, { director: '봉준호' }),
      item(3, 200, { director: '박찬욱' }),
      item(4, 400), // director null
    ]);
    expect(themes.map((t) => t.title)).toEqual(['봉준호 믹스', '박찬욱 믹스']);
    expect(themes[0].seed.tmdbId).toBe(2); // 봉준호 최신 = 300
    expect(themes[0].subtitle).toContain('2편');
  });
});
