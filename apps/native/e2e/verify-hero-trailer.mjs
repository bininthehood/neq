// 2026-07-12 — DetailSheet hero 인라인 트레일러 검증 (1회성).
// 카드 탭 → 시트 오픈 → 재생 대기 → 3s 간격 스크린샷 2장 (hero 프레임 변화 = 재생 증거)
// → swipe-down 닫기 (webview 존재 하 dismiss 회귀 확인).
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

  await driver.pause(5000); // 오픈 + trailer fetch + 플레이어 로드/자동재생
  await driver.saveScreenshot(`${SHOT}/hero-video-a.png`);
  await driver.pause(3000);
  await driver.saveScreenshot(`${SHOT}/hero-video-b.png`);
  console.log('MARK screenshots taken');

  // swipe-down 닫기 — webview 아래 타이틀 존에서 시작 (y 45% → 90%)
  await driver.performActions([{
    type: 'pointer', id: 'f', parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, x: width * 0.5, y: height * 0.45 },
      { type: 'pointerDown', button: 0 },
      { type: 'pointerMove', duration: 280, x: width * 0.5, y: height * 0.9 },
      { type: 'pointerUp', button: 0 },
    ],
  }]);
  await driver.releaseActions();
  await driver.pause(1500);
  await driver.saveScreenshot(`${SHOT}/hero-video-dismissed.png`);
  console.log('MARK dismissed');
} finally {
  await driver.deleteSession();
}
