import { describe, it, expect } from 'vitest';
import { friendMemo, hasBannedPhrase, MEMO_MAX_LEN, MEMO_PHRASES } from '../memo';
import type { Recommendation } from '../types';

function rec(over: Partial<Recommendation>): Recommendation {
  return {
    title: '테스트',
    titleEn: 'Test',
    type: 'movie',
    reason: '',
    tmdbId: 1,
    posterUrl: null,
    rating: 7,
    date: '2015-01-01',
    overview: '',
    providers: [],
    watchLink: null,
    director: null,
    cast: [],
    runtime: 115,
    seasons: null,
    country: [],
    backdrop: null,
    genres: [],
    ...over,
  };
}

describe('friendMemo 규칙', () => {
  const table: [string, Partial<Recommendation>, keyof typeof MEMO_PHRASES][] = [
    // [설명, 입력, 기대 phrase 묶음 키]
    ['공포 영화', { genres: [27, 18] }, 'horror'],
    ['드라마는 뒤로 밀림', { genres: [18, 53] }, 'thriller'],
    ['TMDB 순서: 액션 먼저', { genres: [28, 35] }, 'action'],
    ['TMDB 순서: 코미디 먼저', { genres: [35, 28] }, 'comedy'],
    ['로맨스', { genres: [10749, 18] }, 'romance'],
    ['다큐', { genres: [99] }, 'documentary'],
    ['드라마만', { genres: [18] }, 'drama'],
    ['애니는 다른 장르가 있으면 양보', { genres: [16, 10759] }, 'action'],
    ['애니만', { genres: [16] }, 'animation'],
    ['TV SF·판타지', { type: 'series', seasons: 2, runtime: null, genres: [10765] }, 'sf'],
    ['예능 리얼리티', { type: 'variety', seasons: 3, runtime: null, genres: [10764] }, 'reality'],
    ['짧은 영화 85분', { runtime: 85, genres: [27] }, 'short'],
    ['86분은 장르로', { runtime: 86, genres: [27] }, 'horror'],
    ['긴 영화 150분', { runtime: 150, genres: [35] }, 'long'],
    ['149분은 장르로', { runtime: 149, genres: [35] }, 'comedy'],
    ['시리즈 runtime 은 무시', { type: 'series', seasons: 2, runtime: 262, genres: [35] }, 'comedy'],
    ['5시즌 이상', { type: 'series', seasons: 5, runtime: null, genres: [35] }, 'manySeasons'],
    ['4시즌은 장르로', { type: 'series', seasons: 4, runtime: null, genres: [18] }, 'drama'],
    ['한 시즌은 장르가 우선', { type: 'series', seasons: 1, runtime: null, genres: [35] }, 'comedy'],
    ['한 시즌 + 장르 없음', { type: 'series', seasons: 1, runtime: null, genres: [] }, 'oneSeason'],
    ['영화 seasons 값은 무시', { seasons: 1, genres: [] , rating: 8 }, 'acclaimed'],
    ['고전(1999) 고평점', { date: '1999-05-01', rating: 7.5, genres: [18] }, 'classic'],
    ['고전이어도 평점 낮으면 장르', { date: '1990-05-01', rating: 7.4, genres: [35] }, 'comedy'],
    ['2000년은 고전 아님', { date: '2000-01-01', rating: 8.5, genres: [35] }, 'comedy'],
    ['장르 없음 + 평점 8 이상', { genres: [], rating: 8.2 }, 'acclaimed'],
    ['미매핑 장르 + 평점 8', { genres: [10770], rating: 8 }, 'acclaimed'],
  ];
  it.each(table)('%s', (_name, over, key) => {
    expect(MEMO_PHRASES[key]).toContain(friendMemo(rec(over)));
  });

  it('해당 없음이면 null (스티커 생략)', () => {
    expect(friendMemo(rec({ genres: [], rating: 7 }))).toBeNull();
    expect(friendMemo(rec({ genres: undefined, rating: 0, date: '' }))).toBeNull();
    // 평점 5 미만은 장르가 있어도 생략, 0(정보 없음)은 생략하지 않음
    expect(friendMemo(rec({ genres: [35], rating: 4.9 }))).toBeNull();
    expect(MEMO_PHRASES.comedy).toContain(friendMemo(rec({ genres: [35], rating: 0 })));
    expect(MEMO_PHRASES.comedy).toContain(friendMemo(rec({ genres: [35], rating: 5 })));
  });

  it('같은 작품은 항상 같은 문구 (tmdbId 로 변형 고정)', () => {
    const r = rec({ tmdbId: 42, genres: [18] });
    expect(friendMemo(r)).toBe(friendMemo({ ...r }));
    // 묶음 안에서 tmdbId 에 따라 다른 변형이 나온다
    expect(friendMemo(rec({ tmdbId: 1, genres: [18] }))).not.toBe(
      friendMemo(rec({ tmdbId: 2, genres: [18] })),
    );
  });
});

describe('문구 표 검사', () => {
  const all = Object.values(MEMO_PHRASES).flat();

  it.each(all)('"%s" 길이 ≤ 14, 금지 표현 없음', (p) => {
    expect([...p].length).toBeLessThanOrEqual(MEMO_MAX_LEN);
    expect(hasBannedPhrase(p)).toBe(false);
  });

  it.each([
    '최고의 영화',
    'AI가 고른 작품',
    '알고리즘 추천',
    '놀라운 발견',
    '지금 바로!',
    '대박!!',
    '추천드립니다',
    '회원님 취향',
    'Unlock the fun',
  ])('금지 표현 검출: "%s"', (p) => {
    expect(hasBannedPhrase(p)).toBe(true);
  });
});
