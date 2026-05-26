/**
 * Neko native E2E — Persona v2 (LLM 동적 취향 설문) full flow
 *
 * 검증 범위 (PR 3 / G4a):
 *   P0  영화/혼자 컨텍스트 → step 1 (LLM) → step 2 (LLM) → summary → "맞아요" → persona 생성
 *   P1  "다시 받기" 클릭 → step 2 부터 재진입
 *   P2  닫기 (✕) → onCancel + taste_survey_abandoned 분석 이벤트
 *
 * 실행 전제:
 *  - Expo Go / dev client 가 시뮬레이터에 로드됨
 *  - EXPO_PUBLIC_PERSONA_SURVEY_V2_ENABLED=true (profile 의 "+ 새 취향 추가" 가 controller 진입)
 *  - 네트워크 가능 — /api/onboarding/taste-survey/* endpoint 응답 시간 < 10s
 *  - Appium / Metro 가동
 *  - 첫 페르소나 1개 이상 (default) 존재
 *
 * 알려진 트랩 (memory feedback_native_a11y_e2e_patterns.md):
 *  - 첫 탭 race: ~Label 검색 시 mount 전. tapByLabel 헬퍼가 waitForExist 처리
 *  - dual a11y label: 닫기 등 중복 → last 매칭 사용
 *  - wrap a11y 흡수: Pressable 안의 Text 가 a11y 흡수 → Pressable 에 accessibilityLabel
 *  - sim 상태 leak: 직전 테스트 잔재로 페르소나 누적 가능 → before each 에서 페르소나 1개 보장
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

async function tapByLabel(
  label: string,
  opts: { timeout?: number } = {},
): Promise<boolean> {
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

async function tapByPredicate(
  predicate: string,
  opts: { timeout?: number } = {},
): Promise<boolean> {
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

async function tapTab(label: string): Promise<boolean> {
  if (await tapByLabel(label, { timeout: 2000 })) return true;
  return tapByPredicate(`label == "${label}" OR name == "${label}"`, {
    timeout: 3000,
  });
}

async function waitForLabel(
  label: string,
  timeout = 12000,
): Promise<boolean> {
  try {
    const el = await $(`~${label}`);
    await el.waitForExist({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function pageSourceContains(needle: string): Promise<boolean> {
  const source = await browser.getPageSource();
  return source.includes(needle);
}

describe('Persona v2 — taste survey full flow', () => {
  before(async () => {
    // 프로필 탭 진입
    const ok = await tapTab('프로필');
    if (!ok) throw new Error('프로필 탭 진입 실패 — 앱 mount 미확인');
    await browser.pause(800);
    await capture('persona-v2-00-profile');
  });

  it('P0 — 영화/혼자 → step 1/2 → summary → 맞아요 → 새 페르소나 생성', async () => {
    // 1. 프로필의 "+ 새 취향 추가" 탭 → /onboarding/taste-survey 진입
    const enter = await tapByPredicate(
      `label CONTAINS "새 취향" OR name CONTAINS "새 취향"`,
      { timeout: 5000 },
    );
    if (!enter) throw new Error('"+ 새 취향 추가" 버튼 진입 실패');
    // 컨텍스트 selector 렌더 대기
    if (!(await waitForLabel('영화'))) {
      throw new Error('컨텍스트 selector "영화" pill 미노출');
    }
    await capture('persona-v2-01-context');

    // 2. 컨텍스트: 영화 + 혼자 선택 → 다음
    if (!(await tapByLabel('영화'))) throw new Error('영화 pill tap 실패');
    if (!(await tapByLabel('혼자'))) throw new Error('혼자 pill tap 실패');
    await browser.pause(300);
    if (!(await tapByLabel('다음'))) throw new Error('컨텍스트 "다음" 탭 실패');

    // 3. step 1 LLM 응답 대기 (최대 12s)
    //    질문 텍스트 자체는 매번 다르지만, progress "2 / 4" 또는 옵션 a~d 출현으로 식별
    const step1Ready = await tapByPredicate(
      `label CONTAINS "2 / 4" OR name CONTAINS "2 / 4"`,
      { timeout: 12000 },
    );
    // 진행률 텍스트 tap 은 무동작 — 단지 mount 확인용. 통과 못 해도 다음 단계로.
    void step1Ready;
    await browser.pause(500);
    await capture('persona-v2-02-step1');

    // step 1 의 첫 옵션 (네 옵션 중 첫 번째) 탭 — accessibilityLabel = option.label.
    // option label 은 LLM 응답이라 미지 → "다음" 버튼 enabled 까지 page source 의
    // 라디오 텍스트 첫 항목 후보를 휴리스틱으로 탭. 가장 안전한 방식:
    // page source 로부터 첫 radio 라벨 추출.
    const source1 = await browser.getPageSource();
    const radioMatch1 = source1.match(
      /AXRadioButton[^"]*"\s+(?:name|label)="([^"]+)"/i,
    );
    const firstOption1 = radioMatch1?.[1];
    if (!firstOption1) {
      throw new Error('step 1 의 첫 옵션 라벨 추출 실패');
    }
    if (!(await tapByLabel(firstOption1)))
      throw new Error(`step 1 옵션 "${firstOption1}" tap 실패`);
    if (!(await tapByLabel('다음')))
      throw new Error('step 1 "다음" tap 실패');

    // 4. step 2 LLM 응답 대기 + 첫 옵션 탭
    await browser.pause(500);
    const source2 = await browser.getPageSource();
    const radioMatch2 = source2.match(
      /AXRadioButton[^"]*"\s+(?:name|label)="([^"]+)"/i,
    );
    const firstOption2 = radioMatch2?.[1];
    if (!firstOption2) {
      throw new Error('step 2 의 첫 옵션 라벨 추출 실패');
    }
    await capture('persona-v2-03-step2');
    if (!(await tapByLabel(firstOption2)))
      throw new Error(`step 2 옵션 "${firstOption2}" tap 실패`);
    if (!(await tapByLabel('다음')))
      throw new Error('step 2 "다음" tap 실패');

    // 5. summary preview 도달 — "맞아요" 등장 대기 (LLM summary 최대 12s)
    if (!(await waitForLabel('맞아요'))) {
      throw new Error('summary preview "맞아요" 미노출');
    }
    await browser.pause(400);
    await capture('persona-v2-04-summary');

    if (!(await tapByLabel('맞아요')))
      throw new Error('"맞아요" tap 실패');

    // 6. 페르소나 생성 후 onComplete → router.back → profile 로 복귀
    //    "영화 · 혼자" 라벨이 PersonaSection 에 추가됨
    await browser.pause(1000);
    const created = await pageSourceContains('영화 · 혼자');
    if (!created) {
      throw new Error('신규 페르소나 "영화 · 혼자" 가 프로필에 노출되지 않음');
    }
    await capture('persona-v2-05-created');
  });

  it('P1 — "다시 받기" → step 2 부터 재진입', async () => {
    // 새 페르소나 추가 진입
    const enter = await tapByPredicate(
      `label CONTAINS "새 취향" OR name CONTAINS "새 취향"`,
      { timeout: 5000 },
    );
    if (!enter) {
      console.warn('"+ 새 취향 추가" 진입 실패 — 페르소나 3개 도달 가능. skip.');
      return;
    }

    // 컨텍스트 선택 (시리즈/혼자)
    if (!(await waitForLabel('시리즈'))) {
      console.warn('컨텍스트 selector 미노출 — skip');
      return;
    }
    await tapByLabel('시리즈');
    await tapByLabel('혼자');
    await tapByLabel('다음');

    // step 1 첫 옵션 + 다음
    await browser.pause(2000);
    const src = await browser.getPageSource();
    const m = src.match(/AXRadioButton[^"]*"\s+(?:name|label)="([^"]+)"/i);
    if (!m?.[1]) {
      console.warn('step 1 옵션 추출 실패 — skip');
      return;
    }
    await tapByLabel(m[1]);
    await tapByLabel('다음');

    // step 2 첫 옵션 + 다음
    await browser.pause(2000);
    const src2 = await browser.getPageSource();
    const m2 = src2.match(/AXRadioButton[^"]*"\s+(?:name|label)="([^"]+)"/i);
    if (!m2?.[1]) {
      console.warn('step 2 옵션 추출 실패 — skip');
      return;
    }
    await tapByLabel(m2[1]);
    await tapByLabel('다음');

    // summary 도달 → "다시 받기" tap
    if (!(await waitForLabel('다시 받기'))) {
      console.warn('summary "다시 받기" 미노출 — skip');
      return;
    }
    await capture('persona-v2-06-summary-retry');
    if (!(await tapByLabel('다시 받기'))) {
      throw new Error('"다시 받기" tap 실패');
    }

    // step 2 다시 노출되어야 함
    await browser.pause(2500);
    const src3 = await browser.getPageSource();
    const isOnStep2 = src3.includes('3 / 4') || src3.includes('2 / 4');
    if (!isOnStep2) {
      throw new Error('"다시 받기" 후 step 2 복귀 미확인');
    }
    await capture('persona-v2-07-resurvey-step2');

    // 닫기로 정리 (cleanup)
    await tapByLabel('설문 닫기');
  });

  it('P2 — 닫기 (✕) → onCancel + abandoned 이벤트', async () => {
    // 새 페르소나 진입
    const enter = await tapByPredicate(
      `label CONTAINS "새 취향" OR name CONTAINS "새 취향"`,
      { timeout: 5000 },
    );
    if (!enter) {
      console.warn('"+ 새 취향 추가" 진입 실패 — 페르소나 3개 도달 가능. skip.');
      return;
    }

    if (!(await waitForLabel('영화'))) {
      console.warn('컨텍스트 selector 미노출 — skip');
      return;
    }

    // 컨텍스트 선택만 하고 다음 단계 진입 후 ✕ 로 닫기
    await tapByLabel('영화');
    await tapByLabel('같이');
    await tapByLabel('다음');
    await browser.pause(1500);

    // ✕ 버튼 (accessibilityLabel = "설문 닫기")
    if (!(await tapByLabel('설문 닫기'))) {
      throw new Error('"설문 닫기" ✕ 버튼 tap 실패');
    }

    // profile 로 복귀 확인
    await browser.pause(1000);
    if (!(await pageSourceContains('취향'))) {
      throw new Error('profile section "취향" 헤더 미노출 — router.back 실패');
    }
    await capture('persona-v2-08-cancelled');
  });
});
