/**
 * Neko 네이티브 이벤트 트래킹 헬퍼.
 *
 * 웹의 `apps/web/src/lib/analytics.ts` 와 시그니처를 1:1로 맞춘다.
 * - 개발 환경: console.log
 * - 프로덕션: PostHog로 전송 (키가 있을 때만)
 *
 * 사용 패턴:
 *   import { track } from '@/lib/analytics';
 *   track('recommendation_loaded', { duration_ms: 1234 });
 *
 * PostHog 인스턴스는 `<PostHogProvider>` 가 _layout.tsx 에서 mount될 때
 * `attachPostHogInstance()` 로 모듈 레벨에 주입된다. 주입 전 호출은 자동으로 in-memory queue 에
 * 적재되며 attach 시점에 flush 된다 (ahead-of-init capture 안전망).
 *
 * 시그니처/타입은 web과 호환되어야 한다. 새 이벤트 추가 시 양쪽 동기화 필수.
 */

import type { PostHog } from 'posthog-react-native';
import {
  sanitize,
  parseServerTiming,
  timingsToProps,
  usageToProps,
  metaToProps,
  type EventProps,
} from './analytics-utils';

// 외부 호환을 위해 utils를 re-export
export {
  sanitize,
  parseServerTiming,
  timingsToProps,
  usageToProps,
  metaToProps,
} from './analytics-utils';
export type { EventProps } from './analytics-utils';

const isDev = (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.NODE_ENV === 'development';

let phInstance: PostHog | null = null;
const pendingQueue: Array<{ event: NekoEvent; props: Record<string, string | number | boolean | null> }> = [];
const PENDING_MAX = 200; // 메모리 보호. 일반적으로 init 직전 1~5건 정도

/**
 * PostHogProvider 가 mount되면 호출한다.
 * 이전에 큐잉된 이벤트가 있으면 일괄 flush.
 */
export function attachPostHogInstance(instance: PostHog | null | undefined): void {
  if (!instance) return;
  phInstance = instance;
  if (pendingQueue.length === 0) return;
  for (const item of pendingQueue.splice(0, pendingQueue.length)) {
    try {
      instance.capture(item.event, item.props);
    } catch {
      // 무시 — 이벤트 1건 실패가 앱 흐름을 막지 않게
    }
  }
}

export function detachPostHogInstance(): void {
  phInstance = null;
}

/**
 * 이벤트 전송. 키가 없거나 init 전이면 큐잉.
 */
export function track(event: NekoEvent, props?: EventProps): void {
  const payload = sanitize(props);

  if (isDev) {
    // eslint-disable-next-line no-console
    console.log(`[track] ${event}`, payload);
  }

  try {
    if (phInstance) {
      phInstance.capture(event, payload);
      return;
    }
    if (pendingQueue.length < PENDING_MAX) {
      pendingQueue.push({ event, props: payload });
    }
  } catch {
    // 트래킹 실패가 앱 동작에 영향을 주면 안 됨
  }
}

// 일부 호출부에서 직접 import 하던 유틸을 그대로 사용 가능하도록 둠
void parseServerTiming;
void timingsToProps;
void usageToProps;

/**
 * 추적 대상 이벤트 — 웹 `apps/web/src/lib/analytics.ts` 의 NekoEvent 와 동일하게 유지.
 *
 * 새 이벤트 추가 시 web/native 양쪽 동기화 필수.
 */
export type NekoEvent =
  // 세션
  | 'session_started'
  | 'app_open'
  // 온보딩
  | 'onboarding_started'
  | 'onboarding_favorite_added'
  | 'onboarding_completed'
  // Onboarding V2 (D4a, 5단계 라우팅): 단계 진입/완료 추적
  | 'onboarding_step_viewed'
  | 'onboarding_step_completed'
  // 추천 로드
  | 'recommendation_loaded'
  | 'recommendation_load_more'
  | 'recommendation_refresh'
  | 'recommendation_failed'
  // Cold Start V2
  | 'cold_start_v2'
  // 카드 인터랙션
  | 'card_viewed'
  | 'card_swiped'
  | 'card_tapped'
  | 'card_saved'
  | 'card_unsaved'
  | 'card_not_interested'
  | 'detail_opened'
  | 'detail_related_clicked'
  // 2026-06-15 (build 27) — DetailSheet history navigation (← / →)
  | 'detail_history_back'
  | 'detail_history_forward'
  // 2026-06-15 (build 27) — RelatedRow "더보기 →" 풀스크린 sub-screen 진입
  | 'detail_related_more_opened'
  // 위임 O — Cast 클릭 → 검색 진입
  | 'detail_cast_clicked'
  | 'detail_to_search_person'
  // 2026-06-15 (build 27 iter3) — Cast 클릭 → DetailSheet 내부 person-works sub-screen
  | 'detail_cast_works_opened'
  // 위임 O — Saved 뷰 모드 토글
  | 'saved_view_changed'
  // 시청 리포트
  | 'watch_report_submitted'
  // OTT 전환
  | 'ott_link_clicked'
  // 공유
  | 'card_shared'
  | 'share_saved'
  | 'share_viewed'
  // 필터
  | 'filter_changed'
  // 검색
  | 'search_opened'
  | 'search_item_selected'
  | 'search_item_saved'
  | 'search_ott_clicked'
  | 'search_trending_clicked'
  // 프로필
  | 'profile_viewed'
  | 'data_reset'
  // 2026-06-15 (build 27) — Profile 구독 OTT 변경 (onboarding step 9 후속 편집 UI).
  // payload: { provider_id, on, total_selected }. 다음 추천 호출 시 자연스럽게 반영.
  | 'profile_ott_toggled'
  // 페르소나
  | 'persona_switched'
  | 'persona_created'
  | 'persona_deleted'
  // 넛지
  | 'nudge_shown'
  | 'nudge_reported'
  | 'nudge_dismissed'
  | 'reentry_nudge_shown'
  // 온보딩 브릿지 & 코치마크 (v2 잔재 — 신규 호출처 없음. v3 는 아래 tutorial_* 사용)
  | 'bridge_shown'
  | 'bridge_completed'
  | 'coach_shown'
  | 'coach_completed'
  // TutorialFlow v3 — Discover 첫 진입 4단계 튜토리얼 (CoachMark v2 대체).
  // web `apps/web/src/lib/analytics.ts` 정합. W5 Task B 에서 native 도입.
  | 'tutorial_step_shown'
  | 'tutorial_completed'
  | 'tutorial_skipped'
  // 알림 인프라
  | 'notification_subscribed'
  | 'notification_blocked'
  | 'notification_clicked'
  // Persona v2 (2026-05-24 design) — LLM 동적 취향 설문 7 이벤트.
  // web `apps/web/src/lib/analytics.ts` 정합. PR 3 에서 native 도입.
  | 'taste_survey_started'
  | 'taste_survey_step_completed'
  | 'taste_survey_abandoned'
  | 'taste_survey_completed'
  | 'taste_summary_generated'
  | 'taste_survey_fallback_triggered'
  | 'persona_taste_resurveyed';

/**
 * 테스트 전용 — 큐 길이를 노출하기 위함. 프로덕션 코드는 사용 X.
 * @internal
 */
export function __test_getPendingQueueSize(): number {
  return pendingQueue.length;
}

/**
 * 테스트 전용 — 큐를 비운다.
 * @internal
 */
export function __test_resetPendingQueue(): void {
  pendingQueue.length = 0;
  phInstance = null;
}
