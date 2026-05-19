/**
 * 배치 A 검증 e2e — Saved 화면 기능 4건 (정렬 / OTT 필터·그룹핑 / reaction / 빈 상태)
 * + FAIL-B 회귀 재확인 (preview 모드 SavedHero hero rect).
 *
 * 코드 수정 없이 실측만. 캡처 + page source rect 덤프.
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
  const path = `${OUT}/batchA-${name}.png`;
  await writeFile(path, png, 'base64');
  console.log('  cap:', path);
}

/** rect 정보 추출 — name 부분일치하는 모든 element 의 type/name/x/y/w/h */
async function rects(b, contains) {
  const src = await b.getPageSource();
  const re = new RegExp(
    `<(XCUIElementType\\w+)[^>]*?name="([^"]*${contains}[^"]*)"[^>]*?x="(\\d+)"[^>]*?y="(\\d+)"[^>]*?width="(\\d+)"[^>]*?height="(\\d+)"`,
    'g',
  );
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({ type: m[1], name: m[2], x: +m[3], y: +m[4], w: +m[5], h: +m[6] });
  }
  return out;
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

async function srcHas(b, needle) {
  const src = await b.getPageSource();
  return src.includes(needle);
}

const b = await remote({
  hostname: '127.0.0.1',
  port: 4723,
  path: '/',
  capabilities: CAPS,
  logLevel: 'error',
});

const log = [];
function rec(tag, msg) {
  const line = `[${tag}] ${msg}`;
  log.push(line);
  console.log(line);
}

