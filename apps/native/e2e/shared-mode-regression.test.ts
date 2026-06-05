/**
 * Neko native E2E 회귀 — 2026-06-04 shared mode (Universal Link 진입 화면)
 *
 * 컨텍스트: frontend-builder fix 4건 (`_workspace/03_diagnosis-2026-06-04.md`).
 *   P0-#1  shared 진입 시 닫기 / "추천 더 보기" 핸들러 먹통 → DetailSheet 의 Modal 우회
 *   P1-#3  shared OTT 영역 디자인 정합 → flex-wrap 칩(pill) 분기
 *
 * 검증 범위 (S1~S4):
 *   S1 — UL 진입 후 좌상단 X "닫기" 탭 시 Discover 진입
 *   S2 — UL 진입 후 sticky bottom "추천 더 보기" 탭 시 Discover 진입
 *   S3 — shared 화면 OTT 영역에 칩(pill) 렌더 + 1개 이상 노출
 *   S4 — Discover 카드 탭 → DetailSheet (mode='detail') Modal 정상 mount + dismiss
 *
 * 회귀 진입점:
 *   - `669dc97` (DetailSheet 풀스크린 흡수) → Modal × 라우트 컨플릭트 회귀 진입
 *   - `9994c80` 추정 = 본 fix (Modal 우회 + OTT 칩 분기) 시점
 *
 * UL 진입 방식:
 *   - 실기기 자격증명 의존 — 시뮬에서는 `xcrun simctl openurl booted` 가 universalLinks
 *     를 system browser 로 라우팅 (App 자격증명이 없으면 Safari fallback). 시뮬 회귀에서는
 *     `appium:mobile:deepLink` (custom scheme) 또는 `expo-router` 의 `router.push('/share/...')`
 *     를 활용. 본 spec 은 native router.push 를 evaluate 호출 대신, Profile 의 신뢰
 *     가능한 진입 경로 (Saved 카드 detail → share 액션) 가 미확정이라 **JS-side deeplink
 *     시뮬레이션** (`xcrun simctl openurl booted neq://share/<id>?type=movie`) 로 시도.
 *     실패 시 SKIP + `testflight-qa` 위임.
 *
 * 실행 전제:
 *   - simulator-devclient (`com.neq.app` dev client) — wdio.conf.ts default
 *   - 사용자가 onboarding 완료 상태 (forceResetApp 후 ensureOnboardedOrSkip 통과)
 *   - Metro + Appium 가동 중
 */

import { spawn } from 'node:child_process';
import {
  capture,
  ensureOnboardedOrSkip,
  forceResetApp,
  pageSourceContains,
  tapByLabel,
  tapByPredicate,
  waitForLabel,
} from './_helpers';

// well-known tmdbId (기생충, 영화) — TasteSurveyFavoritesPicker MINI_FALLBACK 첫 항목.
// `/api/tmdb/hydrate?id=496243&type=movie` 가 안정적으로 성공한다고 가정.
const SHARE_TMDB_ID = 496243;
const SHARE_TYPE = 'movie';

/**
 * 시뮬에서 deeplink 강제 진입.
 *
 * scheme = `neko` (app.json line 10). 브랜드명은 neq 로 변경됐으나 expo scheme 마이그레이션은
 * 출시 전 별도 작업 — 현재는 `neko://share/<id>?type=movie` 형식이 정본.
 */
async function openShareDeepLink(id: number, type: 'movie' | 'series'): Promise<void> {
  const url = `neko://share/${id}?type=${type}`;
  await new Promise<void>((resolve) => {
    const proc = spawn('xcrun', ['simctl', 'openurl', 'booted', url], {
      stdio: 'ignore',
    });
    proc.on('exit', () => resolve());
    proc.on('error', () => resolve());
  });
  // 진입 + ApertureBreathLoader → hydrate (mirror cache) 대기. 일반적으로 1~3s.
  await browser.pause(2500);
}

/**
 * share 화면 mount 여부 — DetailSheet mode='share' 의 안정적 labels.
 * "추천 더 보기" + "저장하기" 둘 다 노출돼야 share sticky CTA mount 확정.
 * detail mode 는 "공유하기" + "Synopsis" 등 별도 라벨이라 confusion 없음.
 */
async function isOnShareScreen(): Promise<boolean> {
  const src = await browser.getPageSource();
  return src.includes('추천 더 보기') && src.includes('저장하기');
}

/** Discover 도달 여부. */
async function isOnDiscover(): Promise<boolean> {
  return (await pageSourceContains('발견')) || (await pageSourceContains('discover'));
}

