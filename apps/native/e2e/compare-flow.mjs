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

const b = await remote({ hostname: '127.0.0.1', port: 4723, path: '/', capabilities: CAPS, logLevel: 'error' });
try {
  console.log('[1] welcome');
  await cap(b, '01-welcome');

  console.log('[2] hello');
  await tap(b, '시작하기');
  await b.pause(1500);
  await cap(b, '02-hello');

  console.log('[3] taste');
  const inputs = await b.$$('//XCUIElementTypeTextField');
  if (inputs.length > 0) {
    await inputs[0].setValue('Minji');
    await b.pause(400);
    await b.execute('mobile: keys', { keys: [{ key: '\n' }] });
    await b.pause(2000);
  }
  await cap(b, '03-taste');

  console.log('[4] taste-selected');
  for (const chip of ['드라마', '스릴러', '로맨스']) {
    await tap(b, chip);
    await b.pause(300);
  }
  await b.pause(500);
  await cap(b, '04-taste-selected');

  console.log('[5] ott');
  await tap(b, '다음');
  await b.pause(1800);
  await cap(b, '05-ott');

  console.log('[6] notify');
  await tap(b, '나중에 설정');
  await b.pause(1500);
  await cap(b, '06-notify');

  console.log('[7] bridge → discover');
  await tap(b, '시작하기');
  await b.pause(5000);
  await cap(b, '07-discover-tutorial');

  console.log('[8] discover-card (skip tutorial)');
  try {
    await tap(b, '튜토리얼 건너뛰기');
    await b.pause(2000);
  } catch (e) { console.log('  no tutorial skip'); }
  await cap(b, '08-discover-card');

  console.log('[9] saved-tab');
  try {
    const tabs = await b.$$('~저장');
    for (const t of tabs) {
      if (await t.isDisplayed()) { await t.click(); break; }
    }
    await b.pause(2000);
    await cap(b, '09-saved');
  } catch (e) { console.log('  saved tab fail:', e.message); }

  console.log('[10] profile-tab');
  try {
    const tabs = await b.$$('~프로필');
    for (const t of tabs) {
      if (await t.isDisplayed()) { await t.click(); break; }
    }
    await b.pause(2000);
    await cap(b, '10-profile');
  } catch (e) { console.log('  profile tab fail:', e.message); }

  console.log('[11] discover-back');
  try {
    const tabs = await b.$$('~발견');
    for (const t of tabs) {
      if (await t.isDisplayed()) { await t.click(); break; }
    }
    await b.pause(2000);
    await cap(b, '11-discover');
  } catch (e) {}

  console.log('done');
} catch (err) {
  console.error('ERROR:', err.message);
  try { await cap(b, '99-error'); } catch {}
} finally {
  await b.deleteSession();
}
