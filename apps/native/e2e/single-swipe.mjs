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
  // 튜토리얼이 있으면 dismiss
  try { const skip = await b.$('~튜토리얼 건너뛰기'); if (await skip.isDisplayed()) { await skip.click(); await b.pause(1500); } } catch {}
  // 카드 element 존재 확인 — 발견 탭 아이콘 보이는지로 간접 검증
  const discoverTab = await b.$('~발견');
  console.log('discoverTab visible:', await discoverTab.isDisplayed());
  console.log('swipe left');
  await b.execute('mobile: dragFromToForDuration', { fromX: 320, fromY: 480, toX: 50, toY: 480, duration: 0.3 });
  await b.pause(2500);
  // swipe 후 발견 탭 여전히 visible?
  try {
    const stillVisible = await b.$('~발견').isDisplayed();
    console.log('after swipe, 발견 tab visible:', stillVisible);
  } catch (e) {
    console.log('after swipe, 발견 tab NOT visible (app crashed?):', e.message);
  }
} catch (err) {
  console.error('ERROR:', err.message);
} finally {
  await b.deleteSession();
}
