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

  // swipe left × 5
  for (let i = 0; i < 5; i++) {
    console.log(`swipe left #${i + 1}`);
    await b.execute('mobile: dragFromToForDuration', { fromX: 320, fromY: 480, toX: 50, toY: 480, duration: 0.3 });
    await b.pause(1800);
  }

  // swipe right × 2 (prev card overlay)
  for (let i = 0; i < 2; i++) {
    console.log(`swipe right #${i + 1}`);
    await b.execute('mobile: dragFromToForDuration', { fromX: 80, fromY: 480, toX: 320, toY: 480, duration: 0.3 });
    await b.pause(1800);
  }

  // swipe down × 1 (save)
  console.log('swipe down');
  await b.execute('mobile: dragFromToForDuration', { fromX: 200, fromY: 350, toX: 200, toY: 600, duration: 0.3 });
  await b.pause(2000);

  console.log('stress test 완료 — crash 없으면 안정');
} catch (err) {
  console.error('ERROR:', err.message);
} finally {
  await b.deleteSession();
}
