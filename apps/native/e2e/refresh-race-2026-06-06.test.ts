/**
 * Neko native E2E 회귀 — 2026-06-06 새로고침 직후 빠른 좌 스와이프 race 차단
 *
 * 컨텍스트: commit 22f52e7 (`_workspace/02_p0_stack_overlap.md`).
 *
 *   P0 1차 — `load()` 가 새 stream 시작 전 setRecs([]) + AbortController.abort()
 *           둘 다 호출하지 않아 옛 stream A 의 onCard 가 새 stream B 와 같은
 *           React state(recs) 에 끼어들어 후방 카드가 "옛 세트" 작품으로
 *           잠깐 덮어쓰임 (= "미드소마(옛 세트) 잔재" 증상).
 *
 *   P0 2차 — buildPrefetchKey 가 excludeIds 제외 → 새로고침 후 옛 prefetch
 *           결과가 cache hit 으로 새 stack 뒤에 재유입.
 *
 *   Fix    — load() 진입 시 atomic reset + AbortController + onCard ref 가드
 *           + invalidatePrefetchCache (commit 22f52e7).
 *
 * 검증 범위 (R1~R4):
 *   R1 — 첫 세트 도착 직후 작품 시그니처 캡처 (page source 의 title Text)
 *   R2 — 카드 N장 좌 스와이프 (next 진행, topIdx 증가)
 *   R3 — ActionBar "새 추천" tap → 새 stream B 트리거
 *   R4 — 새 세트 첫 카드 도착 직후 즉시 좌 스와이프 → 후방 카드 시그니처가
 *        세트 A 작품과 disjoint 여야 함 (= race 차단됐다는 신호)
 *
 * 진입 경로:
 *   forceResetApp → ensureOnboardedOrSkip → Discover 카드 stack 준비
 *
 * 실행 전제:
 *   - simulator-devclient (`com.neq.app` dev client) — wdio.conf.ts default
 *   - 네트워크 가능 — `/api/recommend` warm enrich ~400ms (cold 첫 호출 3s 가능)
 *   - mobile-qa SKILL.md Phase 3 자동 회귀 트랙에 합류
 *
 * 비고:
 *   본 spec 은 결정성 재현이 어려운 race window 를 좁히는 회귀 lock 이다.
 *   서버 LLM warm latency 가 4~6s → 새로고침 후 부분 stream 윈도우 안에서
 *   swipe 입력해야 race 가 열린다. 그래서:
 *     1) 새 stream B 첫 카드 도착 직후 (~1.5s 대기, fix 전엔 옛 stream A 가 살아
 *        있는 시점) 즉시 좌 스와이프 N 회 — fix 전 시나리오에선 옛 set 카드가
 *        후방으로 끼어들 수 있는 윈도우.
 *     2) 추가 2~4s 대기 후 stack 안정 — 이 시점에 보이는 카드들 시그니처가
 *        세트 A 와 disjoint 여야 fix PASS.
 *   완전 결정성은 아니지만 fix 회귀 시 점진적 false-FAIL 빈도로 감지 가능.
 *   결정성 보강은 향후 mock 인프라 도입 시 (debugLoadHooks ref 등) 별도 트랙.
 */

import {
  capture,
  ensureOnboardedOrSkip,
  forceResetApp,
  tapByLabel,
  tapByPredicate,
} from './_helpers';

