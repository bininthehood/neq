/**
 * Neko native E2E — 2026-06-18 "내 OTT 만 보기" Discover 토글 (1.0.3 train)
 *
 * project_native_parity_gaps 잔여 (P2) 항목 — Discover FilterChips 좌측 토글 chip.
 *
 * 동작 명세 (`_workspace/14_spec-my-ott-toggle-2026-06-18.md`):
 *   1) subscribedOtt 0건: chip disabled + tap → Alert ("내 OTT 설정") + Profile 진입 CTA
 *   2) subscribedOtt 보유: chip tap → toggle ON. filterOTTs = subscribedOtt 매핑 셋.
 *   3) toggle OFF: 이전 filterOTTs 복원.
 *   4) toggle ON 상태에서 OTT dropdown 으로 OTT 변경 → 토글 자동 OFF (override 강조).
 *
 * 본 spec 은 작성만 — 실행은 사용자 환경 (시뮬레이터 dev client) 의존.
 * `npm run test:e2e:ios` 에 통합 시 wdio.conf.ts spec glob 자동 매칭.
 *
 * a11y label 정본:
 *   - 토글 chip       : "내 OTT 만 보기" (accessibilityRole="switch")
 *   - Alert 버튼      : "설정하기" / "취소" (RN Alert system overlay)
 *   - 기존 OTT chip   : "OTT 필터" (filters-2026-05-21 spec 정합)
 *   - dropdown option : "{OTT 이름} 선택" (FilterChips Option a11y)
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

async function tapByLabel(label: string, opts: { timeout?: number } = {}): Promise<boolean> {
  const timeout = opts.timeout ?? 2000;
  try {
    const el = await $(`~${label}`);
    await el.waitForExist({ timeout });
    await el.click();
    return true;
  } catch {
    return false;
  }
}

async function tapTab(label: string): Promise<boolean> {
  return tapByLabel(label, { timeout: 2000 });
}

async function isFilterDropdownOpen(): Promise<boolean> {
  const src = await browser.getPageSource();
  return src.includes('필터 닫기');
}

async function closeFilterDropdownIfOpen(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    if (!(await isFilterDropdownOpen())) return;
    await tapByLabel('필터 닫기', { timeout: 800 });
    await browser.pause(400);
  }
}

/**
 * 토글 chip 의 checked 상태 — accessibilityState.checked 가 page source 의
 * value/checked attribute 로 직렬화된다 (XCUITest). source 안에 "내 OTT 만 보기"
 * 노드의 value 또는 selected 속성으로 ON 여부 추정.
 */
async function isMyOTTToggleOn(): Promise<boolean> {
  try {
    const el = await $('~내 OTT 만 보기');
    await el.waitForExist({ timeout: 1500 });
    // XCUITest: accessibilityState.checked → value="1" (ON) or "0" (OFF).
    const value = await el.getAttribute('value');
    return value === '1' || value === 'true';
  } catch {
    return false;
  }
}

