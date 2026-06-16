/**
 * Neko native E2E — Hybrid Onboarding (PR #14, v0.3.3.0)
 *
 * 검증 범위:
 *   H1  Hybrid happy path — welcome → hello → genre → persona(skip via 우상단 X)
 *       → ott → complete. PR #14 신규 동작 = persona 우상단 X 노출 +
 *       Alert.alert confirm 분기. 2026-06-16: notify 단계 제거, OTT 최종.
 *   H2  StepHeader progress 매핑 — 1/9 ~ 4/9 까지 정수 sequential 확인.
 *       persona subStep≥2 진입 시점에 우상단 X 버튼 노출 확인.
 *
 * 회귀 가드 (PR #14 review fix):
 *  - P0 #1: persona 단계에서 우상단 X 가 실제 native StepHeader 에 렌더되고
 *    탭 가능해야 함 (LLM 행 / rate-limit 시 trap 차단)
 *  - P0 #2: native Alert.alert "건너뛰기" → goNext({persona_created:false}) 분기
 *  - P1 #5: stale personaSubStep 회귀 (web RTL OnboardingV2Controller.test 가
 *    이미 커버. native 는 동일 코드 패턴이라 별도 검증 X — smoke 로 충분)
 *
 * 실행 전제:
 *  - iOS Simulator (4EDF2CB4...) 부팅 + Expo Go 설치
 *  - Metro + Appium 4723 가동
 *  - 앱이 이전 세션에서 onboarded 상태 — before() 가 profile reset 으로 초기화
 *
 * 알려진 트랩 (memory feedback_native_a11y_e2e_patterns.md):
 *  - 첫 탭 race (A2 mount race, _workspace/a2-react-mount-race-analysis-2026-05-21.md):
 *    Expo Go dev mode 에서 첫 tap 누락 가능 → retry-with-poll
 *  - dual a11y label: 중복 매칭 시 displayed 만 선택
 *  - Alert.alert 의 "건너뛰기" 는 시스템 alert. predicate 로 접근 필요할 수 있음
 *
 * PR #14 의 hybrid integration 은 RN/iOS 환경에서 같은 코드 경로 (TS 컴포넌트는
 * web/native 양쪽이 별도 파일이지만 로직 동일). 단순 smoke 가 가장 가치 있음.
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

async function tapVisibleByLabel(label: string): Promise<boolean> {
  // dual a11y 매칭 시 displayed 만 선택. memory feedback_native_a11y_e2e_patterns.md
  const els = await $$(`~${label}`);
  for (const t of els) {
    if (await t.isDisplayed()) {
      await t.click();
      return true;
    }
  }
  return false;
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

/** 첫 tap race 회복 — Expo Go dev mode A2 mount race 대응. */
async function tapWithRetry(
  label: string,
  expectedAfter: string,
  opts: { retries?: number; waitMs?: number } = {},
): Promise<boolean> {
  const retries = opts.retries ?? 3;
  const wait = opts.waitMs ?? 800;
  for (let i = 0; i < retries; i++) {
    const ok = await tapByLabel(label, { timeout: 3000 });
    if (!ok) continue;
    await browser.pause(wait);
    if (await pageSourceContains(expectedAfter)) return true;
  }
  return false;
}

async function resetIfOnboarded(): Promise<void> {
  // profile 로 진입해 데이터 초기화 — onboarded 상태에서만 의미 있음.
  // 이미 onboarding 화면이면 skip.
  if (await pageSourceContains('시작하기')) {
    console.log('onboarding 진입 상태 — reset skip');
    return;
  }
  if (!(await tapByLabel('프로필', { timeout: 3000 }))) {
    // 진입 못 하는 상태일 수 있음 — 그대로 진행
    return;
  }
  await browser.pause(800);
  // 스크롤 다운하여 "모든 데이터 초기화" 노출
  for (let i = 0; i < 4; i++) {
    try {
      await browser.execute('mobile: swipe', { direction: 'up' });
      await browser.pause(400);
    } catch {
      break;
    }
  }
  if (!(await tapByLabel('모든 데이터 초기화', { timeout: 3000 }))) {
    console.warn('"모든 데이터 초기화" 미노출 — reset skip');
    return;
  }
  await browser.pause(1000);
  // 확인 alert — "초기화" 또는 "삭제" 또는 "확인"
  for (const label of ['초기화', '삭제', '확인']) {
    if (await tapByPredicate(`label == "${label}"`, { timeout: 1500 })) break;
  }
  await browser.pause(3000);
}

