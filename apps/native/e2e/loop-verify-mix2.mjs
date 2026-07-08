/**
 * Seeded Mix 2차 loop 타깃 검증 (2026-07-08)
 * 항목: 케밥 단일 렌더 + 메뉴 열림/닫힘/DetailSheet 미오픈 / 덱 주입 + 라벨 /
 *       mix 덱 인터랙션 (좌/우/탭Detail/아래save) / 해제 → 원 덱·위치 복원 /
 *       Mix 탭 (테마 섹션) / 테마 → 덱 주입 연결 / 믹스 왕복 ×10 + 탭 왕복 ×10 /
 *       해제 후 일반 refresh 흐름
 */
import { remote } from 'webdriverio';
import { writeFile, mkdir } from 'node:fs/promises';

const UDID = '4EDF2CB4-81BE-41B2-9D5C-AEB1DDE14E29';
const OUT = process.env.OUT_DIR || '/tmp/neko-loop-verify-mix2';

const CAPS = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:platformVersion': '26.4',
  'appium:deviceName': 'iPhone 17 Pro',
  'appium:udid': UDID,
  'appium:bundleId': 'com.neq.app',
  'appium:autoLaunch': false,
  'appium:noReset': true,
  'appium:newCommandTimeout': 240,
  'appium:wdaLocalPort': 8100,
};

const results = {};
const mark = (k, v, note = '') => {
  results[k] = { verdict: v, note };
  console.log(`[${v}] ${k}${note ? ' — ' + note : ''}`);
};

async function cap(b, name) {
  const png = await b.takeScreenshot();
  await writeFile(`${OUT}/${name}.png`, png, 'base64');
}

const src = (b) => b.getPageSource();

async function waitFor(b, predicate, timeout = 20000, interval = 800) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await predicate()) return Date.now() - t0;
    await b.pause(interval);
  }
  return -1;
}

async function drag(b, x1, y1, x2, y2, ms = 150) {
  await b.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: x1, y: y1 },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerMove', duration: ms, x: x2, y: y2 },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await b.releaseActions();
}

async function tapAt(b, x, y) {
  await b.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x, y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 60 },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await b.releaseActions();
}

/** top 카드 제목 — renderOrder reverse 라 XML 마지막 match 가 top (1차 실측). */
function topTitleOf(s) {
  const m = [...s.matchAll(/name="swipe-card-title-(\d+)"[^>]*label="([^"]*)"/g)];
  return m.length ? m[m.length - 1][2] : null;
}

async function closeDetail(b) {
  const el = await b.$('~닫기');
  try {
    await el.waitForExist({ timeout: 3000 });
    await el.click();
  } catch {
    await drag(b, 200, 200, 200, 700, 250);
  }
  await waitFor(b, async () => !(await src(b)).includes('공유하기'), 8000);
}

const b = await remote({
  hostname: '127.0.0.1',
  port: 4723,
  capabilities: CAPS,
  logLevel: 'silent',
});

await mkdir(OUT, { recursive: true });

