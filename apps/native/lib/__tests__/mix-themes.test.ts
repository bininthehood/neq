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
  it('savedAt desc 상위 N, 라벨 = "<제목> 큐"', () => {
    const themes = buildRecentSavedThemes(
      [item(1, 100, { title: '옛날' }), item(2, 300, { title: '최신' }), item(3, 200)],
      2,
    );
    expect(themes.map((t) => t.title)).toEqual(['최신 큐', 't3 큐']);
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
    expect(themes[0].title).toBe('액션 큐'); // 3편 > 1편
    expect(themes[0].seed.tmdbId).toBe(3); // 액션 최신 = savedAt 300
    expect(themes[1].title).toBe('스릴러 큐');
    expect(themes[1].seed.tmdbId).toBe(2);
    // 기반 작품명 비노출 (사용자 피드백) — 편수만.
    expect(themes[0].subtitle).toBe('저장작 3편');
  });

  it('seed 분산 — 같은 최신작 공유 장르는 다음 최신작으로, 대안 없으면 유지', () => {
    // 3(최신) 이 액션+가족 둘 다 최신. 가족은 2 로 분산, 코미디는 3 뿐이라 유지.
    // 28=액션, 10751=가족, 35=코미디
    const themes = buildGenreThemes([
      item(1, 100, { genres: [28] }),
      item(2, 200, { genres: [10751] }),
      item(3, 300, { genres: [28, 10751, 35] }),
      item(4, 250, { genres: [28] }),
    ]);
    const seedOf = (title: string) => themes.find((t) => t.title === title)!.seed.tmdbId;
    expect(seedOf('액션 큐')).toBe(3); // 첫 테마 = 최신 그대로
    expect(seedOf('가족 큐')).toBe(2); // 3 은 사용됨 → 다음 최신
    expect(seedOf('코미디 큐')).toBe(3); // 대안 없음 → 유지
  });

  it('이미지 = seed backdrop 우선, 없으면 poster', () => {
    const withBackdrop = buildGenreThemes([
      item(1, 100, { genres: [28], backdrop: 'https://b/1.jpg', posterUrl: 'https://p/1.jpg' }),
    ]);
    expect(withBackdrop[0].imageUrl).toBe('https://b/1.jpg');
    const posterOnly = buildGenreThemes([
      item(2, 100, { genres: [28], posterUrl: 'https://p/2.jpg' }),
    ]);
    expect(posterOnly[0].imageUrl).toBe('https://p/2.jpg');
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
    expect(themes.map((t) => t.title)).toEqual(['봉준호 큐', '박찬욱 큐']);
    expect(themes[0].seed.tmdbId).toBe(2); // 봉준호 최신 = 300
    // 기반 작품명 비노출 (사용자 피드백) — 편수만.
    expect(themes[0].subtitle).toBe('저장작 2편');
  });

  it('프로필 사진 — 최신작에 없어도 다른 저장작에서 확보, 전무하면 null', () => {
    const themes = buildDirectorThemes([
      // 옛 저장작만 profileUrl 보유 — 최신작(300) 은 미보유.
      item(1, 100, {
        director: '봉준호',
        directorMember: { name: '봉준호', tmdbId: 9, profileUrl: 'https://pf/bong.jpg' },
      }),
      item(2, 300, { director: '봉준호' }),
      item(3, 200, { director: '박찬욱' }),
    ]);
    expect(themes[0].imageUrl).toBe('https://pf/bong.jpg');
    expect(themes[1].imageUrl).toBeNull();
  });
});
