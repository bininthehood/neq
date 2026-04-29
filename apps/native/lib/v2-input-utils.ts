/**
 * Cold Start V2 LLM 입력 (P0-2) 유틸 — 외부 의존 0 순수 함수.
 *
 * web `apps/web/src/hooks/useRecommendations.ts` 의 `readV2Inputs` 1:1 포팅.
 * AsyncStorage / fetch / PostHog 의존성 없이 입력값만 받아 분기 결정 → flag/IO 와 분리해
 * web vitest 로 직접 검증 가능 (D7/D6 패턴 동일).
 *
 * 호출자는 별도로 flag 평가와 prefs 조회를 수행한 뒤 본 함수에 전달한다:
 *
 *   const tasteOn = isTasteGenresEnabled();
 *   const ottOn = isOttWeakSignalEnabled();
 *   const prefs = await getAccountPrefs();
 *   const v2 = computeV2Inputs({
 *     tasteGenresEnabled: tasteOn,
 *     ottWeakSignalEnabled: ottOn,
 *     tasteGenres: prefs.tasteGenres,
 *     subscribedOtt: prefs.subscribedOtt,
 *   });
 *
 * 반환:
 *   - body: fetch body 에 spread 할 부분 객체 (값이 있을 때만 키 포함)
 *   - tasteGenresCount / subscribedOttCount: PostHog 이벤트 속성용 counts
 *   - coldStartVersion: V1 = 둘 다 비어있음, V2 = 하나 이상 포함
 *
 * flag OFF 시 V1 동작 100% 보존 — body 빈 객체, count 0, version v1.
 */

export interface V2InputArgs {
  /** EXPO_PUBLIC_TASTE_GENRES_ENABLED flag 평가 결과 */
  tasteGenresEnabled: boolean;
  /** EXPO_PUBLIC_OTT_WEAK_SIGNAL flag 평가 결과 */
  ottWeakSignalEnabled: boolean;
  /** AccountPrefs.tasteGenres */
  tasteGenres: string[];
  /** AccountPrefs.subscribedOtt */
  subscribedOtt: number[];
}

export interface V2InputResult {
  body: { tasteGenres?: string[]; subscribedOtt?: number[] };
  tasteGenresCount: number;
  subscribedOttCount: number;
  coldStartVersion: 'v1' | 'v2';
}

export function computeV2Inputs(args: V2InputArgs): V2InputResult {
  const tasteOn = args.tasteGenresEnabled;
  const ottOn = args.ottWeakSignalEnabled;

  // 두 flag 모두 OFF 면 즉시 V1 반환 — prefs 조회 무시.
  if (!tasteOn && !ottOn) {
    return {
      body: {},
      tasteGenresCount: 0,
      subscribedOttCount: 0,
      coldStartVersion: 'v1',
    };
  }

  const tasteGenres = tasteOn ? args.tasteGenres : [];
  const subscribedOtt = ottOn ? args.subscribedOtt : [];

  const body: { tasteGenres?: string[]; subscribedOtt?: number[] } = {};
  if (tasteGenres.length > 0) body.tasteGenres = tasteGenres;
  if (subscribedOtt.length > 0) body.subscribedOtt = subscribedOtt;

  const coldStartVersion: 'v1' | 'v2' =
    tasteGenres.length > 0 || subscribedOtt.length > 0 ? 'v2' : 'v1';

  return {
    body,
    tasteGenresCount: tasteGenres.length,
    subscribedOttCount: subscribedOtt.length,
    coldStartVersion,
  };
}
