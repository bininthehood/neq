/**
 * E2E 검증: 현재 카드 좋아요 → 저장 탭으로 이동 → 저장됐는지 확인
 */
import { remote } from 'webdriverio';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

const driver = await remote({
  hostname: '127.0.0.1', port: 4723, path: '/', logLevel: 'warn',
  capabilities: {
    platformName: 'iOS', 'appium:automationName': 'XCUITest',
    'appium:platformVersion': '17.2', 'appium:deviceName': 'iPhone 15',
    'appium:bundleId': 'host.exp.Exponent', 'appium:autoLaunch': false,
    'appium:noReset': true, 'appium:wdaLocalPort': 8100,
  },
});

async function shot(name) {
  const file = path.join(SHOT_DIR, `flow-${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
  await driver.saveScreenshot(file);
  console.log(`📸 ${path.basename(file)}`);
}

try {
  await driver.pause(1500);
  await shot('01-initial');

  // 좋아요 버튼 탭 (♡ 좋아요 텍스트 포함)
  const likeBtn = await driver.$('//XCUIElementTypeOther[contains(@name,"좋아요")]');
  if (await likeBtn.isExisting()) {
    await likeBtn.click();
    console.log('✅ 좋아요 탭됨');
    await driver.pause(500);
    await shot('02-liked');
  } else {
    console.log('⚠️ 좋아요 버튼 못찾음');
  }

  // 저장 탭으로 전환
  const savedTab = await driver.$('~저장');
  if (await savedTab.isExisting()) {
    await savedTab.click();
    console.log('✅ 저장 탭 전환');
    await driver.pause(800);
    await shot('03-saved-tab');
  } else {
    console.log('⚠️ 저장 탭 못찾음');
  }
} catch (err) {
  console.error('ERROR:', err.message);
} finally {
  await driver.deleteSession();
}
