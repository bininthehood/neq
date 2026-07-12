// 2026-07-12 — DetailSheet 트레일러 섹션 검증 (1회성).
// 카드 탭 → 시트 오픈 → 예고편 섹션까지 스크롤 → 스크린샷.
import { remote } from 'webdriverio';

const driver = await remote({
  hostname: '127.0.0.1', port: 4723, path: '/', logLevel: 'warn',
  capabilities: {
    platformName: 'iOS', 'appium:automationName': 'XCUITest',
    'appium:platformVersion': '26.4', 'appium:deviceName': 'iPhone 17 Pro',
    'appium:udid': '4EDF2CB4-81BE-41B2-9D5C-AEB1DDE14E29',
    'appium:bundleId': 'com.neq.app', 'appium:autoLaunch': false,
    'appium:noReset': true, 'appium:wdaLocalPort': 8100,
  },
});

const SHOT = '/private/tmp/claude-501/-Volumes-Workspace-Projects-neko/65e4c275-d5a5-4d33-899a-02a91f5ccf37/scratchpad';

try {
  const { width, height } = await driver.getWindowSize();

  // 카드 탭 → DetailSheet
  await driver.performActions([{
    type: 'pointer', id: 'f', parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, x: width * 0.5, y: height * 0.4 },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 80 },
      { type: 'pointerUp', button: 0 },
    ],
  }]);
  await driver.releaseActions();
  await driver.pause(2500); // 오픈 + trailer fetch 대기

  // 예고편 섹션 존재 확인 (a11y label)
  const playBtn = await driver.$('~예고편 재생');
  const exists = await playBtn.isExisting();
  console.log('trailer section exists:', exists);

  // 스크롤 내려서 섹션 노출
  await driver.performActions([{
    type: 'pointer', id: 'f', parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, x: width * 0.5, y: height * 0.75 },
      { type: 'pointerDown', button: 0 },
      { type: 'pointerMove', duration: 400, x: width * 0.5, y: height * 0.25 },
      { type: 'pause', duration: 120 },
      { type: 'pointerUp', button: 0 },
    ],
  }]);
  await driver.releaseActions();
  await driver.pause(800);
  await driver.saveScreenshot(`${SHOT}/trailer-section.png`);
  console.log('screenshot saved');
} finally {
  await driver.deleteSession();
}
