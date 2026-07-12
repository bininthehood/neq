// 2026-07-12 — DetailSheet swipe-down 닫힘 모션 2회 재생 검증 (1회성).
// 흐름: 카드 탭 → 시트 오픈 → swipe-down 닫기 → 2s 관찰 → 재오픈 (진입 slide 회귀 확인) → X 닫기.
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

const tap = async (x, y) => {
  await driver.performActions([{
    type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, x, y },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 80 },
      { type: 'pointerUp', button: 0 },
    ],
  }]);
  await driver.releaseActions();
};

try {
  const { width, height } = await driver.getWindowSize();
  console.log('window', width, height);

  // 1) 카드 탭 → DetailSheet 오픈
  await tap(width * 0.5, height * 0.4);
  await driver.pause(1500);
  console.log('MARK open#1 done');

  // 2) swipe-down 닫기 (시트 상단 y15% → y80%, ~280ms)
  await driver.performActions([{
    type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' },
    actions: [
      { type: 'pointerMove', duration: 0, x: width * 0.5, y: height * 0.15 },
      { type: 'pointerDown', button: 0 },
      { type: 'pointerMove', duration: 280, x: width * 0.5, y: height * 0.8 },
      { type: 'pointerUp', button: 0 },
    ],
  }]);
  await driver.releaseActions();
  console.log('MARK swipe-dismiss released');
  await driver.pause(2500); // 2회 재생이 있다면 이 구간에 보임

  // 3) 재오픈 — animationType 원복 확인 (진입 slide 살아있어야 함)
  await tap(width * 0.5, height * 0.4);
  await driver.pause(1800);
  console.log('MARK reopen done');

  // 4) X 닫기 회귀 확인 (좌상단 닫기 버튼 — a11y label 시도 후 좌표 fallback)
  try {
    const closeBtn = await driver.$('~닫기');
    await closeBtn.waitForExist({ timeout: 2000 });
    await closeBtn.click();
  } catch {
    await tap(width * 0.08, height * 0.07);
  }
  await driver.pause(2000);
  console.log('MARK x-close done');
} finally {
  await driver.deleteSession();
}
