// One-shot cleanup — taste-survey 화면이 남아있을 때 ✕ 누르고 profile 로 복귀.
import { remote } from 'webdriverio';

const driver = await remote({
  hostname: '127.0.0.1',
  port: 4723,
  path: '/',
  logLevel: 'error',
  capabilities: {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:platformVersion': '26.4',
    'appium:deviceName': 'iPhone 17 Pro',
    'appium:udid': '4EDF2CB4-81BE-41B2-9D5C-AEB1DDE14E29',
    'appium:bundleId': 'host.exp.Exponent',
    'appium:autoLaunch': false,
    'appium:noReset': true,
    'appium:newCommandTimeout': 240,
    'appium:wdaLocalPort': 8100,
  },
});

try {
  const close = await driver.$('~설문 닫기');
  if (await close.isExisting()) {
    await close.click();
    console.log('✕ 설문 닫기 — clicked');
    await driver.pause(800);
  } else {
    console.log('설문 닫기 element 없음 — 이미 닫혀있을 수 있음');
  }
} finally {
  await driver.deleteSession();
}
