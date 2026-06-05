/**
 * persona resume_modal 회귀 가드 시뮬 검증 — commit 2409781 fix 후 3회 반복.
 *
 * 흐름:
 *   [Reset 1] Profile → 모든 데이터 초기화 → confirm
 *   [Onboard 1] Welcome → name → genre → persona-context (영화/혼자) → LLM step 1 → 답변 → step 2 → 답변
 *   [Reset 2] Profile → 모든 데이터 초기화 → confirm
 *   [Validate] Welcome → name → genre → persona-context (영화/혼자) → LLM step 도달 시
 *              page source 에 "이어서 하시겠어요" 안 떠야 함
 *
 * 3회 반복 (Run 1/2/3) — fresh state 정합 100% 보장.
 */
import { remote } from 'webdriverio';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const SHOT_DIR = '/tmp/neko-qa/resume-modal-shots';
const RESUME_MODAL_NEEDLE = '이어서 하시겠어요';
const RESUME_MODAL_FALLBACK = '이전 진행';

const CAPS = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:platformVersion': '26.4',
  'appium:deviceName': 'iPhone 17 Pro',
  'appium:udid': '4EDF2CB4-81BE-41B2-9D5C-AEB1DDE14E29',
  'appium:bundleId': 'com.neq.app',
  'appium:autoLaunch': false,
  'appium:noReset': true,
  'appium:newCommandTimeout': 600,
  'appium:wdaLocalPort': 8100,
  'appium:usePrebuiltWDA': true,
  'appium:useNewWDA': false,
  'appium:skipServerInstallation': true,
};

if (!existsSync(SHOT_DIR)) await mkdir(SHOT_DIR, { recursive: true });

async function cap(b, name) {
  try {
    const png = await b.takeScreenshot();
    await writeFile(`${SHOT_DIR}/${name}.png`, png, 'base64');
    console.log('  shot:', name);
  } catch (err) {
    console.warn('  shot failed:', name, err.message);
  }
}

async function tapByLabel(b, label, timeout = 5000) {
  try {
    const el = await b.$(`~${label}`);
    await el.waitForExist({ timeout });
    await el.click();
    return true;
  } catch {
    return false;
  }
}

async function tapByPredicate(b, predicate, timeout = 5000) {
  try {
    const el = await b.$(`-ios predicate string:${predicate}`);
    await el.waitForExist({ timeout });
    await el.click();
    return true;
  } catch {
    return false;
  }
}

