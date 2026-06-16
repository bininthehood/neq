/**
 * W5 sprint QA 자동화 — Appium + WebDriverIO ad-hoc script.
 *
 * 사용: `cd apps/native && npx tsx e2e/qa-w5.ts <scenario>`
 *   scenario: tap | snapshot | onboarding | tutorial | saved | persona
 *
 * 시작하기 버튼 logical 좌표: iPhone 17 Pro 디바이스 (1206x2622 device px → 402x874 points)
 */
import { remote } from 'webdriverio';

// wdio.conf 3-way 분기와 정합. E2E_TARGET 미지정 시 simulator-devclient (com.neq.app).
const target = process.env.E2E_TARGET ?? 'simulator-devclient';
const bundleId = target === 'expo-go' ? 'host.exp.Exponent' : 'com.neq.app';

const CAPS = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:platformVersion': '26.4',
  'appium:deviceName': 'iPhone 17 Pro',
  'appium:udid': '4EDF2CB4-81BE-41B2-9D5C-AEB1DDE14E29',
  'appium:bundleId': bundleId,
  'appium:autoLaunch': false,
  'appium:noReset': true,
  'appium:newCommandTimeout': 240,
  'appium:wdaLocalPort': 8100,
  'appium:connectHardwareKeyboard': true,
  'appium:simulatorPasteboardAutomaticSync': 'on',
} as WebdriverIO.Capabilities;

async function tap(browser: WebdriverIO.Browser, x: number, y: number) {
  // XCUITest native mobile:tap — W3C actions 보다 신뢰성 ↑
  await browser.execute('mobile: tap', { x, y });
}

async function findAndTap(browser: WebdriverIO.Browser, label: string) {
  // accessibilityLabel 기반 element tap
  const el = await browser.$(`~${label}`);
  await el.click();
}