describe('Neko — shared mode regression (2026-06-04)', () => {
  // testflight 환경에서는 `xcrun simctl openurl` 이 실기기에 라우팅되지 않으므로
  // S1~S3 자동 회귀 SKIP. 실 UL 수동 검증 (메모/메시지앱 https://neq.me/share/<id>
  // 길게 누르기) 은 `testflight-qa` 의 Phase C 영역.
  let shareEntryOk = process.env.E2E_TARGET !== 'testflight';

  before(async () => {
    await forceResetApp();
    await browser.pause(1500);
    const onboarded = await ensureOnboardedOrSkip();
    if (!onboarded) {
      throw new Error('shared-mode before: 온보딩 통과 실패 (Discover 도달 X)');
    }
    await browser.pause(800);
  });

  beforeEach(async () => {
    // 매 it 시작 시 deeplink 로 share 화면 재진입 (S1/S2/S3 공통).
    // S4 만 별도 — 이 케이스는 deeplink 무관.
    // shareEntryOk = false 면 deeplink fallback 으로 skip 처리.
  });

  it('S1 — UL 진입 후 좌상단 X "닫기" 탭 시 Discover 복귀', async () => {
    if (!shareEntryOk) {
      // testflight 환경: deeplink 시뮬 (xcrun simctl openurl) 이 실기기에 라우팅되지 않음.
      // 실 UL 검증은 testflight-qa Phase C 의 수동 영역 (메모/메시지앱 길게 누르기).
      console.warn(
        'S1: testflight 환경 — neq:// deeplink 시뮬은 실기기에 라우팅 불가. SKIP. ' +
          '실 UL 검증은 https://neq.me/share/<id> 메모/메시지앱 길게 누르기 (수동).',
      );
      return;
    }

    await openShareDeepLink(SHARE_TMDB_ID, SHARE_TYPE);
    await capture('shared-S1-01-after-deeplink');

    const onShare = await isOnShareScreen();
    if (!onShare) {
      shareEntryOk = false;
      throw new Error(
        'S1: share 화면 mount 실패 — deeplink (neq://share/...) 가 시뮬에 라우팅되지 않음. ' +
          'expo-router 의 scheme 분기 또는 시뮬 자격증명 부재로 인한 cold start fallback 의심. ' +
          'simulator-devclient 트랙 한정 — testflight 분기는 본 spec 시작부에서 자동 SKIP.',
      );
    }

    // 좌상단 X "닫기" 탭 (mode='share' 에서 sticky CTA 의 amber "저장하기" 와 ghost "추천 더 보기" 중
    // X 만 dismiss). DetailSheet line 654 의 `accessibilityLabel="닫기"`.
    // 시뮬에서 ~닫기 매칭 1개여야 하나, SearchSheet 잔재가 있으면 마지막 매칭 선호.
    const closeEls = await $$('~닫기');
    if (closeEls.length === 0) {
      throw new Error('S1: 좌상단 X "닫기" element 미발견');
    }
    await closeEls[closeEls.length - 1].click();
    await browser.pause(1800);
    await capture('shared-S1-02-after-close');

    const reachedDiscover = await isOnDiscover();
    if (!reachedDiscover) {
      throw new Error('S1: "닫기" 탭 후 Discover 복귀 실패 — 라우트 전환 미실행');
    }
  });

  it('S2 — UL 진입 후 sticky "추천 더 보기" 탭 시 Discover 복귀', async () => {
    if (!shareEntryOk) {
      // S1 에서 deeplink 진입 실패가 확정된 경우 본 케이스도 동일 BLOCKED.
      console.warn('S2: S1 에서 deeplink 실패 → 본 케이스 SKIP');
      return;
    }
    await openShareDeepLink(SHARE_TMDB_ID, SHARE_TYPE);
    await capture('shared-S2-01-after-deeplink');

    if (!(await isOnShareScreen())) {
      throw new Error('S2: share 화면 mount 실패');
    }

    // mode='share' 의 sticky CTA: amber "저장하기" + ghost "추천 더 보기" (DetailSheet line 707).
    if (!(await tapByLabel('추천 더 보기', { timeout: 3500 }))) {
      throw new Error('S2: "추천 더 보기" 탭 실패 — sticky CTA 미노출 또는 label drift');
    }
    await browser.pause(1800);
    await capture('shared-S2-02-after-more');

    if (!(await isOnDiscover())) {
      throw new Error('S2: "추천 더 보기" 탭 후 Discover 복귀 실패');
    }
  });

  it('S3 — share 화면 OTT 영역에 칩(pill) 렌더 (1개 이상)', async () => {
    if (!shareEntryOk) {
      console.warn('S3: S1 에서 deeplink 실패 → 본 케이스 SKIP');
      return;
    }
    await openShareDeepLink(SHARE_TMDB_ID, SHARE_TYPE);
    await capture('shared-S3-01-after-deeplink');

    if (!(await isOnShareScreen())) {
      throw new Error('S3: share 화면 mount 실패');
    }

    // Where to watch 섹션이 보이도록 살짝 스크롤 (hero + reason + synopsis 다음 위치).
    // 시뮬 ScrollView 안에서 mobile: scroll 가 hit 실패 잦음 → swipe 1회.
    const { width, height } = await browser.getWindowSize();
    await browser.performActions([
      {
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: width * 0.5, y: height * 0.75 },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 80 },
          { type: 'pointerMove', duration: 300, x: width * 0.5, y: height * 0.25 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
    await browser.releaseActions();
    await browser.pause(700);
    await capture('shared-S3-02-after-scroll');

    // OTT 칩 - accessibilityLabel="<provider>에서 보기" (DetailSheet line 553). 단, provider 0개일
    // 가능성도 있음 — 그 때는 "현재 한국 OTT에서 제공 정보를 찾지 못했어요" 라벨 노출 → SKIP 처리.
    const noProviders = await pageSourceContains(
      '현재 한국 OTT에서 제공 정보를 찾지 못했어요',
    );
    if (noProviders) {
      console.warn(
        'S3: tmdbId=' + SHARE_TMDB_ID +
          ' 의 providers 가 0 — TMDB mirror 미캐치 / KR 미공급. 본 케이스 SKIP.',
      );
      return;
    }

    // 칩 patten 확인 — predicate "에서 보기" 라벨 1개 이상.
    const found = await tapByPredicate(
      `label CONTAINS "에서 보기" OR name CONTAINS "에서 보기"`,
      { timeout: 3500 },
    );
    if (!found) {
      throw new Error('S3: OTT 칩 (예: "Netflix에서 보기") 1개 이상 미노출');
    }

    // 칩 클릭이 Linking.openURL 을 호출하므로 외부 앱/Safari 진입 가능. 회귀 정리 위해 시뮬 백그라운드
    // → app 으로 복귀 (forceResetApp 대신 activateApp).
    try {
      await browser.execute('mobile: activateApp', { bundleId: 'com.neq.app' });
    } catch {
      /* 시뮬에서는 deeplink 실패 시 noop. 다음 it 의 forceResetApp 가 정상화. */
    }
    await browser.pause(800);
    await capture('shared-S3-03-after-chip-tap');
  });

  it('S4 — Discover 카드 탭 → DetailSheet (detail mode) Modal mount + dismiss', async () => {
    // S1~S3 가 외부 앱 진입 등으로 상태 leak 가능 → reset + 재 onboarding 통과.
    await forceResetApp();
    await browser.pause(1500);
    const onboarded = await ensureOnboardedOrSkip();
    if (!onboarded) {
      throw new Error('S4 before: 온보딩 통과 실패');
    }

    // 추천 카드 로딩 대기 — Discover 진입 직후는 "추천을 준비하고 있어요" 로딩 상태 일반적.
    // 카드 mount 의 안정적 시그널: "유형/국가/년도/별점" 필터 chip 노출 + ApertureBreathLoader
    // 의 "추천을 준비하고 있어요" 부재.
    let cardReady = false;
    for (let i = 0; i < 15; i++) {
      await browser.pause(1000);
      const src = await browser.getPageSource();
      const stillLoading = src.includes('추천을 준비하고 있어요');
      if (!stillLoading) {
        cardReady = true;
        break;
      }
    }
    await capture('shared-S4-01-discover');

    if (!cardReady) {
      throw new Error('S4: Discover 추천 카드 로딩 timeout — 15s 내 ApertureBreathLoader 미해제');
    }

    if (!(await isOnDiscover())) {
      throw new Error('S4: Discover 도달 실패');
    }

    // Discover 카드 탭 — DetailSheet (mode='detail') Modal 진입.
    // 화면 50% (수직 중앙) 은 카드 중앙이지만 메타/저장/스와이프 영역과 겹칠 수 있음 →
    // 화면 35% (포스터 상반부) 가 안전한 hit zone. 카드 좌우 패딩 고려해 50% x.
    const { width, height } = await browser.getWindowSize();
    await browser.execute('mobile: tap', { x: width * 0.5, y: height * 0.35 });
    // Modal slide-up 애니메이션 450ms + hydrate skeleton.
    await browser.pause(1500);
    await capture('shared-S4-02-after-card-tap');

    // Modal 진입 신호 — "Synopsis · 시놉시스" / "Where to watch · 시청 가능" / "Cast · 캐스트"
    // 중 최소 1개 노출. mode='share' 의 "추천 더 보기" 가 없음 + mode='detail' 의 "공유하기" 가 있음.
    const onDetailModal =
      (await pageSourceContains('Synopsis')) ||
      (await pageSourceContains('Where to watch')) ||
      (await pageSourceContains('Cast')) ||
      (await pageSourceContains('공유하기'));
    if (!onDetailModal) {
      throw new Error('S4: DetailSheet Modal mount 실패 — section 라벨 미노출');
    }

    // dismiss — 좌상단 X "닫기" 마지막 매칭 (SearchSheet 잔재가 없으면 1개).
    const closeEls = await $$('~닫기');
    if (closeEls.length === 0) {
      throw new Error('S4: detail mode 의 "닫기" element 미발견');
    }
    await closeEls[closeEls.length - 1].click();
    // Modal slide-down 350ms.
    await browser.pause(1500);
    await capture('shared-S4-03-after-dismiss');

    if (!(await isOnDiscover())) {
      throw new Error('S4: Modal dismiss 후 Discover 복귀 실패');
    }
  });
});
