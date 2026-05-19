/**
 * 배치 A 정밀 재실측 — 1차에서 셀렉터 불일치로 누락된 reaction/그룹핑 검증.
 * - "봤어요?" 버튼 accessibilityLabel = "{title} 시청 리포트 작성"
 * - 그룹화 토글 accessibilityLabel = "OTT별로 그룹화" (switch role)
 */
import { remote } from 'webdriverio';
import { writeFile, mkdir } from 'node:fs/promises';
import { checkAlive } from './_alive.mjs';

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
const OUT = '/tmp/neko-qa';

async function cap(b, name) {
  const png = await b.takeScreenshot();
  await writeFile(`${OUT}/batchA2-${name}.png`, png, 'base64');
  console.log('  cap:', name);
}
async function tapVisible(b, label) {
  const els = await b.$$(`~${label}`);
  for (const t of els) {
    if (await t.isDisplayed()) {
      await t.click();
      return true;
    }
  }
  return false;
}
async function srcHas(b, n) {
  return (await b.getPageSource()).includes(n);
}
async function rects(b, contains) {
  const src = await b.getPageSource();
  const re = new RegExp(
    `<(XCUIElementType\\w+)[^>]*?name="([^"]*${contains}[^"]*)"[^>]*?x="(\\d+)"[^>]*?y="(\\d+)"[^>]*?width="(\\d+)"[^>]*?height="(\\d+)"`,
    'g',
  );
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({ name: m[2], x: +m[3], y: +m[4], w: +m[5], h: +m[6] });
  }
  return out;
}

const b = await remote({ hostname: '127.0.0.1', port: 4723, path: '/', capabilities: CAPS, logLevel: 'error' });
const log = [];
function rec(t, m) { const l = `[${t}] ${m}`; log.push(l); console.log(l); }

