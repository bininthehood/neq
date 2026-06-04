/**
 * Neko native E2E 회귀 — 2026-06-04 onboarding step 7 (좋아하는 작품 picker)
 *
 * 컨텍스트: frontend-builder fix 4건 (`_workspace/03_diagnosis-2026-06-04.md`).
 *   P0-#2  step 7 무한스크롤 회귀 → suggestions.slice(0,8) 제한 제거 + "다른 작품 보기" 신설
 *   P1-#4  step 7 2열 그리드 가시성 → web 정본 isLarge 패턴 (i % 3 === 0 → 가로 풀폭)
 *
 * 검증 범위 (F1~F4):
 *   F1 — favorites_pick step (step 7) mount + heading "좋아하는 작품도 알려주세요" 노출
 *   F2 — 초기 그리드 N개 노출 (FALLBACK 6개 + trending API 응답 합산, N ≥ 6 보장)
 *   F3 — 스크롤 가능 + 카드 진입 (suggestions 그리드 ScrollView 내부)
 *   F4 — "다른 작품 보기" 버튼 노출 + 탭 → fetchTrending 갱신 (page 갱신)
 *
 * 진입 경로:
 *   profile "+ 새 취향 추가" → context_select (영화 + 혼자 + 다음) → step 1 (LLM 답변
 *   + 다음) → step 2 (LLM 답변 + 다음) → **favorites_pick (step 7 = TasteSurveyFavoritesPicker)**
 *
 *   onboarding 흐름의 step 7 과 PersonaSurveyController 의 favorites_pick phase 는
 *   동일 컴포넌트 (`apps/native/components/onboarding/TasteSurveyFavoritesPicker.tsx`)
 *   를 사용 — 본 spec 은 profile 진입 경로로 favorites_pick 컴포넌트 mount 를 검증.
 *
 * 실행 전제:
 *   - simulator-devclient (`com.neq.app` dev client) — wdio.conf.ts default
 *   - 사용자가 onboarding 완료 상태 (forceResetApp 후 ensureOnboardedOrSkip 통과)
 *   - 네트워크 가능 — /api/trending, /api/onboarding/taste-survey/* 응답 < 15s
 *   - 첫 페르소나 1개 이상 존재
 */

import {
  capture,
  ensureOnboardedOrSkip,
  forceResetApp,
  pageSourceContains,
  tapByLabel,
  tapByPredicate,
  tapTab,
  waitForLabel,
} from './_helpers';

/**
 * step_question phase 의 옵션 element mount 대기.
 * persona-taste-survey.test.ts line 100 의 패턴 재사용 (radio button 매칭).
 */
async function waitForRadioOption(timeoutMs = 25000): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const src = await browser.getPageSource();
    const m = src.match(/value="radio button"\s+name="([^"]+)"/);
    if (m?.[1]) return m[1];
    await browser.pause(400);
  }
  return null;
}

/** Persona context → step 1 → step 2 → favorites_pick 진입 경로. */
async function reachFavoritesPick(): Promise<boolean> {
  // 1. profile 진입
  if (!(await tapTab('프로필'))) return false;
  await browser.pause(800);

  // 2. "+ 새 취향 추가" tap
  if (
    !(await tapByPredicate(
      `label CONTAINS "새 취향" OR name CONTAINS "새 취향"`,
      { timeout: 5000 },
    ))
  ) {
    return false;
  }

  // 3. context_select — 영화 + 혼자 + 다음
  if (!(await waitForLabel('영화', 8000))) return false;
  await tapByLabel('영화');
  await tapByLabel('혼자');
  await browser.pause(300);
  if (!(await tapByLabel('다음'))) return false;

  // 3a. resume modal 처리
  await browser.pause(800);
  if (await pageSourceContains('이어서 하시겠어요')) {
    await tapByLabel('처음부터');
    await browser.pause(500);
  }

  // 4. step 1 — LLM 옵션 + 다음
  const o1 = await waitForRadioOption(25000);
  if (!o1) return false;
  if (!(await tapByLabel(o1))) return false;
  if (!(await tapByLabel('다음'))) return false;

  // 5. step 2 — LLM 옵션 + 다음
  const o2 = await waitForRadioOption(25000);
  if (!o2) return false;
  if (!(await tapByLabel(o2))) return false;
  if (!(await tapByLabel('다음'))) return false;

  // 6. favorites_pick step mount 대기 — heading 또는 "건너뛰기" 노출이 안정적 신호.
  // TasteSurveyFavoritesPicker line 132: "좋아하는 작품도 알려주세요"
  for (let i = 0; i < 12; i++) {
    if (
      (await pageSourceContains('좋아하는 작품')) ||
      (await pageSourceContains('이런 작품은 어때요')) ||
      (await waitForLabel('건너뛰기', 1500))
    ) {
      return true;
    }
    await browser.pause(800);
  }
  return false;
}