async function main() {
  const scenario = process.argv[2] ?? 'tap';
  console.log(`[qa-w5] scenario=${scenario}`);

  const browser = await remote({
    hostname: '127.0.0.1',
    port: 4723,
    path: '/',
    capabilities: CAPS,
    logLevel: 'info',
  });

  try {
    if (scenario === 'tap' || scenario === 'onboarding') {
      // 시작하기 버튼 — accessibility name 기반 element click
      console.log('[qa-w5] click ~시작하기');
      await findAndTap(browser, '시작하기');
      await browser.pause(2000);
    }

    if (scenario === 'find') {
      // page source 출력 — accessibility 트리 확인
      const source = await browser.getPageSource();
      const fs = await import('node:fs/promises');
      await fs.writeFile('/tmp/neko-qa/page-source.xml', source);
      console.log('[qa-w5] page source saved');
    }

    if (scenario === 'screenshot') {
      const name = process.argv[3] ?? 'now';
      const png = await browser.takeScreenshot();
      const fs = await import('node:fs/promises');
      await fs.writeFile(`/tmp/neko-qa/wda-${name}.png`, png, 'base64');
      console.log(`[qa-w5] saved /tmp/neko-qa/wda-${name}.png`);
    }

    if (scenario === 'onboarding-full') {
      // 0. Expo Go dev menu Continue (첫 진입 시)
      try { await findAndTap(browser, 'Continue'); await browser.pause(800); } catch {}
      // 시작 단계 어디든 idempotent.
      // 1. Welcome → 시작하기 (있으면)
      try {
        const welcome = await browser.$$('~오늘의 한 편을\n고르는 시간');
        if (welcome.length > 0) {
          console.log('[qa-w5] welcome → 시작하기');
          await findAndTap(browser, '시작하기');
          await browser.pause(1500);
        }
      } catch {}

      // 2. Hello: 이름 입력 + Return 키 (RN TextInput onSubmitEditing → finalize)
      console.log('[qa-w5] hello: 이름 입력 + Return');
      const inputs = await browser.$$('//XCUIElementTypeTextField');
      if (inputs.length > 0) {
        await inputs[0].setValue('Minji');
        await browser.pause(400);
        // XCUITest Return 키 — RN onSubmitEditing 트리거
        await browser.execute('mobile: keys', { keys: [{ key: '\n' }] });
        await browser.pause(1500);
      }

      // 3. Taste: 3개 장르 칩 선택 (회귀 — cold start v1 보조 옵션 누락)
      console.log('[qa-w5] taste: 3개 장르 선택');
      for (const chip of ['드라마', '스릴러', '로맨스']) {
        await findAndTap(browser, chip);
        await browser.pause(300);
      }
      await browser.pause(500);
      await findAndTap(browser, '다음');
      await browser.pause(1500);

      // 4. OTT (마지막 단계): "나중에 설정" → 곧바로 Bridge + Discover 진입
      // 2026-06-16: notify 단계 제거. OTT 가 최종.
      console.log('[qa-w5] ott: 나중에 설정 (완료)');
      await findAndTap(browser, '나중에 설정');
      await browser.pause(4000);  // Bridge + Discover 진입
    }

    if (scenario === 'discover-tab') {
      // 발견 탭 클릭 (TutorialFlow 노출 확인용)
      await findAndTap(browser, '발견');
      await browser.pause(1500);
    }
    if (scenario === 'saved-tab') {
      await findAndTap(browser, '저장');
      await browser.pause(1500);
    }
    if (scenario === 'profile-tab') {
      await findAndTap(browser, '프로필');
      await browser.pause(1500);
    }

    if (scenario === 'ott-capture') {
      // Taste 보조 옵션으로 cold_start_v1 진입 → OTT 화면 캡처
      try { await findAndTap(browser, '장르/작품 정하지 않고 시작'); } catch {}
      await browser.pause(2000);
      const png = await browser.takeScreenshot();
      const fs = await import('node:fs/promises');
      await fs.writeFile('/tmp/neko-qa/ott-screen.png', png, 'base64');
      console.log('[qa-w5] ott-screen saved');
    }

    if (scenario === 'to-ott') {
      // wipe 직후 호출 — Welcome → Hello → Taste 보조옵션 → OTT 캡처
      try { await findAndTap(browser, 'Continue'); await browser.pause(800); } catch {}
      try { await findAndTap(browser, '시작하기'); await browser.pause(1500); } catch {}
      const inputs = await browser.$$('//XCUIElementTypeTextField');
      if (inputs.length > 0) {
        await inputs[0].setValue('Minji');
        await browser.pause(400);
        await browser.execute('mobile: keys', { keys: [{ key: '\n' }] });
        await browser.pause(2000);
      }
      // Taste → 보조 옵션 클릭
      try { await findAndTap(browser, '장르/작품 정하지 않고 시작'); } catch {}
      await browser.pause(2000);
      const png = await browser.takeScreenshot();
      const fs = await import('node:fs/promises');
      await fs.writeFile('/tmp/neko-qa/ott-with-logos.png', png, 'base64');
      console.log('[qa-w5] ott-with-logos saved');
    }

    if (scenario === 'bridge-capture') {
      // OTT skip (마지막 단계) → Bridge 진입 캡처 (애니메이션 확인용 — 여러 frame)
      // 2026-06-16: notify 단계 제거로 OTT 의 "나중에 설정" 만으로 Bridge 진입.
      try { await findAndTap(browser, '나중에 설정'); } catch {}
      // Bridge 시점 빠른 캡처 3장
      for (let i = 0; i < 3; i++) {
        await browser.pause(500);
        const png = await browser.takeScreenshot();
        const fs = await import('node:fs/promises');
        await fs.writeFile(`/tmp/neko-qa/bridge-${i}.png`, png, 'base64');
      }
      console.log('[qa-w5] bridge captures saved');
    }

    if (scenario === 'skip-tutorial-save-detail') {
      // 1. TutorialFlow 건너뛰기
      try { await findAndTap(browser, '튜토리얼 건너뛰기'); await browser.pause(1500); } catch {}
      // 2. 첫 카드 탭 → DetailSheet 진입
      await browser.execute('mobile: tap', { x: 200, y: 400 });
      await browser.pause(2500);
      const png1 = await browser.takeScreenshot();
      const fs = await import('node:fs/promises');
      await fs.writeFile('/tmp/neko-qa/detail-sheet.png', png1, 'base64');
      console.log('[qa-w5] detail-sheet saved');
    }

    if (scenario === 'go-saved') {
      // tutorial 건너뛰기 (있으면)
      try {
        const skipBtns = await browser.$$('~튜토리얼 건너뛰기');
        for (const b of skipBtns) {
          if (await b.isDisplayed()) { await b.click(); break; }
        }
        await browser.pause(1500);
      } catch {}
      // Saved 탭 — visible=true element 만 click
      const tabs = await browser.$$('~저장');
      for (const t of tabs) {
        if (await t.isDisplayed()) { await t.click(); break; }
      }
      await browser.pause(2500);
      const png = await browser.takeScreenshot();
      const fs = await import('node:fs/promises');
      await fs.writeFile('/tmp/neko-qa/saved-tab.png', png, 'base64');
      console.log('[qa-w5] saved-tab saved');
    }

    if (scenario === 'go-profile') {
      try {
        const skipBtns = await browser.$$('~튜토리얼 건너뛰기');
        for (const b of skipBtns) {
          if (await b.isDisplayed()) { await b.click(); break; }
        }
        await browser.pause(1500);
      } catch {}
      const tabs = await browser.$$('~프로필');
      for (const t of tabs) {
        if (await t.isDisplayed()) { await t.click(); break; }
      }
      await browser.pause(2500);
      const png = await browser.takeScreenshot();
      const fs = await import('node:fs/promises');
      await fs.writeFile('/tmp/neko-qa/profile-tab.png', png, 'base64');
      console.log('[qa-w5] profile-tab saved');
    }

    if (scenario === 'taste-capture') {
      // Welcome → Hello → Taste 진입 후 캡처 (보조 옵션 시각 검증)
      try { await findAndTap(browser, 'Continue'); await browser.pause(800); } catch {}
      try { await findAndTap(browser, '시작하기'); await browser.pause(1500); } catch {}
      const inputs = await browser.$$('//XCUIElementTypeTextField');
      if (inputs.length > 0) {
        await inputs[0].setValue('Minji');
        await browser.pause(400);
        await browser.execute('mobile: keys', { keys: [{ key: '\n' }] });
        await browser.pause(2000);
      }
      // Taste 화면 캡처
      const png = await browser.takeScreenshot();
      const fs = await import('node:fs/promises');
      await fs.writeFile('/tmp/neko-qa/taste-with-skip.png', png, 'base64');
      console.log('[qa-w5] taste-with-skip saved');
    }

    if (scenario === 'tutorial-flow') {
      // TutorialFlow 4단계 swipe — 카드 영역 내 좌표 (dim 회피)
      console.log('[qa-w5] swipe left');
      await browser.execute('mobile: dragFromToForDuration', {
        fromX: 250, fromY: 380, toX: 80, toY: 380, duration: 0.3,
      });
      await browser.pause(2500);
      console.log('[qa-w5] swipe right');
      await browser.execute('mobile: dragFromToForDuration', {
        fromX: 150, fromY: 380, toX: 320, toY: 380, duration: 0.3,
      });
      await browser.pause(2500);
      console.log('[qa-w5] swipe down');
      await browser.execute('mobile: dragFromToForDuration', {
        fromX: 200, fromY: 350, toX: 200, toY: 550, duration: 0.3,
      });
      await browser.pause(2500);
      console.log('[qa-w5] tap card');
      await browser.execute('mobile: tap', { x: 200, y: 400 });
      await browser.pause(2500);
    }

    if (scenario === 'reset') {
      // 0. TutorialFlow dismiss (있으면)
      try { await findAndTap(browser, '튜토리얼 건너뛰기'); await browser.pause(1000); } catch {}
      // 1. 프로필 탭 진입
      await findAndTap(browser, '프로필');
      await browser.pause(1500);
      // 2. page source 저장 — 데이터 초기화 element 위치 확인
      const source = await browser.getPageSource();
      const fs = await import('node:fs/promises');
      await fs.writeFile('/tmp/neko-qa/profile-source.xml', source);
      console.log('[qa-w5] profile source saved');
    }

    if (scenario === 'snapshot') {
      const png = await browser.takeScreenshot();
      const fs = await import('node:fs/promises');
      await fs.writeFile('/tmp/neko-qa/wda-snapshot.png', png, 'base64');
      console.log('[qa-w5] snapshot saved to /tmp/neko-qa/wda-snapshot.png');
    }
  } finally {
    await browser.deleteSession();
  }
}

main().catch((err) => {
  console.error('[qa-w5] error:', err);
  process.exit(1);
});
