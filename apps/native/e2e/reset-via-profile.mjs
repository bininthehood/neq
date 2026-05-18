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

const b = await remote({ hostname: '127.0.0.1', port: 4723, path: '/', capabilities: CAPS, logLevel: 'error' });
try {
  console.log('[1] 튜토리얼 dismiss (있으면)');
  try {
    const skip = await b.$('~튜토리얼 건너뛰기');
    if (await skip.isDisplayed()) {
      await skip.click();
      await b.pause(1500);
    }
  } catch {}

  console.log('[2] Profile 탭 진입 — 좌표 탭');
  // iPhone 17 Pro 402pt 너비. 하단 탭 4개. profile 은 3번째 (75% 위치).
  // 하단 탭바 y ≈ 시뮬레이터 캡처 보면 ~840-870pt (전체 874pt)
  await b.execute('mobile: tap', { x: 250, y: 850 });
  await b.pause(2500);
  await cap(b, '50-profile');

  console.log('[3] Profile 스크롤 — 데이터 초기화 버튼 찾기');
  for (let i = 0; i < 4; i++) {
    await b.execute('mobile: swipe', { direction: 'up' });
    await b.pause(500);
  }
  await cap(b, '51-profile-bottom');

  console.log('[4] 모든 데이터 초기화 클릭');
  try {
    const btn = await b.$('~모든 데이터 초기화');
    await btn.click();
    await b.pause(1500);
    await cap(b, '52-reset-confirm');
    // alert 확인
    try {
      const ok = await b.$('~초기화');
      if (await ok.isDisplayed()) await ok.click();
    } catch {}
    try {
      const del = await b.$('~삭제');
      if (await del.isDisplayed()) await del.click();
    } catch {}
    await b.pause(3000);
    await cap(b, '53-after-reset');
  } catch (e) {
    console.log('  reset button not found:', e.message);
  }

  console.log('done');
} catch (err) {
  console.error('ERROR:', err.message);
  try { await cap(b, '99-error'); } catch {}
} finally {
  await b.deleteSession();
}
