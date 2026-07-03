/**
 * TMDB genre id → 한국어 라벨. 영화(movie) + TV 장르 목록 병합.
 *
 * 출처: https://api.themoviedb.org/3/genre/{movie,tv}/list?language=ko
 *
 * 주의 — 영화와 TV 는 genre id 체계가 일부 다르다:
 *  - 공유 id (동일 의미): 16 애니메이션, 35 코미디, 80 범죄, 99 다큐, 18 드라마,
 *    10751 가족, 9648 미스터리, 10765(TV: SF·판타지) vs 878(영화: SF) — 별개 id.
 *  - 영화 전용: 28 액션, 12 모험, 14 판타지, 36 역사, 27 공포, 10402 음악,
 *    10749 로맨스, 878 SF, 10770 TV영화, 53 스릴러, 10752 전쟁, 37 서부.
 *  - TV 전용: 10759 액션&어드벤처, 10762 키즈, 10763 뉴스, 10764 리얼리티,
 *    10765 SF&판타지, 10766 연속극, 10767 토크, 10768 전쟁&정치.
 * 영화 28(액션)/TV 10759(액션&어드벤처), 영화 878(SF)/TV 10765(SF&판타지) 처럼
 * 개념은 비슷해도 id 가 달라 둘 다 등록해야 한 작품이 movie/TV 어느 쪽이든 라벨이 뜬다.
 *
 * 미매핑 id 는 getGenreLabels 에서 skip (잡음 최소화).
 */
export const TMDB_GENRE_NAMES_KO: Record<number, string> = {
  // ── Movie ──
  28: '액션',
  12: '모험',
  14: '판타지',
  36: '역사',
  27: '공포',
  10402: '음악',
  10749: '로맨스',
  878: 'SF',
  10770: 'TV영화',
  53: '스릴러',
  10752: '전쟁',
  37: '서부',
  // ── 공유 (movie + TV 동일 id·동일 라벨) ──
  16: '애니메이션',
  35: '코미디',
  80: '범죄',
  99: '다큐멘터리',
  18: '드라마',
  10751: '가족',
  9648: '미스터리',
  // ── TV 전용 ──
  10759: '액션·모험',
  10762: '키즈',
  10763: '뉴스',
  10764: '리얼리티',
  10765: 'SF·판타지',
  10766: '연속극',
  10767: '토크',
  10768: '전쟁·정치',
};

/**
 * TMDB genre id 배열 → 한국어 라벨 배열. 미매핑 id 는 skip.
 * Saved 장르 필터 칩바(Track B UI)가 저장 작품의 genres 를 라벨로 변환할 때 사용.
 */
export function getGenreLabels(ids: number[] | undefined): string[] {
  if (!ids || ids.length === 0) return [];
  return ids
    .map((id) => TMDB_GENRE_NAMES_KO[id])
    .filter((n): n is string => typeof n === 'string');
}
