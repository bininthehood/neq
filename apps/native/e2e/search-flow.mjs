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
  await driver.pause(2000);
  const { width, height } = await driver.getWindowSize();
  // 검색 탭 (중간)
  await driver.performActions([{
    type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, x: width * 0.5, y: height - 40 },
      { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 50 },
      { type: 'pointerUp', button: 0 },
    ],
  }]);
  await driver.releaseActions();
  await driver.pause(1000);

  // 검색어 입력
  const input = await driver.$('//XCUIElementTypeTextField');
  await input.click();
  await driver.pause(200);
  await input.setValue('기생충');
  await driver.pause(1500); // debounce 350ms + fetch

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  await driver.saveScreenshot(`e2e/screenshots/search-${ts}.png`);
  console.log('✅ search completed');
} finally { await driver.deleteSession(); }
