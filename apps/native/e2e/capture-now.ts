/**
 * 긴급 스크린샷 + 화면 계층 덤프 도구.
 * Appium 서버 가동 상태에서 실행하면 현재 시뮬레이터 상태를 캡처한다.
 *
 * 실행:  npx ts-node apps/native/e2e/capture-now.ts
 */
import { remote } from 'webdriverio';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SHOT_DIR = path.resolve(__dirname, 'screenshots');

async function main() {
  if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

  const driver = await remote({
    hostname: '127.0.0.1',
    port: 4723,
    path: '/',
    logLevel: 'warn',
    capabilities: {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:platformVersion': '17.2',
      'appium:deviceName': 'iPhone 15',
      'appium:bundleId': 'host.exp.Exponent',
      'appium:autoLaunch': false,
      'appium:noReset': true,
      'appium:newCommandTimeout': 120,
      'appium:wdaLocalPort': 8100,
    } as WebdriverIO.Capabilities,
  });

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const shotFile = path.join(SHOT_DIR, `${timestamp}-adhoc.png`);
    await driver.saveScreenshot(shotFile);
    console.log(`📸 screenshot → ${shotFile}`);

    const source = await driver.getPageSource();
    const dumpFile = path.join(SHOT_DIR, `${timestamp}-source.xml`);
    fs.writeFileSync(dumpFile, source);
    console.log(`🧾 pageSource → ${dumpFile}`);

    const textMatches = source.match(/name="([^"]+)"/g)?.slice(0, 30) ?? [];
    console.log('🔤 visible names (최대 30개):');
    textMatches.forEach((m) => console.log('  •', m.replace(/^name="|"$/g, '')));
  } finally {
    await driver.deleteSession();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
