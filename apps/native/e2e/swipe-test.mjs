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
  // tutorial dismiss + swipe left 시도
  try { const skip = await b.$('~튜토리얼 건너뛰기'); if (await skip.isDisplayed()) { await skip.click(); await b.pause(1500); } } catch {}
  console.log('swipe left 시도');
  await b.execute('mobile: dragFromToForDuration', { fromX: 300, fromY: 500, toX: 50, toY: 500, duration: 0.3 });
  await b.pause(2500);
  console.log('swipe done — crash 없으면 정상');
} catch (err) {
  console.error('ERROR:', err.message);
} finally {
  await b.deleteSession();
}
