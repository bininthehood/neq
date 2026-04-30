"use client";

import posthog from "posthog-js";

/**
 * Neko 이벤트 트래킹 헬퍼.
 *
 * - 개발 환경: console.log로 표시
 * - 프로덕션: PostHog로 전송
 *
 * 나중에 백엔드나 다른 analytics 서비스로 이관할 때 이 파일만 수정하면 됨.
 *
 * 주의: PostHog는 property로 다양한 타입을 받지만 직렬화 가능한 값만 사용.
 */

type EventProps = Record<string, string | number | boolean | null | undefined>;

const isDev = process.env.NODE_ENV === "development";

function sanitize(props?: EventProps): Record<string, string | number | boolean | null> {
  if (!props) return {};
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export function track(event: NekoEvent, props?: EventProps) {
  const payload = sanitize(props);

  if (isDev) {
    // 개발 환경: 보기 쉽게 로그
    console.log(`[track] ${event}`, payload);
  }

  // PostHog로 전송. 초기화 전에 호출되면 자동으로 queue에 쌓임.
  try {
    if (posthog.__loaded) {
      posthog.capture(event, payload);
    } else if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      // posthog-js는 init 전 호출 시 queue로 처리하지만 안전하게 방어
      posthog.capture(event, payload);
    }
  } catch {
    // 실패해도 앱 동작에는 영향 없음
  }
}

/**
 * 추적 대상 이벤트 — 기획 단계 성공 지표와 연결.
 *
 * - 추천 품질: recommendation_loaded → card_swiped (save/pass 비율)
 * - 시청 리포트 전환: card_saved → watch_report
 * - 결정 시간: session_started → ott_link_clicked 소요 시간
 * - 발견감: detail_opened 비율
 * - 바이럴: card_shared 빈도
 */
export type NekoEvent =
  // 세션
  | "session_started"
  // 온보딩
  | "onboarding_started"
  | "onboarding_favorite_added"
  | "onboarding_completed"
  // Onboarding V2 (D4a, 5단계 라우팅): 단계 진입/완료 추적
  | "onboarding_step_viewed"
  | "onboarding_step_completed"
  // 추천 로드
  | "recommendation_loaded"
  | "recommendation_load_more"
  | "recommendation_failed"
  // Onboarding V2 (Day 22, P0-2): Cold Start V2 분기 진입 카운트
  | "cold_start_v2"
  // 카드 인터랙션
  | "card_viewed"
  | "card_swiped"
  | "card_tapped"
  | "card_saved"
  | "card_unsaved"
  | "card_not_interested"
  | "detail_opened"
  | "detail_related_clicked"
  // 시청 리포트
  | "watch_report_submitted"
  // OTT 전환
  | "ott_link_clicked"
  // 공유
  | "card_shared"
  | "share_saved"
  | "share_viewed"
  // 필터
  | "filter_changed"
  // 검색
  | "search_opened"
  | "search_item_selected"
  | "search_item_saved"
  | "search_ott_clicked"
  // 검색 — D10b (Recent / Trending / Voice)
  | "search_recent_removed"
  | "search_trending_clicked"
  | "search_voice_started"
  | "search_voice_completed"
  | "search_voice_error"
  // 프로필
  | "profile_viewed"
  | "data_reset"
  // 페르소나
  | "persona_switched"
  | "persona_created"
  | "persona_deleted"
  // 넛지
  | "nudge_shown"
  | "nudge_reported"
  | "nudge_dismissed"
  | "reentry_nudge_shown"
  // 온보딩 브릿지 & 코치마크
  | "bridge_shown"
  | "bridge_completed"
  | "coach_shown"
  | "coach_completed"
  // Onboarding V2 (Day 24, P0-4): 알림 인프라
  | "notification_subscribed"
  | "notification_blocked"
  | "notification_clicked";
