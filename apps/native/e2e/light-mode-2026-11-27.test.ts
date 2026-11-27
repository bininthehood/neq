/**
 * Night Pool 3단계 — 라이트 모드 진입 E2E (계획 T6 ②, D8).
 *
 * 시스템 밝기를 `xcrun simctl ui booted appearance light|dark` 로 바꾸고
 * 발견 → 상세 → 큐 → 저장 → 검색 → 프로필을 돌며 테마별 스크린샷을 남긴다.
 * DynamicColorIOS 는 재시작 없이 전환되므로(0단계) 앱을 다시 띄우지 않는다.
 * 목적은 `useAnimatedStyle` 동적색 같은 조용한 미렌더를 스크린샷으로 잡는 것 —
 * 판정은 크래시·RedBox 없음 + 탭 라벨 4종 유지까지만 자동, 색은 스크린샷 검수.
 *
 * 실행 (부팅된 시뮬이 기본 udid 와 다르면):
 *   IOS_SIM_UDID=<udid> IOS_SIM_VERSION=26.5 npx wdio run wdio.conf.ts --spec e2e/light-mode-2026-11-27.test.ts
 * 끝나면 시뮬 밝기를 시작 전 값으로 되돌린다.
 */
import { execSync } from 'node:child_process';
import {
  capture,
  tapByLabel,
  tapTab,
  waitForLabel,
  pageSourceContains,
  ensureOnboardedOrSkip,
} from './_helpers';

type Appearance = 'light' | 'dark';
const udid = process.env.IOS_SIM_UDID ?? 'booted';
const simctl = (args: string) =>
  execSync(`xcrun simctl ui ${udid} ${args}`, { encoding: 'utf8' }).trim();

async function setAppearance(mode: Appearance) {
  simctl(`appearance ${mode}`);
  await browser.pause(1200); // 동적 색 전환 + 상태표시줄 반영
}

async function assertNoRedBox(where: string) {
  const src = await browser.getPageSource();
  const bad = ['RedBox', 'Unhandled JS Exception', 'Invalid color value', 'TransformError'];
  const hit = bad.find((b) => src.includes(b));
  expect(hit ? `${where}: ${hit}` : '').toBe('');
}

async function closeAllSheets() {
  for (const label of ['닫기', '검색 닫기']) {
    const els = await $$(`~${label}`);
    if (els.length > 0) {
      try {
        await els[els.length - 1].click();
        await browser.pause(700);
      } catch {
        /* 이미 닫힘 */
      }
    }
  }
}

describe('라이트 모드 진입 (Night Pool 3단계)', () => {
  let original: Appearance = 'dark';

  before(async () => {
    original = simctl('appearance') === 'light' ? 'light' : 'dark';
    await ensureOnboardedOrSkip();
    await closeAllSheets();
  });

  after(async () => {
    await closeAllSheets();
    simctl(`appearance ${original}`);
  });

  for (const mode of ['light', 'dark'] as const) {
    it(`${mode}: 발견·상세·큐·저장·검색·프로필 진입 + 스크린샷`, async () => {
      await setAppearance(mode);

      expect(await tapTab('발견')).toBe(true);
      await browser.pause(1500);
      await assertNoRedBox(`${mode} 발견`);
      await capture(`light-mode-${mode}-discover`);

      // 상세 — ActionBar "상세보기"
      if (await tapByLabel('상세보기', { timeout: 4000 })) {
        await browser.pause(1500);
        await assertNoRedBox(`${mode} 상세`);
        await capture(`light-mode-${mode}-detail`);
        await closeAllSheets();
      }

      expect(await tapTab('큐')).toBe(true);
      await browser.pause(1500);
      await assertNoRedBox(`${mode} 큐`);
      await capture(`light-mode-${mode}-mix`);

      expect(await tapTab('저장')).toBe(true);
      await browser.pause(1500);
      await assertNoRedBox(`${mode} 저장`);
      await capture(`light-mode-${mode}-saved`);

      expect(await tapTab('검색')).toBe(true);
      await browser.pause(1200);
      await assertNoRedBox(`${mode} 검색`);
      await capture(`light-mode-${mode}-search`);
      await closeAllSheets();

      expect(await tapTab('발견')).toBe(true);
      await browser.pause(800);
      if (await tapByLabel('프로필', { timeout: 3000 })) {
        await browser.pause(1500);
        await assertNoRedBox(`${mode} 프로필`);
        await capture(`light-mode-${mode}-profile`);
        await browser.back().catch(() => {});
        await tapByLabel('뒤로', { timeout: 1500 });
        await browser.pause(800);
      }

      // 탭 접근성 라벨 4종 유지 (기존 회귀 스펙 9개 파일이 참조)
      for (const label of ['발견', '큐', '저장', '검색']) {
        expect(await waitForLabel(label, 3000) || (await pageSourceContains(label))).toBe(true);
      }
    });
  }
});
