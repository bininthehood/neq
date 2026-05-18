import { remote } from 'webdriverio';
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
const b = await remote({ hostname: '127.0.0.1', port: 4723, path: '/', capabilities: CAPS, logLevel: 'error' });
try {
  try { const skip = await b.$('~튜토리얼 건너뛰기'); if (await skip.isDisplayed()) { await skip.click(); await b.pause(1500); } } catch {}

  // BEFORE swipe — 앱 생존 검증 (발견 탭 visible)
  const before = await b.$('~발견');
  const beforeOK = await before.isDisplayed();
  console.log('BEFORE swipe — 발견 tab visible:', beforeOK);

  if (!beforeOK) {
    console.log('앱이 이미 종료된 상태 — swipe 시도 의미 없음');
    process.exit(0);
  }

  console.log('swipe left 시도');
  await b.execute('mobile: dragFromToForDuration', { fromX: 320, fromY: 480, toX: 50, toY: 480, duration: 0.3 });
  await b.pause(3000);

  // AFTER swipe — 앱 생존 검증
  try {
    const after = await b.$('~발견');
    const afterOK = await after.isDisplayed();
    console.log('AFTER swipe — 발견 tab visible:', afterOK, '— crash:', !afterOK ? 'YES' : 'NO');
  } catch (e) {
    console.log('AFTER swipe — 발견 tab NOT found — likely crashed:', e.message);
  }
} catch (err) {
  console.error('ERROR:', err.message);
} finally {
  await b.deleteSession();
}
