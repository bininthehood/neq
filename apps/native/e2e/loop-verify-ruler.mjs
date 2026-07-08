/**
 * 룰러 스크러버 검증 (uncommitted QA 스크립트 — loop-verify-month.mjs 후속)
 *
 * neq_saved 백업 → 2개월 전(2건) + 이번 달(나머지) 백데이트 (가운데 달 = 빈 눈금)
 *  R1  룰러 렌더: 컨테이너 + 데이터 눈금 2 + 빈 눈금(저장 없음) + '전체 월' + 연 라벨
 *  R2  스냅 선택: 전체 → 우측 드래그 → 가장 오래된 달 스냅 → 리스트 그 달만
 *  R3  해제: '전체 월' 탭 → 전체 복귀
 *  R4  빈 달 스냅 해석: 빈 달 정지 → 인접 데이터 달로 보정 (리스트 비어있지 않음)
 *  R5  단일 월: 전부 이번 달로 → 스크러버 여전히 노출
 *  R6  stretch 회귀: 컨테이너 height < 100
 *  R7  크래시: 빠른 플링 20회 후 앱 foreground 유지
 * → 원복
 */
import { remote } from 'webdriverio';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';

const UDID = '4EDF2CB4-81BE-41B2-9D5C-AEB1DDE14E29';
const BUNDLE = 'com.neq.app';
const OUT = process.env.OUT_DIR || '/tmp/neko-loop-ruler';
const TICK_W = 44;
const simctl = (cmd) => execSync(`xcrun simctl ${cmd}`, { encoding: 'utf8' }).trim();

const CAPS = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:platformVersion': '26.4',
  'appium:deviceName': 'iPhone 17 Pro',
  'appium:udid': UDID,
  'appium:bundleId': BUNDLE,
  'appium:autoLaunch': false,
  'appium:noReset': true,
  'appium:newCommandTimeout': 300,
  'appium:wdaLocalPort': 8100,
};

