import type { Options } from '@wdio/types';
import path from 'node:path';

/**
 * E2E target 분기 — 3-way.
 *
 *   E2E_TARGET=simulator-devclient  (default) — com.neq.app 시뮬 dev client
 *   E2E_TARGET=expo-go                         — host.exp.Exponent + 시뮬레이터 udid
 *   E2E_TARGET=testflight                      — com.neq.app + IOS_DEVICE_UDID 환경변수 (실기기)
 *
 * 2026-06-02: default 가 expo-go → simulator-devclient 로 전환됨.
 *   b1b0d5a (Welcome 4차 라운드) 가 lottie-react-native 네이티브 모듈을 도입하면서
 *   Expo Go 로는 Welcome 화면 자체가 깨짐 (커밋 메시지: "Expo Go 미작동").
 *   시뮬레이터 dev client 빌드 (`npx expo run:ios`) 가 새 기본 회귀 트랙.
 *
 * simulator-devclient 사용 예:
 *   cd apps/native && npx expo run:ios               # 1회 dev client 빌드 (sim 에 설치)
 *   cd apps/native && npx expo start --dev-client &  # Metro 부착 (백그라운드)
 *   npm run test:e2e:ios                              # default = simulator-devclient
 *
 * TestFlight 사용 예:
 *   IOS_DEVICE_UDID=<실기기 udid> E2E_TARGET=testflight npm run test:e2e:ios
 *   (사전: 실기기 USB 연결 + 개발자 모드 + appium-xcuitest 신뢰)
 *
 * Expo Go (legacy / 네이티브 모듈 없는 sanity 회귀) 사용 예:
 *   E2E_TARGET=expo-go npm run test:e2e:ios
 *   (현재 main 브랜치는 Lottie 의존 — Welcome 깨져 BLOCKED 예상)
 */
const E2E_TARGET = (process.env.E2E_TARGET ?? 'simulator-devclient') as
  | 'simulator-devclient'
  | 'expo-go'
  | 'testflight';
const isTestFlight = E2E_TARGET === 'testflight';
const isExpoGo = E2E_TARGET === 'expo-go';

// 시뮬 dev client / TestFlight 둘 다 com.neq.app standalone 번들 사용.
// Expo Go 만 host.exp.Exponent 컨테이너.
const bundleId = isExpoGo ? 'host.exp.Exponent' : 'com.neq.app';
const udid = isTestFlight
  ? (process.env.IOS_DEVICE_UDID ?? (() => {
      throw new Error('E2E_TARGET=testflight 시 IOS_DEVICE_UDID 환경변수 필요');
    })())
  : '4EDF2CB4-81BE-41B2-9D5C-AEB1DDE14E29';
const deviceName = isTestFlight
  ? (process.env.IOS_DEVICE_NAME ?? 'iPhone')
  : 'iPhone 17 Pro';
const platformVersion = isTestFlight
  ? (process.env.IOS_PLATFORM_VERSION ?? '26.5')
  : '26.4';

// 실기기 (TestFlight) 전용 — WDA 자동 빌드를 위한 dev signing.
// xcodeOrgId 는 eas.json submit profile 의 appleTeamId 와 동일.
// simulator-devclient 는 시뮬 codesigning 불필요 → testFlightExtras 비적용.
const testFlightExtras: Partial<WebdriverIO.Capabilities> = isTestFlight
  ? {
      'appium:xcodeOrgId': process.env.IOS_TEAM_ID ?? '67YXH2WD77',
      'appium:xcodeSigningId': 'Apple Development',
      'appium:showXcodeLog': true,
      'appium:webDriverAgentUrl': process.env.WDA_URL,
      // TestFlight standalone 빌드는 Appium 이 직접 띄워야 stale-pid 회피
      'appium:autoLaunch': true,
      // iOS 17+ build hang 우회: 기존 설치된 WDA Runner 재사용 (Appium 가 xcodebuild
      // build-for-testing 을 새로 돌리면 38분+ hang. 본 capability 3종이 build 단계 skip)
      'appium:usePrebuiltWDA': true,
      'appium:useNewWDA': false,
      'appium:skipServerInstallation': true,
      'appium:updatedWDABundleId': 'com.facebook.WebDriverAgentRunner.xctrunner',
    }
  : {};

export const config: Options.Testrunner = {
  runner: 'local',
  tsConfigPath: './tsconfig.json',

  specs: ['./e2e/**/*.test.ts'],
  maxInstances: 1,

  capabilities: [
    {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:platformVersion': platformVersion,
      'appium:deviceName': deviceName,
      'appium:udid': udid,
      'appium:bundleId': bundleId,
      'appium:autoLaunch': false,
      'appium:noReset': true,
      'appium:newCommandTimeout': 240,
      'appium:wdaLocalPort': 8100,
      ...testFlightExtras,
    } as WebdriverIO.Capabilities,
  ],

  logLevel: 'info',
  bail: 0,
  waitforTimeout: 10000,
  // TestFlight standalone + autoLaunch=true 첫 launch 가 120s 초과 — 300s 로 확장
  connectionRetryTimeout: 300000,
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
