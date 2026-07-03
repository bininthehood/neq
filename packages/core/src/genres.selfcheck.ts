/**
 * genres.ts id→라벨 매핑 self-check. 비자명 매핑(영화 vs TV id 체계 차이) 검증.
 * 실행: npx tsx packages/core/src/genres.selfcheck.ts
 * 프레임워크 없음 — assert 만.
 */
import assert from 'node:assert';
import { TMDB_GENRE_NAMES_KO, getGenreLabels } from './genres';

// 대표 id 라벨 확인 — 확정 데이터 계약(28=액션 …)과 일치해야 함.
assert.equal(TMDB_GENRE_NAMES_KO[28], '액션', '28=액션');
assert.equal(TMDB_GENRE_NAMES_KO[35], '코미디', '35=코미디');
assert.equal(TMDB_GENRE_NAMES_KO[18], '드라마', '18=드라마');
assert.equal(TMDB_GENRE_NAMES_KO[53], '스릴러', '53=스릴러');
assert.equal(TMDB_GENRE_NAMES_KO[27], '공포', '27=공포');
assert.equal(TMDB_GENRE_NAMES_KO[10749], '로맨스', '10749=로맨스');
assert.equal(TMDB_GENRE_NAMES_KO[878], 'SF', '878=SF (영화)');
assert.equal(TMDB_GENRE_NAMES_KO[99], '다큐멘터리', '99=다큐멘터리');
assert.equal(TMDB_GENRE_NAMES_KO[16], '애니메이션', '16=애니메이션');
// 영화 vs TV id 체계 차이: 878(영화 SF) 과 10765(TV SF·판타지) 는 별개 id.
assert.equal(TMDB_GENRE_NAMES_KO[10759], '액션·모험', '10759=액션·모험 (TV 전용)');
assert.equal(TMDB_GENRE_NAMES_KO[10765], 'SF·판타지', '10765=SF·판타지 (TV 전용)');
assert.notEqual(TMDB_GENRE_NAMES_KO[878], TMDB_GENRE_NAMES_KO[10765], '영화 SF ≠ TV SF·판타지');

// getGenreLabels: 매핑된 것만 라벨화, 미매핑 id(999999) skip, 순서 보존.
assert.deepEqual(getGenreLabels([28, 35]), ['액션', '코미디'], '매핑 id → 라벨');
assert.deepEqual(getGenreLabels([28, 999999, 18]), ['액션', '드라마'], '미매핑 id skip');
assert.deepEqual(getGenreLabels([]), [], '빈 배열 → 빈 배열');
assert.deepEqual(getGenreLabels(undefined), [], 'undefined → 빈 배열 (백필 전 저장분 호환)');

console.log('genres.selfcheck OK');