// rec.title 은 SwipeCard.tsx:364 의 <Text style={styles.title}>{rec.title}</Text>
// 로 page source 에 그대로 노출됨. 한 page source 에서 title-like Text 노출 element
// 들의 value 를 모아 set 으로 비교.
//
// XCUIElementTypeStaticText 의 value 또는 name attribute 에 title 이 들어감.
// 정확한 element 매칭 대신 page source 내 unique text token 추출 — race 가 발생
// 했을 때 옛 세트 카드 title 이 새 세트와 섞이는지 set intersection 으로 판단.
async function snapshotCardSignatures(): Promise<Set<string>> {
  const src = await browser.getPageSource();
  // XCUIElementTypeStaticText 의 value/name 에서 title 후보 추출.
  // 휴리스틱: SwipeCard 의 title (line 364) + subTitle (year · titleEn, line 361-362).
  // 둘 다 page source 에 노출되므로 둘 다 시그니처로 사용.
  // 정규식: value="..." 또는 name="..." 매칭, 단 너무 짧거나 일반적인 UI 라벨 제외.
  const sigs = new Set<string>();
  const valueRe = /(?:value|name)="([^"]{3,80})"/g;
  let m: RegExpExecArray | null;
  while ((m = valueRe.exec(src)) !== null) {
    const v = m[1];
    // UI noise 필터 — 탭바/버튼/공통 텍스트 제외.
    if (
      v === '발견' ||
      v === '저장' ||
      v === '프로필' ||
      v === '검색' ||
      v === '검색 열기' ||
      v === '검색 닫기' ||
      v === '새 추천' ||
      v === '상세보기' ||
      v === '공유' ||
      v === '처음으로' ||
      v === '저장 해제' ||
      v === '저장' ||
      v === '다시 시도' ||
      v === '필터 초기화' ||
      v === '추천을 준비하고 있어요' ||
      v.startsWith('http') ||
      v.startsWith('com.') ||
      /^\d+$/.test(v) ||
      v.length < 3
    ) {
      continue;
    }
    sigs.add(v);
  }
  return sigs;
}

async function swipeLeftOnCard(strength = 0.6): Promise<void> {
  const { width, height } = await browser.getWindowSize();
  const startX = width * 0.8;
  const endX = width * (0.8 - strength);
  const y = height * 0.5;
  await browser.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: startX, y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 80 },
        { type: 'pointerMove', duration: 220, x: endX, y },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await browser.releaseActions();
}

// "새 추천" — ActionBar.tsx:99 accessibilityLabel.
async function tapRefreshButton(): Promise<boolean> {
  // 우선 a11y label, 실패 시 predicate (label OR name) fallback (메모리 트랩 #2).
  if (await tapByLabel('새 추천', { timeout: 3000 })) return true;
  return tapByPredicate(`label == "새 추천" OR name == "새 추천"`, {
    timeout: 3000,
  });
}

