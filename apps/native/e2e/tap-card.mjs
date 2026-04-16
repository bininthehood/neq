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
  // 카드 중앙 탭 (40% high)
  await driver.performActions([{
    type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, x: width * 0.5, y: height * 0.4 },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 80 },
      { type: 'pointerUp', button: 0 },
    ],
  }]);
  await driver.releaseActions();
  await driver.pause(1000);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  await driver.saveScreenshot(`e2e/screenshots/detail-${ts}.png`);
  console.log('✅ detail sheet captured');
} finally { await driver.deleteSession(); }
