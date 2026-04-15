/**
 * Expo Go LogBox 에러 화면에서 Dismiss 후 앱 강제 리로드.
 * 실행:  npx ts-node --transpile-only e2e/reload-app.ts
 */
import { remote } from 'webdriverio';

async function main() {
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
      'appium:newCommandTimeout': 60,
      'appium:wdaLocalPort': 8100,
    } as WebdriverIO.Capabilities,
  });

  try {
    // Dismiss 버튼이 있으면 탭
    try {
      const dismiss = await driver.$('~Dismiss');
      if (await dismiss.isExisting()) {
        await dismiss.click();
        console.log('✅ Dismiss tapped');
        await driver.pause(500);
      }
    } catch (e) {
      console.log('• Dismiss button not found (괜찮음)');
    }

    // Shake gesture로 dev menu 호출 → "Reload" 탭
    await driver.execute('mobile: shake');
    console.log('✅ shake fired');
    await driver.pause(800);

    try {
      const reload = await driver.$('~Reload');
      if (await reload.isExisting()) {
        await reload.click();
        console.log('✅ Reload tapped');
      } else {
        console.log('⚠️ Reload not found in dev menu');
      }
    } catch (e) {
      console.log('⚠️ Reload not found');
    }
  } finally {
    await driver.deleteSession();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