try {
  await mkdir(OUT, { recursive: true });

  // ── 0. Saved 탭 진입 ──
  rec('0', 'Saved 탭 진입 시도');
  let toSaved = await tapVisible(b, 'saved, tab, 2 of 5');
  if (!toSaved) toSaved = await tapVisible(b, 'saved, tab');
  if (!toSaved) {
    // 탭 인덱스 변동 대비 — 2번째 탭 버튼 좌표탭
    const tabs = await b.$$('//XCUIElementTypeButton[contains(@name,"tab")]');
    rec('0', `tab 버튼 ${tabs.length}개 발견`);
    if (tabs.length >= 2) await tabs[1].click();
  }
  await b.pause(1800);
  await cap(b, '00-saved-landing');
  let alive = await checkAlive(b);
  rec('0', `Saved 진입 후 alive: ${alive.alive} (${alive.reason})`);

  // 탭바 개수 회귀 확인
  const tabBtns = await b.$$('//XCUIElementTypeButton[contains(@name,"tab")]');
  rec('0', `탭 버튼 개수: ${tabBtns.length} (3 기대)`);

  // ── 1. 빈 상태 카피 확인 (작품 0개 시) ──
  const emptyShelf = await srcHas(b, '책장이 비어 있어요');
  const emptyHint = await srcHas(b, '하나씩 담아 보세요');
  rec('1', `빈 상태 "책장이 비어 있어요": ${emptyShelf} / "하나씩 담아 보세요": ${emptyHint}`);

  // 저장 작품 유무 판정 — viewMode segmented 존재 여부
  const hasItems = await srcHas(b, '뷰 모드 전환');
  rec('1', `저장 작품 존재(뷰 모드 전환 노출): ${hasItems}`);

  if (!hasItems) {
    rec('SKIP', 'Saved 비어 있음 — 정렬/필터/그룹핑/reaction 실측 불가. 빈 상태만 검증.');
    // 그래도 빈 상태에서 헤더 양끝 정렬·search 버튼 확인
    const searchEmpty = await b.$$('~검색 열기');
    rec('1', `빈 상태에서 search 버튼: ${searchEmpty.length}개`);
  } else {
    // ── viewFilter rect (FAIL-B 비교 baseline: grid 모드) ──
    const vfGrid = await rects(b, '저장 필터');
    rec('FAIL-B', `grid 모드 viewFilter("저장 필터") rect: ${JSON.stringify(vfGrid)}`);

    // ── 2. 정렬 — 필터 시트 진입 ──
    const filterOpened = await tapVisible(b, '필터 열기');
    rec('2', `"필터 열기" 트리거 탭: ${filterOpened}`);
    await b.pause(900);
    await cap(b, '01-filter-sheet');
    if (filterOpened) {
      const hasSort = await srcHas(b, '저장순');
      const hasTitle = await srcHas(b, '가나다순');
      const hasRating = await srcHas(b, '평점순');
      const hasGroup = await srcHas(b, 'OTT별로 그룹화');
      rec('2', `정렬 옵션 저장순:${hasSort} 가나다순:${hasTitle} 평점순:${hasRating}`);
      rec('3', `그룹화 토글 노출: ${hasGroup}`);

      // 평점순 선택
      const sortRating = await tapVisible(b, '평점순 선택');
      rec('2', `평점순 선택 탭: ${sortRating}`);
      await b.pause(700);
      await cap(b, '02-sort-rating');

      // 필터 시트 닫기
      await tapVisible(b, '필터 닫기');
      await b.pause(700);
      const titlesAfterSort = (await rects(b, '상세보기')).slice(0, 4).map((r) => r.name);
      rec('2', `평점순 적용 후 상위 카드: ${JSON.stringify(titlesAfterSort)}`);
      await cap(b, '03-after-sort-close');
      alive = await checkAlive(b);
      rec('2', `정렬 후 alive: ${alive.alive} (${alive.reason})`);

      // ── 3. OTT 그룹핑 ──
      await tapVisible(b, '필터 열기');
      await b.pause(800);
      const groupTapped = await tapVisible(b, 'OTT별로 그룹화');
      rec('3', `그룹화 토글 탭: ${groupTapped}`);
      await b.pause(600);
      await tapVisible(b, '필터 닫기');
      await b.pause(900);
      await cap(b, '04-grouped');
      alive = await checkAlive(b);
      rec('3', `그룹핑 적용 후 alive: ${alive.alive} (${alive.reason})`);
      const groupChip = await srcHas(b, 'OTT별 그룹화');
      rec('3', `활성 chip "OTT별 그룹화" 노출: ${groupChip}`);

      // 그룹핑 ON 상태에서 reaction 시도 (조합 시나리오)
      const reportBtns = await b.$$('~봤어요?');
      rec('3+4', `그룹핑 모드 "봤어요?" 버튼 개수: ${reportBtns.length}`);
      let reactionDoneInGroup = false;
      if (reportBtns.length > 0) {
        for (const rb of reportBtns) {
          if (await rb.isDisplayed()) {
            await rb.click();
            await b.pause(600);
            await cap(b, '05-grouped-reaction-overlay');
            const overlayOn = await srcHas(b, '본 적 있나요?');
            rec('3+4', `그룹핑+reaction overlay "본 적 있나요?": ${overlayOn}`);
            const lovedTap = await tapVisible(b, '인생작 리포트');
            rec('3+4', `그룹핑 모드에서 "인생작" 선택: ${lovedTap}`);
            await b.pause(800);
            alive = await checkAlive(b);
            rec('3+4', `그룹핑+reaction 후 alive: ${alive.alive} (${alive.reason})`);
            reactionDoneInGroup = lovedTap;
            await cap(b, '06-grouped-after-reaction');
            break;
          }
        }
      }

      // 그룹화 해제 (chip 탭)
      await tapVisible(b, 'OTT별 그룹화 해제');
      await b.pause(800);
      rec('3', '그룹화 chip 탭으로 해제 완료');
    }

    // ── 4. reaction 입력 (grid 모드) ──
    await cap(b, '07-grid-before-reaction');
    const gridReportBtns = await b.$$('~봤어요?');
    rec('4', `grid 모드 "봤어요?" 버튼 개수: ${gridReportBtns.length}`);
    if (gridReportBtns.length > 0) {
      for (const rb of gridReportBtns) {
        if (await rb.isDisplayed()) {
          await rb.click();
          await b.pause(600);
          const overlayOn = await srcHas(b, '본 적 있나요?');
          rec('4', `grid reaction overlay "본 적 있나요?": ${overlayOn}`);
          await cap(b, '08-grid-reaction-overlay');
          const goodTap = await tapVisible(b, '괜찮았어 리포트');
          rec('4', `"괜찮았어" 선택: ${goodTap}`);
          await b.pause(800);
          await cap(b, '09-grid-after-reaction');
          // badge 확인 — 시청 토글 버튼 노출
          const watchedToggle = await b.$$('~시청');
          const visibleWatched = [];
          for (const w of watchedToggle) if (await w.isDisplayed()) visibleWatched.push(true);
          rec('4', `reaction 후 "✓ 시청" 토글 노출 수: ${visibleWatched.length}`);
          alive = await checkAlive(b);
          rec('4', `grid reaction 후 alive: ${alive.alive} (${alive.reason})`);
          break;
        }
      }
    }

    // ── 4b. OTT 필터 단독 ──
    await tapVisible(b, '필터 열기');
    await b.pause(800);
    await cap(b, '10-filter-sheet-ott');
    // 첫 OTT row 탭 — name 패턴 "(N편) 선택"
    const src = await b.getPageSource();
    const ottM = src.match(/name="([^"]*?\(\d+편\) 선택)"/);
    if (ottM) {
      const ottName = ottM[1];
      rec('4b', `OTT row 탭 시도: "${ottName}"`);
      const ottEl = await b.$(`~${ottName}`);
      await ottEl.click();
      await b.pause(600);
      await tapVisible(b, '필터 닫기');
      await b.pause(900);
      await cap(b, '11-ott-filtered');
      alive = await checkAlive(b);
      rec('4b', `OTT 필터 적용 후 alive: ${alive.alive} (${alive.reason})`);
      // 활성 chip ✕ 노출 확인
      const chipX = await srcHas(b, '필터 제거');
      rec('4b', `활성 OTT chip "필터 제거" 노출: ${chipX}`);
      // 초기화 — 필터 시트 재진입 후 초기화
      await tapVisible(b, '필터 열기');
      await b.pause(800);
      const resetTapped = await tapVisible(b, '필터 초기화');
      rec('4b', `"초기화" 버튼 탭: ${resetTapped}`);
      await b.pause(500);
      await tapVisible(b, '필터 닫기');
      await b.pause(800);
    } else {
      rec('4b', 'OTT row name 패턴 미발견 — OTT 필터 단독 SKIP');
    }

    // ── 6. FAIL-B 회귀 — preview 모드 진입 후 hero rect 실측 ──
    rec('FAIL-B', 'preview 모드 진입 시도');
    const previewTapped = await tapVisible(b, '미리보기');
    rec('FAIL-B', `"미리보기" 토글 탭: ${previewTapped}`);
    await b.pause(1200);
    await cap(b, '12-preview-mode');
    alive = await checkAlive(b);
    rec('FAIL-B', `preview 모드 alive: ${alive.alive} (${alive.reason})`);

    const vfPreview = await rects(b, '저장 필터');
    rec('FAIL-B', `preview 모드 viewFilter("저장 필터") rect: ${JSON.stringify(vfPreview)}`);
    const heroBtn = await rects(b, '상세보기');
    rec('FAIL-B', `preview hero/카드 "상세보기" rect: ${JSON.stringify(heroBtn.slice(0, 3))}`);
    const carousel = await rects(b, '작품 목록');
    rec('FAIL-B', `preview carousel("작품 목록") rect: ${JSON.stringify(carousel)}`);

    // 토글 회귀 — grid/list/preview 순환 ×4
    rec('7', 'grid/list/preview 순환 ×4 redbox 검증');
    let redboxHits = 0;
    for (let i = 0; i < 4; i++) {
      for (const mode of ['그리드 보기', '리스트 보기', '미리보기']) {
        await tapVisible(b, mode);
        await b.pause(350);
        const a = await checkAlive(b);
        if (!a.alive) {
          redboxHits++;
          rec('7', `  순환 ${i}-${mode}: FAIL — ${a.reason}`);
        }
      }
    }
    rec('7', `토글 순환 12회 — redbox/crash ${redboxHits}건`);
    await cap(b, '13-after-cycle');

    // grid 로 복귀
    await tapVisible(b, '그리드 보기');
    await b.pause(600);
  }

  // ── 최종 alive ──
  alive = await checkAlive(b);
  rec('END', `최종 alive: ${alive.alive} (${alive.reason})`);
} catch (e) {
  rec('ERROR', `예외: ${e.message}`);
  try {
    await cap(b, 'ZZ-error');
  } catch {
    /* ignore */
  }
} finally {
  await writeFile(`${OUT}/batchA-log.txt`, log.join('\n'), 'utf8');
  console.log('\n=== 로그 저장:', `${OUT}/batchA-log.txt`);
  await b.deleteSession();
}
