/**
 * Seeded Mix MVP loop 타깃 검증 (uncommitted QA 스크립트, 2026-07-08)
 * 항목: MIX 버튼 top 카드 단일 렌더 / MIX 탭 → DetailSheet 미오픈 + 라벨 /
 *       조사 처리 (받침有/無) / 후보 ≤12 + seed 제외 / 후보 섹션 표시 /
 *       후보 탭 → DetailSheet / 닫기 복귀 / 제스처 회귀 (좌/우/아래/탭) /
 *       MIX 열고닫기 ×10 크래시 0
 */
import { remote } from 'webdriverio';
import { writeFile, mkdir } from 'node:fs/promises';

const UDID = '4EDF2CB4-81BE-41B2-9D5C-AEB1DDE14E29';
const OUT = process.env.OUT_DIR || '/tmp/neko-loop-verify-mix';

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

async function src(b) {
  return b.getPageSource();
}

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

/** page source 에서 현재 top 카드 제목 추출 (swipe-card-title-<id> testID). */
function topTitleOf(s) {
  // XCUITest 는 testID 를 name 으로 노출. title 요소는 label 에 실제 제목.
  const m = [...s.matchAll(/name="swipe-card-title-(\d+)"[^>]*label="([^"]*)"/g)];
  return m.length ? m[m.length - 1][2] : null; // top 카드는 XML 마지막 (renderOrder reverse)
}

