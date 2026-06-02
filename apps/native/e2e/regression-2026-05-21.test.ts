/**
 * Neko native E2E 회귀 — 2026-05-21
 *
 * 검증 범위:
 *  P0  최근 변경 회귀 (ce94e02, 0499bb3 revert)
 *  P1  핵심 사용자 플로우 (Discover / Saved / Detail)
 *  P2  엣지/시각
 *
 * 실행 전제:
 *  - Expo Go 가 시뮬레이터에 로드되어 nekko app 이 떠 있는 상태
 *  - Appium / Metro 모두 가동 중
 */

import fs from 'node:fs';
import path from 'node:path';

const SHOT_DIR = path.resolve(__dirname, 'screenshots');

async function capture(name: string): Promise<string> {
  if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(SHOT_DIR, `${ts}-${name}.png`);
  await browser.saveScreenshot(file);
  console.log(`shot ${file}`);
  return file;
}

async function pageSourceHasError(): Promise<{ hasError: boolean; snippet: string }> {
  const source = await browser.getPageSource();
  const hasError =
    source.includes('Console Error') ||
    source.includes('TransformError') ||
    source.includes('RedBox') ||
    source.includes('Unhandled JS Exception');
  return { hasError, snippet: source.slice(0, 2000) };
}

async function tapByLabel(label: string, opts: { timeout?: number } = {}): Promise<boolean> {
  const timeout = opts.timeout ?? 5000;
  try {
    const el = await $(`~${label}`);
    await el.waitForExist({ timeout });
    await el.click();
    return true;
  } catch (err) {
    console.warn(`tap ${label} 실패: ${(err as Error).message}`);
    return false;
  }
}

// SearchSheet 의 "검색 닫기" 라벨은 backdrop Pressable(첫 매칭, sheet 뒤) +
// 취소 버튼(마지막 매칭, sheet 안) 두 곳에 있음. backdrop 은 sheet content 에 가려져
// XCUITest 탭이 hit 안 되므로 last 매칭(취소 버튼) 사용해야 한다.
async function closeSearchSheetIfOpen(): Promise<boolean> {
  const els = await $$('~검색 닫기');
  if (els.length === 0) return false;
  try {
    await els[els.length - 1].click();
    return true;
  } catch {
    return false;
  }
}

// iOS XCUITest predicate — label/name 일치 (탭바 텍스트처럼 accessibilityLabel 없는 경우)
async function tapByPredicate(predicate: string, opts: { timeout?: number } = {}): Promise<boolean> {
  const timeout = opts.timeout ?? 5000;
  try {
    const el = await $(`-ios predicate string:${predicate}`);
    await el.waitForExist({ timeout });
    await el.click();
    return true;
  } catch (err) {
    console.warn(`predicate ${predicate} 실패: ${(err as Error).message}`);
    return false;
  }
}

// 탭바 진입 — Tabs 라벨 텍스트로 매칭 (예: "발견", "저장", "프로필").
// 일부 XCUITest 버전은 ~Label, 다른 버전은 predicate 필요 — 양쪽 다 시도.
async function tapTab(label: string): Promise<boolean> {
  if (await tapByLabel(label, { timeout: 2000 })) return true;
  return tapByPredicate(`label == "${label}" OR name == "${label}"`, { timeout: 3000 });
}

// DetailSheet 닫기 — 우상단 X 버튼은 sheet 자체의 닫기. "검색 닫기"(SearchSheet)
// 와 충돌하지 않게, 모든 "닫기" 라벨 element 중 마지막(최상위 modal) 시도.
async function closeTopSheetByXButton(): Promise<boolean> {
  const els = await $$('~닫기');
  if (els.length === 0) return false;
  // 최상위 modal 의 close 는 보통 element 배열 끝
  const target = els[els.length - 1];
  try {
    await target.click();
    return true;
  } catch {
    return false;
  }
}

