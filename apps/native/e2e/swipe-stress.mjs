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

// WARN-1 보정 — 매 step 후 page source 기반 생존 판정. crash 즉시 FAIL 종료.
async function assertAlive(b, label) {
  const r = await checkAlive(b);
  console.log(`  [${label}]`, r.reason);
  if (!r.alive) throw new Error(`crash/redbox at ${label} — ${r.reason}`);
}

try {
  try { const skip = await b.$('~튜토리얼 건너뛰기'); if (await skip.isDisplayed()) { await skip.click(); await b.pause(1500); } } catch {}

  await assertAlive(b, 'start');

  // swipe left × 5
  for (let i = 0; i < 5; i++) {
    console.log(`swipe left #${i + 1}`);
    await b.execute('mobile: dragFromToForDuration', { fromX: 320, fromY: 480, toX: 50, toY: 480, duration: 0.3 });
    await b.pause(1800);
    await assertAlive(b, `left#${i + 1}`);
  }

  // swipe right × 2 (prev card overlay)
  for (let i = 0; i < 2; i++) {
    console.log(`swipe right #${i + 1}`);
    await b.execute('mobile: dragFromToForDuration', { fromX: 80, fromY: 480, toX: 320, toY: 480, duration: 0.3 });
    await b.pause(1800);
    await assertAlive(b, `right#${i + 1}`);
  }

  // swipe down × 1 (save)
  console.log('swipe down');
  await b.execute('mobile: dragFromToForDuration', { fromX: 200, fromY: 350, toX: 200, toY: 600, duration: 0.3 });
  await b.pause(2000);
  await assertAlive(b, 'down');

  console.log('PASS — stress test 완료, crash 없음');
} catch (err) {
  console.error('FAIL —', err.message);
  exitCode = 1;
} finally {
  await b.deleteSession();
}
process.exit(exitCode);
