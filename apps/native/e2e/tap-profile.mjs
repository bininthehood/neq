import { remote } from 'webdriverio';
const driver = await remote({
  hostname: '127.0.0.1', port: 4723, path: '/', logLevel: 'warn',
  capabilities: {
    platformName: 'iOS', 'appium:automationName': 'XCUITest',
    'appium:platformVersion': '17.2', 'appium:deviceName': 'iPhone 15',
    'appium:bundleId': 'host.exp.Exponent', 'appium:autoLaunch': false,
    'appium:noReset': true, 'appium:wdaLocalPort': 8100,
  },
});
try {
  const { width, height } = await driver.getWindowSize();
  // 프로필 탭 = 4번째 (0-indexed 3). 탭바 x = 7/8 of width
  await driver.performActions([{
    type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, x: width * 0.875, y: height - 40 },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 50 },
      { type: 'pointerUp', button: 0 },
    ],
  }]);
  await driver.releaseActions();
  await driver.pause(1200);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  await driver.saveScreenshot(`e2e/screenshots/profile-${ts}.png`);
  console.log('✅ profile captured');
} finally { await driver.deleteSession(); }
