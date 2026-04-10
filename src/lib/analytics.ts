"use client";

import { track as vercelTrack } from "@vercel/analytics";

/**
 * Neko 이벤트 트래킹 헬퍼.
 *
 * - 개발 환경: console.log로 표시
 * - 프로덕션: Vercel Analytics로 전송
 *
 * 나중에 PostHog/Amplitude 등으로 이관할 때 이 파일만 수정하면 됨.
 *
 * 주의: Vercel Analytics의 custom event props는 string/number/boolean만 지원.
 */

type EventProps = Record<string, string | number | boolean | null | undefined>;

const isDev = process.env.NODE_ENV === "development";

/** 세션 ID — 페이지 로드마다 새로 생성 */
let sessionId: string | null = null;
function getSessionId(): string {
  if (typeof window === "undefined") return "";
  if (sessionId) return sessionId;
  sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return sessionId;
}

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
  const payload = {
    ...sanitize(props),
    sessionId: getSessionId(),
  };

  if (isDev) {
    // 개발 환경: 보기 쉽게 로그
    console.log(`[track] ${event}`, payload);
  }

  // 프로덕션/개발 모두 Vercel에 전송 (개발 환경은 어차피 /_vercel/insights가 없어서 무시됨)
  try {
    vercelTrack(event, payload);
  } catch {
    // 실패해도 앱 동작에는 영향 없음
  }
}

/**
 * 추적 대상 이벤트 — 기획 단계 성공 지표와 연결.
 *
 * - 온보딩 이탈률: onboarding_started → onboarding_completed
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
  // 추천 로드
  | "recommendation_loaded"
  | "recommendation_load_more"
  | "recommendation_failed"
  // 카드 인터랙션
  | "card_viewed"
  | "card_swiped"
  | "card_tapped"
  | "card_saved"
  | "card_unsaved"
  | "card_not_interested"
  | "detail_opened"
  // 시청 리포트
  | "watch_report_submitted"
  // OTT 전환
  | "ott_link_clicked"
  // 공유
  | "card_shared"
  // 필터
  | "filter_changed"
  // 프로필
  | "profile_viewed"
  | "data_reset";
