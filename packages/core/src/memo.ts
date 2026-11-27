/**
 * 친구 메모 스티커 문구 — 카드 우상단 라임 스티커의 "12자 안팎 한마디".
 * 서버·LLM 없이 작품 정보(연도·평점·시즌 수·러닝타임·장르)만으로 고르는 순수 함수.
 * 웹·네이티브 공용. 해당 없음이면 null → 스티커 생략 (어색한 기본 문구보다 낫다).
 */
import type { Recommendation } from './types';

export const MEMO_MAX_LEN = 14;

/** 묶음별 문구. 같은 묶음 안에서는 tmdbId 로 변형을 고정한다. */
export const MEMO_PHRASES = {
  classic: ['오래 사랑받은 작품', '세월이 증명한 작품'],
  oneSeason: ['한 시즌이면 끝나요', '부담 없는 한 시즌'],
  manySeasons: ['오래 빠져들 시리즈', '시즌이 넉넉해요'],
  short: ['짧고 굵게 한 편', '부담 없는 길이예요'],
  long: ['긴 밤에 어울려요', '시간 넉넉할 때 봐요'],
  horror: ['불 켜고 보세요', '혼자 보긴 무서워요'],
  thriller: ['숨 참고 보게 돼요', '끝까지 긴장돼요'],
  mystery: ['같이 추리해 봐요', '끝까지 궁금해요'],
  romance: ['설레고 싶은 밤에', '마음이 몽글해져요'],
  comedy: ['가볍게 웃고 싶을 때', '피식 웃게 돼요'],
  animation: ['눈이 즐거운 한 편', '애니 보고 싶은 밤에'],
  documentary: ['알고 보면 더 재밌어요', '몰랐던 이야기예요'],
  crime: ['쫄깃한 범죄물이에요', '긴장감이 꽉 차요'],
  war: ['묵직한 한 편이에요', '여운이 오래가요'],
  sf: ['상상력이 가득해요', '다른 세계로 가요'],
  fantasy: ['다른 세계로 가요', '상상력이 가득해요'],
  action: ['속이 시원해져요', '보는 내내 신나요'],
  adventure: ['떠나고 싶어지는 밤', '모험 가는 기분이에요'],
  family: ['같이 보기 좋아요', '온 가족이 봐요'],
  music: ['음악이 오래 남아요', '소리 키우고 봐요'],
  reality: ['틀어 두기 좋아요', '편하게 웃으며 봐요'],
  drama: ['여운이 남는 이야기', '마음에 오래 남아요'],
  acclaimed: ['평이 정말 좋아요', '본 사람들이 칭찬해요'],
} as const satisfies Record<string, readonly string[]>;

type MemoKey = keyof typeof MEMO_PHRASES;

/** TMDB 장르 id → 묶음. 영화·TV id 가 달라 둘 다 둔다 (genres.ts 참조). */
const GENRE_KEY: Record<number, MemoKey> = {
  27: 'horror',
  53: 'thriller',
  9648: 'mystery',
  10749: 'romance',
  35: 'comedy',
  99: 'documentary',
  80: 'crime',
  10752: 'war', 36: 'war', 10768: 'war',
  878: 'sf', 10765: 'sf',
  14: 'fantasy',
  28: 'action', 10759: 'action',
  12: 'adventure',
  10751: 'family', 10762: 'family',
  10402: 'music',
  10764: 'reality', 10767: 'reality',
};
/** 너무 흔해 성격을 못 말해 주는 장르 — 다른 장르가 없을 때만 쓴다. */
const FALLBACK_GENRE_KEY: Record<number, MemoKey> = { 16: 'animation', 18: 'drama', 10766: 'drama' };

/** DESIGN.md Tone & Voice 금지 표현 + 격식체. */
const BANNED: RegExp[] = [
  /환영합니다|welcome/i,
  /\bAI\b|알고리즘/i,
  /최고의|놀라운/,
  /잠금 ?해제|unlock/i,
  /쉽고 빠르게|초 만에/,
  /지금 바로/,
  /!!/,
  /니다|하였/, // 격식체 (~습니다·~ㅂ니다)
  /성공적으로/,
  /님/,
  /curated/i,
];

export function hasBannedPhrase(s: string): boolean {
  return BANNED.some((re) => re.test(s));
}

/**
 * 규칙 순서 (먼저 걸리는 것): 저평점(<5) 생략 → 고전 → 긴 시리즈 → 영화 길이 → 장르 → 한 시즌 → 고평점 → 없음.
 * 장르는 TMDB 가 준 순서(대표 장르가 앞)를 따르고, 애니·드라마는 마지막 수단.
 */
function pickKey(rec: Recommendation): MemoKey | null {
  // ponytail: 평이 낮은 작품(0점 = 정보 없음 제외)에는 친구가 보증하지 않는다.
  if (rec.rating > 0 && rec.rating < 5) return null;
  const year = Number(rec.date?.slice(0, 4));
  if (year > 0 && year < 2000 && rec.rating >= 7.5) return 'classic';

  const isSeries = rec.type !== 'movie';
  if (isSeries && rec.seasons && rec.seasons >= 5) return 'manySeasons';
  if (!isSeries && rec.runtime) {
    if (rec.runtime <= 85) return 'short';
    if (rec.runtime >= 150) return 'long';
  }

  const genres = rec.genres ?? [];
  const main = genres.find((id) => GENRE_KEY[id]);
  if (main !== undefined) return GENRE_KEY[main];
  const fallback = genres.find((id) => FALLBACK_GENRE_KEY[id]);
  if (fallback !== undefined) return FALLBACK_GENRE_KEY[fallback];

  if (isSeries && rec.seasons === 1) return 'oneSeason';
  if (rec.rating >= 8) return 'acclaimed';
  return null;
}

export function friendMemo(rec: Recommendation): string | null {
  const key = pickKey(rec);
  if (!key) return null;
  const options = MEMO_PHRASES[key];
  const phrase = options[Math.abs(rec.tmdbId) % options.length];
  // 표는 테스트로 검증하지만, 수정 실수가 화면에 새지 않게 한 번 더 막는다.
  if ([...phrase].length > MEMO_MAX_LEN || hasBannedPhrase(phrase)) return null;
  return phrase;
}
