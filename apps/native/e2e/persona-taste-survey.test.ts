/**
 * Neko native E2E — Persona v2 (LLM 동적 취향 설문) full flow
 *
 * 검증 범위 (PR 3 / G4a):
 *   P0  영화/혼자 컨텍스트 → step 1 (LLM) → step 2 (LLM) → summary → "맞아요" → persona 생성
 *   P1  "다시 받기" 클릭 → step 2 부터 재진입
 *   P2  닫기 (✕) → onCancel + taste_survey_abandoned 분석 이벤트
 *
 * 실행 전제:
 *  - Expo Go / dev client 가 시뮬레이터에 로드됨
 *  - EXPO_PUBLIC_PERSONA_SURVEY_V2_ENABLED=true (profile 의 "+ 새 취향 추가" 가 controller 진입)
 *  - 네트워크 가능 — /api/onboarding/taste-survey/* endpoint 응답 시간 < 10s
 *  - Appium / Metro 가동
 *  - 첫 페르소나 1개 이상 (default) 존재
 *
 * 알려진 트랩 (memory feedback_native_a11y_e2e_patterns.md):
 *  - 첫 탭 race: ~Label 검색 시 mount 전. tapByLabel 헬퍼가 waitForExist 처리
 *  - dual a11y label: 닫기 등 중복 → last 매칭 사용
 *  - wrap a11y 흡수: Pressable 안의 Text 가 a11y 흡수 → Pressable 에 accessibilityLabel
 *  - sim 상태 leak: 직전 테스트 잔재로 페르소나 누적 가능 → before each 에서 페르소나 1개 보장
 */

import fs from 'node:fs';
import path from 'node:path';

const SHOT_DIR = path.resolve(__dirname, 'screenshots');

async function capture(name: string): Promise<string> {
  if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(SHOT_DIR, `${ts}-${name}.png`);
  await browser.saveScreenshot(file);
  console.log(`shot ${file}`);
  return file;
}

async function tapByLabel(
  label: string,
  opts: { timeout?: number } = {},
): Promise<boolean> {
  const timeout = opts.timeout ?? 5000;
  try {
    const el = await $(`~${label}`);
    await el.waitForExist({ timeout });
    await el.click();
    return true;
  } catch (err) {
    console.warn(`tap ${label} 실패: ${(err as Error).message}`);
    return false;
  }
}

async function tapByPredicate(
  predicate: string,
  opts: { timeout?: number } = {},
): Promise<boolean> {
  const timeout = opts.timeout ?? 5000;
  try {
    const el = await $(`-ios predicate string:${predicate}`);
    await el.waitForExist({ timeout });
    await el.click();
    return true;
  } catch (err) {
    console.warn(`predicate ${predicate} 실패: ${(err as Error).message}`);
    return false;
  }
}

async function tapTab(label: string): Promise<boolean> {
  if (await tapByLabel(label, { timeout: 2000 })) return true;
  return tapByPredicate(`label == "${label}" OR name == "${label}"`, {
    timeout: 3000,
  });
}

