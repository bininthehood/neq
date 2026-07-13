// 2026-07-13 — DetailSheet transparent Modal 전환 검증 (1회성).
// ① 오픈 (reanimated 진입 슬라이드) ② 드래그-홀드 중 후방 노출 스크린샷
// ③ 스냅백 ④ swipe-down 닫기 ⑤ 재오픈 ⑥ X 닫기.
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

const tap = async (d, x, y) => {
  await d.performActions([{
    type: 'pointer', id: 'f', parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, x, y },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 80 },
      { type: 'pointerUp', button: 0 },
    ],
  }]);
  await d.releaseActions();
};

try {
  const { width, height } = await driver.getWindowSize();

  // ① 오픈
  await tap(driver, width * 0.5, height * 0.4);
  await driver.pause(1800);
  console.log('MARK open');

  // ② 드래그-홀드: 상단에서 45% 지점까지 내리고 손가락 유지 (pointerUp 없음)
  await driver.performActions([{
    type: 'pointer', id: 'hold', parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, x: width * 0.5, y: height * 0.12 },
      { type: 'pointerDown', button: 0 },
      { type: 'pointerMove', duration: 350, x: width * 0.5, y: height * 0.57 },
      { type: 'pause', duration: 400 },
    ],
  }]);
  await driver.saveScreenshot(`${SHOT}/v2-drag-hold.png`);
  console.log('MARK drag-hold shot');

  // ③ 스냅백: 임계 아래(25% 미만)로 되돌리고 릴리즈
  await driver.performActions([{
    type: 'pointer', id: 'hold', parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 250, x: width * 0.5, y: height * 0.2 },
      { type: 'pointerUp', button: 0 },
    ],
  }]);
  await driver.releaseActions();
  await driver.pause(900);
  await driver.saveScreenshot(`${SHOT}/v2-snapback.png`);
  console.log('MARK snapback');

  // ④ swipe-down 닫기
  await driver.performActions([{
    type: 'pointer', id: 'f2', parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, x: width * 0.5, y: height * 0.15 },
      { type: 'pointerDown', button: 0 },
      { type: 'pointerMove', duration: 280, x: width * 0.5, y: height * 0.8 },
      { type: 'pointerUp', button: 0 },
    ],
  }]);
  await driver.releaseActions();
  await driver.pause(1200);
  await driver.saveScreenshot(`${SHOT}/v2-dismissed.png`);
  console.log('MARK swipe-dismissed');

  // ⑤ 재오픈 → ⑥ X 닫기
  await tap(driver, width * 0.5, height * 0.4);
  await driver.pause(1800);
  const closeBtn = await driver.$('~닫기');
  await closeBtn.waitForExist({ timeout: 3000 });
  await closeBtn.click();
  await driver.pause(1200);
  await driver.saveScreenshot(`${SHOT}/v2-xclosed.png`);
  console.log('MARK x-closed');
} finally {
  await driver.deleteSession();
}
