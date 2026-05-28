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
  const id = bundleId ?? (cap['appium:bundleId'] as string) ?? 'host.exp.Exponent';
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
