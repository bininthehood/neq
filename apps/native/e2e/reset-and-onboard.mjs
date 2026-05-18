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
  await writeFile(`/tmp/neko-qa/native-${name}.png`, png, 'base64');
  console.log('  captured:', name);
}

async function tap(b, label) {
  const el = await b.$(`~${label}`);
  await el.click();
}

async function tryTapVisible(b, label) {
  const els = await b.$$(`~${label}`);
  for (const t of els) {
    if (await t.isDisplayed()) { await t.click(); return true; }
  }
  return false;
}

const b = await remote({ hostname: '127.0.0.1', port: 4723, path: '/', capabilities: CAPS, logLevel: 'error' });
try {
  console.log('[pre-reset] 튜토리얼 건너뛰기 + Profile 진입');
  if (await tryTapVisible(b, '튜토리얼 건너뛰기')) {
    await b.pause(1200);
  } else if (await tryTapVisible(b, '건너뛰기')) {
    await b.pause(1200);
  }

  // Discover dim 해제 후 Profile 탭
  if (await tryTapVisible(b, '프로필')) {
    await b.pause(2000);
  }
  await cap(b, '30-profile');

  // 모든 데이터 초기화 — Profile 스크롤 후 버튼 탭
  for (let i = 0; i < 3; i++) {
    try {
      await b.execute('mobile: swipe', { direction: 'up' });
      await b.pause(500);
    } catch {}
  }
  await cap(b, '31-profile-scrolled');

  if (await tryTapVisible(b, '모든 데이터 초기화')) {
    await b.pause(1500);
    if (!(await tryTapVisible(b, '초기화'))) {
      await tryTapVisible(b, '삭제');
    }
    await b.pause(3000);
    console.log('  reset done');
  } else {
    console.log('  reset button not found — fallback: 직접 onboarding 진입 안 됨');
  }

  await b.pause(2500);
  await cap(b, '32-after-reset');

  console.log('[onboarding 6단계 진행]');
  // welcome 진입 확인
  await tap(b, '시작하기');
  await b.pause(1500);

  const inputs = await b.$$('//XCUIElementTypeTextField');
  if (inputs.length > 0) {
    await inputs[0].setValue('Minji');
    await b.pause(400);
    await b.execute('mobile: keys', { keys: [{ key: '\n' }] });
    await b.pause(2000);
  }

  for (const chip of ['드라마', '스릴러', '로맨스']) {
    await tap(b, chip);
    await b.pause(300);
  }
  await b.pause(500);
  await tap(b, '다음');
  await b.pause(3500);

  await cap(b, '33-taste-empty');

  // 작품 carousel 좌표 탭 (3개 선택)
  await b.execute('mobile: tap', { x: 70, y: 380 });
  await b.pause(500);
  await b.execute('mobile: tap', { x: 170, y: 380 });
  await b.pause(500);
  await b.execute('mobile: tap', { x: 270, y: 380 });
  await b.pause(800);
  await cap(b, '34-taste-selected');

  await tap(b, '다음');
  await b.pause(2000);
  await cap(b, '35-ott');

  await tap(b, '나중에 설정');
  await b.pause(1500);
  await cap(b, '36-notify');

  await tap(b, '시작하기');
  await b.pause(2000);
  await cap(b, '37-bridge');

  // Fix 3 검증 — streaming 이면 첫 카드 ~3s, 폴백이면 ~13s
  await b.pause(3000);
  await cap(b, '38-after5s');
  await b.pause(5000);
  await cap(b, '39-after10s');
  await b.pause(5000);
  await cap(b, '40-after15s');

  console.log('done');
} catch (err) {
  console.error('ERROR:', err.message);
  try { await cap(b, '99-error'); } catch {}
} finally {
  await b.deleteSession();
}