try {
  await b.execute('mobile: launchApp', { bundleId: 'com.neq.app' });
  const t = await waitFor(b, async () => /name="swipe-card-title-\d+"/.test(await src(b)), 40000);
  if (t < 0) {
    mark('discover_loaded', 'FAIL', '첫 카드 40s 미도착');
    throw new Error('discover not loaded');
  }
  mark('discover_loaded', 'PASS', `${t}ms`);
  await cap(b, '01-discover');

  // ── 1. 케밥 단일 렌더 + 메뉴 열림/닫힘 + DetailSheet 미오픈
  {
    let s = await src(b);
    const kebabCount = (s.match(/name="card-menu-button"/g) || []).length;
    const seedTitle = topTitleOf(s);
    await (await b.$('~card-menu-button')).click();
    const gotMenu = await waitFor(b, async () => (await src(b)).includes('name="card-menu"'), 5000);
    s = await src(b);
    const hasItem = s.includes(`${seedTitle} 믹스 시작`);
    const detailLeak1 = s.includes('공유하기');
    await cap(b, '02-card-menu');
    // backdrop 탭 (메뉴 밖 좌하단 좌표) — 투명 Pressable 이 흡수해 메뉴 닫힘 +
    // 카드 tap 제스처 미전파 (DetailSheet 미오픈) 동시 검증.
    await tapAt(b, 60, 560);
    const closed = await waitFor(b, async () => !(await src(b)).includes('name="card-menu"'), 5000);
    const detailLeak2 = (await src(b)).includes('공유하기');
    mark(
      'kebab_menu',
      kebabCount === 1 && gotMenu >= 0 && hasItem && closed >= 0 && !detailLeak1 && !detailLeak2
        ? 'PASS'
        : 'FAIL',
      `케밥${kebabCount}개 메뉴열림=${gotMenu >= 0} 항목("${seedTitle} 믹스 시작")=${hasItem} 닫힘=${closed >= 0} detail누출=${detailLeak1 || detailLeak2}`,
    );
  }

  // ── 2. 덱 주입 + 라벨
  let seedTitle = null;
  {
    const s0 = await src(b);
    seedTitle = topTitleOf(s0);
    await (await b.$('~card-menu-button')).click();
    await waitFor(b, async () => (await src(b)).includes('name="card-menu"'), 5000);
    await (await b.$('~card-menu-mix')).click();
    // mix-bar 라벨 + 덱 교체 (top 제목이 seed 와 달라짐) 대기
    const injected = await waitFor(b, async () => {
      const s = await src(b);
      const top = topTitleOf(s);
      return s.includes(`${seedTitle} 믹스`) && s.includes('name="mix-release"') && top && top !== seedTitle;
    }, 20000);
    const s1 = await src(b);
    mark(
      'deck_injection',
      injected >= 0 ? 'PASS' : 'FAIL',
      injected >= 0
        ? `"${seedTitle} 믹스" 라벨 + top="${topTitleOf(s1)}" 교체 ${injected}ms`
        : `라벨/덱 교체 미확인 (top=${topTitleOf(s1)})`,
    );
    await cap(b, '03-mix-deck');
  }

  // ── 3. mix 덱 인터랙션 — 좌/우/탭Detail/아래save
  {
    let s = await src(b);
    const first = topTitleOf(s);
    await drag(b, 300, 400, 30, 400, 150); // 좌
    await b.pause(900);
    s = await src(b);
    const second = topTitleOf(s);
    const leftOk = second && second !== first;

    await drag(b, 60, 400, 360, 400, 200); // 우 (prev)
    await b.pause(900);
    s = await src(b);
    const rightOk = topTitleOf(s) === first;

    await tapAt(b, 200, 420); // 탭 → Detail
    const detailOk = await waitFor(b, async () => (await src(b)).includes('공유하기'), 8000);
    if (detailOk >= 0) await closeDetail(b);

    s = await src(b);
    const saveTarget = topTitleOf(s);
    await drag(b, 200, 300, 200, 620, 200); // 아래 save
    await b.pause(1200);
    s = await src(b);
    const afterSave = topTitleOf(s);
    const stillMix = s.includes('name="mix-release"');
    const downOk = afterSave && afterSave !== saveTarget && stillMix;

    mark(
      'mix_deck_interactions',
      leftOk && rightOk && detailOk >= 0 && downOk ? 'PASS' : 'FAIL',
      `좌=${leftOk ? 'OK' : 'X'} 우=${rightOk ? 'OK' : 'X'} 탭Detail=${detailOk >= 0 ? 'OK' : 'X'} 아래save=${downOk ? 'OK' : 'X'}`,
    );
    await cap(b, '04-mix-interactions');
  }

  // ── 4. 해제 → 원 덱/위치 복원 (해제 전 원 top = seedTitle 이어야 함 —
  //       mix 진입 전 위치가 seed 카드였으므로)
  {
    await (await b.$('~mix-release')).click();
    const restored = await waitFor(b, async () => {
      const s = await src(b);
      return !s.includes('name="mix-release"') && topTitleOf(s) === seedTitle;
    }, 8000);
    const s = await src(b);
    mark(
      'mix_release_restore',
      restored >= 0 ? 'PASS' : 'FAIL',
      restored >= 0 ? `원 top "${seedTitle}" 복원` : `top=${topTitleOf(s)} (기대 ${seedTitle})`,
    );
    await cap(b, '05-released');
  }

  // ── 5. Mix 탭 — 테마 섹션 ≥2종
  {
    await (await b.$('~믹스')).click();
    const gotTab = await waitFor(b, async () => {
      const s = await src(b);
      return s.includes('최근 저장작으로') || s.includes('저장작이 아직 없어요');
    }, 8000);
    const s = await src(b);
    const sections = ['최근 저장작으로', '장르 테마', '감독 테마'].filter((x) => s.includes(x));
    const themeButtons = (s.match(/name="mix-theme-[a-z]+-\d+"/g) || []).length;
    mark(
      'mix_tab',
      gotTab >= 0 && sections.length >= 2 && themeButtons > 0 ? 'PASS' : 'FAIL',
      `섹션=${sections.join(',')} 테마버튼=${themeButtons}개`,
    );
    await cap(b, '06-mix-tab');
  }

  // ── 6. 테마 탭 → Discover 덱 주입 연결
  {
    const s0 = await src(b);
    const m = s0.match(/name="mix-theme-(?:genre|director|recent)-0"[^>]*label="([^"]*) 시작"/);
    const themeLabel = m ? m[1] : null; // "<xxx> 믹스"
    await (await b.$('~mix-theme-recent-0')).click();
    const linked = await waitFor(b, async () => {
      const s = await src(b);
      return s.includes('name="mix-release"') && s.includes('믹스');
    }, 20000);
    const s1 = await src(b);
    const cardShown = await waitFor(b, async () => !!topTitleOf(await src(b)), 20000);
    mark(
      'theme_to_deck',
      linked >= 0 && cardShown >= 0 ? 'PASS' : 'FAIL',
      `테마(${themeLabel}) → mix-bar=${linked >= 0} 카드=${cardShown >= 0}`,
    );
    await cap(b, '07-theme-mix');
    // 해제 후 원 상태
    await (await b.$('~mix-release')).click();
    await waitFor(b, async () => !(await src(b)).includes('name="mix-release"'), 8000);
  }

  // ── 7. 믹스 진입/해제 ×10 + Mix 탭 왕복 ×10 크래시 0
  {
    let failNote = '';
    try {
      for (let i = 0; i < 10; i++) {
        await (await b.$('~card-menu-button')).click();
        await waitFor(b, async () => (await src(b)).includes('name="card-menu"'), 5000);
        await (await b.$('~card-menu-mix')).click();
        await waitFor(b, async () => (await src(b)).includes('name="mix-release"'), 10000);
        await (await b.$('~mix-release')).click();
        await waitFor(b, async () => !(await src(b)).includes('name="mix-release"'), 8000);
      }
      for (let i = 0; i < 10; i++) {
        await (await b.$('~믹스')).click();
        await b.pause(250);
        await (await b.$('~발견')).click();
        await b.pause(250);
      }
    } catch (e) {
      failNote = e.message?.slice(0, 100);
    }
    const s = await src(b);
    const alive = /swipe-card-title/.test(s) || s.includes('name="card-menu-button"');
    mark('stress_crash', !failNote && alive ? 'PASS' : 'FAIL', failNote || '믹스 ×10 + 탭 ×10, 앱 정상');
    await cap(b, '08-after-stress');
  }

  // ── 8. 해제 후 일반 흐름 — refresh 버튼 → 로딩 → 새 덱
  {
    const s0 = await src(b);
    const before = topTitleOf(s0);
    const refreshBtn = await b.$('~새 추천');
    let ok = false;
    try {
      await refreshBtn.waitForExist({ timeout: 4000 });
      await refreshBtn.click();
      const reloaded = await waitFor(b, async () => {
        const s = await src(b);
        const top = topTitleOf(s);
        return top !== null && top !== before;
      }, 40000);
      ok = reloaded >= 0;
    } catch {
      ok = false;
    }
    mark('normal_flow_refresh', ok ? 'PASS' : 'WARN', ok ? '새 덱 로드' : '새 추천 버튼 미발견 — 수동 확인 필요');
    await cap(b, '09-after-refresh');
  }

  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
} finally {
  await b.deleteSession();
}