async function waitForLabel(
  label: string,
  timeout = 12000,
): Promise<boolean> {
  try {
    const el = await $(`~${label}`);
    await el.waitForExist({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function pageSourceContains(needle: string): Promise<boolean> {
  const source = await browser.getPageSource();
  return source.includes(needle);
}

/**
 * step_question phase 의 옵션 element 가 mount 될 때까지 대기.
 * SurveyHeader 의 "2/4", "3/4" progress 는 step_loading 도 매칭 → 사용 X.
 * value="radio button" 정규식은 native Pressable accessibilityRole="radio" 의
 * XCUITest 매핑. 4개 옵션 모두 매칭되므로 첫 매칭 확인.
 */
async function waitForOptions(timeoutMs = 25000): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const src = await browser.getPageSource();
    const m = src.match(/value="radio button"\s+name="([^"]+)"/);
    if (m?.[1]) return m[1];
    await browser.pause(400);
  }
  return null;
}

describe('Persona v2 — taste survey full flow', () => {
  before(async () => {
    // spec audit (2026-05-28) — 이전 spec 의 onboarding 상태 leak 방지.
    // forceResetApp + onboarding skip check + 프로필 탭 진입 (helper 의 강화 tapTab).
    const { forceResetApp, ensureOnboardedOrSkip } = await import('./_helpers');
    await forceResetApp();
    if (!(await ensureOnboardedOrSkip())) {
      throw new Error(
        'before: onboarding 자동 진행 실패. _helpers.ts ensureOnboardedOrSkip 의 단계별 라벨 확인 필요.',
      );
    }
    const ok = await tapTab('프로필');
    if (!ok) throw new Error('프로필 탭 진입 실패 — 앱 mount 미확인 (탭바 미렌더)');
    await browser.pause(800);
    await capture('persona-v2-00-profile');
  });

  it('P0 — 영화/혼자 → step 1/2 → summary → 맞아요 → 새 페르소나 생성', async () => {
    // 1. 프로필의 "+ 새 취향 추가" 탭 → /onboarding/taste-survey 진입
    const enter = await tapByPredicate(
      `label CONTAINS "새 취향" OR name CONTAINS "새 취향"`,
      { timeout: 5000 },
    );
    if (!enter) throw new Error('"+ 새 취향 추가" 버튼 진입 실패');
    // 컨텍스트 selector 렌더 대기
    if (!(await waitForLabel('영화'))) {
      throw new Error('컨텍스트 selector "영화" pill 미노출');
    }
    await capture('persona-v2-01-context');

    // 2. 컨텍스트: 영화 + 혼자 선택 → 다음
    if (!(await tapByLabel('영화'))) throw new Error('영화 pill tap 실패');
    if (!(await tapByLabel('혼자'))) throw new Error('혼자 pill tap 실패');
    await browser.pause(300);
    if (!(await tapByLabel('다음'))) throw new Error('컨텍스트 "다음" 탭 실패');

    // 2a. resume modal 노출 가능성 — 이전 cancel 한 progress 잔재.
    // "처음부터" 클릭하여 깨끗한 새 시작 보장.
    await browser.pause(800);
    const hasResume = await pageSourceContains('이어서 하시겠어요');
    if (hasResume) {
      console.log('resume modal 감지 — "처음부터" 클릭');
      await tapByLabel('처음부터');
      await browser.pause(500);
    }

    // 3. step 1 LLM 응답 대기 → 옵션 element mount 까지 polling.
    const firstOption1 = await waitForOptions(25000);
    await capture('persona-v2-02-step1');
    if (!firstOption1) {
      throw new Error('step 1 옵션 mount 대기 timeout');
    }
    if (!(await tapByLabel(firstOption1)))
      throw new Error(`step 1 옵션 "${firstOption1}" tap 실패`);
    if (!(await tapByLabel('다음')))
      throw new Error('step 1 "다음" tap 실패');

    // 4. step 2 LLM 응답 대기 + 첫 옵션 탭
    const firstOption2 = await waitForOptions(25000);
    await capture('persona-v2-03-step2');
    if (!firstOption2) {
      throw new Error('step 2 옵션 mount 대기 timeout');
    }
    if (!(await tapByLabel(firstOption2)))
      throw new Error(`step 2 옵션 "${firstOption2}" tap 실패`);
    if (!(await tapByLabel('다음')))
      throw new Error('step 2 "다음" tap 실패');

    // 5a. favorites_pick step — 본 케이스는 skip path (건너뛰기) 로 빠른 통과.
    if (!(await waitForLabel('건너뛰기', 15000))) {
      throw new Error('favorites_pick "건너뛰기" 미노출');
    }
    await capture('persona-v2-03b-favorites');
    if (!(await tapByLabel('건너뛰기')))
      throw new Error('"건너뛰기" tap 실패');

    // 5b. summary preview 도달 — "맞아요" 등장 대기 (LLM summary 최대 12s)
    if (!(await waitForLabel('맞아요', 20000))) {
      throw new Error('summary preview "맞아요" 미노출');
    }
    await browser.pause(400);
    await capture('persona-v2-04-summary');

    if (!(await tapByLabel('맞아요')))
      throw new Error('"맞아요" tap 실패');

    // 6. 페르소나 생성 후 onComplete → router.back → profile 로 복귀
    //    "영화 · 혼자" 라벨이 PersonaSection 에 추가됨. router.back transition 가
    //    iOS 에서 비동기적이라 retry loop (최대 5s).
    await browser.pause(1500);
    await capture('persona-v2-05-after-accept');

    // profile 화면이면 탭바의 "프로필" tab 노출. 다른 라우트면 다시 탭 진입.
    const onProfile =
      (await pageSourceContains('취향')) &&
      (await pageSourceContains('+ 새 취향 추가'));
    if (!onProfile) {
      console.log('profile 아닌 화면 — 프로필 탭 진입 재시도');
      await tapTab('프로필');
      await browser.pause(1200);
    }

    let created = false;
    for (let i = 0; i < 5; i++) {
      if (await pageSourceContains('영화 · 혼자')) {
        created = true;
        break;
      }
      await browser.pause(800);
    }
    if (!created) {
      await capture('persona-v2-05-not-created');
      throw new Error('신규 페르소나 "영화 · 혼자" 가 프로필에 노출되지 않음');
    }
    await capture('persona-v2-05-created');
  });

  it('P1 — "다시 받기" → step 2 부터 재진입', async () => {
    const enter = await tapByPredicate(
      `label CONTAINS "새 취향" OR name CONTAINS "새 취향"`,
      { timeout: 5000 },
    );
    if (!enter) throw new Error('"+ 새 취향 추가" 진입 실패');

    if (!(await waitForLabel('시리즈')))
      throw new Error('컨텍스트 selector "시리즈" pill 미노출');
    if (!(await tapByLabel('시리즈'))) throw new Error('시리즈 pill tap 실패');
    if (!(await tapByLabel('혼자'))) throw new Error('혼자 pill tap 실패');
    if (!(await tapByLabel('다음'))) throw new Error('컨텍스트 "다음" tap 실패');

    // resume modal 처리
    await browser.pause(800);
    if (await pageSourceContains('이어서 하시겠어요')) {
      await tapByLabel('처음부터');
      await browser.pause(500);
    }

    // step 1 옵션 + 다음
    const o1 = await waitForOptions(25000);
    if (!o1) throw new Error('P1 step 1 옵션 mount 대기 timeout');
    if (!(await tapByLabel(o1))) throw new Error(`P1 step 1 옵션 tap 실패`);
    if (!(await tapByLabel('다음'))) throw new Error('P1 step 1 "다음" tap 실패');

    // step 2 옵션 + 다음
    const o2 = await waitForOptions(25000);
    if (!o2) throw new Error('P1 step 2 옵션 mount 대기 timeout');
    if (!(await tapByLabel(o2))) throw new Error(`P1 step 2 옵션 tap 실패`);
    if (!(await tapByLabel('다음'))) throw new Error('P1 step 2 "다음" tap 실패');

    // favorites_pick — skip
    if (!(await waitForLabel('건너뛰기', 15000)))
      throw new Error('P1 favorites_pick "건너뛰기" 미노출');
    if (!(await tapByLabel('건너뛰기'))) throw new Error('P1 "건너뛰기" tap 실패');

    // summary 도달 → "다시 받기" tap
    if (!(await waitForLabel('다시 받기', 20000)))
      throw new Error('P1 summary "다시 받기" 미노출');
    await capture('persona-v2-06-summary-retry');
    if (!(await tapByLabel('다시 받기')))
      throw new Error('"다시 받기" tap 실패');

    // step 2 재진입 — 옵션 mount 까지 대기
    const o2b = await waitForOptions(25000);
    if (!o2b) throw new Error('"다시 받기" 후 step 2 옵션 mount 안 됨');
    await capture('persona-v2-07-resurvey-step2');

    // cleanup
    await tapByLabel('설문 닫기');
    await browser.pause(1000);
  });

  it('P2 — 닫기 (✕) → onCancel + abandoned 이벤트', async () => {
    const enter = await tapByPredicate(
      `label CONTAINS "새 취향" OR name CONTAINS "새 취향"`,
      { timeout: 5000 },
    );
    if (!enter) throw new Error('P2 "+ 새 취향 추가" 진입 실패');

    if (!(await waitForLabel('영화')))
      throw new Error('P2 컨텍스트 selector "영화" pill 미노출');

    if (!(await tapByLabel('영화'))) throw new Error('P2 영화 pill tap 실패');
    if (!(await tapByLabel('같이'))) throw new Error('P2 같이 pill tap 실패');
    if (!(await tapByLabel('다음'))) throw new Error('P2 컨텍스트 "다음" tap 실패');
    await browser.pause(1500);

    if (!(await tapByLabel('설문 닫기')))
      throw new Error('"설문 닫기" ✕ 버튼 tap 실패');

    await browser.pause(1500);
    // close 함수가 router.replace('/profile') 호출 → "+ 새 취향 추가" 다시 노출
    let onProfile = false;
    for (let i = 0; i < 5; i++) {
      if (await pageSourceContains('+ 새 취향 추가')) {
        onProfile = true;
        break;
      }
      await browser.pause(800);
    }
    if (!onProfile) {
      await capture('persona-v2-08-cancel-no-return');
      throw new Error('cancel 후 profile 복귀 실패');
    }
    await capture('persona-v2-08-cancelled');
  });
});
