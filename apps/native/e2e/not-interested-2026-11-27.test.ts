/**
 * Night Pool 5단계 — "관심 없음" 숨김 흐름 E2E (계획 T6 ①, D8).
 *
 * ① 위로 밀기 → 토스트 "다시 안 보여요 · 되돌리기" → 되돌리기 → 같은 카드가 다시 맨 위
 * ② 상세 시트 "관심 없음" 버튼으로 숨기기
 * ③ 새 추천(새로고침) 뒤에도 숨긴 작품 재노출 없음
 *
 * 카드 식별은 SwipeCard testID `swipe-card-{tmdbId}` (refresh-race 스펙과 같은 방식).
 * 렌더 순서가 뒤 카드 → 맨 위 카드라 page source 의 마지막 id 가 맨 위 카드.
 *
 * 실행:
 *   IOS_SIM_UDID=<udid> IOS_SIM_VERSION=26.5 npx wdio run wdio.conf.ts --spec e2e/not-interested-2026-11-27.test.ts
 * 숨긴 작품은 시뮬 저장소에 남는다 (기기 기준 영구 — 의도된 동작).
 */
import { capture, tapByLabel, tapTab, waitForLabel, pageSourceContains, ensureOnboardedOrSkip } from './_helpers';

async function cardIds(): Promise<string[]> {
  const src = await browser.getPageSource();
  return [...src.matchAll(/name="swipe-card-(\d+)"/g)].map((m) => m[1]);
}

async function topCardId(timeout = 15000): Promise<string> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const ids = await cardIds();
    if (ids.length > 0) return ids[ids.length - 1];
    await browser.pause(500);
  }
  throw new Error('카드가 안 떴어요');
}

async function swipeUp() {
  const { width, height } = await browser.getWindowSize();
  const x = Math.round(width / 2);
  const fromY = Math.round(height * 0.55);
  // 190pt 위로 — 임계 100 을 넉넉히 넘김. 느린 끌기라 튕김 보조와 무관.
  await browser.execute('mobile: dragFromToForDuration', {
    fromX: x, fromY, toX: x, toY: fromY - 190, duration: 0.35,
  });
}

describe('관심 없음 (Night Pool 5단계)', () => {
  before(async () => {
    await ensureOnboardedOrSkip();
    // 이전 실행이 남긴 상세 시트 정리 — 시트 위에서 밀면 카드가 아니라 시트가 스크롤된다
    for (let i = 0; i < 2; i++) {
      const close = await $$('~닫기');
      if (close.length === 0) break;
      await close[close.length - 1].click().catch(() => {});
      await browser.pause(700);
    }
    expect(await tapTab('발견')).toBe(true);
    await browser.pause(1500);
  });

  it('① 위로 밀기 → 토스트 → 되돌리기', async () => {
    const id = await topCardId();
    await swipeUp();
    await browser.pause(700); // 가라앉기 220ms + 토스트 등장 250ms
    expect(await waitForLabel('되돌리기', 3000)).toBe(true);
    expect(await pageSourceContains('다시 안 보여요')).toBe(true);
    expect(await cardIds()).not.toContain(id);
    await capture('not-interested-swipe-toast');

    expect(await tapByLabel('되돌리기', { timeout: 3000 })).toBe(true);
    await browser.pause(800);
    expect(await topCardId()).toBe(id);
  });

  it('② 상세 시트 "관심 없음" 버튼 + ③ 새로고침 후 재노출 없음', async () => {
    const id = await topCardId();
    expect(await tapByLabel('상세보기', { timeout: 4000 })).toBe(true);
    await browser.pause(1500);
    await capture('not-interested-detail-button');
    // iOS 는 testID 가 accessibility id(name) 라 ~라벨 대신 testID 로 찾는다 (라벨 "관심 없음" 은 VoiceOver 용)
    expect(await tapByLabel('detail-hide-button', { timeout: 4000 })).toBe(true);
    await browser.pause(1200);
    expect(await pageSourceContains('다시 안 보여요')).toBe(true);
    expect(await cardIds()).not.toContain(id);

    // 위로 밀어 하나 더 숨김 → 새 추천 → 두 작품 모두 없음
    const id2 = await topCardId();
    await swipeUp();
    await browser.pause(800);
    expect(await cardIds()).not.toContain(id2);

    await browser.pause(3200); // 토스트가 새 추천 버튼과 겹치지 않게 사라질 때까지
    expect(await tapByLabel('새 추천', { timeout: 4000 })).toBe(true);
    await topCardId(30000);
    await browser.pause(4000); // 스트리밍 남은 카드 도착
    const after = await cardIds();
    expect(after).not.toContain(id);
    expect(after).not.toContain(id2);
    await capture('not-interested-after-refresh');

    // 탭 접근성 라벨 4종 유지
    for (const label of ['발견', '큐', '저장', '검색']) {
      expect((await waitForLabel(label, 3000)) || (await pageSourceContains(label))).toBe(true);
    }
  });
});