async function waitForLabel(b, label, timeout = 12000) {
  try {
    const el = await b.$(`~${label}`);
    await el.waitForExist({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function pageSourceContains(b, needle) {
  try {
    const src = await b.getPageSource();
    return src.includes(needle);
  } catch {
    return false;
  }
}

async function forceReset(b) {
  try {
    await b.execute('mobile: terminateApp', { bundleId: 'com.neq.app' });
  } catch {}
  await b.pause(500);
  try {
    await b.execute('mobile: launchApp', { bundleId: 'com.neq.app' });
  } catch (err) {
    console.warn('launchApp 실패:', err.message);
  }
  await b.pause(3000);
}

/**
 * Profile 진입 → "모든 데이터 초기화" tap → Alert 확인.
 * 가능한 시작 화면: Discover (tab bar 보임). resume_modal 직후 (onboarding 모달) 면 closure 우선.
 */
async function resetViaProfile(b, runLabel) {
  console.log(`  [${runLabel}] Profile reset 시작`);
  // 1. tab bar 의 '프로필' 진입 — 다양한 label 시도.
  let entered = false;
  for (const lbl of ['프로필', 'profile', 'Profile']) {
    if (await tapByLabel(b, lbl, 2500)) {
      entered = true;
      break;
    }
  }
  if (!entered) {
    // 좌표 fallback (iPhone 17 Pro 402×874, tab 3번째 ≈ x=250 y=850)
    await b.execute('mobile: tap', { x: 250, y: 850 });
  }
  await b.pause(2000);
  await cap(b, `${runLabel}-profile-top`);

  // 2. 스크롤 다운으로 "모든 데이터 초기화" 버튼 노출
  for (let i = 0; i < 6; i++) {
    await b.execute('mobile: swipe', { direction: 'up' });
    await b.pause(400);
    if (await pageSourceContains(b, '모든 데이터 초기화')) break;
  }
  await cap(b, `${runLabel}-profile-bottom`);

  // 3. tap
  const tapped = await tapByLabel(b, '모든 데이터 초기화', 5000);
  if (!tapped) {
    console.warn(`  [${runLabel}] reset 버튼 못 찾음`);
    return false;
  }
  await b.pause(1500);
  await cap(b, `${runLabel}-reset-alert`);

  // 4. Alert 확인 — "초기화" / "삭제" / "확인" 다중 시도
  let confirmed = false;
  for (const lbl of ['초기화', '삭제', '확인', 'OK']) {
    if (await tapByPredicate(b, `label == "${lbl}"`, 2000)) {
      confirmed = true;
      break;
    }
    if (await tapByLabel(b, lbl, 1500)) {
      confirmed = true;
      break;
    }
  }
  if (!confirmed) {
    console.warn(`  [${runLabel}] confirm alert 못 찾음`);
    return false;
  }
  await b.pause(4500);
  await cap(b, `${runLabel}-after-reset`);
  return true;
}

/**
 * Welcome → name → genre → persona-context (영화/혼자) → 다음 → LLM 질문 단계 도달.
 */
async function onboardToLLMStep(b, runLabel) {
  console.log(`  [${runLabel}] onboarding → LLM step 진행`);

  // welcome
  if (await waitForLabel(b, '시작하기', 8000)) {
    await tapByLabel(b, '시작하기');
    await b.pause(1000);
  }
  await cap(b, `${runLabel}-after-welcome`);

  // hello — TextField + return key
  const inputs = await b.$$('//XCUIElementTypeTextField');
  if (inputs.length > 0) {
    try {
      await inputs[0].setValue('E2E');
      await b.pause(400);
    } catch {}
  }
  // return key submit
  const submitOk =
    (await tapByPredicate(
      b,
      `name == "Return" OR name == "Done" OR name == "다음" OR name == "완료" OR name == "확인" OR name == "개행"`,
      2500,
    )) ||
    (await (async () => {
      try {
        await b.execute('mobile: keys', { keys: [{ key: '\n' }] });
        return true;
      } catch {
        return false;
      }
    })()) ||
    (await tapByLabel(b, '다음', 1500)) ||
    (await tapByLabel(b, '이름 없이 시작', 1500));
  if (!submitOk) console.warn(`  [${runLabel}] hello submit 실패`);
  await b.pause(800);
  await cap(b, `${runLabel}-after-hello`);

  // genre
  await b.pause(800);
  for (const chip of ['드라마', '스릴러', '로맨스']) {
    await tapByLabel(b, chip, 2500);
    await b.pause(250);
  }
  if (!(await tapByLabel(b, '다음', 3000))) {
    await tapByLabel(b, '장르 정하지 않고 시작', 2000);
  }
  await b.pause(1500);
  await cap(b, `${runLabel}-after-genre`);

  // persona context (영화 + 혼자)
  if (!(await waitForLabel(b, '영화', 12000))) {
    console.warn(`  [${runLabel}] persona context 미노출`);
    return { reachedLLM: false, resumeModalShown: false };
  }
  await tapByLabel(b, '영화');
  await b.pause(300);
  await tapByLabel(b, '혼자');
  await b.pause(300);
  await tapByLabel(b, '다음');
  await b.pause(3000);
  await cap(b, `${runLabel}-after-context`);

  // ── 핵심 검증 포인트 ──
  // LLM 질문 단계에 도달했을 때 resume_modal 이 떴는지 page source 검사
  // step_loading 도 가능 → 추가 wait
  await b.pause(2500);
  const resumeShown =
    (await pageSourceContains(b, RESUME_MODAL_NEEDLE)) ||
    (await pageSourceContains(b, RESUME_MODAL_FALLBACK));
  await cap(b, `${runLabel}-LLM-step1-arrival`);

  return { reachedLLM: true, resumeModalShown: resumeShown };
}

/**
 * LLM step 1 진입 후 답변 1개 → step 2 진입 → 답변 1개 더 (회귀 패턴 재현).
 */
async function answerLLMSteps(b, runLabel) {
  console.log(`  [${runLabel}] LLM 답변 진행`);

  // resume_modal 이 떴으면 닫고 진행 (Run 1 초기 reset 직후엔 안 떠야 정상)
  if (await pageSourceContains(b, RESUME_MODAL_NEEDLE)) {
    await tapByLabel(b, '처음부터', 2500);
    await b.pause(800);
  }

  // 첫 답변 — radio 옵션 4개 중 첫번째 tap (a11y "radio" role)
  // LLM 옵션 라벨이 일정하지 않으므로 XCUI Cell 또는 radio role 매칭
  let answered = false;
  for (let i = 0; i < 4; i++) {
    try {
      const opts = await b.$$('//XCUIElementTypeOther[@value="radio button"]');
      if (opts.length > 0) {
        await opts[0].click();
        answered = true;
        break;
      }
    } catch {}
    await b.pause(1500);
  }
  if (!answered) {
    // fallback: pageSource 의 옵션 라벨 추출 시도 (느린 호흡 등)
    for (const lbl of ['느린 호흡', '빠른 전개', '강렬한', '잔잔한', '진지한', '가벼운']) {
      if (await tapByLabel(b, lbl, 1500)) {
        answered = true;
        break;
      }
    }
  }
  await b.pause(500);
  await tapByLabel(b, '다음', 2500);
  await b.pause(3000);
  await cap(b, `${runLabel}-after-llm-q1`);

  // step 2 답변
  answered = false;
  for (let i = 0; i < 4; i++) {
    try {
      const opts = await b.$$('//XCUIElementTypeOther[@value="radio button"]');
      if (opts.length > 0) {
        await opts[0].click();
        answered = true;
        break;
      }
    } catch {}
    await b.pause(1500);
  }
  await b.pause(500);
  await cap(b, `${runLabel}-after-llm-q2`);
  return answered;
}

// ── 메인 시나리오 ──
const b = await remote({
  hostname: '127.0.0.1',
  port: 4723,
  path: '/',
  capabilities: CAPS,
  logLevel: 'error',
});

const results = [];

try {
  console.log('=== persona resume_modal 회귀 가드 검증 시작 (3회 반복) ===');

  for (let run = 1; run <= 3; run++) {
    const runLabel = `run${run}`;
    console.log(`\n--- Run ${run}/3 ---`);
    const result = {
      run,
      reset1: false,
      onboard1Reached: false,
      onboard1ResumeShown: null,
      llmAnswered: false,
      reset2: false,
      validateReached: false,
      validateResumeShown: null,
      pass: false,
      note: '',
    };

    // 매 run 시작 시 app cold launch
    await forceReset(b);
    await cap(b, `${runLabel}-00-cold-start`);

    // (Reset 1) — 이미 onboarded 상태이거나, 첫 run 은 fresh.
    // Discover 가 보이면 reset 실행, welcome 이면 skip.
    if (await pageSourceContains(b, '발견')) {
      result.reset1 = await resetViaProfile(b, `${runLabel}-r1`);
      await forceReset(b);
      await b.pause(2000);
    } else if (await pageSourceContains(b, '시작하기')) {
      // 이미 fresh state
      result.reset1 = true;
      result.note += 'Run 시작 시 이미 welcome → reset 1 skip. ';
    } else {
      result.reset1 = false;
      result.note += 'Run 시작 시 알 수 없는 state. ';
    }

    // (Onboard 1) — LLM 질문 단계 도달 후 resume_modal 확인.
    // 1차 reset 직후이므로 resume_modal 안 떠야 정상 (= fix 효과 1).
    const o1 = await onboardToLLMStep(b, `${runLabel}-o1`);
    result.onboard1Reached = o1.reachedLLM;
    result.onboard1ResumeShown = o1.resumeModalShown;

    if (o1.reachedLLM) {
      result.llmAnswered = await answerLLMSteps(b, `${runLabel}-o1`);
    }

    // (Reset 2) — Profile 진입. LLM 단계에서 직접 reset 가능한지 확인.
    // Discover 까지 도달 못 했을 수 있음 → forceReset 후 진입.
    await b.pause(1000);
    if (await pageSourceContains(b, '발견')) {
      result.reset2 = await resetViaProfile(b, `${runLabel}-r2`);
    } else {
      // LLM 단계에서 닫기 → Profile 진입 시도. 가능하면 직접, 안 되면 cold restart.
      console.log(`  [${runLabel}] LLM 단계에서 Profile 직접 진입 시도`);
      await tapByLabel(b, '닫기', 2000);
      await b.pause(1000);
      if (await pageSourceContains(b, '발견')) {
        result.reset2 = await resetViaProfile(b, `${runLabel}-r2`);
      } else {
        result.note += `Reset 2 시점 Profile 진입 불가 — forceReset 후 시도. `;
        await forceReset(b);
        if (await pageSourceContains(b, '발견')) {
          result.reset2 = await resetViaProfile(b, `${runLabel}-r2`);
        }
      }
    }
    await forceReset(b);
    await b.pause(2000);

    // (Validate) — 2차 reset 후 동일 컨텍스트 (영화/혼자) 재진입 → resume_modal 안 떠야 함.
    const o2 = await onboardToLLMStep(b, `${runLabel}-v`);
    result.validateReached = o2.reachedLLM;
    result.validateResumeShown = o2.resumeModalShown;

    // PASS 판정: validate 단계에서 LLM 도달 + resume_modal 미노출
    if (result.validateReached && result.validateResumeShown === false) {
      result.pass = true;
    }

    results.push(result);
    console.log(`  Run ${run} 결과:`, JSON.stringify(result, null, 2));
  }
} catch (err) {
  console.error('TOP-LEVEL ERROR:', err.message, err.stack);
  await cap(b, '99-top-error');
} finally {
  console.log('\n=== 최종 결과 ===');
  console.log(JSON.stringify(results, null, 2));
  await writeFile(
    '/tmp/neko-qa/resume-modal-results.json',
    JSON.stringify(results, null, 2),
  );
  await b.deleteSession();
}
