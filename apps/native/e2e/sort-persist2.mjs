/**
 * 정렬 persist 복원 — 재실측 (Expo Go relaunch 보정).
 * relaunch 후 Expo Go 홈의 "Recently opened" neq 프로젝트를 탭해 재진입.
 *
 * 주의: 후속 reenterNeq 흐름이 Expo Go 홈 가정. dev client 트랙에서는
 * relaunch 만으로 dev client 자체가 재실행되니 reenterNeq 단계 우회 필요.
 */
import { remote } from 'webdriverio';
import { writeFile } from 'node:fs/promises';
// wdio.conf 3-way 분기와 정합. E2E_TARGET 미지정 시 simulator-devclient (com.neq.app).
const target = process.env.E2E_TARGET ?? 'simulator-devclient';
const bundleId = target === 'expo-go' ? 'host.exp.Exponent' : 'com.neq.app';
const CAPS = {
  platformName: 'iOS', 'appium:automationName': 'XCUITest',
  'appium:platformVersion': '26.4', 'appium:deviceName': 'iPhone 17 Pro',
  'appium:udid': '4EDF2CB4-81BE-41B2-9D5C-AEB1DDE14E29',
  'appium:bundleId': bundleId, 'appium:autoLaunch': false,
  'appium:noReset': true, 'appium:newCommandTimeout': 300, 'appium:wdaLocalPort': 8100,
};
async function cap(b, n) { await writeFile(`/tmp/neko-qa/sp2-${n}.png`, await b.takeScreenshot(), 'base64'); console.log('  cap:', n); }
async function tapVis(b, l) {
  const els = await b.$$(`~${l}`);
  for (const e of els) if (await e.isDisplayed()) { await e.click(); return true; }
  return false;
}
async function gotoSaved(b) {
  for (const l of ['saved, tab, 2 of 5', 'saved, tab']) if (await tapVis(b, l)) return true;
  return false;
}
async function activeSort(b) {
  const src = await b.getPageSource();
  const m = src.match(/name="([^"]*) 선택됨"/);
  return m ? m[1] : '(미검출)';
}
async function topCards(b) {
  const src = await b.getPageSource();
  return [...src.matchAll(/name="([^"]*) 상세보기"/g)].slice(0, 5).map((x) => x[1]);
}
async function srcHas(b, s) { return (await b.getPageSource()).includes(s); }

const b = await remote({ hostname: '127.0.0.1', port: 4723, path: '/', capabilities: CAPS, logLevel: 'error' });
const log = [];
function rec(t, m) { const l = `[${t}] ${m}`; log.push(l); console.log(l); }

async function reenterNeq(b) {
  // Expo Go 홈에서 "neq" Recently opened 항목 탭
  await b.pause(2000);
  let entered = false;
  // accessibility: "neq," 텍스트 포함 cell/button
  const src = await b.getPageSource();
  const m = src.match(/name="(neq[^"]*)"[^>]*x="(\d+)"[^>]*y="(\d+)"[^>]*width="(\d+)"[^>]*height="(\d+)"/);
  if (m) {
    const x = +m[2] + +m[4] / 2, y = +m[3] + +m[5] / 2;
    rec('relaunch', `Recently opened "neq" 탭 @ (${x},${y})`);
    await b.execute('mobile: tap', { x, y });
    entered = true;
  } else {
    rec('relaunch', 'Recently opened neq 항목 미발견');
  }
  return entered;
}

try {
  // ── 현재 앱이 살아있는지 확인, 없으면 재진입 ──
  await b.pause(800);
  let onApp = await srcHas(b, 'tab, 2 of 5') || await srcHas(b, 'tab,');
  if (!onApp) {
    rec('init', 'neq 앱 미로드 — Expo Go 재진입');
    await reenterNeq(b);
    await b.pause(8000);
  }
  // DetailSheet 등 잔여 모달 닫기
  await tapVis(b, '닫기');
  await b.pause(400);
  const closed = await b.$$('//XCUIElementTypeButton[@name="close" or contains(@name,"닫")]');
  for (const c of closed) { try { if (await c.isDisplayed()) await c.click(); } catch { /* */ } }
  await b.pause(500);

  const okSaved = await gotoSaved(b);
  rec('init', `Saved 탭 진입: ${okSaved}`);
  await b.pause(1800);
  await tapVis(b, '그리드 보기');
  await b.pause(700);
  await cap(b, '00-saved');

  // ── 1) 평점순 선택 ──
  const fOpen = await tapVis(b, '필터 열기');
  rec('persist', `필터 시트 열기: ${fOpen}`);
  await b.pause(1000);
  await cap(b, '01-sheet');
  const before = await activeSort(b);
  rec('persist', `변경 전 활성 정렬: "${before}"`);
  const rt = await tapVis(b, '평점순 선택');
  rec('persist', `"평점순 선택" 탭: ${rt}`);
  await b.pause(700);
  const afterSet = await activeSort(b);
  rec('persist', `변경 후 활성 정렬: "${afterSet}"`);
  await tapVis(b, '필터 닫기');
  await b.pause(900);
  const cardsSet = await topCards(b);
  rec('persist', `평점순 적용 상위: ${JSON.stringify(cardsSet)}`);
  await cap(b, '02-rating-applied');

  // ── 2) terminate + relaunch ──
  rec('persist', 'terminate → relaunch → Expo Go 재진입');
  await b.execute('mobile: terminateApp', { bundleId });
  await b.pause(1500);
  await b.execute('mobile: launchApp', { bundleId });
  await b.pause(2500);
  await cap(b, '03-expo-home');
  await reenterNeq(b);
  await b.pause(9000);
  await cap(b, '04-reloaded');

  // ── 3) Saved 재진입 → 정렬 복원 확인 ──
  const okSaved2 = await gotoSaved(b);
  rec('persist', `재시작 후 Saved 진입: ${okSaved2}`);
  await b.pause(2500);
  await tapVis(b, '그리드 보기');
  await b.pause(700);
  const cardsRestart = await topCards(b);
  rec('persist', `재시작 후 상위 카드: ${JSON.stringify(cardsRestart)}`);
  await cap(b, '05-after-restart');

  await tapVis(b, '필터 열기');
  await b.pause(1000);
  const restored = await activeSort(b);
  rec('persist', `재시작 후 활성 정렬: "${restored}"`);
  await cap(b, '06-sheet-restored');
  const PASS = restored.includes('평점순');
  rec('RESULT', `정렬 persist 복원: ${PASS ? 'PASS' : 'FAIL'} (기대=평점순, 실측="${restored}")`);

  // 저장순 복원
  await tapVis(b, '저장순 선택');
  await b.pause(500);
  await tapVis(b, '필터 닫기');
  await b.pause(500);
} catch (e) {
  rec('ERROR', e.message);
  try { await cap(b, 'ZZ-error'); } catch { /* */ }
} finally {
  await writeFile('/tmp/neko-qa/sp2-log.txt', log.join('\n'), 'utf8');
  await b.deleteSession();
}
