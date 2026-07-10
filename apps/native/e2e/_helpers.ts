/**
 * Native E2E 공통 helper — spec audit (2026-05-28) 의 기반 모듈.
 *
 * 기존 4 spec (filters / regression / persona-taste-survey / extended) 의 inline
 * helper 중복 통합 + 신규 forceResetApp / dismissKeyboard / waitForOnboardingReset.
 *
 * 메모리 `feedback_native_a11y_e2e_patterns` 의 4종 트랩 우회 헬퍼 포함:
 *   1) 첫 탭 race — waitForOnboardingReset 의 3-5s 대기
 *   2) dual a11y label — tapByLabel 실패 시 predicate (label OR name) fallback
 *   3) wrap a11y 흡수 — tapTab 의 predicate 분기
 *   4) sim 상태 leak — forceResetApp 매 spec before hook
 */

import fs from 'node:fs';
import path from 'node:path';

const SHOT_DIR = path.resolve(__dirname, 'screenshots');

export async function capture(name: string): Promise<string> {
  if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(SHOT_DIR, `${ts}-${name}.png`);
  await browser.saveScreenshot(file);
  console.log(`shot ${file}`);
  return file;
}

export async function tapByLabel(
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

export async function tapByPredicate(
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

/**
 * 탭바 진입 — `~label` 우선 시도, 실패 시 predicate (label OR name) fallback.
 * 메모리 트랩 #2 (dual a11y label) + #3 (wrap a11y 흡수) 우회.
 */
export async function tapTab(label: string): Promise<boolean> {
  if (await tapByLabel(label, { timeout: 2000 })) return true;
  return tapByPredicate(`label == "${label}" OR name == "${label}"`, {
    timeout: 3000,
  });
}

export async function waitForLabel(
  label: string,
  timeoutMs = 5000,
): Promise<boolean> {
  try {
    const el = await $(`~${label}`);
    await el.waitForExist({ timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

export async function pageSourceContains(needle: string): Promise<boolean> {
  const source = await browser.getPageSource();
  return source.includes(needle);
}

/**
 * 키보드 dismiss — 3가지 패턴.
 * `done`: returnKeyType="done" 의 onSubmitEditing 트리거 (예: OnboardingStepHello)
 * `cancel`: returnKeyType="cancel"
 * `tap-outside`: input 외 빈 영역 tap (focus loss)
 */
export async function dismissKeyboard(
  method: 'done' | 'cancel' | 'tap-outside' = 'done',
): Promise<void> {
  if (method === 'tap-outside') {
    try {
      await browser.execute('mobile: tap', { x: 10, y: 200 });
    } catch { /* ignore */ }
    return;
  }
  try {
    await browser.execute('mobile: hideKeyboard', { keys: [method] });
  } catch {
    // fallback: 일반 hideKeyboard
    try { await browser.hideKeyboard(); } catch { /* iOS 일부 환경 */ }
  }
}

/**
 * 앱 강제 reset — terminate + launch + 첫 화면 mount 대기.
 *
 * wdio.conf 의 `autoLaunch: false` 와 spec 간 state share 문제 해결.
 * 매 spec `before` 에서 호출하여 isolation 보장.
 *
 * bundleId 미지정 시 capability 의 bundleId 사용.
 */
export async function forceResetApp(bundleId?: string): Promise<void> {
  const cap = (browser.capabilities as Record<string, unknown>) ?? {};
  // E2E_TARGET 기반 fallback — wdio.conf 의 3-way 분기와 정합.
  // 2026-06-02: default 가 expo-go → simulator-devclient (com.neq.app). expo-go 만 host.exp.Exponent.
  const target = process.env.E2E_TARGET ?? 'simulator-devclient';
  const defaultBundleId = target === 'expo-go' ? 'host.exp.Exponent' : 'com.neq.app';
  const id =
    bundleId ??
    (cap['appium:bundleId'] as string) ??
    (cap.bundleId as string) ??
    defaultBundleId;
  try {
    await browser.execute('mobile: terminateApp', { bundleId: id });
  } catch { /* 이미 종료 */ }
  await browser.pause(500);
  try {
    await browser.execute('mobile: launchApp', { bundleId: id });
  } catch (err) {
    console.warn(`launchApp 실패: ${(err as Error).message}`);
  }
  // 첫 mount 대기 (font/splash + first paint)
  await browser.pause(2500);
}

/**
 * onboarding reset 후 welcome 화면 mount 대기.
 * "시작하기" label 확인. 5s 안에 보이면 ok.
 */
export async function waitForOnboardingReset(timeoutMs = 5000): Promise<boolean> {
  return waitForLabel('시작하기', timeoutMs);
}

/**
 * 첫 tap race 회복 — A2 mount race 대응 (memory feedback_native_a11y_e2e_patterns).
 * tap 후 expectedAfter 가 page source 에 등장할 때까지 retries 회 재시도.
 */
export async function tapWithRetry(
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

/**
 * 6/2 simulator-devclient 전환 후, forceResetApp 직후 dev client AsyncStorage 가
 * 비어 있어 Welcome 화면이 보임. regression / filters / persona-taste-survey /
 * extended 4 spec 은 onboarded 상태 가정 → 자동 통과로 진입.
 *
 * 흐름은 hybrid-onboarding-2026-05-27.test.ts (H1) 의 happy path 와 동일:
 *   welcome → hello (이름 skip 가능) → genre → persona context → persona skip
 *   → ott (시작하기 또는 나중에 설정) → discover
 *
 * 2026-06-16: notify 단계 제거. OTT 가 마지막 단계 → CTA "시작하기".
 *
 * 반환:
 *   true  — Discover 도달 (또는 진입 시점에 이미 onboarded)
 *   false — 도중 실패. 호출 spec 의 before hook 에서 throw 권장.
 */
/**
 * 2026-07-10 — TutorialFlow v3 잔재 처리. 온보딩 직후 첫 Discover 에서 튜토리얼이
 * 활성화되면 가이드 잠금이 카드 탭/비가이드 스와이프를 차단 → P1/S4 류 "카드 탭 →
 * DetailSheet" 케이스가 원인 불명 실패 (2026-07-10 QA 에서 확정). onboarded 상태
 * 진입/완료 양쪽에서 호출해 스위트 순서 의존을 제거한다.
 */
export async function skipTutorialIfActive(): Promise<void> {
  if (!(await pageSourceContains('튜토리얼 건너뛰기'))) return;
  await tapByLabel('튜토리얼 건너뛰기', { timeout: 3000 });
  await browser.pause(600);
}

export async function ensureOnboardedOrSkip(): Promise<boolean> {
  // 이미 Discover (또는 다른 onboarded 화면) 면 튜토리얼 잔재만 정리 후 no-op.
  if (!(await pageSourceContains('시작하기'))) {
    await skipTutorialIfActive();
    return true;
  }

  // (1) Welcome → hello
  if (!(await tapWithRetry('시작하기', '님'))) {
    console.warn('ensureOnboarded: welcome → hello 전이 실패');
    return false;
  }

  // (2) Hello — 2026-07-10 재작성 (시뮬 한국어 IME 트랩).
  // 배경: TextField 자동 포커스로 키보드가 하단('이름 없이 시작' 포함)을 가리고,
  // 한국어 키보드의 완료 키(✓)는 done/Return/완료 등 어떤 이름 매칭에도 안 걸림.
  // 해법: setValue 끝에 '\n' — XCUITest typeText 가 IME 레이아웃과 무관하게
  // return 키를 눌러 onSubmitEditing → submit() 발화. (빈 이름은 submit 이
  // hasValue 가드로 막혀 있어 이름 입력이 선행 필수.)
  await browser.pause(500);
  const inputs = await $$('//XCUIElementTypeTextField');
  if (inputs.length > 0) {
    await inputs[0].setValue('E2E\n');
    await browser.pause(800);
  }
  // 아직 hello 에 머물러 있으면 fallback (키보드 내려간 상태 가정) — 스킵/다음.
  if (await pageSourceContains('어떻게 부를까요')) {
    const submitOk =
      (await tapByLabel('이름 없이 시작', { timeout: 2000 })) ||
      (await tapByLabel('다음', { timeout: 1500 })) ||
      (await tapByPredicate(
        `name == "Return" OR name == "Done" OR name == "완료" OR name == "확인" OR name == "개행"`,
        { timeout: 2000 },
      ));
    if (!submitOk) {
      console.warn('ensureOnboarded: Hello 단계 진행 실패 — return/스킵 전부 미발견');
      return false;
    }
  }
  await browser.pause(800);

  // (3) Genre — 3 chips + 다음
  await browser.pause(800);
  for (const chip of ['드라마', '스릴러', '로맨스']) {
    await tapByLabel(chip);
    await browser.pause(250);
  }
  if (!(await tapByLabel('다음'))) {
    if (!(await tapByLabel('장르 정하지 않고 시작'))) {
      console.warn('ensureOnboarded: genre 진행 실패');
      return false;
    }
  }

  // (4) Persona context (subStep 1) — 영화 + 혼자 + 다음
  if (!(await waitForLabel('영화', 12000))) {
    console.warn('ensureOnboarded: persona context "영화" 미노출');
    return false;
  }
  await tapByLabel('영화');
  await tapByLabel('혼자');
  await browser.pause(300);
  await tapByLabel('다음');

  // resume modal 잔재 정리
  await browser.pause(800);
  if (await pageSourceContains('이어서 하시겠어요')) {
    await tapByLabel('처음부터');
    await browser.pause(500);
  }

  // (5) Persona step 1 → 정적 풀 첫 옵션 + "다음" (정상 경로 승격, 2026-06-06).
  // MOVIE_ALONE[0] option a "빠르게 몰입" — context (영화/혼자) 기준.
  // 이전 페르소나 건너뛰기 UI 는 트랙 A 에서 제거, LLM 호출은 트랙 B 에서 페기.
  // TasteSurveyStep 은 옵션 선택 후 별도 "다음" 버튼 tap 으로 onAnswer 발화.
  if (!(await waitForLabel('빠르게 몰입', 8000))) {
    console.warn('ensureOnboarded: persona step 1 옵션 "빠르게 몰입" 미노출');
    return false;
  }
  await tapByLabel('빠르게 몰입');
  await browser.pause(400);
  if (!(await tapByLabel('다음'))) {
    console.warn('ensureOnboarded: persona step 1 "다음" tap 실패');
    return false;
  }
  await browser.pause(600);

  // (6) Persona step 2 → MOVIE_ALONE[1] option a "명쾌한 마무리" + "다음"
  if (!(await waitForLabel('명쾌한 마무리', 6000))) {
    console.warn('ensureOnboarded: persona step 2 옵션 "명쾌한 마무리" 미노출');
    return false;
  }
  await tapByLabel('명쾌한 마무리');
  await browser.pause(400);
  if (!(await tapByLabel('다음'))) {
    console.warn('ensureOnboarded: persona step 2 "다음" tap 실패');
    return false;
  }
  await browser.pause(600);

  // (7) Persona step 3 → MOVIE_ALONE[2] option a "무거운 주제" + "다음"
  // 정적 풀 step 2 shouldContinue=true 로 모든 사용자 3-step path 진입.
  if (!(await waitForLabel('무거운 주제', 6000))) {
    console.warn('ensureOnboarded: persona step 3 옵션 "무거운 주제" 미노출');
    return false;
  }
  await tapByLabel('무거운 주제');
  await browser.pause(400);
  if (!(await tapByLabel('다음'))) {
    console.warn('ensureOnboarded: persona step 3 "다음" tap 실패');
    return false;
  }
  await browser.pause(600);

  // (8) Favorites picker → 0개 선택 후 "건너뛰기" (페르소나 건너뛰기와 무관 — favorites 의 0 picks 진행)
  if (!(await waitForLabel('건너뛰기', 6000))) {
    console.warn('ensureOnboarded: favorites picker "건너뛰기" 미노출');
    return false;
  }
  await tapByLabel('건너뛰기');
  await browser.pause(800);

  // (9) Summary preview "맞아요" → 페르소나 저장 → OTT 진입
  if (!(await waitForLabel('맞아요', 6000))) {
    console.warn('ensureOnboarded: summary "맞아요" 미노출');
    return false;
  }
  await tapByLabel('맞아요');
  await browser.pause(1500);

  // (10) OTT — 마지막 단계. 나중에 설정 우선, fallback Netflix + 시작하기.
  const ottReached =
    (await waitForLabel('Netflix', 8000)) ||
    (await waitForLabel('TVING', 5000)) ||
    (await waitForLabel('나중에 설정', 5000));
  if (!ottReached) {
    console.warn('ensureOnboarded: OTT 단계 미도달');
    return false;
  }
  if (!(await tapByLabel('나중에 설정'))) {
    await tapByLabel('Netflix');
    await browser.pause(300);
    // OTT 가 최종 step → CTA "시작하기". 구 빌드 ("다음" 사용) fallback 유지.
    if (
      !(await tapByLabel('시작하기', { timeout: 2000 })) &&
      !(await tapByLabel('다음', { timeout: 1500 }))
    ) {
      console.warn('ensureOnboarded: OTT 단계 CTA tap 실패');
      return false;
    }
  }

  // (11) Discover 도달 확인
  await browser.pause(3000);
  const reached =
    (await pageSourceContains('발견')) ||
    (await pageSourceContains('discover'));

  // (12) TutorialFlow v3 skip — 온보딩 직후 Discover 에서 활성화되면 카드 탭이
  // 가이드 잠금에 차단되므로 후속 spec 진입 전 반드시 정리.
  if (reached) {
    await browser.pause(1200);
    await skipTutorialIfActive();
  }
  return reached;
}
