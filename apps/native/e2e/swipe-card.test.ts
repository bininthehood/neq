import fs from 'node:fs';
import path from 'node:path';

const SHOT_DIR = path.resolve(__dirname, 'screenshots');

async function capture(name: string): Promise<string> {
  if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(SHOT_DIR, `${timestamp}-${name}.png`);
  await browser.saveScreenshot(file);
  console.log(`📸 ${file}`);
  return file;
}

describe('Neko — discover swipe stack', () => {
  before(async () => {
    await browser.pause(2000);
  });

  it('카드가 렌더되고 스크린샷이 저장된다', async () => {
    await capture('00-initial');

    // Expo Go 안에서 실행 중이라면 우리 앱 화면이 이미 보이는 상태
    // 에러가 있으면 여기서 읽어 로그로 남김
    const source = await browser.getPageSource();
    const hasError = source.includes('Console Error') || source.includes('TransformError');
    if (hasError) {
      console.error('⚠️ 에러 감지 — pageSource 일부:');
      console.error(source.slice(0, 2000));
      await capture('01-error');
    }

    expect(hasError).toBe(false);
  });

  it('오른쪽 스와이프로 카드 전환된다', async () => {
    const { width, height } = await browser.getWindowSize();
    const startX = width * 0.3;
    const endX = width * 0.9;
    const y = height * 0.5;

    await browser.performActions([
      {
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: startX, y },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 100 },
          { type: 'pointerMove', duration: 300, x: endX, y },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
    await browser.releaseActions();

    await browser.pause(600);
    await capture('02-after-right-swipe');
  });

  it('왼쪽 스와이프로 카드 전환된다', async () => {
    const { width, height } = await browser.getWindowSize();
    const startX = width * 0.7;
    const endX = width * 0.1;
    const y = height * 0.5;

    await browser.performActions([
      {
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: startX, y },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 100 },
          { type: 'pointerMove', duration: 300, x: endX, y },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
    await browser.releaseActions();

    await browser.pause(600);
    await capture('03-after-left-swipe');
  });
});
