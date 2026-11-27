import { describe, it, expect, beforeEach } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  nextHint,
  decideSavePrompt,
  markHintDone,
  getHintsDone,
  getOnboardingVariant,
  consumeOnce,
} from '../onboarding';
import { consumeFirstOpen, hasOnboarded, toggleSaved } from '../store';
import { __resetStorage } from './_mocks/async-storage';

beforeEach(() => __resetStorage());

describe('온보딩 분기 — 신규/기존 사용자', () => {
  it('신규 설치(neq_onboarded·저장 없음) = A안 표시, first_open new', async () => {
    expect(await consumeFirstOpen()).toBe('new');
    expect(await getOnboardingVariant()).toBe('A');
  });
  it('기존 사용자(neq_onboarded) = 표시 없음, 온보딩 상태 그대로', async () => {
    await AsyncStorage.setItem('neq_onboarded', 'true');
    expect(await consumeFirstOpen()).toBe('existing');
    expect(await getOnboardingVariant()).toBeNull();
    expect(await AsyncStorage.getItem('neq_onboarded')).toBe('true');
    expect(await hasOnboarded()).toBe(true);
  });
  it('온보딩 플래그 없이 저장만 있는 1.0.x 사용자도 기존', async () => {
    await toggleSaved({ tmdbId: 1, title: 't', type: 'movie' } as never);
    expect(await consumeFirstOpen()).toBe('existing');
    expect(await getOnboardingVariant()).toBeNull();
  });
  it('두 번째 실행은 아무것도 안 바꿈', async () => {
    await consumeFirstOpen();
    expect(await consumeFirstOpen()).toBeNull();
    expect(await getOnboardingVariant()).toBe('A');
  });
});

describe('조작 힌트 — 한 번에 하나씩', () => {
  it('첫 카드 = 위로 넘기기', () => {
    expect(nextHint([], 0)).toBeNull();
    expect(nextHint([], 1)).toBe('swipe_up_next');
  });
  it('위로 넘기기를 해 봐도 3번째 카드 전엔 더블탭 힌트 없음', () => {
    expect(nextHint(['swipe_up_next'], 2)).toBeNull();
    expect(nextHint(['swipe_up_next'], 3)).toBe('double_tap_save');
  });
  it('앞 힌트가 안 끝났으면 뒤 힌트로 건너뛰지 않음', () => {
    expect(nextHint([], 10)).toBe('swipe_up_next');
  });
  it('이후 좌우 탭 이동 → 길게 누르기 → 끝', () => {
    expect(nextHint(['swipe_up_next', 'double_tap_save'], 5)).toBe('swipe_tab');
    expect(nextHint(['swipe_up_next', 'double_tap_save', 'swipe_tab'], 7)).toBe('long_press_hide');
    expect(nextHint(['swipe_up_next', 'double_tap_save', 'swipe_tab', 'long_press_hide'], 99)).toBeNull();
  });
  it('완료 저장은 한 번만', async () => {
    expect(await markHintDone('swipe_tab')).toBe(true);
    expect(await markHintDone('swipe_tab')).toBe(false);
    expect(await getHintsDone()).toEqual(['swipe_tab']);
  });
});

describe('저장 뒤 제안', () => {
  const base = { isVariantA: true, savesCount: 1, ottPromptDone: false, tastePromptDone: false, hasOtt: false };
  it('첫 저장 직후 OTT 한 번', () => {
    expect(decideSavePrompt(base)).toBe('ott');
    expect(decideSavePrompt({ ...base, ottPromptDone: true })).toBeNull();
  });
  it('이미 OTT 를 정했으면 묻지 않음', () => {
    expect(decideSavePrompt({ ...base, hasOtt: true })).toBeNull();
  });
  it('저장 3개 뒤 취향 제안, 한 번만', () => {
    expect(decideSavePrompt({ ...base, ottPromptDone: true, savesCount: 2 })).toBeNull();
    expect(decideSavePrompt({ ...base, ottPromptDone: true, savesCount: 3 })).toBe('taste');
    expect(decideSavePrompt({ ...base, ottPromptDone: true, savesCount: 3, tastePromptDone: true })).toBeNull();
  });
  it('기존 사용자(A 아님)는 아무 제안 없음', () => {
    expect(decideSavePrompt({ ...base, isVariantA: false, savesCount: 3 })).toBeNull();
  });
});

describe('설치 후 1회 계측', () => {
  it('first_card·first_save 각각 한 번', async () => {
    expect(await consumeOnce('first_card')).toBe(true);
    expect(await consumeOnce('first_card')).toBe(false);
    expect(await consumeOnce('first_save')).toBe(true);
  });
});
