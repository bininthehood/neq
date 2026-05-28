/**
 * Neko native E2E — 2026-05-21 필터칩 회귀 (B4)
 *
 * FilterChips 의 Chip/Option 에 accessibilityLabel 추가 후 dev env 에서의 기본
 * 동작 회귀 보호. Option Pressable a11y 가 panel wrap 의 Pressable 흡수 때문에
 * 현재 dev env (Expo Go + Fast Refresh) 에서 page source 노출이 불완전한 영역
 * 발견 → A2 와 동일 카테고리. EAS prod 빌드 검증 후 확정.
 *
 * 현재 spec 검증 범위:
 *  - 5칩 (유형/국가/년도/별점/OTT) 모두 mount + accessibilityLabel "{kind} 필터"
 *  - 각 chip tap → dropdown mount (필터 닫기 backdrop 표출)
 *  - dropdown 닫기 동작
 *  - chip 라벨 변경 transition: code-driven 보다 page source level 동작
 *
 * SKIP: option tap → filter state 변경 (dev env page source 한계, A2 트랙).
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

async function closeDetailSheetIfOpen(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const els = await $$('~닫기');
    if (els.length === 0) return;
    try {
      await els[els.length - 1].click();
    } catch {
      return;
    }
    await browser.pause(500);
  }
}

async function closeSearchSheetIfOpen(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const els = await $$('~검색 닫기');
    if (els.length === 0) return;
    try {
      await els[els.length - 1].click();
    } catch {
      return;
    }
    await browser.pause(500);
  }
}

async function ensureChipsVisible(): Promise<void> {
  await closeSearchSheetIfOpen();
  await closeDetailSheetIfOpen();
  await closeFilterDropdownIfOpen();
}

// A2 race 우회 — chip 탭 retry 후 dropdown mount 확인
async function openChipDropdown(kind: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const tapped = await tapByLabel(`${kind} 필터`, { timeout: 2000 });
    if (!tapped) continue;
    for (let i = 0; i < 4; i++) {
      await browser.pause(400);
      if (await isFilterDropdownOpen()) {
        console.log(`${kind} dropdown 열림 (attempt ${attempt + 1})`);
        return true;
      }
    }
  }
  return false;
}

// ──────────────────────────────────────────────────────────
// B4 — 필터칩 회귀 (a11y label + dropdown mount/close)
// ──────────────────────────────────────────────────────────
describe('B4 — 필터칩 회귀', () => {
  before(async () => {
    // spec audit (2026-05-28) — 이전 spec 의 onboarding 상태 leak 방지.
    // forceResetApp + onboarded state 확인 후 "발견" 탭 진입.
    const { forceResetApp, pageSourceContains } = await import('./_helpers');
    await forceResetApp();
    if (await pageSourceContains('시작하기')) {
      throw new Error(
        'before: 앱이 onboarding (welcome) 화면. filters spec 은 onboarded 상태 가정. ' +
        '수동 onboarding 완료 후 재실행 필요.',
      );
    }
    await tapTab('발견');
    await browser.pause(1500);
    await ensureChipsVisible();
    await capture('b4-00-initial');
  });

  after(async () => {
    await ensureChipsVisible();
  });

  it('5칩 (유형/국가/년도/별점/OTT) accessibilityLabel 존재', async () => {
    const src = await browser.getPageSource();
    const chips = ['유형 필터', '국가 필터', '년도 필터', '별점 필터'];
    // OTT 는 availableOTTs.length > 0 조건부 — 조건 미충족시 부재 가능
    const presence = chips.map((c) => ({ chip: c, present: src.includes(c) }));
    for (const p of presence) {
      console.log(`  ${p.chip}: ${p.present}`);
    }
    const allPresent = presence.every((p) => p.present);
    expect(allPresent).toBe(true);
  });

  it('유형 chip tap → dropdown mount (필터 닫기 backdrop 표출)', async () => {
    const opened = await openChipDropdown('유형');
    await capture('b4-02-type-dropdown');
    expect(opened).toBe(true);
    await closeFilterDropdownIfOpen();
  });

  it('국가 chip tap → dropdown mount', async () => {
    const opened = await openChipDropdown('국가');
    await capture('b4-03-origin-dropdown');
    expect(opened).toBe(true);
    await closeFilterDropdownIfOpen();
  });

  it('년도 chip tap → dropdown mount', async () => {
    const opened = await openChipDropdown('년도');
    await capture('b4-04-year-dropdown');
    expect(opened).toBe(true);
    await closeFilterDropdownIfOpen();
  });

  it('별점 chip tap → dropdown mount', async () => {
    const opened = await openChipDropdown('별점');
    await capture('b4-05-rating-dropdown');
    expect(opened).toBe(true);
    await closeFilterDropdownIfOpen();
  });

  it('dropdown 닫기 — backdrop "필터 닫기" 탭 시 dismiss', async () => {
    await openChipDropdown('유형');
    expect(await isFilterDropdownOpen()).toBe(true);
    await closeFilterDropdownIfOpen();
    expect(await isFilterDropdownOpen()).toBe(false);
    await capture('b4-06-dismissed');
  });
});
