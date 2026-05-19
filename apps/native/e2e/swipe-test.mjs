import { remote } from 'webdriverio';
import { checkAlive } from './_alive.mjs';
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
let exitCode = 0;
try {
  // tutorial dismiss
  try { const skip = await b.$('~튜토리얼 건너뛰기'); if (await skip.isDisplayed()) { await skip.click(); await b.pause(1500); } } catch {}

  // WARN-1 보정 — `~발견` selector 대신 page source 기반 생존 판정.
  const before = await checkAlive(b);
  console.log('BEFORE swipe —', before.reason);
  if (!before.alive) { console.log('FAIL — swipe 전 이미 비정상'); exitCode = 1; }

  console.log('swipe left 시도');
  await b.execute('mobile: dragFromToForDuration', { fromX: 300, fromY: 500, toX: 50, toY: 500, duration: 0.3 });
  await b.pause(2500);

  const after = await checkAlive(b);
  console.log('AFTER swipe —', after.reason);
  if (!after.alive) { console.log('FAIL — swipe 후 crash/redbox'); exitCode = 1; }
  else console.log('PASS — crash 없음');
} catch (err) {
  console.error('ERROR:', err.message);
  exitCode = 1;
} finally {
  await b.deleteSession();
}
process.exit(exitCode);