describe("'내 OTT 만 보기' Discover 토글 (1.0.3 train)", () => {
  before(async () => {
    // _helpers.ts 정본 패턴 — 이전 spec 의 onboarding 상태 leak 차단.
    const { forceResetApp, ensureOnboardedOrSkip } = await import('./_helpers');
    await forceResetApp();
    if (!(await ensureOnboardedOrSkip())) {
      throw new Error(
        'before: onboarding 자동 진행 실패. _helpers.ts ensureOnboardedOrSkip 점검 필요.',
      );
    }
    await tapTab('발견');
    await browser.pause(1500);
    await closeFilterDropdownIfOpen();
    await capture('myott-00-initial');
  });

  // ─────────────────────────────────────────────────────────
  // T1 — subscribedOtt 0건 사용자: chip disabled + tap → Alert
  // ─────────────────────────────────────────────────────────
  it('T1 — subscribedOtt 0건: chip 보임 + tap 시 설정 Alert', async () => {
    // 전제: onboarding 자동 skip 흐름은 subscribedOtt 0건 셋팅.
    // `_helpers.ensureOnboardedOrSkip` 가 OTT 단계에서 "건너뛰기" 또는 "다음" 호출.
    const src = await browser.getPageSource();
    expect(src.includes('내 OTT 만 보기')).toBe(true);
    // tap → Alert title "내 OTT 설정" 노출.
    await tapByLabel('내 OTT 만 보기', { timeout: 2000 });
    await browser.pause(500);
    const afterSrc = await browser.getPageSource();
    const alertShown =
      afterSrc.includes('내 OTT 설정') || afterSrc.includes('설정하기');
    await capture('myott-01-zero-alert');
    expect(alertShown).toBe(true);
    // dismiss Alert (취소)
    await tapByLabel('취소', { timeout: 1500 });
    await browser.pause(400);
  });

  // ─────────────────────────────────────────────────────────
  // T2 — subscribedOtt 보유 사용자: 토글 ON → OTT chip 자동 update
  // ─────────────────────────────────────────────────────────
  it('T2 — subscribedOtt 보유: 토글 ON → filterOTTs subscribedOtt 셋', async () => {
    // SETUP: Profile 진입 → Netflix (또는 임의 OTT) 선택 → 발견 복귀.
    // 본 케이스는 setup 자체가 다단계 — 사용자 환경에서 사전 onboarding 시점에
    // OTT 선택을 마치고 진입한 경우만 의미가 있다. 자동 setup helper 가 없으면
    // SKIP 처리 (helper 추가 시 활성화).
    // 2026-07-10 — 가용성 판정 재작성. 칩은 subscribedOtt 0건이어도 disabled prop
    // 없이 탭 시 "내 OTT 설정" Alert 로 안내하는 구조라 enabled attr 검사가 무의미
    // (항상 true → 클린 온보딩 상태에서 SKIP 대신 FAIL). 실제 탭 후 Alert 노출
    // 여부가 유일한 신뢰 신호 — Alert 뜨면 취소 후 SKIP (T1 정합).
    await tapByLabel('내 OTT 만 보기', { timeout: 2000 });
    await browser.pause(800);
    if (await pageSourceContains('내 OTT 설정')) {
      await tapByLabel('취소');
      await browser.pause(400);
      console.log('T2 SKIP — subscribedOtt 0건 (설정 Alert 노출, T1 정합). Profile 사전 setup 필요');
      return;
    }
    const after = await isMyOTTToggleOn();
    await capture('myott-02-on');
    expect(after).toBe(true);
    // OTT chip 라벨 변화 — filterOTTs.size > 0 시 "OTT" → "OTT N개" 또는 단일 이름.
    const src = await browser.getPageSource();
    const ottChipChanged =
      !src.includes('OTT 필터: OTT') || src.match(/OTT \d+개|Netflix|TVING|wavve|Watcha/);
    expect(!!ottChipChanged).toBe(true);
  });

  // ─────────────────────────────────────────────────────────
  // T3 — 토글 OFF → 이전 filterOTTs 복원
  // ─────────────────────────────────────────────────────────
  it('T3 — 토글 OFF: 이전 filterOTTs 복원 (empty Set)', async () => {
    // T2 가 SKIP 되었으면 본 케이스도 의미 없음 — chained dependency.
    const currentlyOn = await isMyOTTToggleOn();
    if (!currentlyOn) {
      console.log('T3 SKIP — T2 (ON 전이) 가 SKIP 또는 실패');
      return;
    }
    await tapByLabel('내 OTT 만 보기', { timeout: 2000 });
    await browser.pause(800);
    const after = await isMyOTTToggleOn();
    await capture('myott-03-off');
    expect(after).toBe(false);
    // 복원된 filterOTTs 는 T2 시작 전과 동일 (empty Set 가정 — onboarding 직후).
    const src = await browser.getPageSource();
    // OTT chip 라벨 = "OTT" (size 0).
    expect(src.includes('OTT 필터')).toBe(true);
  });

  // ─────────────────────────────────────────────────────────
  // T4 — 토글 ON 상태에서 OTT dropdown 으로 OTT 변경 → 토글 자동 OFF
  // ─────────────────────────────────────────────────────────
  it('T4 — 토글 ON → OTT dropdown 으로 OTT 변경 → 토글 자동 OFF', async () => {
    // 사전: 토글 ON 상태 만들기 — 2026-07-10: T2 와 동일하게 Alert 노출 = SKIP.
    if (!(await isMyOTTToggleOn())) {
      await tapByLabel('내 OTT 만 보기', { timeout: 2000 });
      await browser.pause(800);
      if (await pageSourceContains('내 OTT 설정')) {
        await tapByLabel('취소');
        await browser.pause(400);
        console.log('T4 SKIP — subscribedOtt 0건 (설정 Alert 노출)');
        return;
      }
    }
    expect(await isMyOTTToggleOn()).toBe(true);
    // OTT dropdown 열고 임의 OTT 선택 (Netflix).
    await tapByLabel('OTT 필터', { timeout: 2000 });
    await browser.pause(500);
    // Netflix 선택 또는 모든 OTT 토글로 변경 시그널 발생.
    const tapped =
      (await tapByLabel('Netflix 선택', { timeout: 1500 })) ||
      (await tapByLabel('모든 OTT 선택', { timeout: 1500 }));
    expect(tapped).toBe(true);
    await browser.pause(800);
    // 토글 자동 OFF 검증.
    const afterToggle = await isMyOTTToggleOn();
    await capture('myott-04-auto-off');
    expect(afterToggle).toBe(false);
    await closeFilterDropdownIfOpen();
  });
});
