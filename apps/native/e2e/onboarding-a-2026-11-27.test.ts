/**
 * 온보딩 A안 E2E (1.1.0, 2026-11-27) — hybrid-onboarding-2026-05-27 대체.
 *
 * 강제 온보딩 진입(Welcome → Hello → 장르 → 취향 → OTT) 을 없앴으므로 옛 H1 걷기는 도달할 수 없다.
 * 대신 "데이터 초기화(= 온보딩 안 한 상태) 후에도 화면 없이 바로 발견 카드" 를 지킨다.
 *
 *   A1  모든 데이터 초기화 → 온보딩 화면 없음 · 발견 탭 선택 · 카드 보임 · 탭바 4종
 *   A2  위로 넘기기 동작 (첫 진입 카드가 실제 피드)
 *
 * 신규 설치 분기(variant A·first_open) 는 설치 단위 키라 초기화로 재현되지 않는다 → 단위 테스트
 * lib/__tests__/onboarding.test.ts (신규/기존/저장만 있는 1.0.x/재실행) 가 정본.
 */
import {
  capture,
  tapByLabel,
  tapByPredicate,
  pageSourceContains,
  selectedTab,
  waitVisibleCardId,
  swipeFeed,
  dismissSavePromptIfAny,
  waitForLabel,
} from './_helpers';

async function resetIfOnboarded(): Promise<void> {
  // profile 로 진입해 데이터 초기화 — onboarded 상태에서만 의미 있음.
  // 이미 onboarding 화면이면 skip.
  if (await pageSourceContains('어떻게 부를까요')) {
    console.log('onboarding 진입 상태 — reset skip');
    return;
  }
  if (!(await tapByLabel('프로필', { timeout: 3000 }))) {
    // 진입 못 하는 상태일 수 있음 — 그대로 진행
    return;
  }
  await browser.pause(800);
  // 스크롤 다운하여 "모든 데이터 초기화" 노출
  for (let i = 0; i < 4; i++) {
    try {
      await browser.execute('mobile: swipe', { direction: 'up' });
      await browser.pause(400);
    } catch {
      break;
    }
  }
  if (!(await tapByLabel('모든 데이터 초기화', { timeout: 3000 }))) {
    console.warn('"모든 데이터 초기화" 미노출 — reset skip');
    return;
  }
  await browser.pause(1000);
  // 확인 alert — "초기화" 또는 "삭제" 또는 "확인"
  for (const label of ['초기화', '삭제', '확인']) {
    if (await tapByPredicate(`label == "${label}"`, { timeout: 1500 })) break;
  }
  await browser.pause(3000);
}

describe('온보딩 A안 — 첫 실행 바로 발견 카드', () => {
  before(async () => {
    await dismissSavePromptIfAny();
    await resetIfOnboarded();
  });

  it('A1 — 초기화 후 온보딩 화면 없이 발견 카드', async () => {
    const id = await waitVisibleCardId(30000);
    await capture('onboarding-a-01-discover');
    expect(id).toBeTruthy();
    expect(await pageSourceContains('어떻게 부를까요')).toBe(false); // 옛 Hello 단계
    expect(await pageSourceContains('리스트 대신, 한 편씩')).toBe(false); // 옛 Welcome
    expect(await selectedTab()).toBe('발견');
    for (const label of ['발견', '큐', '저장', '프로필']) {
      expect(await waitForLabel(label, 3000)).toBe(true);
    }
  });

  it('A2 — 첫 카드에서 위로 넘기면 다음 작품', async () => {
    const a = await waitVisibleCardId();
    await swipeFeed('up');
    await browser.pause(900);
    expect(await waitVisibleCardId()).not.toBe(a);
  });
});