const results = [];
function check(id, pass, note) {
  results.push({ id, pass, note });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${id} — ${note}`);
}

async function rects(b, contains) {
  const src = await b.getPageSource();
  const re = new RegExp(
    `<(XCUIElementType\\w+)[^>]*?name="([^"]*${contains}[^"]*)"[^>]*?x="(-?\\d+)"[^>]*?y="(-?\\d+)"[^>]*?width="(\\d+)"[^>]*?height="(\\d+)"`,
    'g',
  );
  const out = []; let m; const seen = new Set();
  while ((m = re.exec(src)) !== null) {
    const key = `${m[2]}|${m[3]}|${m[4]}`;
    if (seen.has(key)) continue; seen.add(key);
    out.push({ type: m[1], name: m[2], x: +m[3], y: +m[4], w: +m[5], h: +m[6] });
  }
  return out;
}

async function tap(b, x, y) {
  await b.performActions([{ type: 'pointer', id: 'f', parameters: { pointerType: 'touch' }, actions: [
    { type: 'pointerMove', duration: 0, x, y }, { type: 'pointerDown', button: 0 },
    { type: 'pause', duration: 80 }, { type: 'pointerUp', button: 0 } ] }]);
  await b.releaseActions();
}

/** 느린 수평 드래그 (릴리즈 속도 ~0 → snapToInterval 보정 스냅 유도). dx>0 = 손가락 오른쪽. */
async function dragH(b, x, y, dx, slow = true) {
  const steps = slow ? 4 : 1;
  const acts = [
    { type: 'pointerMove', duration: 0, x, y },
    { type: 'pointerDown', button: 0 },
    { type: 'pause', duration: 120 },
  ];
  for (let i = 1; i <= steps; i++) {
    acts.push({ type: 'pointerMove', duration: slow ? 220 : 60, x: x + (dx * i) / steps, y });
  }
  if (slow) acts.push({ type: 'pause', duration: 250 }); // 속도 죽이기
  acts.push({ type: 'pointerUp', button: 0 });
  await b.performActions([{ type: 'pointer', id: 'f', parameters: { pointerType: 'touch' }, actions: acts }]);
  await b.releaseActions();
}

// ── AsyncStorage ────────────────────────────────────────────────
function storagePaths() {
  const container = simctl(`get_app_container ${UDID} ${BUNDLE} data`);
  const dir = path.join(container, 'Library', 'Application Support', BUNDLE, 'RCTAsyncLocalStorage_V1');
  return { dir, manifest: path.join(dir, 'manifest.json') };
}

async function readSaved() {
  const { dir, manifest } = storagePaths();
  const man = JSON.parse(await readFile(manifest, 'utf8'));
  if (Object.prototype.hasOwnProperty.call(man, 'neq_saved') && man.neq_saved !== null) {
    return { where: 'manifest', man, dir, manifest, value: JSON.parse(man.neq_saved) };
  }
  const crypto = await import('node:crypto');
  const hash = crypto.createHash('md5').update('neq_saved').digest('hex');
  const file = path.join(dir, hash);
  return { where: 'file', man, dir, manifest, file, value: JSON.parse(await readFile(file, 'utf8')) };
}

async function writeSaved(loc, value) {
  const json = JSON.stringify(value);
  // 온보딩 키 주입 — E2E 리셋 잔재로 카드 탭 silent ignore 되는 트랩 방어
  loc.man.tutorialV3Shown = '1';
  loc.man.neq_onboarded = 'true';
  if (loc.where === 'manifest') {
    loc.man.neq_saved = json;
    await writeFile(loc.manifest, JSON.stringify(loc.man));
  } else {
    await writeFile(loc.manifest, JSON.stringify(loc.man));
    await writeFile(loc.file, json);
  }
}

async function relaunchToScrubber(b) {
  simctl(`launch ${UDID} ${BUNDLE}`);
  await b.pause(6000);
  for (const l of ['저장', '저장됨', 'saved']) {
    const el = await b.$(`~${l}`);
    if (await el.isExisting()) { await el.click(); break; }
  }
  await b.pause(2000);
  const ym = await b.$('~연·월별 보기');
  if (await ym.isExisting()) { await ym.click(); await b.pause(1500); }
}

async function shot(b, name) {
  const png = await b.takeScreenshot();
  await writeFile(`${OUT}/${name}.png`, png, 'base64');
  return `${OUT}/${name}.png`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  try { simctl(`terminate ${UDID} ${BUNDLE}`); } catch {}

  const loc = await readSaved();
  const saved = loc.value;
  if (!Array.isArray(saved) || saved.length < 3) {
    console.log(`[SKIP] neq_saved ${saved?.length ?? 0}건 — 3건 이상 필요`);
    process.exit(2);
  }
  const backupPath = `${OUT}/neq_saved.backup.json`;
  await writeFile(backupPath, JSON.stringify(saved));
  console.log(`backup: ${backupPath} (${saved.length} items, where=${loc.where})`);

  // 백데이트: 첫 1건 = 2개월 전 (가운데 달 빈 눈금), 나머지 = 이번 달.
  // 월별 건수를 다르게(1 vs N-1) — visible 수만으로 어느 달 필터인지 판별 가능하게.
  const now = new Date();
  const oldD = new Date(now.getFullYear(), now.getMonth() - 2, 10, 12);
  const oldLabel = `${oldD.getFullYear()}년 ${oldD.getMonth() + 1}월`;
  const midD = new Date(now.getFullYear(), now.getMonth() - 1, 10);
  const midLabel = `${midD.getFullYear()}년 ${midD.getMonth() + 1}월`;
  const curLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
  const mod = saved.map((it, i) => ({
    ...it,
    savedAt: i < 1 ? oldD.getTime() : now.getTime() - i * 3600e3,
  }));
  await writeSaved(loc, mod);
  console.log(`backdated: ${oldLabel}×1 + ${curLabel}×${saved.length - 1} (빈 달=${midLabel})`);

  const b = await remote({ hostname: '127.0.0.1', port: 4723, capabilities: CAPS, logLevel: 'error' });
  try {
    await relaunchToScrubber(b);

    // ── R1 룰러 렌더 ──
    const container = await rects(b, '연·월 필터');
    const dataTicks = await rects(b, '저장작');
    const emptyTicks = await rects(b, '저장 없음');
    const allZone = await rects(b, '전체 월');
    check('R1a', container.length >= 1, `컨테이너 '연·월 필터' ${container.length}`);
    check('R1b', dataTicks.length === 2, `데이터 눈금 2 기대: ${dataTicks.map((t) => t.name).join(' | ')}`);
    check('R1c', emptyTicks.some((t) => t.name === `${midLabel} 저장 없음`), `빈 눈금 '${midLabel} 저장 없음': ${emptyTicks.map((t) => t.name).join(' | ')}`);
    check('R1d', allZone.length >= 1, `'전체 월' 존 ${allZone.length}`);
    // 연 라벨 Text 는 accessible Pressable 자식이라 XCUITest 에 평탄화 — a11y 라벨의
    // 연도 포함 + 스크린샷(r1-ruler-initial) 육안 확인 병행.
    check('R1e', dataTicks.some((t) => t.name.startsWith(`${oldD.getFullYear()}년`)), `연도 정보 a11y 노출 (시각 라벨은 스크린샷 확인)`);
    console.log('screenshot:', await shot(b, 'r1-ruler-initial'));

    const fullCount = (await rects(b, '상세보기')).length;
    const total = saved.length;
    console.log(`전체 월 visible=${fullCount}, total=${total}`);

    // ── R2 스냅 선택 → 필터 ──
    // 초기 위치 = '전체'(idx 3). 터치 슬롭(~10pt)이 초반 이동을 먹으므로 3.5칸
    // 오버드래그 → bounce 후 idx0(2개월 전 달) 스냅.
    const c = container[0];
    const cy = c.y + c.h / 2;
    const cx = c.x + c.w / 2;
    await dragH(b, cx, cy, Math.round(TICK_W * 3.5));
    await b.pause(2500);
    const oldCount = (await rects(b, '상세보기')).length;
    check('R2', oldCount === 1, `${oldLabel} 스냅 → visible ${oldCount} (기대 1)`);
    console.log('screenshot:', await shot(b, 'r2-snap-oldest'));

    // ── R3 '전체 월' 탭 → 해제 ──
    const az = (await rects(b, '전체 월'))[0];
    if (az) await tap(b, az.x + az.w / 2, az.y + az.h / 2);
    await b.pause(2000);
    const clearCount = (await rects(b, '상세보기')).length;
    check('R3', clearCount === fullCount, `전체 복귀 → visible ${clearCount} (기대 ${fullCount})`);
    console.log('screenshot:', await shot(b, 'r3-clear-all'));

    // ── R4 빈 달 스냅 해석 ──
    // 전체(idx3)에서 오른쪽 2.0칸(+슬롭 감안 release ≈ 1.2칸) → snap idx1(빈 달)
    // → resolveSnapIndex 가 인접 데이터 달(최신 쪽)로 보정.
    await dragH(b, cx, cy, Math.round(TICK_W * 2.0));
    await b.pause(2500);
    const resolvedCount = (await rects(b, '상세보기')).length;
    const expectCur = Math.min(total - 1, fullCount);
    check('R4', resolvedCount === expectCur, `빈 달 정지 → 인접 데이터 달 보정, visible ${resolvedCount} (기대 ${expectCur})`);
    console.log('screenshot:', await shot(b, 'r4-empty-resolve'));

    // ── R6 stretch 회귀 ──
    check('R6', c.h > 0 && c.h < 100, `컨테이너 height ${c.h}`);

    // ── R7 크래시 20회 플링 ──
    for (let i = 0; i < 20; i++) {
      await dragH(b, cx, cy, (i % 2 === 0 ? -1 : 1) * TICK_W * 3, false);
      await b.pause(150);
    }
    await b.pause(1500);
    const state = await b.execute('mobile: queryAppState', { bundleId: BUNDLE });
    check('R7', state === 4, `플링 20회 후 appState=${state} (4=foreground)`);
    console.log('screenshot:', await shot(b, 'r7-after-stress'));

    // ── R5 단일 월 ──
    simctl(`terminate ${UDID} ${BUNDLE}`);
    const locS = await readSaved();
    await writeSaved(locS, saved.map((it, i) => ({ ...it, savedAt: now.getTime() - i * 3600e3 })));
    await relaunchToScrubber(b);
    const singleTicks = await rects(b, '저장작');
    const singleAll = await rects(b, '전체 월');
    check('R5', singleTicks.length === 1 && singleAll.length >= 1, `단일 월 눈금 ${singleTicks.map((t) => t.name).join(' | ')} + 전체 존 ${singleAll.length}`);
    console.log('screenshot:', await shot(b, 'r5-single-month'));
  } finally {
    await b.deleteSession().catch(() => {});
    try { simctl(`terminate ${UDID} ${BUNDLE}`); } catch {}
    const backup = JSON.parse(await readFile(backupPath, 'utf8'));
    const loc2 = await readSaved();
    await writeSaved(loc2, backup);
    console.log('restored: neq_saved 원복 완료');
    simctl(`launch ${UDID} ${BUNDLE}`);
  }

  const fails = results.filter((r) => !r.pass);
  console.log(`\n=== ${results.length - fails.length}/${results.length} PASS ===`);
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