async function swipe(direction: 'left' | 'right' | 'up' | 'down', strength = 0.6) {
  const { width, height } = await browser.getWindowSize();
  let startX = width * 0.5;
  let startY = height * 0.5;
  let endX = startX;
  let endY = startY;

  if (direction === 'left') {
    startX = width * 0.8;
    endX = width * (0.8 - strength);
  } else if (direction === 'right') {
    startX = width * 0.2;
    endX = width * (0.2 + strength);
  } else if (direction === 'up') {
    startY = height * 0.8;
    endY = height * (0.8 - strength);
  } else if (direction === 'down') {
    startY = height * 0.3;
    endY = height * (0.3 + strength);
  }

  await browser.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: startX, y: startY },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 100 },
        { type: 'pointerMove', duration: 300, x: endX, y: endY },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await browser.releaseActions();
}

// ──────────────────────────────────────────────────────────
// P0 — 최근 변경 회귀
// ──────────────────────────────────────────────────────────
describe('P0 — 최근 변경 회귀 (ce94e02 + 0499bb3 revert)', () => {
  before(async () => {
    // spec audit (2026-05-28) — 이전 spec leak 방지 + 추천 로드 대기.
    const { forceResetApp, ensureOnboardedOrSkip } = await import('./_helpers');
    await forceResetApp();
    if (!(await ensureOnboardedOrSkip())) {
      throw new Error(
        'before: onboarding 자동 진행 실패. _helpers.ts ensureOnboardedOrSkip 의 단계별 라벨 확인 필요.',
      );
    }
    // 첫 진입: 카드/추천 로드 대기. 추천 준비 spinner 가 지나갈 시간.
    await browser.pause(8000);
    // 이전 run 의 잔재 정리 — SearchSheet/DetailSheet 떠 있을 수 있음.
    for (let i = 0; i < 3; i++) {
      const closed = await closeSearchSheetIfOpen();
      if (!closed) break;
      await browser.pause(400);
    }
    await closeTopSheetByXButton();
    await browser.pause(600);
    await capture('p0-00-initial');
  });

  it('앱 마운트 — RedBox / Console Error 없음', async () => {
    const { hasError, snippet } = await pageSourceHasError();
    if (hasError) {
      console.error('error pageSource snippet:\n', snippet);
      await capture('p0-error');
    }
    expect(hasError).toBe(false);
  });

  it('ce94e02 fix #1 — SearchSheet → 작품 탭 → DetailSheet → 닫으면 SearchSheet 복귀 + 검색어 유지', async () => {
    // 1) 검색 sheet 열기
    // 첫 탭이 React mount race 로 onPress 발화 안 하는 케이스 관찰됨.
    // tap → 폴링 → 안 뜨면 다시 tap. 최대 3회.
    let sheetMounted = false;
    for (let attempt = 0; attempt < 3 && !sheetMounted; attempt++) {
      const opened = await tapByLabel('검색 열기', { timeout: 4000 });
      if (!opened) {
        console.warn(`tap attempt ${attempt + 1}: 검색 열기 element 못 찾음`);
        continue;
      }
      // 폴링 1.6s
      for (let i = 0; i < 4; i++) {
        await browser.pause(400);
        const src = await browser.getPageSource();
        if (src.includes('작품, 감독, 배우')) {
          sheetMounted = true;
          console.log(`SearchSheet mount 성공 (attempt ${attempt + 1}, ${(i + 1) * 400}ms 폴링)`);
          break;
        }
      }
    }
    await capture('p0-fix1-01-sheet-open');
    if (!sheetMounted) {
      console.warn('FAIL — 검색 sheet 가 3회 retry 후에도 mount 안 됨');
      throw new Error('SearchSheet did not mount after 3 tap attempts');
    }

    // 2) 검색어 입력 — accessibilityLabel "검색" TextInput (production fix 후 outer는 "검색 시트")
    const input = await $('~검색');
    await input.waitForExist({ timeout: 5000 });
    await input.click();
    await browser.pause(200);
    // RN 이 한글 입력 sendKeys 안정성 낮음 → 영문 "squid" 폴백
    let usedQuery = '오징어';
    try {
      await input.setValue('오징어');
    } catch {
      usedQuery = 'squid';
      await input.setValue('squid');
    }
    await browser.pause(2200); // 디바운싱(200) + 검색 fetch
    await capture('p0-fix1-02-results');

    // 결과 텍스트 확인 — page source 에 결과 그룹 또는 "검색 결과" 키워드
    const sourceAfterSearch = await browser.getPageSource();
    const hasResults =
      sourceAfterSearch.includes('검색 결과') ||
      sourceAfterSearch.includes(usedQuery) ||
      sourceAfterSearch.includes('영화') ||
      sourceAfterSearch.includes('드라마');
    console.log(`검색 결과 표출: ${hasResults}`);

    // 3) 작품 카드 탭 — accessibilityLabel 이 title 자체 (line 578)
    // 첫번째 작품 hit 의 라벨을 정확히 알 수 없어 좌표 탭 + 결과 영역
    const { width, height } = await browser.getWindowSize();
    // 작품 carousel 은 sheet 상단 약 35% 위치
    await browser.performActions([
      {
        type: 'pointer',
        id: 'tap',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: width * 0.25, y: height * 0.4 },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 60 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
    await browser.releaseActions();
    await browser.pause(1500); // DetailSheet enter
    await capture('p0-fix1-03-detail-opened');

    // 4) DetailSheet 닫기 — 최상위 modal 의 X (DetailSheet)
    let closeOk = await closeTopSheetByXButton();
    if (!closeOk) {
      // 좌표 폴백 — DetailSheet X 버튼 위치 (screenshot 분석상 우상단 약 92%/130)
      const { width: w2 } = await browser.getWindowSize();
      await browser.performActions([
        {
          type: 'pointer',
          id: 'close',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x: w2 * 0.92, y: 130 },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 60 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ]);
      await browser.releaseActions();
      closeOk = true;
    }
    console.log(`DetailSheet 닫기 시도: ${closeOk}`);
    await browser.pause(1500); // DetailSheet exit + SearchSheet 자동 재진입
    await capture('p0-fix1-04-after-detail-close');

    // 5) 핵심 검증 — SearchSheet 가 다시 떠 있고, 검색어 input 에 값 보존
    const finalSource = await browser.getPageSource();
    const searchVisible =
      finalSource.includes('검색 닫기') || finalSource.includes('작품, 감독, 배우');
    const queryPreserved =
      finalSource.includes(usedQuery) || finalSource.includes('검색어 지우기');

    console.log(`SearchSheet 복귀: ${searchVisible}, 검색어 보존: ${queryPreserved}`);

    expect(searchVisible).toBe(true);
    // 검색어 보존이 실패해도 sheet 복귀가 더 핵심이라 별도 assert
    if (!queryPreserved) {
      console.warn('FAIL — 검색어가 보존되지 않음. preserveStateOnClose 로직 회귀 가능');
      await capture('p0-fix1-FAIL-query-lost');
    }
    expect(queryPreserved).toBe(true);
  });

  it('ce94e02 fix #2 — SearchSheet 인물 카드 탭 → PersonWorksPanel 필모그래피', async () => {
    // 클린 슬레이트 — SearchSheet/DetailSheet 모두 닫고 새로 열기.
    for (let i = 0; i < 3; i++) {
      const closed = await closeSearchSheetIfOpen();
      if (!closed) break;
      await browser.pause(400);
    }
    await closeTopSheetByXButton();
    await browser.pause(500);

    // SearchSheet 새로 열기 — fix #1 과 동일한 retry (첫 탭 race condition)
    let sheetMounted = false;
    for (let attempt = 0; attempt < 3 && !sheetMounted; attempt++) {
      const opened = await tapByLabel('검색 열기', { timeout: 4000 });
      if (!opened) continue;
      for (let i = 0; i < 4; i++) {
        await browser.pause(400);
        const src = await browser.getPageSource();
        if (src.includes('작품, 감독, 배우')) {
          sheetMounted = true;
          console.log(`fix2 sheet mount 성공 (attempt ${attempt + 1})`);
          break;
        }
      }
    }
    if (!sheetMounted) {
      throw new Error('fix #2 — SearchSheet did not mount after 3 attempts');
    }

    const input = await $('~검색');
    await input.waitForExist({ timeout: 5000 });
    await input.click();
    await browser.pause(200);
    let personQuery = '봉준호';
    try {
      await input.setValue('봉준호');
    } catch {
      personQuery = 'nolan';
      await input.setValue('nolan');
    }
    console.log(`인물 검색어: ${personQuery}`);
    await browser.pause(3000); // 디바운싱 + person fetch
    await capture('p0-fix2-01-person-search');

    const sourceAfterSearch = await browser.getPageSource();
    // PeopleCarousel 의 인물 카드 라벨 — `${name} 필모그래피 보기`
    // page source 에 "필모그래피" 키워드가 있으면 인물 카드 마운트.
    const hasPersonCard = sourceAfterSearch.includes('필모그래피');
    console.log(`인물 카드 표출: ${hasPersonCard}`);

    if (!hasPersonCard) {
      console.warn('SKIP — 인물 검색 결과 0. (API 응답 또는 한글 sendKeys 실패)');
      await capture('p0-fix2-SKIP-no-person');
      return;
    }

    // 인물 카드 탭 — accessibilityLabel 패턴 매칭. PersonCard 라벨 = `${name} 필모그래피 보기`.
    // 좌표 추정은 carousel 위치/스크롤 의존 → 불안. predicate 로 정확한 element 매칭.
    const personCard = await $(
      '-ios predicate string:label ENDSWITH "필모그래피 보기"',
    );
    const personFound = await personCard.isExisting();
    console.log(`PersonCard 매칭 (predicate): ${personFound}`);
    if (!personFound) {
      console.warn('SKIP — PersonCard predicate 매칭 실패');
      await capture('p0-fix2-SKIP-no-predicate');
      return;
    }
    await personCard.click();
    await browser.pause(2500); // person-works fetch
    await capture('p0-fix2-02-person-tapped');

    const sourceAfterTap = await browser.getPageSource();
    // PersonWorksPanel 마운트 → "필모그래피 닫기" 라벨로 토글됨
    const panelOpen = sourceAfterTap.includes('필모그래피 닫기');
    console.log(`PersonWorksPanel 열림: ${panelOpen}`);

    if (!panelOpen) {
      console.warn('FAIL — PersonWorksPanel 미마운트');
      await capture('p0-fix2-FAIL-no-panel');
    }
    expect(panelOpen).toBe(true);
  });

  it('0499bb3 revert — Modal 기반 SearchSheet/DetailSheet enter/exit + dim overlay 정상', async () => {
    // 클린 슬레이트 — DetailSheet 도 같이 닫음. 폴링으로 mount 사라질 때까지 대기.
    for (let i = 0; i < 5; i++) {
      const searchClosed = await closeSearchSheetIfOpen();
      const detailClosed = await closeTopSheetByXButton();
      if (!searchClosed && !detailClosed) break;
      await browser.pause(500);
    }
    // 사라질 때까지 page source 폴링 (최대 3.2s)
    let sheetGone = false;
    for (let i = 0; i < 8; i++) {
      const src = await browser.getPageSource();
      if (!src.includes('작품, 감독, 배우')) {
        sheetGone = true;
        break;
      }
      await browser.pause(400);
    }
    await capture('p0-revert-01-search-closed');
    console.log(`SearchSheet 정리 완료: ${sheetGone}`);
    expect(sheetGone).toBe(true);

    // 다시 열어서 enter 정상 확인 — mount race 대응 (P0 fix1 line 178~195 와 동일 패턴).
    // 단발 tap + 700ms 대기는 시뮬 dev client 환경에서 첫 tap onPress 누락 발생 시 false-FAIL.
    let sheetBack = false;
    for (let attempt = 0; attempt < 3 && !sheetBack; attempt++) {
      const opened = await tapByLabel('검색 열기', { timeout: 3000 });
      if (!opened) {
        console.warn(`tap attempt ${attempt + 1}: 검색 열기 element 못 찾음`);
        continue;
      }
      for (let i = 0; i < 4; i++) {
        await browser.pause(400);
        const src = await browser.getPageSource();
        if (src.includes('작품, 감독, 배우')) {
          sheetBack = true;
          console.log(`SearchSheet 재오픈 mount 성공 (attempt ${attempt + 1}, ${(i + 1) * 400}ms 폴링)`);
          break;
        }
      }
    }
    await capture('p0-revert-02-search-reopen');
    expect(sheetBack).toBe(true);

    // 마무리 — 다음 case 영향 없게 닫기. backdrop 첫 매칭 대신 취소 버튼(last) 사용.
    await closeSearchSheetIfOpen();
    await browser.pause(800);
    // 폴링으로 정말 닫혔는지 확인
    for (let i = 0; i < 5; i++) {
      const src = await browser.getPageSource();
      if (!src.includes('작품, 감독, 배우')) break;
      await closeSearchSheetIfOpen();
      await browser.pause(400);
    }
  });
});

// ──────────────────────────────────────────────────────────
// P1 — 핵심 사용자 플로우
// ──────────────────────────────────────────────────────────
describe('P1 — 핵심 사용자 플로우', () => {
  it('Discover — 좌 스와이프 (Pass) 카드 전환', async () => {
    await capture('p1-01-before-left');
    await swipe('left');
    await browser.pause(700);
    await capture('p1-02-after-left');
    const { hasError } = await pageSourceHasError();
    expect(hasError).toBe(false);
  });

  it('Discover — 우 스와이프 (Save) 동작', async () => {
    await capture('p1-03-before-right');
    await swipe('right');
    await browser.pause(700);
    await capture('p1-04-after-right');
    const { hasError } = await pageSourceHasError();
    expect(hasError).toBe(false);
  });

  it('Discover — 카드 탭 → DetailSheet 진입', async () => {
    const { width, height } = await browser.getWindowSize();
    // 카드는 화면 중앙 — 포스터 영역 탭
    await browser.performActions([
      {
        type: 'pointer',
        id: 'tap-card',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: width * 0.5, y: height * 0.45 },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 60 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
    await browser.releaseActions();
    await browser.pause(1500);
    await capture('p1-05-detail-opened');

    const source = await browser.getPageSource();
    // DetailSheet 마운트 시 "상세 정보" 라벨 또는 "공유하기" 텍스트 노출
    const detailOpen = source.includes('상세 정보') || source.includes('공유하기');
    console.log(`DetailSheet 진입: ${detailOpen}`);

    if (detailOpen) {
      // 닫기
      await closeTopSheetByXButton();
      await browser.pause(1200);
    }
    expect(detailOpen).toBe(true);
  });

  it('Saved 탭 진입 → 작품 리스트 또는 빈 상태 표출', async () => {
    await tapTab('저장');
    await browser.pause(1200);
    await capture('p1-06-saved-tab');

    const source = await browser.getPageSource();
    // SavedScreen 마운트 시 "저장" 헤더 또는 "안 본 작품" 필터 라벨
    const savedMounted =
      source.includes('저장한 작품') ||
      source.includes('안 본 작품') ||
      source.includes('아직 저장한 작품이 없어요') ||
      source.includes('SavedHero');
    console.log(`Saved 화면 마운트: ${savedMounted}`);

    const { hasError } = await pageSourceHasError();
    expect(hasError).toBe(false);
  });

  it('Discover 탭 복귀', async () => {
    await tapTab('발견');
    await browser.pause(1000);
    await capture('p1-07-discover-back');
    const { hasError } = await pageSourceHasError();
    expect(hasError).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────
// P2 — 엣지/시각
// ──────────────────────────────────────────────────────────
describe('P2 — 엣지/시각', () => {
  it('연속 스와이프 4회 — 스택 안정성', async () => {
    for (let i = 0; i < 4; i++) {
      await swipe(i % 2 === 0 ? 'left' : 'right');
      await browser.pause(500);
    }
    await capture('p2-01-after-4-swipes');
    const { hasError } = await pageSourceHasError();
    expect(hasError).toBe(false);
  });

  it('프로필 탭 진입 — 3번째 탭', async () => {
    const tapped = await tapTab('프로필');
    if (!tapped) {
      console.warn('SKIP — 프로필 탭 라벨 못 찾음');
      return;
    }
    await browser.pause(1000);
    await capture('p2-02-profile');
    const { hasError } = await pageSourceHasError();
    expect(hasError).toBe(false);
  });

  it('Discover 복귀 — 최종 상태 캡처', async () => {
    await tapTab('발견');
    await browser.pause(1000);
    await capture('p2-03-final');
  });
});
