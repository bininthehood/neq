/**
 * reaction 입력 정밀 — 좌표 시퀀스 + 스크린샷 증거.
 * 1차에서 overlay 시각 등장 확인. src 판정 대신 스크린샷으로 검증.
 * 시퀀스: 칩 탭 → overlay → "괜찮았어" 좌표탭 → badge → "✓ 시청" 재탭 해제.
 */
import { remote } from 'webdriverio';
import { writeFile } from 'node:fs/promises';
const CAPS = {
  platformName: 'iOS', 'appium:automationName': 'XCUITest',
  'appium:platformVersion': '26.4', 'appium:deviceName': 'iPhone 17 Pro',
  'appium:udid': '4EDF2CB4-81BE-41B2-9D5C-AEB1DDE14E29',
  'appium:bundleId': 'host.exp.Exponent', 'appium:autoLaunch': false,
  'appium:noReset': true, 'appium:newCommandTimeout': 240, 'appium:wdaLocalPort': 8100,
};
async function cap(b, n) {
  await writeFile(`/tmp/neko-qa/rc2-${n}.png`, await b.takeScreenshot(), 'base64');
  console.log('  cap:', n);
}
const b = await remote({ hostname: '127.0.0.1', port: 4723, path: '/', capabilities: CAPS, logLevel: 'error' });
const log = [];
function rec(t, m) { const l = `[${t}] ${m}`; log.push(l); console.log(l); }
try {
  for (const lbl of ['saved, tab, 2 of 5', 'saved, tab']) {
    const els = await b.$$(`~${lbl}`);
    let d = false;
    for (const e of els) if (await e.isDisplayed()) { await e.click(); d = true; break; }
    if (d) break;
  }
  await b.pause(1600);
  const gEls = await b.$$('~그리드 보기');
  for (const e of gEls) if (await e.isDisplayed()) { await e.click(); break; }
  await b.pause(800);

  const src = await b.getPageSource();
  const cardM = src.match(/<XCUIElementTypeButton[^>]*name="([^"]*상세보기)"[^>]*x="(\d+)"[^>]*y="(\d+)"[^>]*width="(\d+)"[^>]*height="(\d+)"/);
  const card = { name: cardM[1], x: +cardM[2], y: +cardM[3], w: +cardM[4], h: +cardM[5] };
  rec('4', `카드: ${card.name} @ (${card.x},${card.y}) ${card.w}x${card.h}`);

  // 1) 칩 탭 → overlay
  await b.execute('mobile: tap', { x: card.x + 42, y: card.y + 22 });
  await b.pause(900);
  await cap(b, '01-overlay');

  // overlay 4종 버튼은 카드 중앙 btnRow. 카드 세로 중앙 ~ y+h*0.55, btnRow 2줄 wrap.
  // "괜찮았어" 는 2번째 버튼 — 1줄에 인생작+괜찮았어, 2줄에 별로였어+안맞았어 (flexWrap).
  // 카드 폭 177 좁아 2x2 배치. 인생작/괜찮았어 = 상단 줄, y ~ card.y+h*0.52.
  const row1Y = card.y + Math.round(card.h * 0.55);
  const row2Y = card.y + Math.round(card.h * 0.68);
  const colL = card.x + Math.round(card.w * 0.30);
  const colR = card.x + Math.round(card.w * 0.70);
  rec('4', `버튼 추정 좌표 — row1 y=${row1Y}, row2 y=${row2Y}, colL=${colL}, colR=${colR}`);

  // "괜찮았어" = row1 우측 추정
  await b.execute('mobile: tap', { x: colR, y: row1Y });
  await b.pause(900);
  await cap(b, '02-after-tap-good');

  // 다시 칩 탭해서 상태 확인 (reaction 됐으면 "✓ 시청" 토글, 안 됐으면 "봤어요?")
  await cap(b, '03-state-check');

  // 다른 카드로도 reaction — 2번째 카드
  const src2 = await b.getPageSource();
  const cards = [...src2.matchAll(/<XCUIElementTypeButton[^>]*name="([^"]*상세보기)"[^>]*x="(\d+)"[^>]*y="(\d+)"[^>]*width="(\d+)"[^>]*height="(\d+)"/g)];
  if (cards.length >= 2) {
    const c2 = cards[1];
    const c2x = +c2[2], c2y = +c2[3], c2h = +c2[5];
    rec('4', `2번째 카드 ${c2[1]} @ (${c2x},${c2y})`);
    await b.execute('mobile: tap', { x: c2x + 42, y: c2y + 22 });
    await b.pause(900);
    await cap(b, '04-card2-overlay');
    // "인생작" = row1 좌측
    await b.execute('mobile: tap', { x: c2x + Math.round(+c2[4] * 0.30), y: c2y + Math.round(c2h * 0.55) });
    await b.pause(900);
    await cap(b, '05-card2-loved');
  }

  // list 모드 reaction
  const lEls = await b.$$('~리스트 보기');
  for (const e of lEls) if (await e.isDisplayed()) { await e.click(); break; }
  await b.pause(900);
  await cap(b, '06-list-mode');
  const lsrc = await b.getPageSource();
  const lcardM = lsrc.match(/<XCUIElementTypeButton[^>]*name="([^"]*상세보기)"[^>]*x="(\d+)"[^>]*y="(\d+)"[^>]*width="(\d+)"[^>]*height="(\d+)"/);
  if (lcardM) {
    const lc = { x: +lcardM[2], y: +lcardM[3], w: +lcardM[4], h: +lcardM[5] };
    rec('4-list', `list 카드 @ (${lc.x},${lc.y}) ${lc.w}x${lc.h}`);
    // list reportChip = 트레일링(우측). 카드 우측 끝 ~ x+w-30, 세로중앙 y+h/2
    await b.execute('mobile: tap', { x: lc.x + lc.w - 30, y: lc.y + Math.round(lc.h / 2) });
    await b.pause(900);
    await cap(b, '07-list-overlay');
    // compact overlay 버튼 — 카드 중앙
    await b.execute('mobile: tap', { x: lc.x + Math.round(lc.w * 0.35), y: lc.y + Math.round(lc.h * 0.62) });
    await b.pause(900);
    await cap(b, '08-list-after-report');
  }
  const gEls2 = await b.$$('~그리드 보기');
  for (const e of gEls2) if (await e.isDisplayed()) { await e.click(); break; }
  await b.pause(600);
  await cap(b, '09-final-grid');
} catch (e) {
  rec('ERROR', e.message);
} finally {
  await writeFile('/tmp/neko-qa/rc2-log.txt', log.join('\n'), 'utf8');
  await b.deleteSession();
}