try {
  await mkdir(OUT, { recursive: true });
  // Saved 탭
  if (!(await tapVisible(b, 'saved, tab, 2 of 5'))) await tapVisible(b, 'saved, tab');
  await b.pause(1600);
  // grid 모드 보장
  await tapVisible(b, '그리드 보기');
  await b.pause(700);

  // ── 4. reaction (grid) — "시청 리포트 작성" label 매칭 ──
  let src = await b.getPageSource();
  let rm = src.match(/name="([^"]*?시청 리포트 작성)"/g) || [];
  rec('4', `grid "시청 리포트 작성" 버튼 ${rm.length}개`);
  if (rm.length > 0) {
    const firstLabel = rm[0].slice(6, -1);
    rec('4', `첫 reaction 버튼: "${firstLabel}"`);
    const el = await b.$(`~${firstLabel}`);
    await el.click();
    await b.pause(700);
    const overlayOn = await srcHas(b, '본 적 있나요?');
    rec('4', `reaction overlay "본 적 있나요?": ${overlayOn}`);
    await cap(b, '01-grid-overlay');
    // 4종 reaction 라벨 확인
    for (const opt of ['인생작', '괜찮았어', '별로였어', '안 맞았어']) {
      rec('4', `  overlay 옵션 "${opt}": ${await srcHas(b, opt)}`);
    }
    // "괜찮았어 리포트" 선택
    const goodEl = await b.$$('~괜찮았어 리포트');
    let goodTapped = false;
    for (const g of goodEl) if (await g.isDisplayed()) { await g.click(); goodTapped = true; break; }
    rec('4', `"괜찮았어" 선택 탭: ${goodTapped}`);
    await b.pause(800);
    await cap(b, '02-grid-after-report');
    // badge — ReactionLabel "재밌었어" (good→good 라벨 web REACTIONS) 노출 확인
    const badgeGood = await srcHas(b, '재밌었어');
    rec('4', `reaction 후 badge "재밌었어" 노출: ${badgeGood}`);
    // "시청 리포트 취소" 토글 확인
    src = await b.getPageSource();
    const cancelM = src.match(/name="([^"]*?시청 리포트 취소)"/g) || [];
    rec('4', `"시청 리포트 취소" 토글 ${cancelM.length}개`);
    let aL = await checkAlive(b);
    rec('4', `grid reaction 후 alive: ${aL.alive} (${aL.reason})`);
    // 해제 토글
    if (cancelM.length > 0) {
      const cl = cancelM[0].slice(6, -1);
      const ce = await b.$(`~${cl}`);
      await ce.click();
      await b.pause(700);
      const badgeGone = !(await srcHas(b, '재밌었어'));
      rec('4', `해제 토글 후 badge 사라짐: ${badgeGone}`);
      await cap(b, '03-grid-reaction-removed');
    }
  }

  // ── 3. 그룹핑 — 시트 진입 후 switch 탭 ──
  await tapVisible(b, '필터 열기');
  await b.pause(900);
  await cap(b, '04-filter-sheet');
  // 시트 스크롤 — 그룹화 토글이 하단이라 보일 때까지
  src = await b.getPageSource();
  const groupRects = await rects(b, 'OTT별로 그룹화');
  rec('3', `시트 내 "OTT별로 그룹화" element rect: ${JSON.stringify(groupRects)}`);
  // 스크롤 후 탭 시도
  try {
    await b.execute('mobile: scroll', { direction: 'down' });
    await b.pause(500);
  } catch { /* ignore */ }
  let groupTapped = false;
  const gEls = await b.$$('~OTT별로 그룹화');
  for (const g of gEls) {
    if (await g.isDisplayed()) { await g.click(); groupTapped = true; break; }
  }
  if (!groupTapped && groupRects.length > 0) {
    // 좌표 탭 fallback
    const gr = groupRects[0];
    await b.execute('mobile: tap', { x: gr.x + gr.w / 2, y: gr.y + gr.h / 2 });
    groupTapped = true;
    rec('3', '좌표탭 fallback 사용');
  }
  rec('3', `그룹화 토글 탭: ${groupTapped}`);
  await b.pause(600);
  await cap(b, '05-sheet-group-on');
  await tapVisible(b, '필터 닫기');
  await b.pause(1000);
  await cap(b, '06-grouped-list');
  let aL = await checkAlive(b);
  rec('3', `그룹핑 적용 후 alive: ${aL.alive} (${aL.reason})`);
  const groupChip = await srcHas(b, 'OTT별 그룹화');
  rec('3', `활성 chip "OTT별 그룹화": ${groupChip}`);
  // SectionList OTT 섹션 헤더 확인 (wavve/Netflix 등)
  src = await b.getPageSource();
  const sectionHeaders = ['wavve', 'Netflix', 'Disney Plus', 'Google Play Movies', '기타'].filter((s) => src.includes(s));
  rec('3', `그룹핑 섹션 헤더 노출: ${JSON.stringify(sectionHeaders)}`);

  // ── 3+4 조합 — 그룹핑 상태에서 reaction ──
  src = await b.getPageSource();
  rm = src.match(/name="([^"]*?시청 리포트 작성)"/g) || [];
  rec('3+4', `그룹핑 모드 reaction 버튼 ${rm.length}개`);
  if (rm.length > 0) {
    const lbl = rm[0].slice(6, -1);
    const el = await b.$(`~${lbl}`);
    await el.click();
    await b.pause(700);
    rec('3+4', `그룹핑+overlay "본 적 있나요?": ${await srcHas(b, '본 적 있나요?')}`);
    await cap(b, '07-group-reaction-overlay');
    let lovedTapped = false;
    const lvEls = await b.$$('~인생작 리포트');
    for (const lv of lvEls) if (await lv.isDisplayed()) { await lv.click(); lovedTapped = true; break; }
    rec('3+4', `그룹핑 모드 "인생작" 선택: ${lovedTapped}`);
    await b.pause(900);
    aL = await checkAlive(b);
    rec('3+4', `그룹핑+reaction 후 alive: ${aL.alive} (${aL.reason})`);
    await cap(b, '08-group-after-reaction');
    // 동일 작품이 여러 OTT 그룹에 중복 노출 → reaction badge 가 모든 인스턴스에 반영되는지
    const lovedBadges = (src.match(/인생작/g) || []).length;
    const src2 = await b.getPageSource();
    rec('3+4', `그룹핑 reaction 후 "인생작" 텍스트 출현 수(중복 노출 확인): ${(src2.match(/인생작/g) || []).length}`);
  }

  // 그룹핑 해제 + reaction 정리
  await tapVisible(b, 'OTT별 그룹화 해제');
  await b.pause(800);
  // list 모드 reaction 확인
  await tapVisible(b, '리스트 보기');
  await b.pause(800);
  src = await b.getPageSource();
  rm = src.match(/name="([^"]*?시청 리포트 작성)"/g) || [];
  rec('4-list', `list 모드 reaction 버튼 ${rm.length}개`);
  if (rm.length > 0) {
    const lbl = rm[0].slice(6, -1);
    const el = await b.$(`~${lbl}`);
    await el.click();
    await b.pause(700);
    rec('4-list', `list reaction overlay "본 적 있나요?": ${await srcHas(b, '본 적 있나요?')}`);
    await cap(b, '09-list-overlay');
    // compact 모드 — sub 문구 없어야 함
    rec('4-list', `compact overlay sub문구 "알려주시면" 부재: ${!(await srcHas(b, '알려주시면 더 좋은'))}`);
    // 빈 곳 탭 = 취소
    const ovRects = await rects(b, '빈 곳을 누르면');
    if (ovRects.length > 0) {
      const o = ovRects[0];
      await b.execute('mobile: tap', { x: o.x + 8, y: o.y + 8 });
      await b.pause(600);
      rec('4-list', `overlay 빈곳 탭 → 취소: ${!(await srcHas(b, '본 적 있나요?'))}`);
    }
  }
  await tapVisible(b, '그리드 보기');
  await b.pause(600);

  aL = await checkAlive(b);
  rec('END', `최종 alive: ${aL.alive} (${aL.reason})`);
} catch (e) {
  rec('ERROR', e.message);
  try { await cap(b, 'ZZ-error'); } catch { /* */ }
} finally {
  await writeFile(`${OUT}/batchA2-log.txt`, log.join('\n'), 'utf8');
  await b.deleteSession();
}
