import { remote } from 'webdriverio';
const CAPS = {
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
};
const b = await remote({ hostname: '127.0.0.1', port: 4723, path: '/', capabilities: CAPS, logLevel: 'error' });
try {
  console.log('swipe left');
  await b.execute('mobile: dragFromToForDuration', { fromX: 320, fromY: 480, toX: 50, toY: 480, duration: 0.3 });
  await b.pause(3000);
  console.log('done');
} catch (err) { console.error('ERROR:', err.message); }
finally { await b.deleteSession(); }
