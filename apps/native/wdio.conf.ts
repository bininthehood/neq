import type { Options } from '@wdio/types';
import path from 'node:path';

/**
 * E2E target 분기 — 기본 expo-go (개발), testflight 는 standalone 빌드 회귀.
 *
 *   E2E_TARGET=expo-go     (default) — host.exp.Exponent + 시뮬레이터 udid
 *   E2E_TARGET=testflight  — com.neq.app + IOS_DEVICE_UDID 환경변수 (실기기)
 *
 * TestFlight 사용 예:
 *   IOS_DEVICE_UDID=<실기기 udid> E2E_TARGET=testflight npm run test:e2e:ios
 *   (사전: 실기기 USB 연결 + 개발자 모드 + appium-xcuitest 신뢰)
 */
const E2E_TARGET = (process.env.E2E_TARGET ?? 'expo-go') as 'expo-go' | 'testflight';
const isTestFlight = E2E_TARGET === 'testflight';
const bundleId = isTestFlight ? 'com.neq.app' : 'host.exp.Exponent';
const udid = isTestFlight
  ? (process.env.IOS_DEVICE_UDID ?? (() => {
      throw new Error('E2E_TARGET=testflight 시 IOS_DEVICE_UDID 환경변수 필요');
    })())
  : '4EDF2CB4-81BE-41B2-9D5C-AEB1DDE14E29';
const deviceName = isTestFlight
  ? (process.env.IOS_DEVICE_NAME ?? 'iPhone')
  : 'iPhone 17 Pro';

export const config: Options.Testrunner = {
  runner: 'local',
  tsConfigPath: './tsconfig.json',

  specs: ['./e2e/**/*.test.ts'],
  maxInstances: 1,

  capabilities: [
    {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:platformVersion': '26.4',
      'appium:deviceName': deviceName,
      'appium:udid': udid,
      'appium:bundleId': bundleId,
      'appium:autoLaunch': false,
      'appium:noReset': true,
      'appium:newCommandTimeout': 240,
      'appium:wdaLocalPort': 8100,
    } as WebdriverIO.Capabilities,
  ],

  logLevel: 'info',
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  hostname: '127.0.0.1',
  port: 4723,
  path: '/',

  // Appium 서버는 별도로 `appium --relaxed-security`로 실행한다고 가정
  // services를 사용하지 않으므로 유저가 직접 제어

  framework: 'mocha',
  reporters: ['spec'],

  mochaOpts: {
    ui: 'bdd',
    timeout: 120000,
  },

  outputDir: path.resolve('./e2e/_logs'),
};
