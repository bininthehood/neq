/**
 * "관심 없음" 숨김 흐름 E2E — 1.1.0 숏폼식 조작 (2026-11-27 갱신).
 *
 * ① 길게 누르기 → 메뉴 "관심 없음" → 토스트 "다시 안 보여요 · 되돌리기" → 되돌리기 → 같은 카드가 다시 보임
 * ② 상세 시트 "관심 없음" 버튼 + 케밥 메뉴 "관심 없음"
 * ③ 새 추천(새로고침) 뒤에도 숨긴 작품 재노출 없음
 * (5단계의 위로 밀기 = 숨김은 1.1.0 에서 "다음 작품"으로 바뀜 → 이 스펙에서 위로 밀기는 숨기지 않아야 한다)
 *
 * 실행:
 *   IOS_SIM_UDID=<udid> IOS_SIM_VERSION=26.5 npx wdio run wdio.conf.ts --spec e2e/not-interested-2026-11-27.test.ts
 * 숨긴 작품은 시뮬 저장소에 남는다 (기기 기준 영구 — 의도된 동작).
 */
import {
  capture,
  tapByLabel,
  tapTab,
  waitForLabel,
  pageSourceContains,
  ensureOnboardedOrSkip,
  feedCardIds,
  waitVisibleCardId,
  swipeFeed,
  hideViaLongPress,
  dismissSavePromptIfAny,
} from './_helpers';

describe('관심 없음 (1.1.0 길게 누르기)', () => {
  before(async () => {
    await ensureOnboardedOrSkip();
    // 이전 실행이 남긴 상세 시트 정리 — 시트 위에서 밀면 카드가 아니라 시트가 스크롤된다
    for (let i = 0; i < 2; i++) {
      const close = await $$('~닫기');
      if (close.length === 0) break;
      await close[close.length - 1].click().catch(() => {});
      await browser.pause(700);
    }
    await dismissSavePromptIfAny();
    expect(await tapTab('발견')).toBe(true);
    await browser.pause(1500);
  });

  it('① 길게 누르기 → 관심 없음 → 토스트 → 되돌리기', async () => {
    const id = await waitVisibleCardId();
    expect(await hideViaLongPress()).toBe(true);
    await browser.pause(700); // 가라앉기 220ms + 토스트 등장 250ms
    // 토스트는 3초 — 확인은 짧게 하고 되돌리기를 먼저 누른다
    expect(await waitForLabel('되돌리기', 2000)).toBe(true);
    expect(await feedCardIds()).not.toContain(id);
    expect(await tapByLabel('되돌리기', { timeout: 3000 })).toBe(true);
    await browser.pause(800);
    expect(await waitVisibleCardId()).toBe(id);
  });

  it('위로 밀기는 숨기지 않고 다음 작품 (5단계 동작 회귀 방지)', async () => {
    await browser.pause(3200); // 되돌리기 토스트 사라짐
    const id = await waitVisibleCardId();
    await swipeFeed('up');
    await browser.pause(800);
    expect(await pageSourceContains('다시 안 보여요')).toBe(false);
    expect(await waitVisibleCardId()).not.toBe(id);
    await swipeFeed('down');
    await browser.pause(800);
    expect(await waitVisibleCardId()).toBe(id);
  });

  it('② 상세 시트 "관심 없음" + 케밥 메뉴 + ③ 새로고침 후 재노출 없음', async () => {
    const id = await waitVisibleCardId();
    expect(await tapByLabel('상세보기', { timeout: 4000 })).toBe(true);
    await browser.pause(1500);
    await capture('not-interested-detail-button');
    // iOS 는 testID 가 accessibility id(name) 라 ~라벨 대신 testID 로 찾는다 (라벨 "관심 없음" 은 VoiceOver 용)
    expect(await tapByLabel('detail-hide-button', { timeout: 4000 })).toBe(true);
    await browser.pause(1200);
    expect(await pageSourceContains('다시 안 보여요')).toBe(true);
    expect(await feedCardIds()).not.toContain(id);

    // 케밥 메뉴로 하나 더 숨김 → 새 추천 → 두 작품 모두 없음
    await browser.pause(3200); // 토스트가 칩 줄·케밥과 겹치지 않게
    const id2 = await waitVisibleCardId();
    expect(await tapByLabel('card-menu-button', { timeout: 3000 })).toBe(true);
    await browser.pause(500);
    expect(await tapByLabel('card-menu-hide', { timeout: 3000 })).toBe(true);
    await browser.pause(800);
    expect(await feedCardIds()).not.toContain(id2);
    // 뒤 카드가 제자리로 당겨져 보인다 (빈 화면 아님)
    const pulled = await waitVisibleCardId(3000);
    expect(pulled).not.toBe(id2);
    await capture('not-interested-kebab-pulled');

    await browser.pause(3200); // 토스트가 새 추천 버튼과 겹치지 않게 사라질 때까지
    expect(await tapByLabel('새 추천', { timeout: 4000 })).toBe(true);
    await waitVisibleCardId(30000);
    await browser.pause(4000); // 스트리밍 남은 카드 도착
    const after = await feedCardIds();
    expect(after).not.toContain(id);
    expect(after).not.toContain(id2);
    await capture('not-interested-after-refresh');

    // 탭 접근성 라벨 4종 유지
    for (const label of ['발견', '큐', '저장', '프로필']) {
      expect((await waitForLabel(label, 3000)) || (await pageSourceContains(label))).toBe(true);
    }
  });
});
