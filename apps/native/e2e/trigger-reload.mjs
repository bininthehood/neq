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

async function tryTapVisible(b, label) {
  const els = await b.$$(`~${label}`);
  for (const t of els) {
    if (await t.isDisplayed()) { await t.click(); return true; }
  }
  return false;
}

const b = await remote({ hostname: '127.0.0.1', port: 4723, path: '/', capabilities: CAPS, logLevel: 'error' });
try {
  console.log('[1] 필터 칩 별점 클릭 → load() 새 호출 트리거');

  // 별점 칩 좌표 — 필터 row 의 4번째 위치. iPhone 17 Pro 402pt 너비.
  // 유형(50) 국가(50) 년도(50) 별점(50) OTT(50) — 각 ~70-80pt 간격
  // 별점 chip 중앙: x≈250, y≈80 (필터 row 영역)
  // 캡처에서 정확 위치 확인 필요. 일단 좌표 탭.
  await b.execute('mobile: tap', { x: 240, y: 95 });
  await b.pause(800);
  await cap(b, '40-rating-dropdown');

  // dropdown 의 "8+" 옵션 — y 좌표 dropdown 안. 추정 y≈140-180
  await b.execute('mobile: tap', { x: 200, y: 180 });
  await b.pause(3000);
  await cap(b, '41-after-rating-filter');

  // streaming 적용 시 첫 카드 빨리 도착 — 추가 캡처
  await b.pause(3000);
  await cap(b, '42-after-3s-more');

  console.log('done');
} catch (err) {
  console.error('ERROR:', err.message);
  try { await cap(b, '99-error'); } catch {}
} finally {
  await b.deleteSession();
}
