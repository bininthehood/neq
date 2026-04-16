import { remote } from 'webdriverio';
const d = await remote({
  hostname: '127.0.0.1', port: 4723, path: '/', logLevel: 'warn',
  capabilities: {
    platformName: 'iOS', 'appium:automationName': 'XCUITest',
    'appium:platformVersion': '17.2', 'appium:deviceName': 'iPhone 15',
    'appium:bundleId': 'host.exp.Exponent', 'appium:autoLaunch': false,
    'appium:noReset': true, 'appium:wdaLocalPort': 8100,
  },
});
try {
  const { width, height } = await d.getWindowSize();
  // 좌 스와이프 2번해서 새 카드
  for (let i = 0; i < 2; i++) {
    await d.performActions([{
      type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: width * 0.7, y: height * 0.4 },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerMove', duration: 250, x: width * 0.1, y: height * 0.4 },
        { type: 'pointerUp', button: 0 },
      ],
    }]);
    await d.releaseActions();
    await d.pause(700);
  }
  await d.pause(2000);
  await d.saveScreenshot('/Users/james/Projects/neko/_screenshots/native-v3.png');
  console.log('ok');
} finally { await d.deleteSession(); }
