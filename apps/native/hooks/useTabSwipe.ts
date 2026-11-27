import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { classifySwipe, tabAfterSwipe, TAB_EVENT_NAME, type SwipeTab } from '../lib/swipe-classify';
import { track } from '../lib/analytics';
import { markHintDone } from '../lib/onboarding';

const ROUTE: Record<SwipeTab, '/' | '/mix' | '/saved'> = { index: '/', mix: '/mix', saved: '/saved' };

/**
 * 1.1.0 — 큐·저장 화면 좌우 스와이프 = 탭 이동 (발견 ↔ 큐 ↔ 저장, 프로필 제외).
 * activeOffsetX ±20 · failOffsetY ±15 — 두 범위가 겹치지 않게 (메모리 pan offset 충돌).
 * 세로 스크롤을 먼저 시작하면 15px 에서 실패해 스크롤이 이긴다. 판정 임계는 발견과 같은 classifySwipe.
 */
export function useTabSwipe(from: SwipeTab) {
  function go(action: 'tab_next' | 'tab_prev') {
    const to = tabAfterSwipe(from, action);
    if (!to) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    track('tab_swiped', { from: TAB_EVENT_NAME[from], to: TAB_EVENT_NAME[to] });
    void markHintDone('swipe_tab');
    router.navigate(ROUTE[to]);
  }
  return Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onEnd((e) => {
      const action = classifySwipe({
        axis: 1,
        dx: e.translationX,
        dy: e.translationY,
        vx: e.velocityX,
        vy: e.velocityY,
        hasPrev: false,
        hasNext: false,
      });
      if (action === 'tab_next' || action === 'tab_prev') runOnJS(go)(action);
    });
}
