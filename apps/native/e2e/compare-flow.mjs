import { remote } from 'webdriverio';
import { writeFile } from 'node:fs/promises';

const CAPS = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:platformVersion': '26.4',
  'appium:deviceName': 'iPhone 17 Pro',
  'appium:udid': '4EDF2CB4-81BE-41B2-9D5C-AEB1DDE14E29',
  'appium:bundleId': 'host.exp.Exponent',
  'appium:autoLaunch': false,
  'appium:noReset': true,
  'appium:newCommandTimeout': 240,
  'appium:wdaLocalPort': 8100,
};

async function cap(b, name) {
  const png = await b.takeScreenshot();
  const path = `/tmp/neko-qa/native-${name}.png`;
  await writeFile(path, png, 'base64');
  console.log('  captured:', path);
}

async function tap(b, label) {
  const el = await b.$(`~${label}`);
  await el.click();
}

async function tryTapVisible(b, label) {
  const els = await b.$$(`~${label}`);
  for (const t of els) {
    if (await t.isDisplayed()) {
      await t.click();
      return true;
    }
  }
  return false;
}

// 6단계 onboarding (2026-05-18 Fix 2 적용): welcome → hello → genre → taste(작품) → ott → notify
const b = await remote({ hostname: '127.0.0.1', port: 4723, path: '/', capabilities: CAPS, logLevel: 'error' });
try {
  console.log('[1] welcome');
  await cap(b, '01-welcome');

  console.log('[2] hello');
  await tap(b, '시작하기');
  await b.pause(1500);
  await cap(b, '02-hello');

  console.log('[3] genre (장르 칩 선택)');
  const inputs = await b.$$('//XCUIElementTypeTextField');
  if (inputs.length > 0) {
    await inputs[0].setValue('Minji');
    await b.pause(400);
    await b.execute('mobile: keys', { keys: [{ key: '\n' }] });
    await b.pause(2000);
  }
  await cap(b, '03-genre');

  for (const chip of ['드라마', '스릴러', '로맨스']) {
    await tap(b, chip);
    await b.pause(300);
  }
  await b.pause(500);
  await cap(b, '04-genre-selected');

  console.log('[5] taste (작품 선택) — Fix 2 검증');
  await tap(b, '다음');
  await b.pause(3000);
  await cap(b, '05-taste-empty');

  // by-genre 카로셀 로드 대기. 작품 3개 선택 시도 — 첫 carousel 의 첫 작품들이
  // accessibilityLabel 로 노출됨. label 패턴 매칭이 어려우니 가운데 좌표 탭으로 fallback.
  // (작품 카드는 80px 너비 × 112px 높이, x=70/160/250 정도)
  await b.execute('mobile: tap', { x: 70, y: 380 });
  await b.pause(400);
  await b.execute('mobile: tap', { x: 170, y: 380 });
  await b.pause(400);
  await b.execute('mobile: tap', { x: 270, y: 380 });
  await b.pause(800);
  await cap(b, '06-taste-selected');

  console.log('[7] ott');
  await tap(b, '다음');
  await b.pause(2000);
  await cap(b, '07-ott');

  console.log('[8] notify');
  await tap(b, '나중에 설정');
  await b.pause(1500);
  await cap(b, '08-notify');

  console.log('[9] bridge → discover');
  await tap(b, '시작하기');
  await b.pause(2500);
  await cap(b, '09a-bridge');

  // Fix 3 streaming 검증 — 첫 카드 도착까지 짧으면 (~3s) 'ready' 전환
  await b.pause(3000);
  await cap(b, '09b-after5s');
  await b.pause(5000);
  await cap(b, '09c-after10s');

  console.log('[10] discover-card (skip tutorial)');
  if (!(await tryTapVisible(b, '튜토리얼 건너뛰기'))) {
    console.log('  no tutorial skip — already on Discover');
  }
  await b.pause(1500);
  await cap(b, '10-discover-card');

  console.log('[11] saved-tab');
  if (await tryTapVisible(b, '저장')) {
    await b.pause(2000);
    await cap(b, '11-saved');
  }

  console.log('[12] profile-tab');
  if (await tryTapVisible(b, '프로필')) {
    await b.pause(2000);
    await cap(b, '12-profile');
  }

  console.log('[13] discover-back');
  if (await tryTapVisible(b, '발견')) {
    await b.pause(2000);
    await cap(b, '13-discover');
  }

  console.log('done');
} catch (err) {
  console.error('ERROR:', err.message);
  try { await cap(b, '99-error'); } catch {}
} finally {
  await b.deleteSession();
}