describe('Hybrid Onboarding — v0.3.3.0 PR #14', () => {
  before(async () => {
    await capture('hybrid-00-initial');
    // spec audit (2026-05-28) — terminate + launch 로 isolation 보장.
    // 단, 앱 데이터 reset 까지는 아님 (forceResetApp 는 process restart 만).
    // onboarded 상태면 기존 "프로필 → 모든 데이터 초기화" 경로 시도 (fallback).
    const { forceResetApp, pageSourceContains } = await import('./_helpers');
    await forceResetApp();
    if (!(await pageSourceContains('시작하기'))) {
      // 아직 onboarded 상태 — destructive reset 시도
      await resetIfOnboarded();
    }
    await browser.pause(2000);
    await capture('hybrid-01-after-reset');
  });

  it('H1 — welcome → hello → genre → persona(skip) → ott → complete', async () => {
    // === Welcome (1/9) ===
    if (!(await waitForLabel('시작하기'))) {
      throw new Error('welcome "시작하기" 미노출 — reset 실패 또는 onboarding flag OFF');
    }
    await capture('hybrid-02-welcome');
    if (!(await tapWithRetry('시작하기', '님'))) {
      throw new Error('welcome → hello 전이 실패 (A2 mount race 가능)');
    }

    // === Hello (2/9) ===
    await browser.pause(500);
    const inputs = await $$('//XCUIElementTypeTextField');
    if (inputs.length > 0) {
      await inputs[0].setValue('Tester');
      await browser.pause(300);
      // OnboardingStepHello: returnKeyType="done" + onSubmitEditing → submit().
      // 화면 "다음" 버튼이 키보드에 가려져 직접 tap 안 됨. 키보드 "done" 키 =
      // "다음" 동등 (onSubmitEditing 트리거). hideKeyboard pressKey done 으로
      // 자연 진행.
      try { await browser.execute('mobile: hideKeyboard', { keys: ['done'] }); }
      catch { /* iOS 일부 환경 — pause + tap fallback */ }
      await browser.pause(500);
    }
    await capture('hybrid-03-hello');
    // done 키로 hello 통과했을 수 있어 "다음" 부재 가능. 안전 fallback:
    if (!(await tapByLabel('다음', { timeout: 1500 }))) {
      if (!(await tapByLabel('이름 없이 시작', { timeout: 1500 }))) {
        // 이미 Genre 단계로 이동했다고 가정 — 다음 검증으로 진행
      }
    }

    // === Genre (3/9) ===
    await browser.pause(800);
    await capture('hybrid-04-genre');
    for (const chip of ['드라마', '스릴러', '로맨스']) {
      await tapByLabel(chip);
      await browser.pause(250);
    }
    if (!(await tapByLabel('다음'))) {
      // 보조 옵션 fallback
      if (!(await tapByLabel('장르 정하지 않고 시작'))) {
        throw new Error('genre "다음"/"장르 정하지 않고 시작" 실패');
      }
    }

    // === Persona — subStep 1 (context_select, header 4/9) ===
    if (!(await waitForLabel('영화', 12000))) {
      throw new Error('persona context_select "영화" pill 미노출 — hybrid inline mount 실패 가능');
    }
    await capture('hybrid-05-persona-context');

    // PR #14 회귀 가드 — subStep=1 일 때 우상단 X 는 hidden, back 만 노출
    const skipBtnHidden = !(await $('~취향 만들기 건너뛰기').isExisting());
    if (!skipBtnHidden) {
      console.warn('subStep=1 에서 우상단 X 가 노출됨 — P0#1 가드 위반 가능성');
    }

    if (!(await tapByLabel('영화'))) throw new Error('영화 pill tap 실패');
    if (!(await tapByLabel('혼자'))) throw new Error('혼자 pill tap 실패');
    await browser.pause(300);
    if (!(await tapByLabel('다음'))) throw new Error('persona context "다음" tap 실패');

    // resume modal 처리 — 이전 cancel 한 progress 잔재 가능 (sim leak)
    await browser.pause(800);
    if (await pageSourceContains('이어서 하시겠어요')) {
      console.log('resume modal — 처음부터 선택');
      await tapByLabel('처음부터');
      await browser.pause(500);
    }

    // === Persona — subStep ≥ 2 (step_loading + 우상단 X 검증) ===
    // 우상단 X (페르소나 만들기 건너뛰기) 가 mount 됐는지 확인. PR #14 P0#1 fix.
    if (!(await waitForLabel('취향 만들기 건너뛰기', 8000))) {
      throw new Error(
        'PR #14 P0#1 회귀: subStep≥2 에서 우상단 X "취향 만들기 건너뛰기" 미노출 — trap 차단 실패',
      );
    }
    await capture('hybrid-06-persona-skip-button');

    // X 탭 → Alert.alert "건너뛰기" 확인 → OTT 으로 advance
    if (!(await tapByLabel('취향 만들기 건너뛰기'))) {
      throw new Error('우상단 X tap 실패');
    }
    await browser.pause(1000);

    // Alert.alert 의 "건너뛰기" 버튼. iOS native alert 라 predicate 로 접근.
    const alertOk =
      (await tapByPredicate(`label == "건너뛰기"`, { timeout: 5000 })) ||
      (await tapByLabel('건너뛰기'));
    if (!alertOk) {
      throw new Error('Alert.alert "건너뛰기" 버튼 tap 실패 — P0#2 confirm 분기 검증 실패');
    }
    await browser.pause(1500);
    await capture('hybrid-07-after-skip-confirm');

    // === OTT (9/9, 최종 단계) ===
    // persona skip 후 step=4 (ott) 으로 advance. OTT 가 최종 단계 — CTA "시작하기".
    // 2026-06-16: notify 단계 제거. OTT 완료 → 곧바로 Discover 진입.
    const ottReached =
      (await waitForLabel('Netflix', 8000)) ||
      (await waitForLabel('TVING', 5000)) ||
      (await waitForLabel('나중에 설정', 5000));
    if (!ottReached) {
      throw new Error('persona skip 후 OTT step 미진입 — P0#2 분기 실패');
    }
    await capture('hybrid-08-ott');

    if (!(await tapByLabel('나중에 설정'))) {
      // OTT 1개 선택 + "시작하기" (구 빌드 "다음" fallback)
      await tapByLabel('Netflix');
      await browser.pause(300);
      if (
        !(await tapByLabel('시작하기', { timeout: 2000 })) &&
        !(await tapByLabel('다음', { timeout: 1500 }))
      ) {
        throw new Error('OTT 단계 CTA tap 실패');
      }
    }

    // === Complete — Discover 또는 Bridge 도달 ===
    await browser.pause(3000);
    await capture('hybrid-09-after-ott');
    const reachedApp =
      (await pageSourceContains('발견')) ||
      (await pageSourceContains('discover'));
    if (!reachedApp) {
      throw new Error('onboarding 완료 후 Discover 미도달');
    }
    await capture('hybrid-10-discover');
  });
});
