import { remote } from 'webdriverio';
import fs from 'node:fs';
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
  const src = await d.getPageSource();
  const matches = [...src.matchAll(/name="([^"]+)"/g)].map(m => m[1]).slice(0, 40);
  console.log('Visible names:');
  matches.forEach(n => console.log(' -', n));
} finally { await d.deleteSession(); }
