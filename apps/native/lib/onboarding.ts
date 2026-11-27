/**
 * 1.1.0 온보딩 A안 (2026-11-27, 제임스 확정) — 첫 실행에 화면 없이 바로 발견 카드.
 *
 * - 조작 힌트: 카드 위에 한 번에 하나씩, 해 보면 사라짐 (`nextHint`).
 * - 저장 뒤 제안: 첫 저장 직후 OTT 한 번, 저장 3개 뒤 "취향 더 알려 주기" (`decideSavePrompt`) — A안 신규만.
 * - 계측: 협의체 정의(`neq-onboarding-A-metrics-20261127.md`). onboarding_variant 'A' 는 1.1.0 신규 설치만.
 *
 * 저장 키는 설치 단위라 '모든 데이터 초기화'에도 남긴다 (first_open 과 같은 규칙) —
 * 초기화한 사람에게 힌트·제안을 다시 보여 주면 첫 경험 지표가 부풀려진다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const VARIANT_KEY = 'neq_onboarding_variant';
const HINTS_DONE_KEY = 'neq_gesture_hints_done';
const OTT_PROMPT_KEY = 'neq_ott_prompt_done';
const TASTE_PROMPT_KEY = 'neq_taste_prompt_done';
const FIRST_CARD_KEY = 'neq_first_card_viewed_tracked';
const FIRST_SAVE_KEY = 'neq_first_save_tracked';

export const GESTURE_SCHEME = 'shortform_v1';

// ── 조작 힌트 ──────────────────────────────────────────

export type HintStep = 'swipe_up_next' | 'double_tap_save' | 'swipe_tab' | 'long_press_hide';
export const HINT_ORDER: HintStep[] = ['swipe_up_next', 'double_tap_save', 'swipe_tab', 'long_press_hide'];
/** 이 카드 수(이번 세션에서 본 카드)부터 보여 준다. 첫 카드 · 3번째 카드 · 그 뒤로 한 장씩 띄워서. */
export const HINT_MIN_CARDS: Record<HintStep, number> = {
  swipe_up_next: 1,
  double_tap_save: 3,
  swipe_tab: 5,
  long_press_hide: 7,
};
export const HINT_COPY: Record<HintStep, string> = {
  swipe_up_next: '위로 넘기면 다음 작품이에요',
  double_tap_save: '두 번 톡 치면 저장돼요',
  swipe_tab: '옆으로 밀면 큐·저장으로 가요',
  long_press_hide: '길게 누르면 관심 없음을 고를 수 있어요',
};

/** 한 번에 하나 — 순서대로 첫 미완료 힌트. 아직 카드 수가 안 찼으면 null (뒤 힌트로 건너뛰지 않음). */
export function nextHint(done: readonly string[], cardsSeen: number): HintStep | null {
  const step = HINT_ORDER.find((s) => !done.includes(s));
  if (!step) return null;
  return cardsSeen >= HINT_MIN_CARDS[step] ? step : null;
}

export async function getHintsDone(): Promise<HintStep[]> {
  try {
    const raw = await AsyncStorage.getItem(HINTS_DONE_KEY);
    return raw ? (JSON.parse(raw) as HintStep[]) : [];
  } catch {
    return [];
  }
}

// 다른 탭(큐·저장의 좌우 스와이프)에서도 완료를 알려야 해서 모듈 구독.
type Listener = (done: HintStep[]) => void;
const listeners = new Set<Listener>();
export function subscribeHintsDone(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 해 봤으면 완료. 이미 완료면 false. */
export async function markHintDone(step: HintStep): Promise<boolean> {
  const done = await getHintsDone();
  if (done.includes(step)) return false;
  const next = [...done, step];
  try {
    await AsyncStorage.setItem(HINTS_DONE_KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((fn) => fn(next));
  return true;
}

// ── 저장 뒤 제안 (A안 신규만) ───────────────────────────

export type SavePrompt = 'ott' | 'taste' | null;

export function decideSavePrompt(s: {
  isVariantA: boolean;
  savesCount: number;
  ottPromptDone: boolean;
  tastePromptDone: boolean;
  hasOtt: boolean;
}): SavePrompt {
  if (!s.isVariantA || s.savesCount < 1) return null;
  if (!s.ottPromptDone && !s.hasOtt) return 'ott';
  if (s.savesCount >= 3 && !s.tastePromptDone) return 'taste';
  return null;
}

export async function getPromptFlags(): Promise<{ ottPromptDone: boolean; tastePromptDone: boolean }> {
  try {
    const [o, t] = await AsyncStorage.multiGet([OTT_PROMPT_KEY, TASTE_PROMPT_KEY]);
    return { ottPromptDone: !!o[1], tastePromptDone: !!t[1] };
  } catch {
    return { ottPromptDone: true, tastePromptDone: true };
  }
}

export async function markPromptDone(kind: 'ott' | 'taste'): Promise<void> {
  try {
    await AsyncStorage.setItem(kind === 'ott' ? OTT_PROMPT_KEY : TASTE_PROMPT_KEY, '1');
  } catch {}
}

// ── 변형·첫 순간 계측 ─────────────────────────────────

export async function getOnboardingVariant(): Promise<'A' | null> {
  try {
    return (await AsyncStorage.getItem(VARIANT_KEY)) === 'A' ? 'A' : null;
  } catch {
    return null;
  }
}

/** 설치 후 1회 플래그. 처음이면 true 를 돌려주고 표시. */
export async function consumeOnce(kind: 'first_card' | 'first_save'): Promise<boolean> {
  const key = kind === 'first_card' ? FIRST_CARD_KEY : FIRST_SAVE_KEY;
  try {
    if (await AsyncStorage.getItem(key)) return false;
    await AsyncStorage.setItem(key, '1');
    return true;
  } catch {
    return false;
  }
}

// 앱을 연 시각·그 뒤 탭 수 (first_card_viewed 의 ms_since_open·taps_since_open)
let openedAt = Date.now();
let taps = 0;
export function markAppOpen(): void {
  openedAt = Date.now();
  taps = 0;
}
export function countTap(): void {
  taps += 1;
}
export function sinceOpen(): { ms_since_open: number; taps_since_open: number } {
  return { ms_since_open: Date.now() - openedAt, taps_since_open: taps };
}