describe('Neko — onboarding favorites picker (2026-06-04)', () => {
  before(async () => {
    await forceResetApp();
    await browser.pause(1500);
    const onboarded = await ensureOnboardedOrSkip();
    if (!onboarded) {
      throw new Error('onboarding-favorites before: 온보딩 통과 실패');
    }
    await browser.pause(800);
  });

  // F1~F4 는 단일 favorites_pick mount 위에서 순서대로 검증. before(once) 가 진입 처리.
  it('F1 — favorites_pick step mount + heading 노출', async () => {
    const reached = await reachFavoritesPick();
    await capture('onboarding-favorites-F1-01-mount');
    if (!reached) {
      throw new Error(
        'F1: favorites_pick step 진입 실패 — profile → "+ 새 취향" → context → step1/2 ' +
          '경로 어딘가에서 중단. persona LLM 응답 시간 초과 또는 라벨 drift 의심.',
      );
    }

    // heading 명시 검증 — "좋아하는 작품도 알려주세요"
    if (!(await pageSourceContains('좋아하는 작품'))) {
      throw new Error('F1: heading "좋아하는 작품도 알려주세요" 미노출');
    }
  });

  it('F2 — 초기 그리드 카드 N개 노출 (N ≥ 6 보장)', async () => {
    await capture('onboarding-favorites-F2-01-grid');

    // suggestions 의 각 Pressable accessibilityLabel: "<title> 선택" / "<title> 선택 해제".
    // 초기 MINI_FALLBACK = 6개 (line 40~47), trending API 가 성공하면 setSuggestions 으로
    // 덮어쓰기 (line 65). 어떤 경우든 N ≥ 6.
    const selectables = await $$(
      '-ios predicate string:label ENDSWITH " 선택" OR name ENDSWITH " 선택"',
    );

    // ENDSWITH 매칭 안 되는 환경 fallback — pageSource 에 "선택" 토큰 등장 횟수 측정.
    if (selectables.length >= 6) {
      // 충분 — 통과.
      return;
    }

    // fallback: pageSource 토큰 카운트
    const src = await browser.getPageSource();
    const count = (src.match(/"[^"]+ 선택"/g) ?? []).length;
    if (count < 6) {
      await capture('onboarding-favorites-F2-02-count-fail');
      throw new Error(
        `F2: 초기 그리드 카드 ${count} 개 < 6 — MINI_FALLBACK 미적용 또는 setSuggestions race`,
      );
    }
  });

  it('F3 — ScrollView 스크롤 가능 + 추가 카드 노출', async () => {
    await capture('onboarding-favorites-F3-01-before-scroll');

    // 그리드 영역 스크롤 swipe (수직 위로). bodyScroll 컨테이너가 화면 중앙~하단 차지.
    const { width, height } = await browser.getWindowSize();
    for (let i = 0; i < 3; i++) {
      await browser.performActions([
        {
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x: width * 0.5, y: height * 0.7 },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 80 },
            { type: 'pointerMove', duration: 350, x: width * 0.5, y: height * 0.3 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ]);
      await browser.releaseActions();
      await browser.pause(400);
    }
    await capture('onboarding-favorites-F3-02-after-scroll');

    // 스크롤 후 "다른 작품 보기" 버튼이 보여야 함. line 242 accessibilityLabel.
    if (!(await waitForLabel('다른 작품 보기', 5000))) {
      throw new Error(
        'F3: 스크롤 후 "다른 작품 보기" 버튼 미노출 — ScrollView 콘텐츠 길이 부족 또는 ' +
          'suggestions 가 빈 배열 (네트워크 실패 + MINI_FALLBACK 미적용 의심)',
      );
    }
  });

  it('F4 — "다른 작품 보기" 버튼 탭 → fetchTrending 갱신', async () => {
    await capture('onboarding-favorites-F4-01-before-tap');

    // 버튼 노출 보장 — 만약 F3 스크롤 직후라면 이미 노출 상태.
    if (!(await waitForLabel('다른 작품 보기', 4000))) {
      // 추가 스크롤 시도
      const { width, height } = await browser.getWindowSize();
      await browser.performActions([
        {
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x: width * 0.5, y: height * 0.75 },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 80 },
            { type: 'pointerMove', duration: 300, x: width * 0.5, y: height * 0.25 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ]);
      await browser.releaseActions();
      await browser.pause(600);
      if (!(await waitForLabel('다른 작품 보기', 4000))) {
        throw new Error('F4: "다른 작품 보기" 버튼 미노출 (F3 통과 후에도)');
      }
    }

    if (!(await tapByLabel('다른 작품 보기', { timeout: 3000 }))) {
      throw new Error('F4: "다른 작품 보기" 버튼 tap 실패');
    }
    // fetchTrending 응답 대기. loadingSuggestions 로딩 라벨 → 다시 텍스트 복귀까지.
    // Pressable disabled 가 loadingSuggestions 일 때 토글되므로 직접 검증 어려움.
    // 대신 버튼 라벨이 "로딩..." → "다른 작품 보기" 로 복귀하는지 polling.
    let restored = false;
    for (let i = 0; i < 10; i++) {
      await browser.pause(700);
      const src = await browser.getPageSource();
      const inLoading = src.includes('로딩...');
      const inRestored = src.includes('다른 작품 보기');
      if (!inLoading && inRestored) {
        restored = true;
        break;
      }
    }
    await capture('onboarding-favorites-F4-02-after-tap');

    if (!restored) {
      // network 실패로 영원히 loading 일 수 있음 — WARN 으로 처리 가능하나 spec 은 FAIL.
      throw new Error(
        'F4: 탭 후 "다른 작품 보기" 라벨 복귀 실패 — fetchTrending 응답 timeout 또는 ' +
          'loadingSuggestions state 가 false 로 복귀 안 됨',
      );
    }
  });
});
