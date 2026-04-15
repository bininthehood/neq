import { remote } from "webdriverio";

const driver = await remote({
  hostname: "127.0.0.1",
  port: 4723,
  logLevel: "warn",
  capabilities: {
    platformName: "iOS",
    "appium:automationName": "XCUITest",
    "appium:platformVersion": "17.2",
    "appium:deviceName": "iPhone 15",
    "appium:udid": "AB2A6323-7CA5-4F7C-AF81-76D89F3827FD",
    "appium:browserName": "Safari",
    "appium:newCommandTimeout": 120,
    "appium:wdaLaunchTimeout": 300000,
    "appium:wdaConnectionTimeout": 300000,
    "appium:useNewWDA": false,
  },
  connectionRetryTimeout: 360000,
});

console.log("[test] connected");

await driver.url("http://localhost:3000");
console.log("[test] navigated");

await driver.pause(5000);

const png = await driver.takeScreenshot();
const fs = await import("node:fs");
fs.writeFileSync("_screenshots/appium-01-discover.png", Buffer.from(png, "base64"));
console.log("[test] screenshot saved");

// Dump document title and URL
const title = await driver.getTitle();
const url = await driver.getUrl();
console.log(`[test] title: ${title}`);
console.log(`[test] url: ${url}`);

await driver.deleteSession();
console.log("[test] session closed");