function hasBatchim(word) {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return null; // 비한글
  const jong = (code - 0xac00) % 28;
  if (jong === 0) return false;
  if (jong === 8) return 'rieul';
  return true;
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
  // Discover 첫 카드 대기
  const t = await waitFor(b, async () => {
    const s = await src(b);
    return /name="swipe-card-title-\d+"/.test(s) || s.includes('name="mix-button"');
  }, 40000);
  if (t < 0) {
    mark('discover_loaded', 'FAIL', '첫 카드 40s 미도착');
    throw new Error('discover not loaded');
  }
  mark('discover_loaded', 'PASS', `${t}ms`);
  await cap(b, '01-discover');

  // ── 1. MIX 버튼 단일 렌더 (top 카드만)
  {
    const s = await src(b);
    const count = (s.match(/name="mix-button"/g) || []).length;
    const cardCount = (s.match(/name="swipe-card-\d+"/g) || []).length;
    mark(
      'mix_button_single',
      count === 1 ? 'PASS' : 'FAIL',
      `mix-button ${count}개 / 카드 ${cardCount}장`,
    );
  }

  // ── 2~5. MIX 탭 → 라벨/조사/후보/DetailSheet 미오픈. 받침有/無 seed 각 1회 시도.
  const particleChecks = []; // {title, caption, ok}
  let didCandidateChecks = false;
  let mixItemDetailChecked = false;

  for (let attempt = 0; attempt < 10; attempt++) {
    const s0 = await src(b);
    const title = topTitleOf(s0);
    if (!title) break;
    const batchim = hasBatchim(title);
    const needThis =
      particleChecks.length === 0 ||
      !didCandidateChecks ||
      (batchim !== null &&
        !particleChecks.some((p) => p.batchim === batchim));

    if (needThis) {
      const btn = await b.$('~mix-button');
      await btn.waitForExist({ timeout: 5000 });
      await btn.click();
      // 패널 라벨 대기
      const gotPanel = await waitFor(b, async () => (await src(b)).includes(`${title} 믹스`), 8000);
      const s1 = await src(b);
      const detailOpened = s1.includes('공유하기');
      if (particleChecks.length === 0) {
        mark(
          'mix_tap_no_detail',
          gotPanel >= 0 && !detailOpened ? 'PASS' : 'FAIL',
          `label=${gotPanel >= 0} detail공유하기=${detailOpened}`,
        );
        await cap(b, '02-mix-panel');
      }
      // 조사 캡션 확인
      const expected = (() => {
        const bt = hasBatchim(title);
        const particle = bt === true ? '으로' : '로';
        return `${title}${particle} 시작한 믹스`;
      })();
      const captionOk = s1.includes(expected);
      particleChecks.push({ title, batchim, expected, captionOk });

      // 후보 로딩 대기 (최대 15s) → 후보 규칙 확인 (1회만)
      if (!didCandidateChecks) {
        await waitFor(
          b,
          async () => {
            const s = await src(b);
            return s.includes('믹스 후보') || s.includes('이어볼 후보를 찾지 못했어요');
          },
          15000,
        );
        const s2 = await src(b);
        const items = [...s2.matchAll(/label="([^"]*) 믹스 후보"/g)].map((m) => m[1]);
        if (items.length > 0) {
          const withinCap = items.length <= 12;
          const seedExcluded = !items.includes(title);
          mark(
            'mix_candidates',
            withinCap && seedExcluded ? 'PASS' : 'FAIL',
            `${items.length}개, seed제외=${seedExcluded}, 예시: ${items.slice(0, 3).join(', ')}`,
          );
          mark('mix_section_visible', 'PASS', `후보 그리드 ${items.length}개 표시`);
          await cap(b, '03-mix-candidates');
          didCandidateChecks = true;

          // 후보 탭 → DetailSheet (mix_item_clicked 경로)
          if (!mixItemDetailChecked) {
            const first = await b.$(`~${items[0]} 믹스 후보`);
            await first.click();
            const gotDetail = await waitFor(b, async () => (await src(b)).includes('공유하기'), 15000);
            mark(
              'mix_item_to_detail',
              gotDetail >= 0 ? 'PASS' : 'FAIL',
              gotDetail >= 0 ? `${items[0]} 상세 진입 ${gotDetail}ms` : '상세 미진입',
            );
            await cap(b, '04-mix-item-detail');
            mixItemDetailChecked = true;
            // DetailSheet 닫기 (닫기 버튼 라벨 시도 → 실패 시 swipe down)
            const closeDetail = await b.$('~닫기');
            try {
              await closeDetail.waitForExist({ timeout: 3000 });
              // '닫기' 는 MixPanel 에도 있음 — DetailSheet 쪽이 위 Modal 이라 우선 hit.
              await closeDetail.click();
            } catch {
              await drag(b, 200, 200, 200, 700, 250);
            }
            await waitFor(b, async () => !(await src(b)).includes('공유하기'), 8000);
          }
        } else {
          mark('mix_candidates', 'WARN', '후보 0 — 빈 상태 안내 노출 (실데이터 재시도 필요)');
        }
      }

      // 믹스 닫기 → 원래 카드 복귀 확인
      const close = await b.$('~mix-close');
      await close.waitForExist({ timeout: 5000 });
      await close.click();
      const back = await waitFor(b, async () => {
        const s = await src(b);
        return topTitleOf(s) === title && s.includes('name="mix-button"');
      }, 8000);
      if (particleChecks.length === 1) {
        mark('mix_close_restores', back >= 0 ? 'PASS' : 'FAIL', `top=${title} 복귀`);
      }
    }

    // 받침有/無 모두 확보 + 후보 체크 완료면 종료
    const haveTrue = particleChecks.some((p) => p.batchim === true && p.captionOk);
    const haveFalseOrRieul = particleChecks.some(
      (p) => (p.batchim === false || p.batchim === 'rieul') && p.captionOk,
    );
    if (haveTrue && haveFalseOrRieul && didCandidateChecks && mixItemDetailChecked) break;

    // 다음 카드로 (좌 스와이프)
    await drag(b, 300, 400, 30, 400, 150);
    await b.pause(900);
  }

  {
    const detail = particleChecks
      .map((p) => `${p.title}(${p.batchim === true ? '받침' : p.batchim === 'rieul' ? 'ㄹ' : p.batchim === false ? '무받침' : '비한글'}):${p.captionOk ? 'OK' : 'X'}`)
      .join(' / ');
    const haveTrue = particleChecks.some((p) => p.batchim === true && p.captionOk);
    const haveNo = particleChecks.some((p) => (p.batchim === false || p.batchim === 'rieul') && p.captionOk);
    const allOk = particleChecks.every((p) => p.captionOk);
    mark(
      'mix_particle',
      allOk && haveTrue && haveNo ? 'PASS' : allOk ? 'WARN' : 'FAIL',
      detail || '시도 0',
    );
  }

  // ── 6. 제스처 회귀: 좌 / 우(prev) / 카드 탭 → Detail / 아래(save)
  {
    let s = await src(b);
    const before = topTitleOf(s);
    await drag(b, 300, 400, 30, 400, 150); // 좌
    await b.pause(900);
    s = await src(b);
    const afterLeft = topTitleOf(s);
    const leftOk = afterLeft && afterLeft !== before;

    await drag(b, 60, 400, 360, 400, 200); // 우 (prev)
    await b.pause(900);
    s = await src(b);
    const afterRight = topTitleOf(s);
    const rightOk = afterRight === before;

    // 카드 탭 (중앙 — MIX 버튼 외 영역) → DetailSheet
    await b.performActions([
      {
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: 200, y: 420 },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 60 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
    await b.releaseActions();
    const detailViaTap = await waitFor(b, async () => (await src(b)).includes('공유하기'), 8000);
    if (detailViaTap >= 0) {
      const closeDetail = await b.$('~닫기');
      try {
        await closeDetail.waitForExist({ timeout: 3000 });
        await closeDetail.click();
      } catch {
        await drag(b, 200, 200, 200, 700, 250);
      }
      await waitFor(b, async () => !(await src(b)).includes('공유하기'), 8000);
    }

    // 아래 스와이프 (save)
    s = await src(b);
    const saveTarget = topTitleOf(s);
    await drag(b, 200, 300, 200, 620, 200);
    await b.pause(1200);
    s = await src(b);
    const afterDown = topTitleOf(s);
    const downOk = afterDown && afterDown !== saveTarget; // save 후 advance

    mark(
      'gesture_regression',
      leftOk && rightOk && detailViaTap >= 0 && downOk ? 'PASS' : 'FAIL',
      `좌=${leftOk ? 'OK' : 'X'} 우=${rightOk ? 'OK' : 'X'} 탭Detail=${detailViaTap >= 0 ? 'OK' : 'X'} 아래save=${downOk ? 'OK' : 'X'}`,
    );
    await cap(b, '05-after-gestures');
  }

  // ── 7. MIX 열고닫기 ×10 크래시 0
  {
    let crashed = false;
    for (let i = 0; i < 10; i++) {
      const btn = await b.$('~mix-button');
      try {
        await btn.waitForExist({ timeout: 5000 });
        await btn.click();
        await b.pause(400);
        const close = await b.$('~mix-close');
        await close.waitForExist({ timeout: 5000 });
        await close.click();
        await b.pause(300);
      } catch (e) {
        crashed = true;
        mark('mix_stress_x10', 'FAIL', `iteration ${i}: ${e.message?.slice(0, 80)}`);
        break;
      }
    }
    if (!crashed) {
      const s = await src(b);
      const alive = s.includes('name="mix-button"') || /swipe-card-title/.test(s);
      mark('mix_stress_x10', alive ? 'PASS' : 'FAIL', alive ? '10회 왕복, 앱 정상' : '앱 상태 이상');
    }
    await cap(b, '06-after-stress');
  }

  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
} finally {
  await b.deleteSession();
}
