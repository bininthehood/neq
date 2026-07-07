/**
 * 월 스크러버 검증 (uncommitted QA 스크립트)
 * AsyncStorage `neq_saved` savedAt 을 2~3개월 백데이트(백업 후) → 재실행 →
 * '연·월 필터' 칩 노출 + 탭 필터 동작 확인 → 원복.
 */
import { remote } from 'webdriverio';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';

const UDID = '4EDF2CB4-81BE-41B2-9D5C-AEB1DDE14E29';
const BUNDLE = 'com.neq.app';
const OUT = process.env.OUT_DIR || '/tmp/neko-loop-verify';
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
  'appium:newCommandTimeout': 240,
  'appium:wdaLocalPort': 8100,
};

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

// ── AsyncStorage 조작 ────────────────────────────────────────────
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
  // 대용량 값은 별도 파일 (md5 해시 파일명) — manifest 값이 null 인 경우
  const crypto = await import('node:crypto');
  const hash = crypto.createHash('md5').update('neq_saved').digest('hex');
  const file = path.join(dir, hash);
  return { where: 'file', man, dir, manifest, file, value: JSON.parse(await readFile(file, 'utf8')) };
}

async function writeSaved(loc, value) {
  const json = JSON.stringify(value);
  if (loc.where === 'manifest') {
    loc.man.neq_saved = json;
    await writeFile(loc.manifest, JSON.stringify(loc.man));
  } else {
    await writeFile(loc.file, json);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  try { simctl(`terminate ${UDID} ${BUNDLE}`); } catch {}

  const loc = await readSaved();
  const saved = loc.value;
  if (!Array.isArray(saved) || saved.length === 0) {
    console.log('[SKIP] neq_saved 비어있음 — 저장 항목 먼저 필요');
    process.exit(2);
  }
  // 백업
  const backupPath = `${OUT}/neq_saved.backup.json`;
  await writeFile(backupPath, JSON.stringify(saved));
  console.log(`backup: ${backupPath} (${saved.length} items, where=${loc.where})`);

  // 백데이트: 절반은 1개월 전, 1/4 은 2개월 전 (최소 1건씩)
  const now = Date.now();
  const M = 30 * 24 * 3600 * 1000;
  const mod = saved.map((it, i) => {
    const c = { ...it };
    if (i % 4 === 1) c.savedAt = now - 2 * M - i * 3600e3;
    else if (i % 2 === 1) c.savedAt = now - M - i * 3600e3;
    return c;
  });
  // 최소 보장: 항목 2개 이상이면 마지막 항목을 2개월 전으로
  if (mod.length >= 2) mod[mod.length - 1].savedAt = now - 2 * M;
  await writeSaved(loc, mod);
  console.log('backdated: 1~2개월 분산');

  const b = await remote({ hostname: '127.0.0.1', port: 4723, capabilities: CAPS, logLevel: 'error' });
  let verdict = 'FAIL', note = '';
  try {
    simctl(`launch ${UDID} ${BUNDLE}`);
    await b.pause(6000);
    // saved 탭
    for (const l of ['저장', '저장됨', 'saved']) {
      const el = await b.$(`~${l}`);
      if (await el.isExisting()) { await el.click(); break; }
    }
    await b.pause(2000);
    // 연·월별 보기 진입 (버튼 있으면 tap)
    const ym = await b.$('~연·월별 보기');
    if (await ym.isExisting()) { await ym.click(); await b.pause(1500); }

    const scrubber = await rects(b, '연·월 필터');
    const monthChips = await rects(b, '저장작'); // `${label} 저장작`
    console.log(`scrubber=${scrubber.length}, monthChips=${monthChips.map((c) => c.name).join(' | ')}`);
    const png = await b.takeScreenshot();
    await writeFile(`${OUT}/month-scrubber.png`, png, 'base64');

    if (monthChips.length >= 2) {
      const before = (await rects(b, '상세보기')).length;
      const target = monthChips[monthChips.length - 1];
      await tap(b, target.x + target.w / 2, target.y + target.h / 2);
      await b.pause(1500);
      const after = (await rects(b, '상세보기')).length;
      const png2 = await b.takeScreenshot();
      await writeFile(`${OUT}/month-filtered.png`, png2, 'base64');
      verdict = 'PASS';
      note = `chips=${monthChips.length}, before=${before}, after=${after}`;
    } else {
      note = `월 칩 부족 (${monthChips.length}) — scrubber=${scrubber.length}`;
    }
  } finally {
    await b.deleteSession().catch(() => {});
    // 원복
    try { simctl(`terminate ${UDID} ${BUNDLE}`); } catch {}
    const backup = JSON.parse(await readFile(backupPath, 'utf8'));
    const loc2 = await readSaved();
    await writeSaved(loc2, backup);
    console.log('restored: neq_saved 원복 완료');
    simctl(`launch ${UDID} ${BUNDLE}`);
  }
  console.log(`[${verdict}] month_scrubber — ${note}`);
  process.exit(verdict === 'PASS' ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