// ──────────────────────────────────────────────────────────
// R — 새로고침 race 회귀
// ──────────────────────────────────────────────────────────
describe('R — 새로고침 직후 빠른 좌 스와이프 race 차단 (commit 22f52e7)', () => {
  before(async () => {
    // spec audit (2026-05-28) — 이전 spec leak 방지 + 추천 로드 대기.
    await forceResetApp();
    if (!(await ensureOnboardedOrSkip())) {
      throw new Error(
        'before: onboarding 자동 진행 실패. _helpers.ts ensureOnboardedOrSkip 단계별 라벨 확인 필요.',
      );
    }
    // 첫 추천 stack 안정 대기 — cold start 시 LLM 첫 호출 ~3s + enrich ~0.4s.
    // 추가 여유 4s — 모든 카드 stream 완료.
    await browser.pause(8000);
    await capture('R-00-initial-stack');
  });

  it('R1 — 첫 세트 작품 시그니처 캡처 (세트 A)', async () => {
    const sigsA = await snapshotCardSignatures();
    console.log(`세트 A 시그니처 ${sigsA.size}개:`, Array.from(sigsA).slice(0, 8));
    // 최소 1개 시그니처가 잡혀야 stack 정상.
    // 0개면 page source 가 추천 화면이 아니거나 추출 휴리스틱 실패.
    expect(sigsA.size).toBeGreaterThan(0);
    // 다음 it 으로 전달용 — global 에 stash (mocha context 사용 가능하나 단순화).
    (globalThis as Record<string, unknown>).__sigsA = sigsA;
  });

  it('R2 — 좌 스와이프 3회 진행 (세트 A 일부 소비)', async () => {
    for (let i = 0; i < 3; i++) {
      await swipeLeftOnCard();
      // pass dismiss 360ms (index.tsx:79) + advance 여유 = 600ms 대기.
      await browser.pause(600);
    }
    await capture('R-01-after-3-left-swipes');
    // 스택이 깨지지 않았는지 — 시그니처 잡힘 확인.
    const sigsMid = await snapshotCardSignatures();
    expect(sigsMid.size).toBeGreaterThan(0);
  });

  it('R3 — "새 추천" tap → 세트 B stream 트리거', async () => {
    const tapped = await tapRefreshButton();
    if (!tapped) {
      console.warn('FAIL — "새 추천" 버튼 못 찾음. ActionBar 마운트 상태 확인 필요.');
      await capture('R-02-FAIL-no-refresh-btn');
      throw new Error('"새 추천" 버튼 tap 실패');
    }
    // 첫 카드 b1 도착 윈도우 — warm enrich ~400ms + LLM 첫 토큰 ~1s 합산.
    // 1.5s 시점이 race 가능 영역의 가장 앞 (fix 전엔 옛 stream A 의 onCard 가
    // 1~3s 사이에 끼어들 수 있는 윈도우).
    await browser.pause(1500);
    await capture('R-03-after-refresh-pause');
  });

  it('R4 — 첫 카드 도착 직후 빠른 좌 스와이프 → 후방 카드 시그니처가 세트 A 와 disjoint', async () => {
    // race window 안에서 빠른 좌 스와이프 4회. fix 전엔 이 사이에 옛 set 카드가
    // 새 stack 뒤에 끼어들 수 있음. fix 가 정상 동작 시 옛 stream onCard 는
    // ref 가드 또는 abort 로 무시됨.
    for (let i = 0; i < 4; i++) {
      await swipeLeftOnCard(0.7);
      // 빠른 스와이프 — pass dismiss 360ms 만 대기.
      await browser.pause(400);
    }
    await capture('R-04-after-fast-swipes');

    // stack 안정 대기 — 새 세트 stream 완전 도착.
    await browser.pause(4000);
    await capture('R-05-stack-settled');

    // 세트 B (현재 stack) 시그니처 수집.
    const sigsB = await snapshotCardSignatures();
    console.log(`세트 B 시그니처 ${sigsB.size}개:`, Array.from(sigsB).slice(0, 8));

    const sigsA =
      ((globalThis as Record<string, unknown>).__sigsA as Set<string>) ??
      new Set<string>();

    // 교집합 — 세트 A 의 작품이 세트 B 안에 잔재로 남아 있으면 race 의심.
    const intersection = new Set<string>();
    for (const s of sigsB) {
      if (sigsA.has(s)) intersection.add(s);
    }

    console.log(
      `시그니처 교집합 ${intersection.size}개 (세트 A ∩ 세트 B):`,
      Array.from(intersection).slice(0, 6),
    );

    // 검증: 교집합이 0 또는 매우 작아야 함 (fix 정상).
    //   - 0개 == 가장 깨끗한 fix 동작.
    //   - 1~2개 == 시그니처 추출 휴리스틱이 공통 UI element 를 잡았을 가능성.
    //     (예: 양쪽 stack 모두 보이는 cat chip 텍스트 "영화" 등 — 필터 누락).
    //   - 3개 이상 == 옛 세트 카드 title 다수가 새 stack 에 잔재 → race 의심.
    //
    // 보수적 임계: 2 이하 PASS. 3 이상이면 FAIL + 다음 디버깅 트리거.
    // 단, 세트 A 시그니처가 너무 적게 잡혔으면 (≤2) 비교 무의미 → SKIP.
    if (sigsA.size <= 2) {
      console.warn(
        `SKIP — 세트 A 시그니처가 ${sigsA.size}개 (너무 적음). 휴리스틱 보강 필요.`,
      );
      await capture('R-06-SKIP-sigsA-too-small');
      return;
    }

    if (intersection.size > 2) {
      console.warn(
        `FAIL 후보 — 세트 A 의 ${intersection.size}개 시그니처가 세트 B 에 잔재 ` +
          `(race 의심). 교집합:`,
        Array.from(intersection),
      );
      await capture('R-07-FAIL-intersection-large');
    }

    expect(intersection.size).toBeLessThanOrEqual(2);
  });
});
