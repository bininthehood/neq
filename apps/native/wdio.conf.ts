import type { Options } from '@wdio/types';
import path from 'node:path';

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
      'appium:deviceName': 'iPhone 17 Pro',
      'appium:udid': '4EDF2CB4-81BE-41B2-9D5C-AEB1DDE14E29',
      // Expo Go container — 개발 빌드로 전환하면 com.neq.app로 교체
      'appium:bundleId': 'host.exp.Exponent',
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
